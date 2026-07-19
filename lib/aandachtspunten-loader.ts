/**
 * Server-side verzamelaar voor de generieke aandachtspunten-laag.
 *
 * `collectAandachtspunten(supabase)` voert drie producenten uit (belasting,
 * budget, schulden) met EXACT dezelfde pure rekenkern als de UI-surfaces:
 *
 *   tax    → spiegelt /overzicht/belasting (computeBox1Tax + loadPerspectiveBox3
 *            + computeJaarruimte → buildTaxOverview → opportunities).
 *   budget → spiegelt lib/ai/context/wil-context.ts (NIBUD-benchmark-assemblage).
 *   debt   → actieve schulden met betekenisvolle rente.
 *
 * Elke producent faalt ZACHT (try/catch → []), zodat één ontbrekende databron
 * (geen huishouden, RLS, lege budgetten) de hele laag niet sloopt. Het
 * resultaat wordt gemerged en op savings (desc) gesorteerd.
 *
 * Server-only: importeert de Supabase-server-client niet zelf maar krijgt een
 * client doorgegeven (zo blijft de functie testbaar/herbruikbaar voor zowel
 * server-component als API-route).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  type Aandachtspunt,
  type ActionSuppressionRow,
  taxOpportunitiesToAandachtspunten,
  budgetBenchmarksToAandachtspunten,
  debtsToAandachtspunten,
  assetsToAandachtspunten,
  filterActionedAandachtspunten,
  collectActionedIds,
} from './aandachtspunten'
import { dailyExpenseRate } from './format'
import { buildTaxOverview } from './tax-overview'
import { computeBox1Tax, deriveMarginaalTarief } from './box1-tax'
import { loadPerspectiveBox3 } from './household-tax'
import { computeJaarruimte, jaarruimteBesparing } from './jaarruimte'
import { loadHorizonData } from './horizon-data-loader'
import {
  getNibudHouseholdType,
  getNibudReferences,
  calculateBenchmarks,
} from './nibud/reference-data'
import { getCachedUser } from './supabase/cached-user'
import {
  getActiveAssets,
  getActiveDebts,
  getOwnProfile,
  getBudgets,
  getCurrentMonthTx,
} from './server-data/base'
import type { Debt } from './debt-data'
import type { Asset } from './asset-data'

// ── Belasting-producent ──────────────────────────────────────

/**
 * Bouw de belasting-kansen server-side op met dezelfde pure functies als de
 * belasting-hub. Schat bruto-jaarinkomen uit netto-maandinkomen × marginaal,
 * voedt computeBox1Tax + loadPerspectiveBox3 + computeJaarruimte aan
 * buildTaxOverview en zet de opportunities om naar aandachtspunten.
 */
async function collectTaxAandachtspunten(supabase: SupabaseClient): Promise<Aandachtspunt[]> {
  const horizonData = await loadHorizonData(supabase)

  const monthlyExpenses = horizonData.effectiveInput?.monthlyExpenses ?? 0
  const dailyExpenses = monthlyExpenses > 0 ? dailyExpenseRate(monthlyExpenses) : 100

  // Box 1-schatting: bruto ≈ netto / (1 − marginaal).
  let box1Tax: number | null = null
  let grossYearly = 0
  const netMonthly = horizonData.effectiveInput?.monthlyIncome ?? 0
  const marg = horizonData.fireParams?.marginaalTarief ?? deriveMarginaalTarief()
  if (netMonthly > 0 && marg > 0 && marg < 1) {
    grossYearly = (netMonthly * 12) / (1 - marg)
    const box1 = computeBox1Tax({ grossYearlyIncome: grossYearly, year: 2026, dailyExpenses })
    box1Tax = Math.round(box1.tax)
  }

  // Box 3 (perspectief 'personal' — persoonlijk resultaat).
  let box3Tax: number | null = horizonData.healthScoreInput.taxData?.box3Tax ?? null
  try {
    const box3Data = await loadPerspectiveBox3(supabase, 'personal', 2026)
    if (box3Data.personal?.tax != null) box3Tax = box3Data.personal.tax
  } catch {
    // Box 3-perspectief faalt → behoud de health-proxy-waarde.
  }

  // Jaarruimte-besparing = marginaal-correct Box 1-belastingverschil van de inleg
  // (schijfovergangen + heffingskorting-afbouw) via de gedeelde `jaarruimteBesparing`-
  // helper (ADR 0040/0041), niet de vlakke ruimte × marginaal. Factor A komt uit de
  // loader-bundel (profiles.pension_factor_a via resolvePensionFactorA).
  const jaarruimte = computeJaarruimte(grossYearly, horizonData.pensioenFactorA)
  const jaarruimteSavings = jaarruimte.hasData
    ? jaarruimteBesparing(grossYearly, jaarruimte.jaarruimte, 2026)
    : 0

  // Demping: werknemer mét bedrijfspensioen + ONBEKENDE factor A.
  // Bij onbekende factor A rekent de loader met 0 → de jaarruimte komt op de
  // bovengrens (te hoog), wat een misleidende "benut je jaarruimte"-tip geeft
  // voor iemand die al pensioen opbouwt. Bedrijfspensioen-signaal: een actief
  // life_event met event_type 'pension' én metadata.pensioenType 'bedrijf'
  // (de events-bundel is al op is_active=true gefilterd in de loader). Bij een
  // EXPLICIETE factor A (incl. 0 voor zzp → isKnown=true) of geen
  // bedrijfspensioen blijft de tip ongewijzigd. De box1-hub toont de kans wél
  // (daar beheert de gebruiker 'm); deze demping zit bewust alléén hier.
  const hasBedrijfspensioen = horizonData.events.some(
    (ev) =>
      ev.event_type === 'pension' &&
      (ev.metadata as { pensioenType?: unknown } | undefined)?.pensioenType === 'bedrijf',
  )
  const dampenJaarruimte = !horizonData.pensioenFactorAKnown && hasBedrijfspensioen

  const overview = buildTaxOverview({
    box1Tax,
    box2Tax: null,
    box3Tax,
    grossYearlyIncome: grossYearly > 0 ? grossYearly : null,
    marginalRate: marg,
    dailyExpenses,
    jaarruimte:
      !dampenJaarruimte && jaarruimte.hasData && jaarruimte.jaarruimte > 0
        ? { amount: jaarruimte.jaarruimte, savings: jaarruimteSavings }
        : null,
  })

  return taxOpportunitiesToAandachtspunten(overview.opportunities)
}

