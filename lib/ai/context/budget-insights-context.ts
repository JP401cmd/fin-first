import type { SupabaseClient } from '@supabase/supabase-js'
import { section, formatCurrency, bulletList } from './formatter'

/**
 * Budget insights context: alert triggers, 12-month patterns, NIBUD comparison, freedom-time impact.
 * Adds rich budget-specific data for Will to give proactive advice.
 */
export async function buildBudgetInsightsContext(supabase: SupabaseClient): Promise<string> {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]

  // 12 months ago for trend data
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString().split('T')[0]
  // 3 months ago for income coverage check
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString().split('T')[0]

  const [budgetsResult, currentTxResult, historicalTxResult, nibudResult, incomeResult, profileResult] = await Promise.all([
    supabase
      .from('budgets')
      .select('id, parent_id, name, slug, default_limit, budget_type, is_essential')
      .eq('is_archived', false)
      .order('sort_order', { ascending: true }),
    supabase
      .from('transactions')
      .select('budget_id, amount, is_income')
      .gte('date', monthStart)
      .lte('date', monthEnd)
      .not('budget_id', 'is', null),
    supabase
      .from('transactions')
      .select('budget_id, amount, date, is_income')
      .gte('date', twelveMonthsAgo)
      .lte('date', monthEnd)
      .not('budget_id', 'is', null),
    supabase
      .from('nibud_reference_data')
      .select('mapped_budget_slug, basis_amount')
      .eq('year', now.getFullYear()),
    supabase
      .from('transactions')
      .select('amount')
      .eq('is_income', true)
      .gte('date', threeMonthsAgo)
      .lte('date', monthEnd),
    supabase
      .from('profiles')
      .select('retirement_expense_method')
      .single(),
  ])

  const budgets = budgetsResult.data ?? []
  const currentTx = currentTxResult.data ?? []
  const historicalTx = historicalTxResult.data ?? []
  const nibudData = nibudResult.data ?? []
  const incomeTx = incomeResult.data ?? []
  const retirementMethod = profileResult.data?.retirement_expense_method ?? 'essential_budgets'
  const usesEssentialBudgets = retirementMethod === 'essential_budgets'

  if (budgets.length === 0) return ''

  // Build spending maps
  const currentSpending: Record<string, number> = {}
  for (const t of currentTx) {
    if (!t.budget_id || t.is_income) continue
    currentSpending[t.budget_id] = (currentSpending[t.budget_id] ?? 0) + Math.abs(Number(t.amount))
  }

  // Build 12-month average spending per budget
  const historicalByBudget: Record<string, number[]> = {}
  for (const t of historicalTx) {
    if (!t.budget_id || t.is_income) continue
    if (!historicalByBudget[t.budget_id]) historicalByBudget[t.budget_id] = []
    historicalByBudget[t.budget_id].push(Math.abs(Number(t.amount)))
  }
  // Group by month per budget to get monthly totals
  const monthlyByBudget: Record<string, Record<string, number>> = {}
  for (const t of historicalTx) {
    if (!t.budget_id || t.is_income) continue
    const month = t.date.slice(0, 7)
    if (!monthlyByBudget[t.budget_id]) monthlyByBudget[t.budget_id] = {}
    monthlyByBudget[t.budget_id][month] = (monthlyByBudget[t.budget_id][month] ?? 0) + Math.abs(Number(t.amount))
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

  // Calculate daily expense rate from 12 months of expense transactions
  const totalExpenses = historicalTx
    .filter(t => !t.is_income)
    .reduce((s, t) => s + Math.abs(Number(t.amount)), 0)
  const distinctMonths = new Set(historicalTx.map(t => t.date.slice(0, 7))).size
  const avgMonthlyExpenses = distinctMonths > 0 ? totalExpenses / distinctMonths : 0
  const dailyExpenseRate = (avgMonthlyExpenses * 12) / 365

  // Only child budgets (subbudgets) for detailed analysis
  const childBudgets = budgets.filter(b => b.parent_id && b.budget_type !== 'income')

  // === 10.1: Budget alerts ===
  const overschreden: string[] = []
  const bijnaVol: string[] = []

  for (const b of childBudgets) {
    const spent = currentSpending[b.id] ?? 0
    const limit = Number(b.default_limit)
    if (limit <= 0) continue
    const pct = (spent / limit) * 100
    if (pct >= 100) {
      overschreden.push(`${b.name}: ${formatCurrency(spent)}/${formatCurrency(limit)} (${Math.round(pct)}% — OVER)`)
    } else if (pct >= 80) {
      bijnaVol.push(`${b.name}: ${formatCurrency(spent)}/${formatCurrency(limit)} (${Math.round(pct)}% — BIJNA VOL)`)
    }
  }

  // === 10.2: 12-maands trends ===
  const trendLines: string[] = []
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  for (const b of childBudgets) {
    const avg = avgByBudget[b.id]
    const huidigeMonthData = monthlyByBudget[b.id]?.[currentMonthKey] ?? currentSpending[b.id] ?? 0
    if (!avg || avg < 5) continue
    const afwijking = ((huidigeMonthData - avg) / avg) * 100
    if (Math.abs(afwijking) >= 20) {
      const richting = afwijking > 0 ? 'hoger' : 'lager'
      trendLines.push(`${b.name}: ${formatCurrency(huidigeMonthData)} deze maand vs gem. ${formatCurrency(avg)}/mnd (${Math.round(Math.abs(afwijking))}% ${richting})`)
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
      const richting = diff > 0 ? 'boven' : 'onder'
      nibudLines.push(`${b.name}: eigen limiet ${formatCurrency(limit)} vs NIBUD ${formatCurrency(nibudAmount)} (${Math.abs(diffPct)}% ${richting} NIBUD-norm)`)
    }
  }

  // === 10.4: Vrijheidstijd impact ===
  const vrijheidsLines: string[] = []
  const fireLines: string[] = []
  if (dailyExpenseRate > 0) {
    for (const b of childBudgets) {
      const limit = Number(b.default_limit)
      if (limit < 50) continue
      const isEssential = (b as { is_essential?: boolean }).is_essential ?? false
      const dagenPerJaar = Math.round((limit / dailyExpenseRate) * 12)

      if (isEssential && usesEssentialBudgets && dagenPerJaar >= 1) {
        // Beide voorwaarden OK → echte vrijheidsdagen claim
        vrijheidsLines.push(`${b.name}: ${formatCurrency(limit)}/mnd = ${dagenPerJaar} vrijheidsdagen/jaar`)
      } else if (limit >= 50) {
        // Niet-essentieel OF andere retirement methode → besparingspotentieel
        fireLines.push(`${b.name}: ${formatCurrency(limit)}/mnd = ${formatCurrency(limit * 12)}/jaar richting FIRE-doel`)
      }
    }
    // Sort desc, top 5 per categorie
    vrijheidsLines.sort((a, b) => {
      const get = (s: string) => parseInt(s.match(/= (\d+) vrijheidsdagen/)?.[1] ?? '0')
      return get(b) - get(a)
    })
    vrijheidsLines.splice(5)
    fireLines.sort((a, b) => {
      const get = (s: string) => parseFloat(s.match(/= €([\d.,]+)/)?.[1]?.replace(',', '.') ?? '0')
      return get(b) - get(a)
    })
    fireLines.splice(5)
  }

  // === Build output ===
  const parts: string[] = []

  if (overschreden.length > 0) {
    parts.push(section('OVERSCHREDEN BUDGETTEN', bulletList(overschreden)))
  }
  if (bijnaVol.length > 0) {
    parts.push(section('BUDGETTEN BIJNA VOL (>80%)', bulletList(bijnaVol)))
  }
  if (trendLines.length > 0) {
    parts.push(section('AFWIJKENDE UITGAVEN T.O.V. 12-MAANDS GEMIDDELDE', bulletList(trendLines)))
  }
  if (nibudLines.length > 0) {
    parts.push(section('NIBUD VERGELIJKING', bulletList(nibudLines)))
  }
  if (vrijheidsLines.length > 0 && dailyExpenseRate > 0) {
    parts.push(section(
      'ESSENTIËLE BUDGETTEN — VRIJHEIDSDAGEN PER JAAR',
      `Dagelijkse must-uitgaven: ${formatCurrency(dailyExpenseRate)}/dag\n` + bulletList(vrijheidsLines)
    ))
  }
  if (fireLines.length > 0) {
    const fireLabel = usesEssentialBudgets
      ? 'NIET-ESSENTIËLE BUDGETTEN — BESPARINGSPOTENTIEEL RICHTING FIRE'
      : 'BUDGETTEN — BESPARINGSPOTENTIEEL RICHTING FIRE (retirement methode: geen essentiële budgetten)'
    parts.push(section(fireLabel, bulletList(fireLines)))
  }

  // === 10.5: Dekkingsgraad waarschuwing ===
  const avgMonthlyIncome = incomeTx.length > 0
    ? incomeTx.reduce((s, t) => s + Math.abs(Number(t.amount)), 0) / 3
    : 0
  if (avgMonthlyIncome > 0) {
    const totalAllocated = childBudgets
      .reduce((s, b) => s + Number(b.default_limit), 0)
    const dekkingsgraad = (totalAllocated / avgMonthlyIncome) * 100
    if (dekkingsgraad > 100) {
      parts.push(section(
        '⚠️ DEKKINGSGRAAD WAARSCHUWING',
        `${dekkingsgraad.toFixed(0)}% van inkomen toegewezen — ${formatCurrency(totalAllocated)} budget vs ${formatCurrency(avgMonthlyIncome)} gemiddeld maandinkomen (3-maands gem.). Je hebt meer gebudgetteerd dan je verdient.`
      ))
    }
  }

  return parts.join('\n')
}
