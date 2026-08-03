// ── Deterministische standaardwaarden voor de lokale vrije-tekst-extractie ────
//
// Deze suite bewaakt de belofte van het lokale extractie-pad: geen enkel
// afgeleid getal komt van het model. Wijzigt iemand een rendement of een rente,
// dan moet dat een BEWUSTE wijziging zijn — vandaar dat de waarden hier
// letterlijk zijn vastgelegd tegen de STANDAARDWAARDEN-sectie van de cloud-prompt.

import { describe, it, expect } from 'vitest'
import { LIFE_EVENT_CATALOG } from '@/lib/horizon/life-events-catalog'
import {
  ASSET_EXPECTED_RETURN,
  ASSET_IS_LIQUID,
  DEBT_INTEREST_RATE,
  DEBT_TAX_DEDUCTIBLE,
  annuityMonthlyPayment,
  completeAsset,
  completeDebt,
  completeLifeEvent,
  defaultMonthlyPayment,
  normalizeEventType,
  REVOLVING_MIN_PAYMENT_PCT,
} from './local-extraction-defaults'

describe('rendementen en rentes — gelijk aan de cloud-prompt', () => {
  it('rendement per bezittingstype', () => {
    expect(ASSET_EXPECTED_RETURN.savings).toBe(2.5)
    expect(ASSET_EXPECTED_RETURN.investment).toBe(7)
    expect(ASSET_EXPECTED_RETURN.eigen_huis).toBe(3.5)
    expect(ASSET_EXPECTED_RETURN.vehicle).toBe(-15)
    expect(ASSET_EXPECTED_RETURN.cash).toBe(0)
  })

  it('rente per schuldtype', () => {
    expect(DEBT_INTEREST_RATE.mortgage).toBe(4.0)
    expect(DEBT_INTEREST_RATE.student_loan).toBe(0.46)
    expect(DEBT_INTEREST_RATE.credit_card).toBe(14.0)
    expect(DEBT_INTEREST_RATE.familielening).toBe(2.0)
  })

  it('alleen de eigenwoningschuld is fiscaal aftrekbaar; onbekend blijft null', () => {
    expect(DEBT_TAX_DEDUCTIBLE.mortgage).toBe(true)
    expect(DEBT_TAX_DEDUCTIBLE.personal_loan).toBe(false)
    expect(DEBT_TAX_DEDUCTIBLE.other).toBeNull()
  })

  it('onbekend bezit telt NIET als liquide (fout naar boven is erger)', () => {
    expect(ASSET_IS_LIQUID.other).toBe(false)
    expect(ASSET_IS_LIQUID.eigen_huis).toBe(false)
    expect(ASSET_IS_LIQUID.savings).toBe(true)
  })
})

describe('annuityMonthlyPayment', () => {
  it('rekent de standaard annuïteit — geen modelwerk', () => {
    // 280.000 tegen 4% over 30 jaar ≈ €1.337 per maand.
    expect(Math.round(annuityMonthlyPayment(280000, 4, 360))).toBe(1337)
  })

  it('valt bij nulrente terug op lineair in plaats van te delen door nul', () => {
    expect(annuityMonthlyPayment(1200, 0, 12)).toBe(100)
  })

  it('geeft 0 bij een leeg saldo of een lege looptijd', () => {
    expect(annuityMonthlyPayment(0, 4, 360)).toBe(0)
    expect(annuityMonthlyPayment(1000, 4, 0)).toBe(0)
  })
})

describe('defaultMonthlyPayment', () => {
  it('hypotheek: annuïteit over 30 jaar', () => {
    expect(defaultMonthlyPayment('mortgage', 280000)).toBe(1337)
  })

  it('creditcard en doorlopend krediet: minimumtermijn als percentage van het saldo', () => {
    expect(defaultMonthlyPayment('credit_card', 3000)).toBe(3000 * REVOLVING_MIN_PAYMENT_PCT)
    expect(defaultMonthlyPayment('revolving_credit', 5000)).toBe(100)
  })

  it('DUO: 0 zolang het inkomen onbekend is (draagkracht, geen saldo)', () => {
    expect(defaultMonthlyPayment('student_loan', 12000)).toBe(0)
  })

  it('geeft 0 bij een leeg saldo', () => {
    expect(defaultMonthlyPayment('personal_loan', 0)).toBe(0)
  })
})

