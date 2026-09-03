import type { SupabaseClient } from '@supabase/supabase-js'
import { section, formatCurrency, bulletList } from './formatter'
import { localMonthBounds, localMonthStart } from '@/lib/month-range'
import { getRecentDailyExpenseRate } from '@/lib/expense-rate'
import {
  buildBudgetSpendingMap,
  spendingContribution,
  splitContribution,
  budgetBarPct,
  type SpendingTxRow,
} from '@/lib/budget-spending'
import {
  BUDGET_OR_SPLIT_FILTER,
  buildAiBudgetTypeMap,
  loadSplitRows,
} from './budget-spending-source'

/**
 * Budget insights context: alert triggers, 12-month patterns, NIBUD comparison, freedom-time impact.
 * Adds rich budget-specific data for Fin to give proactive advice.
 *
 * De BESTEDINGSSOM is sinds 30 aug 2026 niet meer van dit bestand. Waar hier
 * eerder `if (t.is_income) continue` + `Math.abs()` stond — de "uitsluiten"-lezing
 * op basis van een vlag — draait alles nu op `spendingContribution` /
 * `splitContribution` uit lib/budget-spending.ts: getekend, met richting per
 * budget, en met de split-regels op hun eigen budget. De maandgroepering (12
 * maanden per budget) blijft hier; alleen de bijdrage per rij is canoniek.
 */
