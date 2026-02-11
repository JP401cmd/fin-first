import type { SupabaseClient } from '@supabase/supabase-js'
import { ASSET_TYPE_LABELS, projectPortfolio, type Asset } from '@/lib/asset-data'
import { DEBT_TYPE_LABELS, debtProjection, type Debt } from '@/lib/debt-data'
import { section, formatCurrency } from './formatter'

/**
 * Horizon-specific context: assets, debts, projections.
 * Uses real Supabase data.
 */
export async function buildHorizonContext(supabase: SupabaseClient): Promise<string> {
  const [assetsResult, debtsResult] = await Promise.all([
    supabase
      .from('assets')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
    supabase
      .from('debts')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
  ])

  const assets = (assetsResult.data ?? []) as Asset[]
  const debts = (debtsResult.data ?? []) as Debt[]

  if (assets.length === 0 && debts.length === 0) {
    return section('VERMOGEN & PROJECTIES', 'Nog geen assets of schulden geregistreerd.')
  }

  const parts: string[] = []

  // Asset breakdown
  if (assets.length > 0) {
    const assetLines = assets.map((a) =>
      `${a.name} (${ASSET_TYPE_LABELS[a.asset_type]}): ${formatCurrency(Number(a.current_value))} | rendement ${a.expected_return}%/jr | bijdrage ${formatCurrency(Number(a.monthly_contribution))}/mnd`
    )
    parts.push(section('ASSETS', assetLines.join('\n')))
  }

  // Debt breakdown with projections
  if (debts.length > 0) {
    const debtLines = debts.map((d) => {
      const proj = debtProjection(d)
      const payoff = proj.isPayable
        ? `afbetaald in ${Math.floor(proj.monthsToPayoff / 12)}j ${proj.monthsToPayoff % 12}m | totale rente: ${formatCurrency(proj.totalInterest)}`
        : 'betaling dekt rente niet!'
      return `${d.name} (${DEBT_TYPE_LABELS[d.debt_type]}): ${formatCurrency(Number(d.current_balance))} @ ${d.interest_rate}% | ${formatCurrency(Number(d.monthly_payment))}/mnd | ${payoff}`
    })
    parts.push(section('SCHULDEN', debtLines.join('\n')))
  }

  // 5-year portfolio projection
  if (assets.length > 0) {
    const projection = projectPortfolio(assets, 60)
    const proj5y = projection[projection.length - 1]
    if (proj5y) {
      parts.push(section('5-JAAR PROJECTIE', `Totale assets over 5 jaar (projectie): ${formatCurrency(proj5y.total)}`))
    }
  }

  return parts.join('\n')
}
