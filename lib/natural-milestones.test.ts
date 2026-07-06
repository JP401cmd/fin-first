import { describe, it, expect } from 'vitest'
import { deriveNaturalMilestones, type NaturalMilestone } from './natural-milestones'
import type { Debt } from '@/lib/debt-data'
import type { UnifiedProjectionRow, DebtBalanceDetail } from '@/lib/unified-projection'

/**
 * BUG 2 — Mijlpaal "[Schuld] afgelost" negeert huisverkoop.
 *
 * De payoff-leeftijd werd uit het STATISCHE amortisatieschema `debtProjection`
 * afgeleid, dat huisverkoop niet kent → mijlpaal op het amortisatie-einde (bv. 76)
 * terwijl de gekoppelde hypotheek bij huisverkoop (bv. 71) feitelijk al weg is.
 *
 * De canonieke bron is nu `unifiedRows: UnifiedProjectionRow[]` (kernel-bridge-
 * output mét `debtBalances[debt.id]` per rij). Payoff = eerste rij waar het saldo
 * ≤ €0,50 valt NÁDAT een eerdere rij het saldo > €0,50 had. Geen rows-payoff →
 * géén `debt_payoff`-mijlpaal (geen fallback naar `debtProjection`).
 */

// ── Factories ──────────────────────────────────────────────────────────────

function mkDebt(partial: Partial<Debt>): Debt {
  return {
    id: 'debt-1',
    user_id: 'u1',
    name: 'Schuld',
    debt_type: 'personal_loan',
    original_amount: 0,
    current_balance: 10_000,
    interest_rate: 3,
    minimum_payment: 0,
    monthly_payment: 100,
    start_date: '2020-01-01',
    end_date: null,
    creditor: null,
    notes: null,
    is_active: true,
    sort_order: 0,
    created_at: '2020-01-01',
    updated_at: '2020-01-01',
    subtype: null,
    is_tax_deductible: null,
    fixed_rate_end_date: null,
    nhg: null,
    linked_asset_id: null,
    credit_limit: null,
    repayment_type: null,
    draagkrachtmeting_date: null,
    tax_year: null,
    has_payment_plan: false,
    has_written_agreement: false,
    ownership: 'personal',
    household_id: null,
    partner_split_pct: null,
    net_worth_inclusion_pct: 100,
    include_aflossing_in_savings: false,
    custom_aflossing_amount: null,
    has_hypotheekplanner_tracking: false,
    ...partial,
  } as Debt
}

function bal(endBalance: number): DebtBalanceDetail {
  return { startBalance: endBalance, interestPaid: 0, principalPaid: 0, endBalance }
}

/** Eén projectierij met per-debt-id eindsaldi. */
function mkRow(age: number, debtBalances: Record<string, number>): UnifiedProjectionRow {
  const dbal: Record<string, DebtBalanceDetail> = {}
  for (const [id, v] of Object.entries(debtBalances)) dbal[id] = bal(v)
  return {
    year: age - 40,
    age,
    phase: 'accumulation',
    assetBuckets: {},
    debtBalances: dbal,
    totalAssets: 0,
    totalDebts: 0,
    netWorth: 0,
    startNetWorth: 0,
    grossIncome: 0,
    savings: 0,
    withdrawal: 0,
    withdrawalByType: {},
    cashflowNet: 0,
    oneTimeNet: 0,
    totalGrowth: 0,
    totalBox3: 0,
    cumulativeBox3: 0,
    inflationFactor: 1,
  } as UnifiedProjectionRow
}

const DOB = '1980-01-01'

/** Bouw rijen waar één debt boven de drempel is t/m `lastOwedAge`, daarna 0. */
function rowsPayoffAt(debtId: string, agesOwed: number[], agesPaid: number[]): UnifiedProjectionRow[] {
  return [
    ...agesOwed.map(a => mkRow(a, { [debtId]: 5_000 })),
    ...agesPaid.map(a => mkRow(a, { [debtId]: 0 })),
  ]
}

