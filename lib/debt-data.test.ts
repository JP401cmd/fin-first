/**
 * Unit tests voor de debt-calculations in `lib/debt-data.ts`.
 *
 * Fase 1 dekking: `computeDefaultMonthlyPayment` — centrale helper die door
 * de quick-add wizard (`buildDebtDraft`) en later ook door de full-form wordt
 * hergebruikt. De vier repayment-takken (annuiteit, lineair, aflossingsvrij,
 * null) + edge-cases (ratePct=0, years=null) zijn hier gevalideerd.
 */

import { describe, it, expect } from 'vitest'
import {
  computeDefaultMonthlyPayment,
  DEBT_GROUP_FOR_TYPE,
  DEBT_GROUP_LABELS,
  getDebtGroup,
  debtProjection,
  type Debt,
  type DebtGroup,
  type DebtType,
} from './debt-data'

describe('computeDefaultMonthlyPayment', () => {
  it('annuiteit: 300k @ 3.5% over 30j ≈ 1347', () => {
    // Standaard PMT-formule: 300000 * (mr * (1+mr)^n) / ((1+mr)^n - 1)
    // met mr = 3.5/100/12 en n = 360 → 1347.13
    const payment = computeDefaultMonthlyPayment(300000, 3.5, 30, 'annuiteit')
    expect(payment).toBeCloseTo(1347, 0)
  })

  it('lineair: 100k @ 5% over 10j eerste maand → aflossing + rente = 1250', () => {
    // Vaste aflossing: 100000 / 120 = 833.33
    // Rente maand 1: 100000 * 0.05 / 12 = 416.67
    // Totaal: 1250.00
    const payment = computeDefaultMonthlyPayment(100000, 5, 10, 'lineair')
    expect(payment).toBeCloseTo(1250, 2)
  })

  it('aflossingsvrij: 50k @ 10% → 416.67 per maand (alleen rente)', () => {
    const payment = computeDefaultMonthlyPayment(50000, 10, null, 'aflossingsvrij')
    expect(payment).toBe(416.67)
  })

  it('annuiteit met ratePct=0 valt terug op balance / months', () => {
    const payment = computeDefaultMonthlyPayment(120000, 0, 10, 'annuiteit')
    expect(payment).toBe(1000)
  })

  it('aflossingsvrij negeert years=null en berekent nog steeds rente', () => {
    const payment = computeDefaultMonthlyPayment(10000, 6, null, 'aflossingsvrij')
    // 10000 * 0.06 / 12 = 50
    expect(payment).toBe(50)
  })

  it('annuiteit met years=null → 0 (onvoldoende data voor PMT)', () => {
    const payment = computeDefaultMonthlyPayment(100000, 4, null, 'annuiteit')
    expect(payment).toBe(0)
  })

  it('null repayment met years=null → 0', () => {
    // Fallback: geen aflossingsmodel én geen looptijd → geen betaling berekend.
    const payment = computeDefaultMonthlyPayment(50000, 5, null, null)
    expect(payment).toBe(0)
  })
})

// ── DebtGroup-taxonomie (Contract 1) ─────────────────────────────
//
// De compile-time `Record<DebtType, DebtGroup>` dwingt volledigheid al af,
// maar een runtime-iteratie over álle DebtTypes vangt een per ongeluk
// toegevoegd type dat nog niet is ingedeeld (of een vertypte groep-waarde).

describe('DebtGroup-taxonomie', () => {
  // Expliciete lijst (spiegelt `DebtType` in debt-data.ts) — losgekoppeld van
  // Object.keys zodat een nieuw type dat vergeten wordt hier opvalt.
  const ALL_DEBT_TYPES: DebtType[] = [
    'mortgage',
    'personal_loan',
    'student_loan',
    'car_loan',
    'credit_card',
    'revolving_credit',
    'payment_plan',
    'belastingschuld',
    'familielening',
    'dga_schuld',
    'other',
  ]

  const VALID_GROUPS: DebtGroup[] = ['wonen', 'consumptief', 'overig']

  it('elk DebtType heeft een geldige groep in DEBT_GROUP_FOR_TYPE', () => {
    for (const t of ALL_DEBT_TYPES) {
      const group = DEBT_GROUP_FOR_TYPE[t]
      expect(group, `${t} moet een groep hebben`).toBeDefined()
      expect(VALID_GROUPS, `${t} → ${group} moet een geldige groep zijn`).toContain(group)
    }
  })

  it('getDebtGroup levert dezelfde groep als de map voor elk type', () => {
    for (const t of ALL_DEBT_TYPES) {
      expect(getDebtGroup(t)).toBe(DEBT_GROUP_FOR_TYPE[t])
    }
  })

  it('DEBT_GROUP_FOR_TYPE dekt exact de bekende DebtTypes (geen wees-keys)', () => {
    expect(Object.keys(DEBT_GROUP_FOR_TYPE).sort()).toEqual([...ALL_DEBT_TYPES].sort())
  })

  it('de bindende indeling: hypotheek=wonen, consumptief krediet, formeel/onderhands=overig', () => {
    expect(getDebtGroup('mortgage')).toBe('wonen')
    expect(getDebtGroup('personal_loan')).toBe('consumptief')
    expect(getDebtGroup('student_loan')).toBe('consumptief')
    expect(getDebtGroup('car_loan')).toBe('consumptief')
    expect(getDebtGroup('credit_card')).toBe('consumptief')
    expect(getDebtGroup('revolving_credit')).toBe('consumptief')
    expect(getDebtGroup('payment_plan')).toBe('consumptief')
    expect(getDebtGroup('belastingschuld')).toBe('overig')
    expect(getDebtGroup('dga_schuld')).toBe('overig')
    expect(getDebtGroup('familielening')).toBe('overig')
    expect(getDebtGroup('other')).toBe('overig')
  })

  it('getDebtGroup valt defensief terug op overig bij een onbekend type', () => {
    expect(getDebtGroup('zomaar_iets' as DebtType)).toBe('overig')
  })

  it('DEBT_GROUP_LABELS heeft een NL-label per groep', () => {
    expect(DEBT_GROUP_LABELS).toEqual({
      wonen: 'Wonen',
      consumptief: 'Consumptief',
      overig: 'Overig',
    })
  })
})

