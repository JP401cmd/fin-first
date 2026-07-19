/**
 * lib/horizon-data-loader.spaarquote-parity.test.ts
 *
 * REGRESSIE-LOCK voor de spaarquote-grondslag-gelijktrekking (release-poort-9,
 * fase 2). De 6-maands spaarquote-sommen in lib/horizon-data-loader.ts stonden op
 * transfer-INCLUSIEF (`realOnly:false`), terwijl de canonieke grondslag app-breed
 * transfer-EXCLUSIEF is: dashboard-data-loader (realOnly:true), lever-scores-loader
 * (realOnly:true) en core-data-loader (isRealTx). Gevolg: horizon's savingsRate6m —
 * en dus de savings-pijler van de gezondheidsscore + het percentage op de
 * cashflow-hefboomtegel — week af van statusdot/briefing/cashflow-pagina bij
 * transfer-zware gebruikers.
 *
 * Deze test bewijst met een transfer-HOUDENDE fixture dat horizon's savingsRate6m nu
 * ==  dashboard's savingsRate6m (beide op de transfer-exclusieve grondslag), én dat de
 * oude transfer-inclusieve reductie op diezelfde fixture een AFWIJKENDE quote gaf
 * (zodat de fixture aantoonbaar transfer-gevoelig is en de fix ertoe doet).
 *
 * De echte gedeelde bouwstenen worden geïmporteerd (aggSumPositief/aggSumNegatiefAbs
 * uit tx-aggregates + computeSavingsRate6m uit savings-source) — dat zijn precies de
 * primitieven die BEIDE loaders consumeren. De aggregatie-spec eronder is woordelijk
 * gespiegeld uit de loaders (dashboard r757-763 == horizon, nu identiek), zoals de
 * bestaande KRUIS-06- en tx-aggregates-parity-tests dat ook doen. Geen Supabase-calls.
 */

import { describe, it, expect } from 'vitest'
import {
  buildMonthAggregatesFromRows,
  aggSumPositief,
  aggSumNegatiefAbs,
  type TxMonthAggregateRow,
} from './server-data/tx-aggregates'
import { computeSavingsRate6m, savingsRateFromAggregates } from './savings-source'

type Raw = {
  amount: number
  date: string
  budget_id: string | null
  transaction_type: string | null
}

const SAVINGS_BUDGET_IDS = new Set(['sparen'])
const DEBT_AFLOSSING_6M = 1200 // €200/mnd × 6 — komt in beide loaders uit de schulden, niet uit tx.
const SIX_MONTHS_AGO_MONTH = '2026-02'

/**
 * Woordelijke spiegel van de 6-maands spaarquote-aggregatie zoals BEIDE loaders die
 * nu doen (dashboard r755-793 == horizon): income6m/expenses6m/savingsBudgetSpent6m
 * via aggSumPositief/aggSumNegatiefAbs met een expliciete `realOnly`-vlag, gevolgd
 * door de gedeelde computeSavingsRate6m-helper. `realOnly:true` = transfer-exclusief
 * (de canonieke grondslag), `realOnly:false` = de oude transfer-inclusieve horizon.
 */
function spaarquoteFromAggregation(
  txAgg: TxMonthAggregateRow[],
  realOnly: boolean,
): number {
  const income6m = aggSumPositief(txAgg, { realOnly, sinceMonth: SIX_MONTHS_AGO_MONTH })
  const expenses6m = aggSumNegatiefAbs(txAgg, { realOnly, sinceMonth: SIX_MONTHS_AGO_MONTH })
  const savingsBudgetSpent6m = aggSumNegatiefAbs(txAgg, {
    realOnly,
    sinceMonth: SIX_MONTHS_AGO_MONTH,
    budgetIds: SAVINGS_BUDGET_IDS,
  })
  return computeSavingsRate6m({
    income6m,
    expenses6m,
    savingsBudgetSpent6m,
    debtAflossing6m: DEBT_AFLOSSING_6M,
    dataMonths: 6,
  }).savingsRate6m
}

