/**
 * lib/lever-scores-loader.savings-rate.test.ts
 *
 * REGRESSIE-LOCK voor KRUIS-06: de sidebar-hefboomtooltip toonde "Spaarquote 164%"
 * i.p.v. de canonieke ~50%.
 *
 * Twee losstaande fouten in de oude lib/lever-scores-loader.ts:
 *   1. `txExpense` werd gesommeerd ZONDER Math.abs terwijl transactions.amount voor
 *      uitgaven negatief is → (txIncome − txExpense) = (txIncome + |uitgaven|) → >100%.
 *   2. Een eigen 3-maands algoritme i.p.v. de canonieke 6-maands savingsRate
 *      (savingsRateFromAggregates, transfer-gefilterd, incl. spaarbudget- + aflossing-
 *      correctie + extrapolatie) — een "consume, don't recompute"-schending.
 *
 * De fix laat de loader de gedeelde helper `computeSavingsRate6m` consumeren. Deze
 * test legt beide vast: (a) de OUDE formule produceert >100% op productie-achtige
 * signed data (bug-signaal); (b) de NIEUWE aggregatie == de canonieke
 * savingsRateFromAggregates/computeSavingsRate6m en blijft ≤ ~100% voor realistische
 * inputs. Geen Supabase-calls — de aggregatie-spec is woordelijk gespiegeld uit de
 * loader; de helper zelf wordt echt geïmporteerd.
 */

import { describe, it, expect } from 'vitest'
import { computeSavingsRate6m, savingsRateFromAggregates } from './savings-source'

// ── Transactievorm (spiegelt Tx6mRow in lever-scores-loader.ts) ────────────────
type Tx = {
  amount: number
  budget_id?: string | null
  transaction_type?: string | null
  /** Alleen voor de OUDE (buggy) formule die op het is_income-vlag splitste. */
  is_income?: boolean
}

const isRealTx = (t: { transaction_type?: string | null }) =>
  t.transaction_type !== 'transfer' && t.transaction_type !== 'joint_transfer'

// ── NIEUWE aggregatie (woordelijk uit lib/lever-scores-loader.ts) ──────────────
function leverSavingsRate(
  tx6m: Tx[],
  savingsBudgetIds: Set<string>,
  debtAflossing6m: number,
  dataMonths: number,
): number | null {
  let income6m = 0
  let expenses6m = 0
  let savingsBudgetSpent6m = 0
  for (const t of tx6m) {
    if (!isRealTx(t)) continue
    const amt = Number(t.amount)
    if (amt > 0) {
      income6m += amt
      continue
    }
    const abs = Math.abs(amt)
    expenses6m += abs
    if (t.budget_id && savingsBudgetIds.has(t.budget_id)) savingsBudgetSpent6m += abs
  }
  return income6m > 0
    ? computeSavingsRate6m({
        income6m,
        expenses6m,
        savingsBudgetSpent6m,
        debtAflossing6m,
        dataMonths,
      }).savingsRate6m
    : null
}

// ── OUDE (buggy) formule (woordelijk uit de vorige lever-scores-loader.ts) ──────
function oldBuggyRate(tx: Tx[]): number | null {
  const txIncome = tx.filter((t) => t.is_income).reduce((s, t) => s + Number(t.amount), 0)
  // BUG: geen Math.abs → uitgaven (negatief) worden bij inkomen OPGETELD.
  const txExpense = tx.filter((t) => !t.is_income).reduce((s, t) => s + Number(t.amount), 0)
  return txIncome > 0 ? ((txIncome - txExpense) / txIncome) * 100 : null
}

// ── Fixture: 6 maanden Tessa-achtige data ──────────────────────────────────────
// 6× inkomen +4000, 6× uitgave −2200, 1× spaarbudget-storting −600 (budget 'sparen'),
// een eigen-rekening-transfer die transfer-gefilterd hoort te worden, en €200/mnd
// schuldaflossing (debtAflossing6m = 1200).
const TX_6M: Tx[] = [
  ...Array.from({ length: 6 }, (): Tx => ({ amount: 4000, is_income: true, transaction_type: null })),
  ...Array.from({ length: 6 }, (): Tx => ({ amount: -2200, is_income: false, transaction_type: null })),
  { amount: -600, budget_id: 'sparen', is_income: false, transaction_type: null },
  // Eigen-rekening-transfer: NIET meetellen (isRealTx filtert 'transfer').
  { amount: 5000, is_income: true, transaction_type: 'transfer' },
  { amount: -5000, is_income: false, transaction_type: 'transfer' },
]
const SAVINGS_BUDGET_IDS = new Set(['sparen'])
const DEBT_AFLOSSING_6M = 1200