export async function buildBudgetInsightsContext(supabase: SupabaseClient): Promise<string> {
  // Tijdzone-veilige maandgrenzen. monthEnd is exclusief = de 1e van de
  // volgende maand; alle queries gebruiken dus .lt(monthEnd) i.p.v. .lte op de
  // laatste dag (zelfde venster, geen vorige-maand-lek).
  const now = new Date()
  const { start: monthStart, end: monthEnd } = localMonthBounds(now)

  // 12 months ago for trend data
  const twelveMonthsAgo = localMonthStart(new Date(now.getFullYear(), now.getMonth() - 11, 1))
  // 3 months ago for income coverage check
  const threeMonthsAgo = localMonthStart(new Date(now.getFullYear(), now.getMonth() - 2, 1))

  const [budgetsResult, currentTxResult, historicalTxResult, nibudResult, incomeResult, profileResult, budgetTypeResult] = await Promise.all([
    supabase
      .from('budgets')
      .select('id, parent_id, name, slug, default_limit, budget_type, is_essential')
      .eq('is_archived', false)
      .order('sort_order', { ascending: true }),
    supabase
      .from('transactions')
      .select('id, budget_id, amount, is_income, transaction_type, is_split')
      .gte('date', monthStart)
      .lt('date', monthEnd)
      // Verbreed: split-OUDERS hebben budget_id NULL en vielen dus volledig
      // buiten beeld, terwijl het scherm hun split-regels wél meetelt.
      .or(BUDGET_OR_SPLIT_FILTER),
    supabase
      .from('transactions')
      .select('id, budget_id, amount, date, is_income, transaction_type, is_split')
      .gte('date', twelveMonthsAgo)
      .lt('date', monthEnd)
      .or(BUDGET_OR_SPLIT_FILTER),
    supabase
      .from('nibud_reference_data')
      .select('mapped_budget_slug, basis_amount')
      .eq('year', now.getFullYear()),
    supabase
      .from('transactions')
      .select('amount, transaction_type')
      .eq('is_income', true)
      .gte('date', threeMonthsAgo)
      .lt('date', monthEnd),
    supabase
      .from('profiles')
      .select('retirement_expense_method')
      .single(),
    // Type-map-bron, BEWUST ZONDER is_archived-filter: een transactie op een
    // gearchiveerd budget houdt zijn richting. De weergavelijst hierboven blijft
    // wél gefilterd. Gelijk aan de budgets-loader en de lookup-tool.
    supabase.from('budgets').select('id, parent_id, budget_type'),
  ])

  const budgets = budgetsResult.data ?? []
  const currentTx = currentTxResult.data ?? []
  const historicalTx = historicalTxResult.data ?? []
  const nibudData = nibudResult.data ?? []
  const incomeTx = incomeResult.data ?? []
  const retirementMethod = profileResult.data?.retirement_expense_method ?? 'essential_budgets'
  const usesEssentialBudgets = retirementMethod === 'essential_budgets'

  if (budgets.length === 0) return ''

  // Richting per budget (child erft parent); zonder haar kan de canonieke
  // bijdrage zijn kwalificatie "op een uitgaven-budget" niet toepassen.
  const budgetTypes = buildAiBudgetTypeMap(
    (budgetTypeResult.data ?? []) as { id: string; parent_id: string | null; budget_type: string | null }[],
  )

  // Split-regels van het HELE 12-maandsvenster (de huidige maand zit daarin),
  // en de datum van de ouder erbij zodat ze in de juiste maandbak vallen.
  const historicalSplits = await loadSplitRows(supabase, historicalTx)
  const dateByTxId = new Map<string, string>()
  for (const t of historicalTx) {
    if (t.is_split && t.id) dateByTxId.set(t.id, t.date)
  }
  const currentSplitTxIds = new Set(currentTx.filter(t => t.is_split && t.id).map(t => t.id as string))
  const currentSplits = historicalSplits.filter(s => currentSplitTxIds.has(s.transaction_id))

  // Besteed deze maand — canoniek, getekend, split-regels op hun eigen budget.
  const currentSpending = buildBudgetSpendingMap(currentTx as SpendingTxRow[], currentSplits, budgetTypes)

  // 12 maanden, gegroepeerd per budget per maand. De GROEPERING is van dit
  // bestand; de bijdrage per rij komt uit de canonieke bron.
  const monthlyByBudget: Record<string, Record<string, number>> = {}
  const addToMonth = (budgetId: string, month: string, delta: number) => {
    if (!monthlyByBudget[budgetId]) monthlyByBudget[budgetId] = {}
    monthlyByBudget[budgetId][month] = (monthlyByBudget[budgetId][month] ?? 0) + delta
  }
  for (const t of historicalTx) {
    if (t.is_split) continue // bedragen leven op de splits
    if (!t.budget_id) continue
    addToMonth(t.budget_id, t.date.slice(0, 7), spendingContribution(t as SpendingTxRow, budgetTypes.get(t.budget_id)))
  }
  for (const s of historicalSplits) {
    const date = dateByTxId.get(s.transaction_id)
    if (!date || !s.budget_id) continue
    addToMonth(s.budget_id, date.slice(0, 7), splitContribution(s))
  }
  const avgByBudget: Record<string, number> = {}
  for (const [budgetId, monthMap] of Object.entries(monthlyByBudget)) {
    const months = Object.values(monthMap)
    avgByBudget[budgetId] = months.reduce((s, v) => s + v, 0) / months.length
  }

  // NIBUD lookup by slug
  const nibudBySlug: Record<string, number> = {}
  for (const n of nibudData) {
    nibudBySlug[n.mapped_budget_slug] = Number(n.basis_amount)
  }

  // Canoniek dagtarief (lib/expense-rate.ts): 12-mnd rolling consumptie —
  // dezelfde wisselkoers als de widgets, zodat Fin dezelfde vrijheidsdagen
  // noemt als het scherm. Hier stond een eigen 12-maands som over de
  // budget-gerichte maandbakken × 12 / 365 (1d, nazorg R2+R3). Deelt binnen
  // één request de cache()-entry van het 12-mnd aggregaat.
  const { dailyRate: dailyExpenseRate } = await getRecentDailyExpenseRate(supabase, now)

  // Only child budgets (subbudgets) for detailed analysis. De richting komt uit
  // de type-map (child erft parent) i.p.v. uit de eigen `budget_type`-kolom van
  // de kindrij — die is niet betrouwbaar gevuld.
  const childBudgets = budgets.filter(b => b.parent_id && budgetTypes.get(b.id) !== 'income')

  // === 10.1: Budget alerts ===
  const { exceeded, nearlyFull } = buildBudgetAlerts(childBudgets, currentSpending)

  // === 10.2: 12-maands trends ===
  const trendLines: string[] = []
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  for (const b of childBudgets) {
    const avg = avgByBudget[b.id]
    const currentMonthData = monthlyByBudget[b.id]?.[currentMonthKey] ?? currentSpending[b.id] ?? 0
    if (!avg || avg < 5) continue
    const deviation = ((currentMonthData - avg) / avg) * 100
    if (Math.abs(deviation) >= 20) {
      const direction = deviation > 0 ? 'hoger' : 'lager'
      trendLines.push(`${b.name}: ${formatCurrency(currentMonthData)} deze maand vs gem. ${formatCurrency(avg)}/mnd (${Math.round(Math.abs(deviation))}% ${direction})`)
    }
  }

  // === 10.3: NIBUD vergelijking ===
  const nibudLines: string[] = []
  for (const b of childBudgets) {
    const slug = b.slug
    const nibudAmount = nibudBySlug[slug]
    if (!nibudAmount || nibudAmount <= 0) continue
    const limit = Number(b.default_limit)
    if (limit <= 0) continue
    const diff = limit - nibudAmount
    const diffPct = Math.round((diff / nibudAmount) * 100)
    if (Math.abs(diffPct) >= 15) {
      const direction = diff > 0 ? 'boven' : 'onder'
      nibudLines.push(`${b.name}: eigen limiet ${formatCurrency(limit)} vs NIBUD ${formatCurrency(nibudAmount)} (${Math.abs(diffPct)}% ${direction} NIBUD-norm)`)
    }
  }

  // === 10.4: Vrijheidstijd impact ===
  const freedomLines: string[] = []
  const fireLines: string[] = []
  if (dailyExpenseRate > 0) {
    for (const b of childBudgets) {
      const limit = Number(b.default_limit)
      if (limit < 50) continue
      const isEssential = (b as { is_essential?: boolean }).is_essential ?? false
      const daysPerYear = Math.round((limit / dailyExpenseRate) * 12)

      if (isEssential && usesEssentialBudgets && daysPerYear >= 1) {
        // Beide voorwaarden OK → echte vrijheidsdagen claim
        freedomLines.push(`${b.name}: ${formatCurrency(limit)}/mnd = ${daysPerYear} vrijheidsdagen/jaar`)
      } else if (limit >= 50) {
        // Niet-essentieel OF andere retirement methode → besparingspotentieel
        fireLines.push(`${b.name}: ${formatCurrency(limit)}/mnd = ${formatCurrency(limit * 12)}/jaar direction FIRE-doel`)
      }
    }
    // Sort desc, top 5 per categorie
    freedomLines.sort((a, b) => {
      const get = (s: string) => parseInt(s.match(/= (\d+) vrijheidsdagen/)?.[1] ?? '0')
      return get(b) - get(a)
    })
    freedomLines.splice(5)
    fireLines.sort((a, b) => {
      const get = (s: string) => parseFloat(s.match(/= €([\d.,]+)/)?.[1]?.replace(',', '.') ?? '0')
      return get(b) - get(a)
    })
    fireLines.splice(5)
  }

  // === Build output ===
  const parts: string[] = []

  if (exceeded.length > 0) {
    parts.push(section('OVERSCHREDEN BUDGETTEN', bulletList(exceeded)))
  }
  if (nearlyFull.length > 0) {
    parts.push(section('BUDGETTEN BIJNA VOL (>80%)', bulletList(nearlyFull)))
  }
  if (trendLines.length > 0) {
    parts.push(section('AFWIJKENDE UITGAVEN T.O.V. 12-MAANDS GEMIDDELDE', bulletList(trendLines)))
  }
  if (nibudLines.length > 0) {
    parts.push(section('NIBUD VERGELIJKING', bulletList(nibudLines)))
  }
  if (freedomLines.length > 0 && dailyExpenseRate > 0) {
    parts.push(section(
      'ESSENTIËLE BUDGETTEN — VRIJHEIDSDAGEN PER JAAR',
      `Dagtarief (12-mnd uitgaven): ${formatCurrency(dailyExpenseRate)}/dag\n` + bulletList(freedomLines)
    ))
  }
  if (fireLines.length > 0) {
    const fireLabel = usesEssentialBudgets
      ? 'NIET-ESSENTIËLE BUDGETTEN — BESPARINGSPOTENTIEEL RICHTING FIRE'
      : 'BUDGETTEN — BESPARINGSPOTENTIEEL RICHTING FIRE (retirement methode: geen essentiële budgetten)'
    parts.push(section(fireLabel, bulletList(fireLines)))
  }

  // === 10.5: Dekkingsgraad waarschuwing ===
  // Overboekingen tussen eigen rekeningen zijn geen inkomen.
  const realIncomeTx = incomeTx.filter(
    (t: { transaction_type?: string | null }) =>
      t.transaction_type !== 'transfer' && t.transaction_type !== 'joint_transfer',
  )
  const avgMonthlyIncome = realIncomeTx.length > 0
    ? realIncomeTx.reduce((s, t) => s + Math.abs(Number(t.amount)), 0) / 3
    : 0
  if (avgMonthlyIncome > 0) {
    const totalAllocated = childBudgets
      .reduce((s, b) => s + Number(b.default_limit), 0)
    const coverageRatio = (totalAllocated / avgMonthlyIncome) * 100
    if (coverageRatio > 100) {
      parts.push(section(
        '⚠️ DEKKINGSGRAAD WAARSCHUWING',
        `${coverageRatio.toFixed(0)}% van inkomen toegewezen — ${formatCurrency(totalAllocated)} budget vs ${formatCurrency(avgMonthlyIncome)} gemiddeld maandinkomen (3-maands gem.). Je hebt meer gebudgetteerd dan je verdient.`
      ))
    }
  }

  return parts.join('\n')
}