function payoffMilestones(ms: NaturalMilestone[]): NaturalMilestone[] {
  return ms.filter(m => m.kind === 'debt_payoff')
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('deriveNaturalMilestones — debt payoff uit unifiedRows (bug 2)', () => {
  it('Variant A: gekoppelde hypotheek + verkoop — payoff op verkoopleeftijd 71 (niet amortisatie-einde 76)', () => {
    const debt = mkDebt({ id: 'mortg', name: 'Hypotheek', debt_type: 'mortgage', current_balance: 300_000 })
    // Saldo > drempel t/m 70, dan 0 vanaf 71 (huisverkoop). Amortisatie zou 76 geven.
    const rows = rowsPayoffAt('mortg', [65, 66, 67, 68, 69, 70], [71, 72, 76, 80])
    const ms = deriveNaturalMilestones({
      debts: [debt], assets: [], simResult: null, unifiedRows: rows, dob: DOB, hasPartner: false,
    })
    const payoffs = payoffMilestones(ms)
    expect(payoffs).toHaveLength(1)
    expect(payoffs[0].target_age).toBe(71)
    expect(payoffs[0].sourceId).toBe('mortg')
  })

  it('Variant B: hypotheek zonder verkoop, amortiseert normaal — payoff op het echte einde 76', () => {
    const debt = mkDebt({ id: 'mortg', name: 'Hypotheek', debt_type: 'mortgage', current_balance: 200_000 })
    const rows = rowsPayoffAt('mortg', [70, 71, 72, 73, 74, 75], [76, 77, 78])
    const ms = deriveNaturalMilestones({
      debts: [debt], assets: [], simResult: null, unifiedRows: rows, dob: DOB, hasPartner: false,
    })
    const payoffs = payoffMilestones(ms)
    expect(payoffs).toHaveLength(1)
    expect(payoffs[0].target_age).toBe(76)
  })

  it('Variant C: niet-gekoppelde schuld die normaal aflost — payoff op de rows-payoff', () => {
    const debt = mkDebt({ id: 'lening', name: 'Autolening', debt_type: 'car_loan', current_balance: 15_000 })
    const rows = rowsPayoffAt('lening', [50, 51, 52, 53, 54], [55, 56])
    const ms = deriveNaturalMilestones({
      debts: [debt], assets: [], simResult: null, unifiedRows: rows, dob: DOB, hasPartner: false,
    })
    const payoffs = payoffMilestones(ms)
    expect(payoffs).toHaveLength(1)
    expect(payoffs[0].target_age).toBe(55)
  })

  it('Variant D: verkoop-trigger ná amortisatie-einde — mijlpaal op het vroegere 0-punt, geen dubbele mijlpaal', () => {
    const debt = mkDebt({ id: 'mortg', name: 'Hypotheek', debt_type: 'mortgage', current_balance: 100_000 })
    // Amortisatie brengt saldo naar 0 op 75; de (irrelevante) verkoop zou pas op 80.
    const rows = [
      mkRow(72, { mortg: 4_000 }),
      mkRow(73, { mortg: 3_000 }),
      mkRow(74, { mortg: 1_000 }),
      mkRow(75, { mortg: 0 }),
      mkRow(76, { mortg: 0 }),
      mkRow(80, { mortg: 0 }),
    ]
    const ms = deriveNaturalMilestones({
      debts: [debt], assets: [], simResult: null, unifiedRows: rows, dob: DOB, hasPartner: false,
    })
    const payoffs = payoffMilestones(ms)
    expect(payoffs).toHaveLength(1)
    expect(payoffs[0].target_age).toBe(75)
  })

  it('Reverse-mortgage / aflossingsvrij: saldo bereikt nooit 0 → GEEN debt_payoff-mijlpaal', () => {
    const debt = mkDebt({ id: 'opeet', name: 'Opeethypotheek', debt_type: 'mortgage', current_balance: 50_000 })
    // Saldo stijgt/blijft > drempel; nooit afgelost.
    const rows = [
      mkRow(70, { opeet: 50_000 }),
      mkRow(75, { opeet: 60_000 }),
      mkRow(80, { opeet: 70_000 }),
      mkRow(85, { opeet: 80_000 }),
    ]
    const ms = deriveNaturalMilestones({
      debts: [debt], assets: [], simResult: null, unifiedRows: rows, dob: DOB, hasPartner: false,
    })
    expect(payoffMilestones(ms)).toHaveLength(0)
  })

  it('Schuld die in de rijen nooit boven de drempel komt (bestond nooit / al weg) → GEEN valse payoff op rij-0', () => {
    const debt = mkDebt({ id: 'weg', name: 'Weg', current_balance: 1 })
    const rows = [mkRow(60, { weg: 0 }), mkRow(61, { weg: 0 }), mkRow(62, { weg: 0 })]
    const ms = deriveNaturalMilestones({
      debts: [debt], assets: [], simResult: null, unifiedRows: rows, dob: DOB, hasPartner: false,
    })
    expect(payoffMilestones(ms)).toHaveLength(0)
  })

  it('Schuld die binnen het eerste projectiejaar aflost (startBalance > 0, endBalance 0 op rij-0) → payoff op die rij, niet weggevallen', () => {
    const debt = mkDebt({ id: 'lening', name: 'Restlening', debt_type: 'car_loan', current_balance: 8_000 })
    // Rij 0 is meteen de eerste rij: begon het jaar met 8.000 schuld, eind van het
    // jaar volledig afgelost. Zonder de startBalance-guard zou deze payoff stil
    // verdwijnen (er is geen eerdere rij die "was ooit boven de drempel" zet).
    const r0 = mkRow(52, { lening: 0 })
    r0.debtBalances['lening'].startBalance = 8_000
    const rows = [r0, mkRow(53, { lening: 0 })]
    const ms = deriveNaturalMilestones({
      debts: [debt], assets: [], simResult: null, unifiedRows: rows, dob: DOB, hasPartner: false,
    })
    const payoffs = payoffMilestones(ms)
    expect(payoffs).toHaveLength(1)
    expect(payoffs[0].target_age).toBe(52)
  })

  it('Variant E: aggregaat — debt_free op de gecorrigeerde (verkoop)leeftijd, niet het amortisatie-einde', () => {
    const mortgage = mkDebt({ id: 'mortg', name: 'Hypotheek', debt_type: 'mortgage', current_balance: 300_000 })
    const loan = mkDebt({ id: 'lening', name: 'Lening', debt_type: 'personal_loan', current_balance: 10_000 })
    const rows = [
      // beide bestaan; lening afgelost op 55, hypotheek (verkoop) op 71
      mkRow(50, { mortg: 250_000, lening: 8_000 }),
      mkRow(54, { mortg: 240_000, lening: 2_000 }),
      mkRow(55, { mortg: 235_000, lening: 0 }),
      mkRow(70, { mortg: 150_000, lening: 0 }),
      mkRow(71, { mortg: 0, lening: 0 }),
      mkRow(76, { mortg: 0, lening: 0 }),
    ]
    const ms = deriveNaturalMilestones({
      debts: [mortgage, loan], assets: [], simResult: null, unifiedRows: rows, dob: DOB, hasPartner: false,
    })
    const payoffs = payoffMilestones(ms)
    expect(payoffs).toHaveLength(2)
    const debtFree = ms.find(m => m.kind === 'debt_free')
    expect(debtFree).toBeDefined()
    expect(debtFree!.target_age).toBe(71)
    // individueel en aggregaat spreken elkaar niet tegen
    const maxPayoff = Math.max(...payoffs.map(p => p.target_age))
    expect(debtFree!.target_age).toBe(maxPayoff)
  })

  it('fixed_rate_reset blijft: hypotheek met fixed_rate_end_date maar zonder rows-payoff toont nog steeds de reset', () => {
    const debt = mkDebt({
      id: 'mortg', name: 'Hypotheek', debt_type: 'mortgage', current_balance: 250_000,
      fixed_rate_end_date: '2035-06-01', // reset-datum
    })
    // Aflossingsvrij: saldo nooit 0 → geen payoff, maar reset moet blijven.
    const rows = [
      mkRow(45, { mortg: 250_000 }),
      mkRow(55, { mortg: 250_000 }),
      mkRow(65, { mortg: 250_000 }),
    ]
    const ms = deriveNaturalMilestones({
      debts: [debt], assets: [], simResult: null, unifiedRows: rows, dob: DOB, hasPartner: false,
    })
    expect(payoffMilestones(ms)).toHaveLength(0)
    const reset = ms.find(m => m.kind === 'fixed_rate_reset')
    expect(reset).toBeDefined()
    expect(reset!.sourceId).toBe('mortg')
    // reset-datum 2035-06-01, dob 1980-01-01 → leeftijd 55
    expect(reset!.target_age).toBe(55)
  })

  it('Null unifiedRows → geen debt_payoff-mijlpalen (geen crash, geen fallback naar debtProjection)', () => {
    const debt = mkDebt({ id: 'lening', name: 'Lening', current_balance: 10_000, monthly_payment: 200 })
    const ms = deriveNaturalMilestones({
      debts: [debt], assets: [], simResult: null, unifiedRows: null, dob: DOB, hasPartner: false,
    })
    expect(payoffMilestones(ms)).toHaveLength(0)
  })

  it('Lege unifiedRows → geen debt_payoff-mijlpalen', () => {
    const debt = mkDebt({ id: 'lening', name: 'Lening', current_balance: 10_000 })
    const ms = deriveNaturalMilestones({
      debts: [debt], assets: [], simResult: null, unifiedRows: [], dob: DOB, hasPartner: false,
    })
    expect(payoffMilestones(ms)).toHaveLength(0)
  })

  it('Null unifiedRows + hypotheek met fixed_rate_end_date → geen payoff, wél fixed_rate_reset', () => {
    const debt = mkDebt({
      id: 'mortg', name: 'Hypotheek', debt_type: 'mortgage', current_balance: 250_000,
      fixed_rate_end_date: '2035-06-01',
    })
    const ms = deriveNaturalMilestones({
      debts: [debt], assets: [], simResult: null, unifiedRows: null, dob: DOB, hasPartner: false,
    })
    expect(payoffMilestones(ms)).toHaveLength(0)
    expect(ms.some(m => m.kind === 'fixed_rate_reset')).toBe(true)
  })
})
