/**
 * Shared types + pure computation for the vier-hefbomen-kompas.
 *
 * This file deliberately has NO 'use client' directive so it can be imported
 * by both server components (e.g. app/(app)/layout.tsx) and client components
 * (e.g. lever-compass.tsx, responsive-shell.tsx).
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type LeverStatus = 'green' | 'amber' | 'red' | 'neutral'

export type LeverEntry = {
  score: number | null
  status: LeverStatus
  /** Korte detailtekst voor tooltip, bv. "4 typen · € 834k". */
  detail: string
}

export type LeverScores = {
  /** Bezittingen: diversificatie + omvang. */
  assets: LeverEntry
  /** Schulden: schuld-vermogen-ratio. */
  debts: LeverEntry
  /** Cashflow: spaarquote (3-maands). */
  cashflow: LeverEntry
  /** Belasting: box3-exposure. */
  tax: LeverEntry
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
/**
 * Format a EUR value to a short display string, e.g. "€ 142k" or "€ 1,2M".
 */
function fmtShort(value: number): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (abs >= 1_000_000) {
    const m = abs / 1_000_000
    const rounded = Math.round(m * 10) / 10
    return `${sign}€ ${rounded.toString().replace('.', ',')}M`
  }
  if (abs >= 1_000) {
    return `${sign}€ ${Math.round(abs / 1_000)}k`
  }
  return `${sign}€ ${Math.round(abs)}`
}

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
  // Bij géén assets → null (neutral/grijs) — er is niets om te beoordelen.
  // Bij wel assets → score 20–100 op basis van diversificatie.
  const assetScore: number | null = input.assetTypeCount <= 0
    ? null
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

  // ── Detail text per lever ─────────────────────────────────────────────────
  const assetDetail = input.assetTypeCount <= 0
    ? 'Geen bezittingen geregistreerd'
    : `${input.assetTypeCount} ${input.assetTypeCount === 1 ? 'type' : 'typen'} · ${fmtShort(input.totalAssets)}`

  let debtDetail: string
  if (input.totalDebts <= 0 && input.totalAssets <= 0) {
    debtDetail = 'Geen data'
  } else if (input.totalDebts <= 0) {
    debtDetail = 'Schuldenvrij'
  } else {
    const ratio = input.totalAssets > 0
      ? Math.round((input.totalDebts / input.totalAssets) * 100)
      : 100
    debtDetail = `${fmtShort(input.totalDebts)} · ${ratio}% van vermogen`
  }

  const cashflowDetail = input.savingsRate === null
    ? 'Onvoldoende transactiedata'
    : `Spaarquote ${Math.round(input.savingsRate)}%`

  const taxDetail = input.box3TaxableAboveThreshold <= 0
    ? 'Onder vrijstelling'
    : `${fmtShort(input.box3TaxableAboveThreshold)} boven vrijstelling`

  return {
    assets: { score: assetScore, status: statusFromScore(assetScore), detail: assetDetail },
    debts: { score: debtScore, status: statusFromScore(debtScore), detail: debtDetail },
    cashflow: { score: cashflowScore, status: statusFromScore(cashflowScore), detail: cashflowDetail },
    tax: { score: taxScore, status: statusFromScore(taxScore), detail: taxDetail },
  }
}
