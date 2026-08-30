import type { SupabaseClient } from '@supabase/supabase-js'
import { section, formatCurrency, bulletList } from './formatter'
import { getNibudHouseholdType, getNibudReferences, calculateBenchmarks } from '@/lib/nibud/reference-data'
import { localMonthBounds, localMonthStartMonthsAgo } from '@/lib/month-range'
import type { ModuleId } from '@/lib/module-registry'
import { buildBudgetSpendingMap, type SpendingTxRow } from '@/lib/budget-spending'
import { buildAiBudgetTypeMap, loadSplitRows } from './budget-spending-source'

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
      // Bewust ZONDER budget_id-filter: `totalMonthlyExpenses` hieronder telt
      // ook ongecategoriseerde uitgaven mee. `is_split`/`id` zijn erbij gekomen
      // zodat de split-regels op hun eigen budget kunnen landen.
      .from('transactions')
      .select('id, budget_id, amount, is_income, transaction_type, is_split')
      .gte('date', monthStart)
      .lt('date', monthEnd),
    // Goals, recommendations, actions belong to inzicht_acties module — skip when inactive
    inzichtActiesActive
      ? supabase
          .from('goals')
          .select('name, goal_type, target_value, current_value, target_date, is_completed')
          .eq('is_completed', false)
          .order('sort_order', { ascending: true })
          .limit(10)
      : noData,
    inzichtActiesActive
      ? supabase
          .from('recommendations')
          .select('title, freedom_days_per_year, status, recommendation_type')
          .in('status', ['pending', 'accepted'])
          .order('created_at', { ascending: false })
          .limit(10)
      : noData,
    inzichtActiesActive
      ? supabase
          .from('actions')
          .select('title, freedom_days_impact, status, source')
          .in('status', ['open', 'postponed'])
          .order('priority_score', { ascending: false })
          .limit(10)
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

  // Overboekingen tussen eigen rekeningen zijn geen uitgave.
  const isRealTx = (t: { transaction_type?: string | null }) =>
    t.transaction_type !== 'transfer' && t.transaction_type !== 'joint_transfer'

  // Besteed per budget — canoniek (getekend, richting per budget, split-regels
  // op hun eigen budget). Was: `Math.abs()` over elke rij, zonder richting en
  // zonder splits, waardoor een inkomst op een uitgaven-budget de besteding
  // VERHOOGDE in plaats van verlaagde.
  const budgetTypes = buildAiBudgetTypeMap(budgets)
  const splits = await loadSplitRows(supabase, transactions)
  const spendingByBudget = buildBudgetSpendingMap(transactions as SpendingTxRow[], splits, budgetTypes)

  // Get monthly expenses for freedom-day conversion. Bewust over ALLE rijen van
  // de maand (ook zonder budget_id) — dit is het uitgavenniveau, niet de
  // budgetsom. Split-ouders dragen hier hun eigen (negatieve) bedrag.
  const totalMonthlyExpenses = transactions
    .filter(t => Number(t.amount) < 0 && isRealTx(t))
    .reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0)

  const parts: string[] = []

  // NIBUD benchmark for Wil context — fetch profile for household type and expense fallback
  const { data: { user } } = await supabase.auth.getUser()
  let profileEstExpenses = 0
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('household_type, number_of_children, children_ages, estimated_monthly_expenses')
      .eq('id', user.id)
      .single()

    profileEstExpenses = Number(profile?.estimated_monthly_expenses ?? 0)

    if (budgetingActive) {
      const dailyExpense = totalMonthlyExpenses > 0
        ? (totalMonthlyExpenses * 12) / 365
        : (profileEstExpenses > 0 ? (profileEstExpenses * 12) / 365 : 0)

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

  // Real goals summary from database
  if (goals.length > 0) {
    const goalLines = goals.map(g => {
      const current = Number(g.current_value)
      const target = Number(g.target_value)
      const pct = target > 0 ? Math.round((current / target) * 100) : 0
      const dateInfo = g.target_date ? ` — deadline ${g.target_date}` : ''
      return `${g.name}: ${formatCurrency(current)}/${formatCurrency(target)} (${pct}%)${dateInfo}`
    })
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
