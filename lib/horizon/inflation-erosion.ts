// ── Inflatie-erosie berekening ───────────────────────────
// Pure functie: startbedrag → reële koopkracht per jaar + vrijheidsdagen.
// Verhuisd uit components/app/horizon/inflation-erosion-chart.tsx (UI→lib).

export type InflationRow = {
  year: number
  /** Nominal amount (stays at startAmount) */
  nominal: number
  /** Real purchasing power after inflation */
  realValue: number
  /** Freedom days the real value represents */
  freedomDays: number
  /** Freedom days lost vs year 0 */
  freedomDaysLost: number
}

// ── Computation ─────────────────────────────────────────────────────────────

export function computeInflationErosion(
  startAmount: number,
  annualInflation: number,
  years: number,
  dailyExpenses: number,
): InflationRow[] {
  const rows: InflationRow[] = []
  const baseFreedomDays =
    dailyExpenses > 0 ? startAmount / dailyExpenses : 0

  for (let y = 0; y <= years; y++) {
    const realValue = startAmount / Math.pow(1 + annualInflation, y)
    const freedomDays = dailyExpenses > 0 ? realValue / dailyExpenses : 0
    rows.push({
      year: y,
      nominal: startAmount,
      realValue,
      freedomDays,
      freedomDaysLost: baseFreedomDays - freedomDays,
    })
  }

  return rows
}
