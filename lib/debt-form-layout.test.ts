/**
 * Indeling van het schuld-bewerkformulier (`lib/debt-form-layout.ts`).
 *
 * Regressie-eis: het formulier mag minder tonen, maar nooit een veld tonen dat
 * niet bij het type hoort — dan zou het opslaan de waarde op null zetten
 * terwijl de gebruiker hem net heeft ingevuld.
 */
import { describe, it, expect } from 'vitest'
import { DEBT_TYPE_FIELDS, type DebtType } from './debt-data'
import {
  DEBT_FORM_LAYOUT,
  debtTeltMeeDelen,
  inclusieTekst,
  debtHasPaymentPlan,
  hasPaymentPlanFor,
  paymentPlanToWrite,
  hiddenDebtFields,
  showsMinimumPayment,
  subtypeToWrite,
} from './debt-form-layout'

const TYPES = Object.keys(DEBT_TYPE_FIELDS) as DebtType[]

describe('DEBT_FORM_LAYOUT', () => {
  it.each(TYPES)('%s: elk getoond veld hoort bij het type', (type) => {
    const { kern, meer } = DEBT_FORM_LAYOUT[type]
    for (const field of [...kern, ...meer]) {
      expect(DEBT_TYPE_FIELDS[type]).toContain(field)
    }
  })

  it.each(TYPES)('%s: geen veld staat in kern én in meer', (type) => {
    const { kern, meer } = DEBT_FORM_LAYOUT[type]
    expect(kern.filter((f) => meer.includes(f))).toEqual([])
  })

  it('een hypotheek verbergt subtype en NHG', () => {
    expect(hiddenDebtFields('mortgage').sort()).toEqual(['nhg', 'subtype'])
  })

  it('velden zonder rekenwerk zijn verborgen', () => {
    expect(hiddenDebtFields('student_loan')).toEqual(['draagkrachtmeting_date'])
    expect(hiddenDebtFields('belastingschuld')).toEqual(['has_payment_plan'])
    expect(hiddenDebtFields('familielening')).toEqual(['has_written_agreement'])
  })

  it('koppelingen en de aflosvorm staan in de kern', () => {
    expect(DEBT_FORM_LAYOUT.mortgage.kern).toContain('linked_asset_id')
    expect(DEBT_FORM_LAYOUT.car_loan.kern).toContain('linked_asset_id')
    expect(DEBT_FORM_LAYOUT.dga_schuld.kern).toContain('linked_asset_id')
    expect(DEBT_FORM_LAYOUT.mortgage.kern).toContain('repayment_type')
  })
})

describe('showsMinimumPayment', () => {
  it('altijd bij creditcard en doorlopend krediet', () => {
    expect(showsMinimumPayment('credit_card', null, null)).toBe(true)
    expect(showsMinimumPayment('revolving_credit', 0, 0)).toBe(true)
  })

  it('niet bij een lening waar minimum en maandbedrag gelijk staan', () => {
    expect(showsMinimumPayment('mortgage', 3000, 3000)).toBe(false)
    expect(showsMinimumPayment('personal_loan', 125, 125)).toBe(false)
  })

  it('niet bij een leeg of nul minimum', () => {
    expect(showsMinimumPayment('mortgage', null, 3000)).toBe(false)
    expect(showsMinimumPayment('mortgage', 0, 3000)).toBe(false)
    expect(showsMinimumPayment('mortgage', undefined, undefined)).toBe(false)
  })

  it('wel bij een bewust afwijkend minimum, zodat het niet onzichtbaar meerekent', () => {
    expect(showsMinimumPayment('mortgage', 500, 3000)).toBe(true)
    expect(showsMinimumPayment('car_loan', 300, 250)).toBe(true)
  })
})

describe('subtypeToWrite', () => {
  it('hypotheek zonder subtype volgt de aflosvorm', () => {
    expect(subtypeToWrite('mortgage', null, 'lineair')).toBe('lineair')
    expect(subtypeToWrite('mortgage', '', 'annuiteit')).toBe('annuiteit')
  })

  it('hypotheek met een overlappend subtype volgt een gewijzigde aflosvorm', () => {
    expect(subtypeToWrite('mortgage', 'annuiteit', 'aflossingsvrij')).toBe('aflossingsvrij')
  })

  it('spaar- en beleggingshypotheek blijven staan', () => {
    expect(subtypeToWrite('mortgage', 'spaarhypotheek', 'aflossingsvrij')).toBe('spaarhypotheek')
    expect(subtypeToWrite('mortgage', 'beleggingshypotheek', 'lineair')).toBe('beleggingshypotheek')
  })

  it('hypotheek zonder aflosvorm houdt het bestaande subtype', () => {
    expect(subtypeToWrite('mortgage', 'lineair', '')).toBe('lineair')
    expect(subtypeToWrite('mortgage', null, null)).toBeNull()
  })

  it('andere types schrijven het subtype ongewijzigd', () => {
    expect(subtypeToWrite('credit_card', 'charge_card', 'aflossingsvrij')).toBe('charge_card')
    expect(subtypeToWrite('familielening', '', 'lineair')).toBeNull()
  })
})

