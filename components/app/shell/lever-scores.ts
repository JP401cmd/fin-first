/**
 * Shared types + pure computation for the vier-hefbomen-kompas.
 *
 * This file deliberately has NO 'use client' directive so it can be imported
 * by both server components (e.g. app/(app)/layout.tsx) and client components
 * (e.g. lever-compass.tsx, responsive-shell.tsx).
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type LeverStatus = 'green' | 'amber' | 'red' | 'neutral'

export type LeverScores = {
  /** Bezittingen: diversificatie + omvang. */
  assets: { score: number | null; status: LeverStatus }
  /** Schulden: schuld-vermogen-ratio. */
  debts: { score: number | null; status: LeverStatus }
  /** Cashflow: spaarquote (3-maands). */
  cashflow: { score: number | null; status: LeverStatus }
  /** Belasting: box3-exposure. */
  tax: { score: number | null; status: LeverStatus }
}

// ── Score computation ────────────────────────────────────────────────────────

function statusFromScore(score: number | null): LeverStatus {
  if (score === null) return 'neutral'
  if (score >= 60) return 'green'
  if (score >= 30) return 'amber'
  return 'red'
}

/**
 * Bereken de 4 hefboomscores uit layout-data.
 *
 * Wordt aangeroepen in `app/(app)/layout.tsx` (server component). Parameters
 * komen uit de reeds-geladen asset/debt/transaction-queries — geen extra DB-
 * round-trips.
 */
export function computeLeverScores(input: {
  totalAssets: number
  totalDebts: number
  assetTypeCount: number
  /** (income − expenses) / income × 100 over 3 maanden. null = geen transacties. */
  savingsRate: number | null
  /** Totaal box3-belast vermogen boven vrijstelling. */
  box3TaxableAboveThreshold: number
}): LeverScores {
  // 1. Bezittingen: diversificatie
  const assetScore = input.assetTypeCount <= 0
    ? 0
    : input.assetTypeCount >= 5
      ? 100
      : Math.round((input.assetTypeCount / 5) * 100)

  // 2. Schulden: debt-to-asset ratio
  let debtScore: number
  if (input.totalAssets <= 0 && input.totalDebts <= 0) {
    debtScore = 50 // neutral — no financial data
  } else if (input.totalDebts <= 0) {
    debtScore = 100 // no debts = great
  } else if (input.totalAssets <= 0) {
    debtScore = 0 // debts but no assets = worst
  } else {
    const ratio = input.totalDebts / input.totalAssets
    debtScore = ratio >= 1 ? 0 : Math.round((1 - ratio) * 100)
  }

  // 3. Cashflow: savings rate
  let cashflowScore: number | null
  if (input.savingsRate === null) {
    cashflowScore = null // insufficient data
  } else if (input.savingsRate <= 0) {
    cashflowScore = Math.max(0, Math.round(20 + input.savingsRate)) // negative = 0–20
  } else if (input.savingsRate >= 30) {
    cashflowScore = 100
  } else if (input.savingsRate >= 20) {
    cashflowScore = Math.round(80 + ((input.savingsRate - 20) / 10) * 20)
  } else if (input.savingsRate >= 10) {
    cashflowScore = Math.round(50 + ((input.savingsRate - 10) / 10) * 30)
  } else {
    cashflowScore = Math.round((input.savingsRate / 10) * 30 + 20) // 0→20, 10→50
  }

  // 4. Belasting: box3 exposure
  // Green: no meaningful box3 exposure; Amber: moderate; Red: high
  let taxScore: number
  if (input.box3TaxableAboveThreshold <= 0) {
    taxScore = 90 // under vrijstelling = fine
  } else if (input.box3TaxableAboveThreshold <= 100_000) {
    taxScore = 65 // moderate exposure
  } else if (input.box3TaxableAboveThreshold <= 500_000) {
    taxScore = 40 // significant
  } else {
    taxScore = 20 // high exposure
  }

  return {
    assets: { score: assetScore, status: statusFromScore(assetScore) },
    debts: { score: debtScore, status: statusFromScore(debtScore) },
    cashflow: { score: cashflowScore, status: statusFromScore(cashflowScore) },
    tax: { score: taxScore, status: statusFromScore(taxScore) },
  }
}