// ── Budget-producent ─────────────────────────────────────────

/**
 * Bouw de NIBUD-benchmark-overschrijdingen op — spiegelt de assemblage in
 * lib/ai/context/wil-context.ts: spending per slug uit deze-maand-transacties,
 * household-type uit profile, dailyExpense uit transacties (fallback profile).
 */
async function collectBudgetAandachtspunten(supabase: SupabaseClient): Promise<Aandachtspunt[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  // Gedeelde basisdata-laag: profiel/budgetten/huidige-maand-transacties draaien
  // als ÉÉN query per tabel per request (gedeeld met dashboard/lever/shell). De
  // huidige-maand-tx heeft exact hetzelfde localMonthBounds-venster als voorheen.
  const [profileRes, budgetsRes, txRes] = await Promise.all([
    getOwnProfile(supabase),
    getBudgets(supabase),
    getCurrentMonthTx(supabase),
  ])

  const profile = profileRes.data
  if (!profile) return []
  const budgets = budgetsRes.data ?? []
  const transactions = txRes.data ?? []

  // Eigen-rekening-transfers tellen niet als uitgave (spiegelt wil-context).
  const isRealTx = (t: { transaction_type?: string | null }) =>
    t.transaction_type !== 'transfer' && t.transaction_type !== 'joint_transfer'

  const spendingByBudget: Record<string, number> = {}
  let totalMonthlyExpenses = 0
  for (const t of transactions) {
    if (!isRealTx(t)) continue
    const amt = Number(t.amount)
    if (t.budget_id) {
      spendingByBudget[t.budget_id] = (spendingByBudget[t.budget_id] ?? 0) + Math.abs(amt)
    }
    if (amt < 0) totalMonthlyExpenses += Math.abs(amt)
  }

  const profileEstExpenses = Number(profile.estimated_monthly_expenses ?? 0)
  const dailyExpense =
    totalMonthlyExpenses > 0
      ? (totalMonthlyExpenses * 12) / 365
      : profileEstExpenses > 0
        ? (profileEstExpenses * 12) / 365
        : 0

  const householdType = getNibudHouseholdType(profile)
  const references = await getNibudReferences(supabase, householdType)
  if (references.length === 0) return []

  // Spending per slug — som van child-budget-spend per slug (wil-context-patroon).
  const spendingBySlug: Record<string, number> = {}
  for (const child of budgets.filter((b) => b.slug)) {
    const spent = spendingByBudget[child.id] ?? 0
    if (spent > 0 && child.slug) {
      spendingBySlug[child.slug] = (spendingBySlug[child.slug] ?? 0) + spent
    }
  }

  const benchmarks = calculateBenchmarks(references, spendingBySlug, dailyExpense)
  const aboveNorm = benchmarks.filter((b) => b.delta > 0 && b.freedom_days_potential > 0)
  return budgetBenchmarksToAandachtspunten(aboveNorm)
}