describe('hasPaymentPlanFor', () => {
  it('belastingschuld met maandbedrag heeft een regeling', () => {
    expect(hasPaymentPlanFor('belastingschuld', 150)).toBe(true)
  })

  it('belastingschuld zonder maandbedrag niet', () => {
    expect(hasPaymentPlanFor('belastingschuld', 0)).toBe(false)
    expect(hasPaymentPlanFor('belastingschuld', Number.NaN)).toBe(false)
  })

  it('andere types nooit', () => {
    expect(hasPaymentPlanFor('personal_loan', 150)).toBe(false)
  })
})

describe('debtHasPaymentPlan — één afleiding voor elke lezer', () => {
  it('een maandbedrag telt, ook als de wizard de vlag nooit zette', () => {
    expect(debtHasPaymentPlan({ debt_type: 'belastingschuld', has_payment_plan: false, monthly_payment: 150 })).toBe(true)
    expect(debtHasPaymentPlan({ debt_type: 'belastingschuld', has_payment_plan: false, monthly_payment: '150' })).toBe(true)
  })

  it('de opgeslagen vlag telt, ook zonder maandbedrag', () => {
    expect(debtHasPaymentPlan({ debt_type: 'belastingschuld', has_payment_plan: true, monthly_payment: 0 })).toBe(true)
  })

  it('geen vlag en geen maandbedrag: geen regeling', () => {
    expect(debtHasPaymentPlan({ debt_type: 'belastingschuld', has_payment_plan: false, monthly_payment: 0 })).toBe(false)
    expect(debtHasPaymentPlan({ debt_type: 'belastingschuld', has_payment_plan: null, monthly_payment: null })).toBe(false)
  })

  it('andere types nooit, ook niet met een achtergebleven vlag', () => {
    expect(debtHasPaymentPlan({ debt_type: 'personal_loan', has_payment_plan: true, monthly_payment: 150 })).toBe(false)
  })
})

describe('samenvatting "Hoe telt dit mee"', () => {
  const basis = {
    debtType: 'personal_loan' as DebtType,
    netWorthInclusionPct: 100,
    ownership: 'personal' as const,
    partnerSplitPct: null,
    isTaxDeductible: false,
    includeAflossingInSavings: false,
    aflossingZichtbaar: true,
  }

  it('volledig meetellen is de korte standaard', () => {
    expect(inclusieTekst(100)).toBe('telt volledig mee')
    expect(debtTeltMeeDelen(basis)).toEqual(['telt volledig mee'])
  })

  it('een lager percentage staat erin, zodat het dicht niet onzichtbaar wordt', () => {
    expect(inclusieTekst(60)).toBe('telt voor 60% mee')
    expect(inclusieTekst(0)).toBe('telt voor 0% mee')
  })

  it('gedeeld, met en zonder eigen verdeling', () => {
    expect(debtTeltMeeDelen({ ...basis, ownership: 'shared' })).toContain('gedeeld')
    expect(debtTeltMeeDelen({ ...basis, ownership: 'shared', partnerSplitPct: 40 })).toContain('gedeeld, jouw deel 40%')
  })

  it('renteaftrek alleen bij een hypotheek, in beide standen', () => {
    expect(debtTeltMeeDelen({ ...basis, debtType: 'mortgage', isTaxDeductible: true })).toContain('met renteaftrek')
    expect(debtTeltMeeDelen({ ...basis, debtType: 'mortgage', isTaxDeductible: false })).toContain('zonder renteaftrek')
    expect(debtTeltMeeDelen({ ...basis, isTaxDeductible: true }).join()).not.toContain('renteaftrek')
  })

  it('aflossing als sparen alleen als die aan staat', () => {
    expect(debtTeltMeeDelen({ ...basis, includeAflossingInSavings: true })).toContain('aflossing telt als sparen')
    expect(debtTeltMeeDelen(basis).join()).not.toContain('sparen')
  })

  it('aflossing als sparen niet als het formulier die instelling niet toont', () => {
    expect(debtTeltMeeDelen({ ...basis, includeAflossingInSavings: true, aflossingZichtbaar: false }).join()).not.toContain('sparen')
  })
})

describe('paymentPlanToWrite — verbergen is geen wissen', () => {
  it('een opgeslagen regeling blijft staan zonder maandbedrag', () => {
    expect(paymentPlanToWrite('belastingschuld', true, 0)).toBe(true)
  })

  it('een maandbedrag zet de vlag', () => {
    expect(paymentPlanToWrite('belastingschuld', false, 150)).toBe(true)
  })

  it('zonder vlag en zonder maandbedrag blijft hij uit', () => {
    expect(paymentPlanToWrite('belastingschuld', false, 0)).toBe(false)
    expect(paymentPlanToWrite('belastingschuld', null, 0)).toBe(false)
  })

  it('een typewissel weg van belastingschuld veegt de vlag schoon', () => {
    expect(paymentPlanToWrite('personal_loan', true, 150)).toBe(false)
  })
})