describe('KRUIS-06 — sidebar-spaarquote is canoniek, niet meer 164%', () => {
  it('de OUDE formule produceert >100% op signed uitgaven (het bug-signaal)', () => {
    const old = oldBuggyRate(TX_6M)
    // txIncome = 24000 (+5000 transfer telde óók mee → 29000), txExpense (signed) =
    // −13200 − 600 − 5000 = −18800. (29000 − (−18800)) / 29000 × 100 ≈ 164,8%.
    expect(old).not.toBeNull()
    expect(old!).toBeGreaterThan(100)
  })

  it('reproduceert de gerapporteerde 164% exact op de kaart-cijfers', () => {
    // Live-cijfers uit de bevinding: txIncome €24.250, txExpense (signed) −€15.761,35.
    const cardTx: Tx[] = [
      { amount: 24250, is_income: true },
      { amount: -15761.35, is_income: false },
    ]
    const old = oldBuggyRate(cardTx)!
    expect(Math.round(old)).toBe(165) // ≈164,99% → afgerond 165 (kaart toonde "164%")
  })

  it('de NIEUWE aggregatie is canoniek (≈50%) en ≤ 100%', () => {
    const rate = leverSavingsRate(TX_6M, SAVINGS_BUDGET_IDS, DEBT_AFLOSSING_6M, 6)
    expect(rate).not.toBeNull()
    // income 24000; uitgaven 13200 (excl. de 600 spaarbudget-storting, die telt als
    // sparen); + aflossing 1200 → (24000 − 13200 + 1200) / 24000 × 100 = 50%.
    expect(rate).toBe(50)
    expect(rate!).toBeLessThanOrEqual(100)
  })

  it('de NIEUWE aggregatie == savingsRateFromAggregates (single-sourced)', () => {
    const rate = leverSavingsRate(TX_6M, SAVINGS_BUDGET_IDS, DEBT_AFLOSSING_6M, 6)
    // income6m 24000, expenses6m 13800 (incl. 600 spaarbudget), savingsBudget 600.
    const canonical = savingsRateFromAggregates(24000, 13800 - 600, DEBT_AFLOSSING_6M)
    expect(rate).toBe(canonical)
  })

  it('eigen-rekening-transfers tellen niet mee (isRealTx-filter)', () => {
    const withoutTransfers = leverSavingsRate(
      TX_6M.filter((t) => t.transaction_type !== 'transfer'),
      SAVINGS_BUDGET_IDS,
      DEBT_AFLOSSING_6M,
      6,
    )
    const withTransfers = leverSavingsRate(TX_6M, SAVINGS_BUDGET_IDS, DEBT_AFLOSSING_6M, 6)
    // De transfer-rijen (±5000) mogen de quote niet veranderen.
    expect(withTransfers).toBe(withoutTransfers)
  })

  it('zonder transactie-inkomen → null (cashflow-hefboom toont "onvoldoende data")', () => {
    const noIncome: Tx[] = [{ amount: -1000, is_income: false, transaction_type: null }]
    expect(leverSavingsRate(noIncome, SAVINGS_BUDGET_IDS, 0, 6)).toBeNull()
  })
})

describe('computeSavingsRate6m — gedeelde 6-maands helper', () => {
  it('basis: rate == savingsRateFromAggregates bij ≥6 maanden data', () => {
    const r = computeSavingsRate6m({
      income6m: 24000,
      expenses6m: 13800,
      savingsBudgetSpent6m: 600,
      debtAflossing6m: 1200,
      dataMonths: 6,
    })
    expect(r.savingsRate6m).toBe(savingsRateFromAggregates(24000, 13800 - 600, 1200))
    expect(r.isEstimate).toBe(false)
    expect(r.extIncome6).toBe(24000)
  })

  it('extrapoleert <6 maanden transactiedata lineair naar een 6-maands basis', () => {
    // 3 maanden transactiedata: income/expenses/savingsBudget ×2. debtAflossing6m is
    // een maand×6-figuur (computeDebtAflossingMonthly × 6) en wordt NIET geëxtrapoleerd,
    // dus dezelfde 1200 als het 6-maands geval → identieke 50%.
    const partial = computeSavingsRate6m({
      income6m: 12000,
      expenses6m: 6900,
      savingsBudgetSpent6m: 300,
      debtAflossing6m: 1200,
      dataMonths: 3,
    })
    expect(partial.extIncome6).toBe(24000)
    expect(partial.extExpenses6).toBe(13800)
    expect(partial.extSavingsBudget6).toBe(600)
    // Zelfde verhouding als het 6-maands geval hierboven → 50%.
    expect(partial.savingsRate6m).toBe(50)
  })

  it('profiel-fallback bij aggregaat = 0 (transactieloze gebruiker)', () => {
    const r = computeSavingsRate6m({
      income6m: 0,
      expenses6m: 0,
      savingsBudgetSpent6m: 0,
      debtAflossing6m: 0,
      dataMonths: 6,
      fallbackMonthlyIncome: 3000,
      fallbackMonthlyExpenses: 2100,
    })
    expect(r.isEstimate).toBe(true) // aggregaat gaf 0
    expect(r.savingsRate6m).toBe(30) // (3000 − 2100) / 3000 × 100
  })

  it('GEEN fallback → 0 wanneer de fallback-velden ontbreken (sidebar-pad)', () => {
    const r = computeSavingsRate6m({
      income6m: 0,
      expenses6m: 0,
      savingsBudgetSpent6m: 0,
      debtAflossing6m: 0,
      dataMonths: 6,
    })
    expect(r.isEstimate).toBe(true)
    expect(r.savingsRate6m).toBe(0)
  })

  it('negatieve spaarquote bij uitgaven > inkomen (geen clamp in de helper)', () => {
    const r = computeSavingsRate6m({
      income6m: 12000,
      expenses6m: 15000,
      savingsBudgetSpent6m: 0,
      debtAflossing6m: 0,
      dataMonths: 6,
    })
    expect(r.savingsRate6m).toBe(-25) // (12000 − 15000) / 12000 × 100
  })
})
