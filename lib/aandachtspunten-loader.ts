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
  taxOpportunitiesToAandachtspunten,
  budgetBenchmarksToAandachtspunten,
  debtsToAandachtspunten,
} from './aandachtspunten'
import { buildTaxOverview } from './tax-overview'
import { computeBox1Tax } from './box1-tax'
import { loadPerspectiveBox3 } from './household-tax'
import { computeJaarruimte } from './jaarruimte'
import { loadHorizonData } from './horizon-data-loader'
import {
  getNibudHouseholdType,
  getNibudReferences,
  calculateBenchmarks,
} from './nibud/reference-data'
import type { Debt } from './debt-data'

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
  const dailyExpenses = monthlyExpenses > 0 ? monthlyExpenses / 30 : 100

  // Box 1-schatting: bruto ≈ netto / (1 − marginaal).
  let box1Tax: number | null = null
  let grossYearly = 0
  const netMonthly = horizonData.effectiveInput?.monthlyIncome ?? 0
  const marg = horizonData.fireParams?.marginaalTarief ?? 0.3697
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

  // Jaarruimte-besparing = onbenutte ruimte × marginaal tarief.
  const jaarruimte = computeJaarruimte(grossYearly, 0)
  const jaarruimteSavings =
    jaarruimte.hasData && marg > 0 ? Math.round(jaarruimte.jaarruimte * marg) : 0

  const overview = buildTaxOverview({
    box1Tax,
    box2Tax: null,
    box3Tax,
    grossYearlyIncome: grossYearly > 0 ? grossYearly : null,
    marginalRate: marg,
    dailyExpenses,
    jaarruimte:
      jaarruimte.hasData && jaarruimte.jaarruimte > 0
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

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split('T')[0]

  const [profileRes, budgetsRes, txRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('household_type, number_of_children, children_ages, estimated_monthly_expenses')
      .eq('id', user.id)
      .single(),
    supabase.from('budgets').select('id, slug, parent_id').order('sort_order', { ascending: true }),
    supabase
      .from('transactions')
      .select('budget_id, amount, transaction_type')
      .gte('date', monthStart)
      .lt('date', monthEnd),
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
  const dailyExpenses = monthlyExpenses > 0 ? monthlyExpenses / 30 : 100

  const { data } = await supabase.from('debts').select('*').eq('is_active', true).limit(200)
  const debts = (data ?? []) as Debt[]
  return debtsToAandachtspunten(debts, dailyExpenses)
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

  const [tax, budget, debt] = await Promise.all([
    safe(() => collectTaxAandachtspunten(supabase)),
    safe(() => collectBudgetAandachtspunten(supabase)),
    safe(() => collectDebtAandachtspunten(supabase)),
  ])

  return [...tax, ...budget, ...debt].sort((a, b) => b.savings - a.savings)
}