/** Budgetrij zoals de alert-regels 'm nodig hebben. */
export interface BudgetAlertRow {
  id: string
  name: string
  default_limit: number | string | null
}

/**
 * De OVER-/BIJNA-VOL-regels van de prompt, als pure functie zodat de
 * belangrijkste gedragsregel toetsbaar is zonder database.
 *
 * De harde regel: een budget met een NEGATIEVE netto-besteding (meer inkomsten
 * dan uitgaven) is nooit "over budget". Vóór de convergentie van 30 aug 2026
 * werden inkomsten uitgesloten in plaats van afgetrokken, waardoor een budget
 * met EUR 1.265 uitgaven en EUR 8.000 inkomsten in de prompt als "127% — OVER"
 * verscheen terwijl het scherm -EUR 6.735 toonde.
 *
 * `budgetBarPct` klemt onderaan op 0 (geen -410%) en bovenaan bewust NIET: de
 * overschrijdingsstaart moet zichtbaar blijven.
 */
export function buildBudgetAlerts(
  budgets: BudgetAlertRow[],
  spending: Record<string, number>,
): { exceeded: string[]; nearlyFull: string[] } {
  const exceeded: string[] = []
  const nearlyFull: string[] = []

  for (const b of budgets) {
    const spent = spending[b.id] ?? 0
    const limit = Number(b.default_limit)
    if (!(limit > 0)) continue
    // Expliciet, niet impliciet-via-het-percentage: netto geld binnen is geen
    // overschrijding en geen waarschuwing.
    if (spent <= 0) continue
    const pct = budgetBarPct(spent, limit)
    if (pct >= 100) {
      exceeded.push(`${b.name}: ${formatCurrency(spent)}/${formatCurrency(limit)} (${Math.round(pct)}% — OVER)`)
    } else if (pct >= 80) {
      nearlyFull.push(`${b.name}: ${formatCurrency(spent)}/${formatCurrency(limit)} (${Math.round(pct)}% — BIJNA VOL)`)
    }
  }

  return { exceeded, nearlyFull }
}
