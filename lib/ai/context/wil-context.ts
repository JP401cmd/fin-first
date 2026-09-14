import { splitActiveGoals } from '@/lib/goal-current-value'

/** Hoe lang de Fin-context maximaal wacht op de live doelwaarden (ms). Geen financiële constante. */
const GOAL_SYNC_TIMEOUT_MS = 2500
import type { SupabaseClient } from '@supabase/supabase-js'
import { section, formatCurrency, bulletList } from './formatter'
import { getNibudHouseholdType, getNibudReferences, calculateBenchmarks } from '@/lib/nibud/reference-data'
import { localMonthBounds, localMonthStartMonthsAgo } from '@/lib/month-range'
import { getRecentDailyExpenseRate } from '@/lib/expense-rate'
import { applyActionPriorityOrder } from '@/lib/action-sort'
import type { ModuleId } from '@/lib/module-registry'
import { buildBudgetSpendingMap, type SpendingTxRow } from '@/lib/budget-spending'
import { buildAiBudgetTypeMap, loadSplitRows } from './budget-spending-source'
import { formatGoalValue, GOAL_TYPE_META, type GoalProgress, type GoalType } from '@/lib/goal-data'
import { syncGoalsFromCanonicalSources, type GoalSyncRows } from '@/lib/goals/canonical-goal-sync'
import { getActiveAssets, getActiveDebts } from '@/lib/server-data/base'

/**
 * Doelwaarde in de EENHEID van het doeltype (ADR 0145, context-formattering): een
 * spaarquote-, dekkings- of vrijheidsleeftijd-doel ging vóór dit punt als euro's de
 * prompt in ("Plan gedekt: €78/€100"). `formatGoalValue` is de canonieke formatter;
 * een niet-canoniek `goal_type` uit een oude rij ('wealth', 'debt' — zie migratie
 * 20260901140000) valt terug op euro's, zoals voorheen.
 */
export function formatGoalAmount(value: number, goalType: string | null | undefined): string {
  if (goalType && Object.prototype.hasOwnProperty.call(GOAL_TYPE_META, goalType)) {
    return formatGoalValue(value, goalType as GoalType)
  }
  return formatCurrency(value)
}

/**
 * Korte, neutrale markering voor een doel zonder meetbare uitkomst onder het plan
 * (`notApplicableReason`, ADR 0129 F3a / ADR 0145). Bewust NIET de lange
 * doelkaart-zin: Fin moet weten dát er geen getal is, zodat hij geen "0%" citeert
 * of voortgang verzint — de uitleg van het anker staat al in het financieel overzicht.
 */
export const GOAL_NOT_APPLICABLE_MARKER = 'n.v.t. — geen uitkomst onder het gekozen stopmoment'

/** Doelrij zoals de Wil-context 'm ophaalt (kolom-scoped, zie de query hieronder). */
export type GoalContextRow = {
  id: string
  user_id: string | null
  name: string
  goal_type: GoalType
  target_value: number | string
  current_value: number | string
  target_date: string | null
  is_completed: boolean
  metadata: Record<string, unknown> | null
  linked_asset_id: string | null
  linked_debt_id: string | null
  created_at?: string
}

type SyncedGoalContextRow = Omit<GoalContextRow, 'current_value' | 'target_value'> & {
  current_value: number
  target_value: number
  notApplicableReason?: string | null
}

/**
 * Pure opmaak van de DOELEN-regels uit GESYNCHRONISEERDE doelen + hun canonieke
 * voortgang (index-gekoppeld). Standen in de eenheid van het doeltype; het
 * percentage komt uit `computeGoalProgress` (richting-bewust, geklemd) en wordt
 * hier niet opnieuw als `current/target` uitgerekend.
 */
