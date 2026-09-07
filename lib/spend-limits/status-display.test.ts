/**
 * DE VIERDE WEERGAVE-STAND (ADR 0136).
 *
 * Wat hier bewaakt wordt is precies de melding die 'm veroorzaakte: "in de
 * melding en in de pot staat dat er nog ruimte is, maar exact het bedrag is
 * uitgegeven". De motor mag daar niets van merken — die tests staan in
 * engine.test.ts en blijven onaangeroerd — maar de WEERGAVE moet het verschil
 * kennen tussen "bijna" en "op".
 *
 * De invoer komt hier uit `computePeriodOutcome`, de echte motorfunctie: een
 * handgeschreven `periodHeadroom: 0` naast `status: 'within'` zou een tweede
 * waarheid zijn en de koppeling met de motor juist wegtesten.
 */

import { describe, it, expect } from 'vitest'
import {
  computePeriodOutcome,
  resolveSpendLimitPeriods,
  type SpendLimitAggregateRow,
} from './engine'
import {
  resolveSpendLimitDisplayStatus,
  resolveSpendLimitOutcomeState,
  SPEND_LIMIT_HEADROOM_EPSILON,
  SPEND_LIMIT_STATUS_BAND_CLASS,
  SPEND_LIMIT_STATUS_COLOR_VAR,
  SPEND_LIMIT_STATUS_LABEL,
  SPEND_LIMIT_STATUS_LABEL_INLINE,
  SPEND_LIMIT_STATUS_TEXT_CLASS,
} from './status-display'

const NOW = new Date(2026, 7, 15) // 15 augustus 2026
const SLICE = resolveSpendLimitPeriods('month', NOW, 2)[1] // de lopende maand

function row(spend: number): SpendLimitAggregateRow {
  return {
    bucketStart: `${SLICE.since.slice(0, 7)}-01`,
    transactionType: 'expense',
    sumPositief: 0,
    sumNegatief: -spend,
    count: 1,
  }
}

/** Doorgerekend door de motor, niet met de hand samengesteld. */
function outcome(spend: number, limit: number) {
  return computePeriodOutcome(SLICE, [row(spend)], limit)
}

describe('resolveSpendLimitDisplayStatus — vier standen', () => {
  it('EXACT op de grens: de motor zegt within, de weergave zegt "reached"', () => {
    const o = outcome(5, 5)
    // Dit is de bug uit de melding: de motorwaarden zijn ongewijzigd correct...
    expect(o.status).toBe('within')
    expect(o.periodHeadroom).toBe(0)
    expect(o.isNearLimit).toBe(true)
    // ...en tóch mag er geen ruimte meer beloofd worden.
    expect(resolveSpendLimitDisplayStatus(o)).toBe('reached')
    expect(SPEND_LIMIT_STATUS_LABEL.reached).toBe('Grens bereikt')
  })

  it('reached wint van near — anders belooft de tekst ruimte die er niet is', () => {
    const o = outcome(5, 5)
    expect(o.isNearLimit).toBe(true)
    expect(resolveSpendLimitDisplayStatus(o)).not.toBe('near')
  })

  it('ruim binnen de grens blijft "within", dicht erbij blijft "near"', () => {
    expect(resolveSpendLimitDisplayStatus(outcome(10, 100))).toBe('within')
    const bijna = outcome(85, 100)
    expect(bijna.isNearLimit).toBe(true)
    expect(resolveSpendLimitDisplayStatus(bijna)).toBe('near')
  })

  it('boven de grens blijft "exceeded" — de motor houdt daar het laatste woord', () => {
    const o = outcome(120, 100)
    expect(o.status).toBe('exceeded')
    expect(resolveSpendLimitDisplayStatus(o)).toBe('exceeded')
  })

  it('een afrondingsrest onder een halve cent telt óók als bereikt', () => {
    // Zonder cent-tolerantie zou dit op `near` terugvallen terwijl het scherm
    // "€ 0 ruimte" toont — dezelfde tegenspraak, alleen zeldzamer.
    const o = outcome(100 - SPEND_LIMIT_HEADROOM_EPSILON / 2, 100)
    expect(o.periodHeadroom).toBeGreaterThan(0)
    expect(o.periodHeadroom).toBeLessThan(SPEND_LIMIT_HEADROOM_EPSILON)
    expect(resolveSpendLimitDisplayStatus(o)).toBe('reached')
  })

  it('een ruimte van een hele cent is nog gewoon ruimte', () => {
    const o = outcome(99.99, 100)
    expect(resolveSpendLimitDisplayStatus(o)).toBe('near')
  })

  it('nulgrens: een lege periode meldt nooit "grens bereikt"', () => {
    // Spiegelt de guard van isNearLimit: zonder `limitAmount > 0` zou elke
    // nulgrens-pot permanent op zijn grens staan.
    const leeg = computePeriodOutcome(SLICE, [], 0)
    expect(leeg.status).toBe('within')
    expect(leeg.periodHeadroom).toBe(0)
    expect(resolveSpendLimitDisplayStatus(leeg)).toBe('within')
  })
})

describe('resolveSpendLimitOutcomeState — de lezing zonder near', () => {
  it('geeft nooit "near", ook niet bij een periode die de drempel raakt', () => {
    const bijna = outcome(85, 100)
    expect(bijna.isNearLimit).toBe(true)
    expect(resolveSpendLimitOutcomeState(bijna)).toBe('within')
  })

  it('kent dezelfde bereikt- en boven-grens als de volledige lezing', () => {
    expect(resolveSpendLimitOutcomeState(outcome(5, 5))).toBe('reached')
    expect(resolveSpendLimitOutcomeState(outcome(120, 100))).toBe('exceeded')
  })
})

describe('de standen-maps dekken alle vier de standen', () => {
  it('reached heeft een eigen label en de warning-kleur — niet groen, niet rood', () => {
    expect(SPEND_LIMIT_STATUS_LABEL_INLINE.reached).toBe('grens bereikt')
    expect(SPEND_LIMIT_STATUS_TEXT_CLASS.reached).toBe('text-warning')
    expect(SPEND_LIMIT_STATUS_COLOR_VAR.reached).toBe('var(--warning)')
    expect(SPEND_LIMIT_STATUS_BAND_CLASS.reached).toContain('warning')
    // Geen stille terugval op de positieve of negatieve familie.
    expect(SPEND_LIMIT_STATUS_TEXT_CLASS.reached).not.toBe(SPEND_LIMIT_STATUS_TEXT_CLASS.within)
    expect(SPEND_LIMIT_STATUS_TEXT_CLASS.reached).not.toBe(SPEND_LIMIT_STATUS_TEXT_CLASS.exceeded)
    // ...maar wel zichtbaar anders dan "dicht bij je grens".
    expect(SPEND_LIMIT_STATUS_BAND_CLASS.reached).not.toBe(SPEND_LIMIT_STATUS_BAND_CLASS.near)
  })
})