describe('completeAsset / completeDebt — het model levert drie velden, de app de rest', () => {
  it('vult een spaarrekening deterministisch aan', () => {
    expect(completeAsset({ name: 'Spaarrekening', asset_type: 'savings', estimated_value: 15000 })).toEqual({
      name: 'Spaarrekening',
      asset_type: 'savings',
      estimated_value: 15000,
      expected_return: 2.5,
      monthly_contribution: 0,
      is_liquid: true,
      subtype: 'savings_account',
    })
  })

  it('vult een hypotheek deterministisch aan', () => {
    expect(completeDebt({ name: 'Hypotheek', debt_type: 'mortgage', estimated_balance: 280000 })).toEqual({
      name: 'Hypotheek',
      debt_type: 'mortgage',
      estimated_balance: 280000,
      interest_rate: 4.0,
      monthly_payment: 1337,
      is_tax_deductible: true,
      subtype: 'annuiteit',
    })
  })

  it('geeft DUO het juiste subtype en nul aflossing', () => {
    const duo = completeDebt({ name: 'Studieschuld DUO', debt_type: 'student_loan', estimated_balance: 12000 })
    expect(duo.subtype).toBe('nieuw_stelsel')
    expect(duo.monthly_payment).toBe(0)
  })
})

describe('normalizeEventType', () => {
  it('accepteert een catalogus-sleutel', () => {
    expect(normalizeEventType('children')).toBe('children')
  })

  it('vertaalt de slugs uit de cloud-prompt', () => {
    expect(normalizeEventType('kind')).toBe('children')
    expect(normalizeEventType('huis_kopen')).toBe('house_purchase')
    expect(normalizeEventType('pensioen')).toBe('early_retirement')
  })

  it('normaliseert spaties, streepjes en hoofdletters', () => {
    expect(normalizeEventType('Huis-kopen')).toBe('house_purchase')
  })

  it('geeft null bij een onbekende soort (geen catalogus = geen bedragen)', () => {
    expect(normalizeEventType('emigratie')).toBeNull()
    expect(normalizeEventType(42)).toBeNull()
  })
})

describe('completeLifeEvent — bedragen komen UITSLUITEND uit LIFE_EVENT_CATALOG', () => {
  it('neemt de catalogus-waarden één-op-één over, inclusief het teken', () => {
    const entry = LIFE_EVENT_CATALOG.sabbatical!
    const event = completeLifeEvent({ event_type: 'sabbatical', target_age: null })!
    expect(event.one_time_cost).toBe(Math.round(entry.defaultCost))
    expect(event.monthly_income_change).toBe(Math.round(entry.defaultMonthlyIncome))
    expect(event.monthly_income_change).toBeLessThan(0) // inkomensverlies blijft verlies
    expect(event.duration_months).toBe(Math.round(entry.defaultDuration))
    expect(event.icon).toBe(entry.icon)
  })

  it('gebruikt de door het model genoemde leeftijd wanneer die er is', () => {
    expect(completeLifeEvent({ event_type: 'children', target_age: 35 })!.target_age).toBe(35)
  })

  it('valt terug op de catalogus-leeftijd wanneer het model er geen noemt', () => {
    expect(completeLifeEvent({ event_type: 'aow', target_age: null })!.target_age).toBe(
      LIFE_EVENT_CATALOG.aow!.defaultAge,
    )
  })

  it('geeft null bij een soort zonder enig bedrag (kaart zonder effect)', () => {
    expect(completeLifeEvent({ event_type: 'custom' as never, target_age: null })).toBeNull()
  })
})
