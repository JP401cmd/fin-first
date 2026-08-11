/**
 * Unit-tests voor de zusterregel van het canonieke trio: wáár een blijvende
 * regel landt, en wanneer hij niet mag ontstaan.
 *
 * Twee eigenschappen die niet mogen verschuiven, omdat ze allebei stil de
 * spaarquote en de FIRE-datum raken:
 *
 *  1. Een "Eigen rekening"-doel landt NOOIT in `category_corrections`. Zo'n
 *     correctie zet alleen `budget_id`; toekomstige imports zouden dan wél op de
 *     archive-post landen en tóch meetellen, want `isRealAggRow` kijkt naar
 *     `transaction_type`.
 *  2. Élke blijvende matchwaarde haalt de ondergrens. Een `description`-correctie
 *     matcht als SUBSTRING op priority 1: een regel op twee tekens stuurt élke
 *     volgende import naar één budget.
 *
 * Deze regels stonden op drie plekken met net andere invulling; dat is precies
 * hoe (2) op de bulkroute kon ontbreken.
 */
import { describe, it, expect } from 'vitest'
import { isRejected, planRuleTarget, MIN_RULE_MATCH_LENGTH } from './rule-target'

describe('planRuleTarget — gewoon budget', () => {
  it('levert een category_corrections-regel op de getrimde waarde', () => {
    const plan = planRuleTarget({
      targetsEigenRekening: false,
      matchField: 'counterparty_name',
      matchValue: '  Albert Heijn  ',
    })
    expect(plan).toEqual({
      target: {
        table: 'category_corrections',
        matchField: 'counterparty_name',
        matchValue: 'Albert Heijn',
      },
    })
  })

  it('weigert een te korte matchwaarde — óók op de description-tak (H2)', () => {
    const plan = planRuleTarget({
      targetsEigenRekening: false,
      matchField: 'description',
      matchValue: 'bp',
    })
    expect(isRejected(plan)).toBe(true)
    if (isRejected(plan)) expect(plan.rejected.reason).toBe('too_short')
  })

  it('accepteert exact de ondergrens (grens, geen valse weigering)', () => {
    const waarde = 'a'.repeat(MIN_RULE_MATCH_LENGTH)
    const plan = planRuleTarget({
      targetsEigenRekening: false,
      matchField: 'description',
      matchValue: waarde,
    })
    expect(isRejected(plan)).toBe(false)
  })

  it('weigert een lege waarde', () => {
    const plan = planRuleTarget({
      targetsEigenRekening: false,
      matchField: 'counterparty_name',
      matchValue: '   ',
    })
    expect(isRejected(plan)).toBe(true)
    if (isRejected(plan)) expect(plan.rejected.reason).toBe('empty')
  })
})

describe('planRuleTarget — Eigen rekening', () => {
  it('landt in user_own_ibans, nooit in category_corrections', () => {
    const plan = planRuleTarget({
      targetsEigenRekening: true,
      matchField: 'counterparty_name',
      matchValue: 'Mijn Spaarrekening',
    })
    expect(isRejected(plan)).toBe(false)
    if (!isRejected(plan)) {
      expect(plan.target.table).toBe('user_own_ibans')
      if (plan.target.table === 'user_own_ibans') {
        // Lowercase: de herkenning is een lowercase substring-match.
        expect(plan.target.matchType).toBe('name')
        expect(plan.target.matchValue).toBe('mijn spaarrekening')
        expect(plan.target.label).toBe('Mijn Spaarrekening')
      }
    }
  })

  it('geeft de IBAN voorrang en normaliseert hem — die matcht exact, dus zonder ondergrens', () => {
    const plan = planRuleTarget({
      targetsEigenRekening: true,
      matchField: 'counterparty_name',
      matchValue: 'ik',
      counterpartyIban: 'nl91 abna 0417 1643 00',
    })
    expect(isRejected(plan)).toBe(false)
    if (!isRejected(plan) && plan.target.table === 'user_own_ibans') {
      expect(plan.target.matchType).toBe('iban')
      expect(plan.target.matchValue).toBe('NL91ABNA0417164300')
    }
  })

  it('weigert een description-regel: de eigen-rekeningherkenning kijkt niet naar de omschrijving', () => {
    const plan = planRuleTarget({
      targetsEigenRekening: true,
      matchField: 'description',
      matchValue: 'overboeking naar spaar',
    })
    expect(isRejected(plan)).toBe(true)
    if (isRejected(plan)) expect(plan.rejected.reason).toBe('unsupported_match_field')
  })

  it('weigert een te kort naampatroon zonder IBAN', () => {
    const plan = planRuleTarget({
      targetsEigenRekening: true,
      matchField: 'counterparty_name',
      matchValue: 'AH',
    })
    expect(isRejected(plan)).toBe(true)
    if (isRejected(plan)) expect(plan.rejected.reason).toBe('too_short')
  })
})