/**
 * Regressie — een schuld zonder maandbedrag is niet "onbetaalbaar door rente".
 *
 * Repro (schermafbeelding gebruiker, 6-9-2026): een DGA-schuld met 0% rente en
 * een leeg maandbedrag toonde "Resterende rente: Onbetaalbaar" plus de melding
 * "De maandelijkse betaling dekt de rente niet. Verhoog de betaling om deze
 * schuld af te lossen." Bij 0% rente ís er geen rente om te dekken; het echte
 * probleem is dat er geen aflossing is ingevuld.
 *
 * `debtProjection` kende beide oorzaken dezelfde uitkomst toe (`isPayable:
 * false`) zonder onderscheid, waardoor elke consument — detailvenster én de
 * AI-context — de rente-verklaring gaf. `unpayableReason` maakt het verschil
 * expliciet.
 */
describe('debtProjection — reden van onaflosbaarheid', () => {
  const base: Debt = {
    id: 'd1', user_id: 'u1', name: 'RC-schuld', debt_type: 'dga_schuld',
    original_amount: 15000, current_balance: 14875, interest_rate: 0,
    minimum_payment: 0, monthly_payment: 0,
    start_date: '2026-08-12', end_date: '2036-08-12',
    creditor: null, notes: null, is_active: true, sort_order: 0,
    created_at: '2026-08-12T00:00:00Z', updated_at: '2026-08-12T00:00:00Z',
    subtype: null, is_tax_deductible: null, fixed_rate_end_date: null, nhg: null,
    linked_asset_id: null, credit_limit: null, repayment_type: 'lineair',
    draagkrachtmeting_date: null, tax_year: null, has_payment_plan: false,
    has_written_agreement: false, ownership: 'personal', household_id: null,
    partner_split_pct: null, net_worth_inclusion_pct: 100,
    include_aflossing_in_savings: false, custom_aflossing_amount: null,
    has_hypotheekplanner_tracking: false,
  }

  it('0% rente zonder maandbedrag → reden is de ontbrekende aflossing, niet de rente', () => {
    const proj = debtProjection(base)
    expect(proj.isPayable).toBe(false)
    expect(proj.unpayableReason).toBe('geen-aflossing')
  })

  it('idem voor de annuïteiten-tak', () => {
    const proj = debtProjection({ ...base, repayment_type: 'annuiteit' })
    expect(proj.isPayable).toBe(false)
    expect(proj.unpayableReason).toBe('geen-aflossing')
  })

  it('rente zonder maandbedrag → nog steeds de ontbrekende aflossing', () => {
    const proj = debtProjection({ ...base, interest_rate: 5 })
    expect(proj.isPayable).toBe(false)
    expect(proj.unpayableReason).toBe('geen-aflossing')
  })

  it('betaling die de rente écht niet dekt houdt de rente-reden', () => {
    // 100k @ 12% → € 1.000 rente p/m, betaling € 100 dekt dat niet.
    const proj = debtProjection({
      ...base, repayment_type: 'annuiteit',
      current_balance: 100000, interest_rate: 12, monthly_payment: 100,
    })
    expect(proj.isPayable).toBe(false)
    expect(proj.unpayableReason).toBe('betaling-dekt-rente-niet')
  })

  it('0% rente mét maandbedrag lost gewoon af', () => {
    const proj = debtProjection({ ...base, monthly_payment: 125 })
    expect(proj.isPayable).toBe(true)
    expect(proj.unpayableReason).toBeUndefined()
  })
})