export function formatGoalContextLines(
  goals: readonly SyncedGoalContextRow[],
  progresses: readonly GoalProgress[],
): string[] {
  return goals.map((g, i) => {
    const p = progresses[i]
    const dateInfo = g.target_date ? ` — deadline ${g.target_date}` : ''
    if (p?.notApplicableReason || g.notApplicableReason) {
      return `${g.name}: ${GOAL_NOT_APPLICABLE_MARKER}${dateInfo}`
    }
    const current = p ? p.current : Number(g.current_value)
    const target = p ? p.target : Number(g.target_value)
    const pct = p ? p.pct : 0
    return `${g.name}: ${formatGoalAmount(current, g.goal_type)}/${formatGoalAmount(target, g.goal_type)} (${pct}%)${dateInfo}`
  })
}

/**
 * De DOELEN-regels voor Fin, op DEZELFDE standen als /toekomst/doelen.
 *
 * Consume, don't recompute: de ruwe `goals.current_value` is voor parameter-,
 * auto-sync-, gekoppelde en vrijheidsgetal-doelen niet de stand (vaak 0) — die
 * wordt bij het lezen geïnjecteerd. Deze functie roept daarom exact de bedrading
 * van het doelen-scherm aan (`syncGoalsFromCanonicalSources`), met dezelfde
 * volgorde en afkap.
 *
 * Kosten per chatbericht, alleen bij ≥1 actief doel: één `goal_links`-query. De
 * bezittingen/schulden worden alleen opgehaald als er een koppeling is; de
 * FIRE-snapshot en elke metric-bron alleen bij een doeltype dat ze nodig heeft.
 *
 * Faalt de sync onverwacht, dan krijgt Fin de doelnamen zónder getallen — nooit
 * de ruwe opgeslagen waarde, want dat is precies de 0 die dit moest voorkomen.
 */
export async function buildGoalContextLines(
  supabase: SupabaseClient,
  rawGoals: readonly GoalContextRow[],
  userId: string | null,
): Promise<string[]> {
  if (rawGoals.length === 0) return []
  // Klonen + NUMERIC-strings naar getallen: de sync muteert in-place.
  const goals: SyncedGoalContextRow[] = rawGoals.map(g => ({
    ...g,
    current_value: Number(g.current_value ?? 0),
    target_value: Number(g.target_value ?? 0),
  }))
  try {
    const loadRows = async (): Promise<GoalSyncRows> => {
      const [assetsRes, debtsRes] = await Promise.all([getActiveAssets(supabase), getActiveDebts(supabase)])
      return {
        assets: (assetsRes.data ?? []) as unknown as GoalSyncRows['assets'],
        debts: (debtsRes.data ?? []) as unknown as GoalSyncRows['debts'],
      }
    }
    // Tijdslimiet: de sync kan een horizon-load + kernel-run doen (vrijheidsgetal-,
    // fire_age-, end_balance-, plan_coverage-doel). Een chatbericht wacht daar nooit
    // langer dan GOAL_SYNC_TIMEOUT_MS op; daarna meldt de context "niet beschikbaar".
    let timer: ReturnType<typeof setTimeout> | undefined
    const { goals: synced, goalProgresses } = await Promise.race([
      syncGoalsFromCanonicalSources(supabase, goals, userId, loadRows),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('doel-sync time-out')), GOAL_SYNC_TIMEOUT_MS)
      }),
    ]).finally(() => clearTimeout(timer))
    return formatGoalContextLines(synced, goalProgresses)
  } catch (err) {
    console.error('[ai:wil-context] doel-sync mislukt', err instanceof Error ? err.message : err)
    // Zelfde begrenzing als het normale pad (lab-doelen + max. 5 eigen), zodat een
    // mislukte sync de context niet laat uitdijen.
    return splitActiveGoals(goals).goals.map(g => `${g.name}: actuele stand niet beschikbaar`)
  }
}

/**
 * Wil-specific context: goals, budget optimization opportunities,
 * active recommendations and open actions.
 * Uses real Supabase data.
 * When inzicht_acties module is inactive, skips goals/recommendations/actions queries.
 */
