// lib/cashflow-forecast-math.ts
// Pure forecast-rekenkern voor /overzicht/cashflow/forecast. Géén 'use client'
// zodat zowel de client-tabel (CashflowForecast) als server-components (de
// cashflow-landingskaarten) dezelfde aannames delen en niet uit-sync raken.

import type { RecurringTransaction } from '@/lib/recurring-data'

export const FORECAST_MONTHS = 6

export type ForecastRow = {
  monthIdx: number
  label: string
  incoming: number
  outgoing: number
  net: number
  cumulative: number
}

/**
 * Per-maand-equivalent van een terugkerende transactie (signed: positief =
 * inkomen, negatief = uitgave). Frequency-aware.
 */
export function recurringPerMonth(r: { amount: number | string; frequency: string }): number {
  const amount = Number(r.amount)
  switch (r.frequency) {
    case 'weekly':
      return amount * (52 / 12)
    case 'monthly':
      return amount
    case 'quarterly':
      return amount / 3
    case 'yearly':
      return amount / 12
    default:
      return 0
  }
}

/**
 * Bouwt de 6-maands-vooruitblik. Baseline (avg inkomen + uitgaven over 6m)
 * herhaalt iedere maand; recurring transactions worden per-maand omgerekend
 * en bovenop de baseline opgeteld. Cumulatief saldo start bij `startingBalance`.
 *
 * Lineair — geen inflatie of marktvolatiliteit.
 */
export function buildForecast(
  recurrings: RecurringTransaction[],
  baselineIncome: number,
  baselineExpenses: number,
  startingBalance: number,
  fromDate: Date,
): ForecastRow[] {
  const rows: ForecastRow[] = []
  let cumulative = startingBalance

  for (let i = 1; i <= FORECAST_MONTHS; i++) {
    const monthDate = new Date(fromDate.getFullYear(), fromDate.getMonth() + i, 1)
    const label = monthDate.toLocaleDateString('nl-NL', {
      month: 'short',
      year: 'numeric',
    })
    let incoming = Math.max(0, baselineIncome)
    let outgoing = Math.max(0, baselineExpenses)
    for (const r of recurrings) {
      if (!r.is_active) continue
      const perMonth = recurringPerMonth(r)
      if (perMonth > 0) incoming += perMonth
      else outgoing += Math.abs(perMonth)
    }
    const net = incoming - outgoing
    cumulative += net
    rows.push({
      monthIdx: i,
      label,
      incoming: Math.round(incoming),
      outgoing: Math.round(outgoing),
      net: Math.round(net),
      cumulative: Math.round(cumulative),
    })
  }
  return rows
}