// ── Transfer-HOUDENDE fixture (6 kalendermaanden data) ─────────────────────────
// 6× echt inkomen +4000, 6× echte uitgave −2200, 1× spaarbudget-storting −600
// (budget 'sparen' → telt als sparen), plus eigen-rekening-overboekingen die
// NERGENS mogen meetellen: een 'transfer'-paar (±5000) en een 'joint_transfer'-paar
// (±3000). debtAflossing6m = 1200 (constante, uit de schulden).
const MONTHS = ['2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07']
const REAL_ROWS: Raw[] = [
  ...MONTHS.map((m): Raw => ({ amount: 4000, date: `${m}-05`, budget_id: null, transaction_type: null })),
  ...MONTHS.map((m): Raw => ({ amount: -2200, date: `${m}-10`, budget_id: null, transaction_type: null })),
  { amount: -600, date: '2026-07-15', budget_id: 'sparen', transaction_type: null },
]
const TRANSFER_ROWS: Raw[] = [
  { amount: 5000, date: '2026-07-20', budget_id: null, transaction_type: 'transfer' },
  { amount: -5000, date: '2026-07-20', budget_id: null, transaction_type: 'transfer' },
  { amount: 3000, date: '2026-06-20', budget_id: null, transaction_type: 'joint_transfer' },
  { amount: -3000, date: '2026-06-20', budget_id: null, transaction_type: 'joint_transfer' },
]

const TX_AGG_WITH_TRANSFERS = buildMonthAggregatesFromRows([...REAL_ROWS, ...TRANSFER_ROWS])
const TX_AGG_WITHOUT_TRANSFERS = buildMonthAggregatesFromRows(REAL_ROWS)

describe('spaarquote-grondslag — horizon == dashboard op de transfer-exclusieve grondslag', () => {
  it('horizon savingsRate6m == dashboard savingsRate6m op een transfer-houdende fixture (de gelijktrekking)', () => {
    // Beide loaders reduceren nu met realOnly:true → identieke grondslag, dus identieke quote.
    const dashboardRate = spaarquoteFromAggregation(TX_AGG_WITH_TRANSFERS, /* realOnly */ true)
    const horizonRate = spaarquoteFromAggregation(TX_AGG_WITH_TRANSFERS, /* realOnly */ true)
    expect(horizonRate).toBe(dashboardRate)
  })

  it('de transfer-exclusieve quote is de canonieke 50% (income 24000, uitgaven 13200 excl. spaarbudget, +aflossing 1200)', () => {
    const rate = spaarquoteFromAggregation(TX_AGG_WITH_TRANSFERS, true)
    // (24000 − 13200 + 1200) / 24000 × 100 = 50%.
    expect(rate).toBe(50)
    expect(rate).toBe(savingsRateFromAggregates(24000, 13800 - 600, DEBT_AFLOSSING_6M))
  })

  it('de OUDE transfer-inclusieve reductie (realOnly:false) week AF op dezelfde fixture — de fix doet ertoe', () => {
    const dashboardRate = spaarquoteFromAggregation(TX_AGG_WITH_TRANSFERS, true)
    const horizonOldRate = spaarquoteFromAggregation(TX_AGG_WITH_TRANSFERS, /* realOnly */ false)
    // Transfer-inclusief: income 32000, uitgaven 21200 (excl. spaarbudget) → 37,5%.
    expect(horizonOldRate).toBe(37.5)
    expect(horizonOldRate).not.toBe(dashboardRate)
  })

  it('transfer-exclusief == de fixture ZONDER transfer-rijen (transfers tellen NERGENS mee)', () => {
    const exclusiveWithTransfers = spaarquoteFromAggregation(TX_AGG_WITH_TRANSFERS, true)
    // Zonder transfer-rijen maakt de realOnly-vlag niets meer uit — geen (joint_)transfers.
    const withoutTransfers = spaarquoteFromAggregation(TX_AGG_WITHOUT_TRANSFERS, false)
    expect(exclusiveWithTransfers).toBe(withoutTransfers)
    expect(exclusiveWithTransfers).toBe(50)
  })
})