export async function buildWilContext(supabase: SupabaseClient, budgetingActive = true, activeModules: ModuleId[] = []): Promise<string> {
  const now = new Date()
  const { start: monthStart, end: monthEnd } = localMonthBounds(now)

  // Relevantie-ondergrens "ongeveer een jaar terug" voor recent bijgewerkte
  // goals/acties/aanbevelingen. Tijdzone-veilig via month-range i.p.v.
  // new Date(jaar, maand, dag).toISOString() (dat schuift de grens in NL terug).
  const oneYearAgo = localMonthStartMonthsAgo(now, 12)

  const inzichtActiesActive = activeModules.includes('inzicht_acties')
  const noData = Promise.resolve({ data: null })

  const [budgetsRes, transactionsRes, goalsRes, recsRes, actionsRes, pastActionsRes, pastRecsRes] = await Promise.all([
    supabase
      .from('budgets')
      .select('id, name, slug, budget_type, default_limit, is_essential, parent_id')
      .order('sort_order', { ascending: true }),
    supabase
      // Rijen van de lopende maand voor de bestedingsmap per budget.
      // `is_split`/`id` zijn erbij gekomen zodat de split-regels op hun eigen
      // budget kunnen landen. (Het dagtarief komt NIET meer uit deze rijen —
      // zie getRecentDailyExpenseRate hieronder.)
      .from('transactions')
      .select('id, budget_id, amount, is_income, transaction_type, is_split')
      .gte('date', monthStart)
      .lt('date', monthEnd),
    // Goals, recommendations, actions belong to inzicht_acties module — skip when inactive
    // Kolommen ná `is_completed` voeden de canonieke doel-sync
    // (`syncGoalsFromCanonicalSources`): id → koppelrijen, metadata → parameter-/
    // auto-sync-/vrijheidsgetal-herkenning, user_id → de eigen-doel-toets van de
    // anker-notitie, created_at → de tempo-toets van `computeGoalProgress`. Geen
    // `.limit()`: de sync kapt zelf af op dezelfde lijst als het doelen-scherm
    // (parameterdoelen + max 5 eigen doelen); een DB-limiet ervóór kon een
    // parameterdoel wegknippen dat het scherm wél toont.
    inzichtActiesActive
      ? supabase
          .from('goals')
          .select('id, user_id, name, goal_type, target_value, current_value, target_date, is_completed, metadata, linked_asset_id, linked_debt_id, created_at')
          .eq('is_completed', false)
          .order('sort_order', { ascending: true })
      : noData,
    inzichtActiesActive
      ? supabase
          .from('recommendations')
          .select('title, freedom_days_per_year, status, recommendation_type')
          .in('status', ['pending', 'accepted'])
          .order('created_at', { ascending: false })
          .limit(10)
      : noData,
    // Canonieke prioriteitsvolgorde (lib/action-sort.ts) — dezelfde top-10 als het
    // actiebord toont, ook bij gelijke priority_score.
    inzichtActiesActive
      ? applyActionPriorityOrder(
          supabase
            .from('actions')
            .select('title, freedom_days_impact, status, source')
            .in('status', ['open', 'postponed']),
        ).limit(10)
      : noData,
    // Fetch completed/rejected actions from the past year to prevent duplicate suggestions
    inzichtActiesActive
      ? supabase
          .from('actions')
          .select('title, status')
          .in('status', ['completed', 'rejected'])
          .gte('updated_at', oneYearAgo)
          .order('updated_at', { ascending: false })
          .limit(30)
      : noData,
    // Fetch dismissed/completed recommendations from the past year to prevent duplicates
    inzichtActiesActive
      ? supabase
          .from('recommendations')
          .select('title, status')
          // Negatief signaal: alles wat al een keer voorgesteld is en
          // niet geaccepteerd — inclusief het nieuwe `expired` (chat-sluit
          // zonder beslissing). Legacy-statussen blijven aanwezig voor
          // data die nog van vroegere flows komt.
          .in('status', ['dismissed', 'completed', 'rejected', 'expired'])
          .gte('updated_at', oneYearAgo)
          .order('updated_at', { ascending: false })
          .limit(30)
      : noData,
  ])

  const budgets = budgetsRes.data ?? []
  const transactions = transactionsRes.data ?? []
  const goals = goalsRes.data ?? []
  const recommendations = recsRes.data ?? []
  const actions = actionsRes.data ?? []
  const pastActions = pastActionsRes.data ?? []
  const pastRecommendations = pastRecsRes.data ?? []

  // Besteed per budget — canoniek (getekend, richting per budget, split-regels
  // op hun eigen budget). Was: `Math.abs()` over elke rij, zonder richting en
  // zonder splits, waardoor een inkomst op een uitgaven-budget de besteding
  // VERHOOGDE in plaats van verlaagde.
  const budgetTypes = buildAiBudgetTypeMap(budgets)
  const splits = await loadSplitRows(supabase, transactions)
  const spendingByBudget = buildBudgetSpendingMap(transactions as SpendingTxRow[], splits, budgetTypes)

  const parts: string[] = []

  // NIBUD benchmark for Wil context — fetch profile for household type and expense fallback
  const { data: { user } } = await supabase.auth.getUser()

  // Doelen: gestart zodra de user-id er is, zodat de sync parallel loopt met de
  // NIBUD-queries hieronder. `buildGoalContextLines` vangt zijn eigen fouten af
  // (geen unhandled rejection als het NIBUD-blok eerder gooit).
  const goalLinesPromise = buildGoalContextLines(supabase, goals as GoalContextRow[], user?.id ?? null)

  let profileEstExpenses = 0
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('household_type, number_of_children, children_ages, estimated_monthly_expenses')
      .eq('id', user.id)
      .single()

    profileEstExpenses = Number(profile?.estimated_monthly_expenses ?? 0)

    if (budgetingActive) {
      // Canoniek dagtarief (lib/expense-rate.ts): 12-mnd rolling consumptie,
      // profielschatting als terugval. Hier stond een eigen `(maand × 12) / 365`
      // op de LOSSE lopende maand — een tweede wisselkoers, en die bepaalde
      // welke vrijheidsdagen Fin citeert (1d, nazorg R2+R3).
      const { dailyRate: dailyExpense } = await getRecentDailyExpenseRate(supabase, now, profileEstExpenses)

      // Identify optimization opportunities (non-essential child budgets with spending)
      const opportunities = selectOptimizationOpportunities(budgets, spendingByBudget).map(
        (o) => `${o.name}: ${formatCurrency(o.spent)}/mnd (= ${formatCurrency(o.spent * 12)}/jaar richting FIRE-doel)`,
      )

      if (opportunities.length > 0) {
        parts.push(section('OPTIMALISATIEKANSEN', 'Niet-essentiële uitgaven deze maand:\n' + bulletList(opportunities)))
      }

      if (profile) {
        const householdType = getNibudHouseholdType(profile)
        const references = await getNibudReferences(supabase, householdType)

        if (references.length > 0) {
          // Build spending-by-slug from this month's transactions
          const spendingBySlug: Record<string, number> = {}
          for (const child of budgets.filter(b => b.slug)) {
            const spent = spendingByBudget[child.id] ?? 0
            // Alleen positieve besteding: een negatieve netto-besteding
            // (meer inkomsten dan uitgaven) is geen uitgavenniveau en zou de
            // NIBUD-vergelijking omkeren.
            if (spent > 0 && child.slug) {
              spendingBySlug[child.slug] = (spendingBySlug[child.slug] ?? 0) + spent
            }
          }

          const benchmarks = calculateBenchmarks(references, spendingBySlug, dailyExpense)
          const aboveNorm = benchmarks.filter(b => b.delta > 0 && b.freedom_days_potential > 0)

          if (aboveNorm.length > 0) {
            const lines = aboveNorm.slice(0, 5).map(b =>
              `${b.nibud_category_name}: ${formatCurrency(b.user_spending)}/mnd vs NIBUD ${formatCurrency(b.voorbeeld_amount ?? b.basis_amount)}/mnd (+${formatCurrency(b.delta)}, ~${b.freedom_days_potential} dagen/jaar)`
            )
            const total = aboveNorm.reduce((s, b) => s + b.freedom_days_potential, 0)
            parts.push(section(
              'NIBUD BENCHMARK (boven norm)',
              bulletList(lines) + `\nTotaal potentieel: ~${total} vrijheidsdagen/jaar`,
            ))
          }
        }
      }
    }
  }

  // Doelen — met de LIVE-gesynchroniseerde standen van het doelen-scherm.
  const goalLines = await goalLinesPromise
  if (goalLines.length > 0) {
    parts.push(section('DOELEN', bulletList(goalLines)))
  }

  // Active recommendations
  if (recommendations.length > 0) {
    const recLines = recommendations.map(r =>
      `"${r.title}" — ${Math.round(r.freedom_days_per_year || 0)} dagen/jaar — status: ${r.status}`
    )
    parts.push(section('ACTIEVE AANBEVELINGEN', bulletList(recLines)))
  }

  // Open actions
  if (actions.length > 0) {
    const actionLines = actions.map(a =>
      `"${a.title}" — ${Math.round(a.freedom_days_impact || 0)} dagen — status: ${a.status} (${a.source})`
    )
    parts.push(section('OPENSTAANDE ACTIES', bulletList(actionLines)))
  }

  // Past actions and recommendations — to prevent duplicate suggestions
  const pastItems: string[] = [
    ...pastActions.map(a => `Actie: "${a.title}" (${a.status})`),
    ...pastRecommendations.map(r => `Aanbeveling: "${r.title}" (${r.status})`),
  ]
  if (pastItems.length > 0) {
    parts.push(section(
      'EERDER VOORGESTELDE ACTIES & AANBEVELINGEN (niet opnieuw voorstellen)',
      'Deze acties en aanbevelingen zijn al afgerond, afgewezen of weggestuurd. Stel ze NIET opnieuw voor, ook niet in andere bewoordingen.\n' + bulletList(pastItems),
    ))
  }

  return parts.join('\n')
}

