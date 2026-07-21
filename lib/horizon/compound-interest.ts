// ── Samengestelde-interest berekening ───────────────────────────
// Pure functie: maandinleg + rendement → jaarlijkse inleg/rendement/waarde.
// Verhuisd uit components/app/horizon/compound-interest-chart.tsx (UI→lib).

export type CompoundInterestRow = {
  year: number
  totalDeposits: number
  totalReturns: number
  totalValue: number
}

// ── Computation ─────────────────────────────────────────────────────────────

export function computeCompoundInterest(
  monthlyDeposit: number,
  annualReturn: number,
  years: number,
): CompoundInterestRow[] {
  const monthlyRate = annualReturn / 12
  const rows: CompoundInterestRow[] = [
    { year: 0, totalDeposits: 0, totalReturns: 0, totalValue: 0 },
  ]

  let totalValue = 0
  for (let m = 1; m <= years * 12; m++) {
    // Interest on existing balance first, then add deposit
    totalValue = totalValue * (1 + monthlyRate) + monthlyDeposit
    const totalDeposits = monthlyDeposit * m
    const totalReturns = totalValue - totalDeposits

    // Record a data point every 12 months (yearly)
    if (m % 12 === 0) {
      rows.push({
        year: m / 12,
        totalDeposits,
        totalReturns: Math.max(0, totalReturns),
        totalValue,
      })
    }
  }

  return rows
}