// ── Schuld-producent ─────────────────────────────────────────

/** Laad actieve schulden + dag-uitgaven en zet ze om naar aandachtspunten. */
async function collectDebtAandachtspunten(supabase: SupabaseClient): Promise<Aandachtspunt[]> {
  const horizonData = await loadHorizonData(supabase)
  const monthlyExpenses = horizonData.effectiveInput?.monthlyExpenses ?? 0
  const dailyExpenses = monthlyExpenses > 0 ? dailyExpenseRate(monthlyExpenses) : 100

  // Gedeelde actieve-schulden-fetch (adapter gebruikt alleen id/name/
  // current_balance/interest_rate/is_active — een subset van select('*')).
  const { data } = await getActiveDebts(supabase)
  const debts = (data ?? []) as Debt[]
  return debtsToAandachtspunten(debts, dailyExpenses)
}

// ── Asset-producent ──────────────────────────────────────────

/**
 * Laad actieve assets + maanduitgaven + inflatie en zet overtollig spaargeld
 * om naar een cash-drag-aandachtspunt. Géén dag-uitgaven-fallback: bij
 * ontbrekende uitgaven kan geen betekenisvolle noodbuffer worden bepaald, dus
 * geeft de adapter dan bewust niets terug (i.p.v. een verzonnen buffer).
 */
async function collectAssetAandachtspunten(supabase: SupabaseClient): Promise<Aandachtspunt[]> {
  const horizonData = await loadHorizonData(supabase)
  const monthlyExpenses = horizonData.effectiveInput?.monthlyExpenses ?? 0
  const dailyExpenses = dailyExpenseRate(monthlyExpenses)
  const inflationRate = horizonData.fireParams?.inflationRate ?? 0

  // Gedeelde actieve-assets-fetch (adapter gebruikt alleen asset_type/
  // current_value/is_active — een subset van select('*')).
  const { data } = await getActiveAssets(supabase)
  const assets = (data ?? []) as Asset[]
  return assetsToAandachtspunten(assets, dailyExpenses, inflationRate)
}

// ── Verzamelaar ──────────────────────────────────────────────

/**
 * Verzamel alle aandachtspunten over de drie domeinen. Faalt zacht per
 * producent en sorteert het resultaat op besparing (desc).
 */
export async function collectAandachtspunten(
  supabase: SupabaseClient,
): Promise<Aandachtspunt[]> {
  const safe = async (fn: () => Promise<Aandachtspunt[]>): Promise<Aandachtspunt[]> => {
    try {
      return await fn()
    } catch {
      return []
    }
  }

  const [tax, budget, debt, asset] = await Promise.all([
    safe(() => collectTaxAandachtspunten(supabase)),
    safe(() => collectBudgetAandachtspunten(supabase)),
    safe(() => collectDebtAandachtspunten(supabase)),
    safe(() => collectAssetAandachtspunten(supabase)),
  ])

  const sorted = [...tax, ...budget, ...debt, ...asset].sort((a, b) => b.savings - a.savings)

  // Kruis tegen de acties van de gebruiker: een aandachtspunt waarvoor al een
  // OPEN actie op de lijst staat — óf een recent AFGERONDE actie (≤9 mnd, zie
  // collectActionedIds) — hoort niet ook nog als suggestie op te duiken (zelfde
  // metadata.aandachtspunt_id). Spiegelt de idempotentie-query bij het AANMAKEN
  // van een actie (app/api/ai/actions/route.ts), maar verbreed naar 'completed'
  // zodat het venster-oordeel client-side (en dus testbaar) blijft. Faalt zacht:
  // bij welke fout dan ook blijft `actionedIds` leeg → geen suppressie, huidig
  // gedrag intact.
  let actionedIds: ReadonlySet<string> = new Set<string>()
  try {
    const user = await getCachedUser(supabase)
    if (user) {
      const { data } = await supabase
        .from('actions')
        .select('metadata, status, completed_at')
        .eq('user_id', user.id)
        .in('status', ['open', 'completed'])
        .not('metadata->>aandachtspunt_id', 'is', null)
        // Ruim bemeten: open + afgerond(≤9 mnd) delen deze cap. De id-ruimte is
        // klein (per aandachtspunt hooguit enkele acties), dus 500 voorkomt dat
        // de suppressie ooit fail-open gaat door truncatie.
        .limit(500)
      actionedIds = collectActionedIds((data ?? []) as ActionSuppressionRow[])
    }
  } catch {
    // Nooit throwen: de bus mag niet sneuvelen op een falende actie-kruising.
  }

  return filterActionedAandachtspunten(sorted, actionedIds)
}