/** Budgetrij zoals de optimalisatiekansen 'm nodig hebben. */
export interface OptimizationBudgetRow {
  id: string
  name: string
  parent_id: string | null
  budget_type: string | null
  is_essential?: boolean | null
}

/** Eén optimalisatiekans: een niet-essentieel subbudget met échte uitgaven. */
export interface OptimizationOpportunity {
  id: string
  name: string
  /** Netto besteding deze maand, altijd > 0 (zie de filterregel hieronder). */
  spent: number
}

/**
 * De niet-essentiële subbudgetten waar deze maand daadwerkelijk geld naartoe
 * ging — de kandidaten waar De Wil een besparing op mag voorstellen.
 *
 * HARDE REGEL: een budget met een NEGATIEVE netto-besteding is GEEN
 * optimalisatiekans. Op zo'n budget kwam er netto geld binnen (meer inkomsten
 * dan uitgaven, sinds de norm van 30 aug 2026 een getekende som); "bespaar
 * hierop en win EUR -80.820/jaar aan vrijheid" is geen advies maar een fout.
 * Het filter staat daarom expliciet in de code, niet impliciet in een
 * `formatCurrency`-uitkomst.
 */
export function selectOptimizationOpportunities(
  budgets: OptimizationBudgetRow[],
  spendingByBudget: Record<string, number>,
): OptimizationOpportunity[] {
  const nonEssentialParentIds = new Set(
    budgets
      .filter(
        (b) =>
          !b.parent_id &&
          !b.is_essential &&
          b.budget_type !== 'income' &&
          b.budget_type !== 'savings' &&
          b.budget_type !== 'debt',
      )
      .map((b) => b.id),
  )

  const opportunities: OptimizationOpportunity[] = []
  for (const child of budgets.filter((b) => b.parent_id)) {
    if (!nonEssentialParentIds.has(child.parent_id ?? '')) continue
    const spent = spendingByBudget[child.id] ?? 0
    if (spent <= 0) continue
    opportunities.push({ id: child.id, name: child.name, spent })
  }
  return opportunities
}
