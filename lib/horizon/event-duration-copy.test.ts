import { describe, expect, it } from 'vitest'
import { describeEventDuration, eventStopAgeFromSim } from './event-duration-copy'
import { LIFE_EVENT_TOT_STOPMOMENT_KEY } from './life-events-catalog'

/**
 * Given een gebeurtenis met een maandbedrag en een gedraaide run,
 * When een tijdas-oppervlak de looptijd beschrijft,
 * Then noemt de tekst het stopmoment van de run bij "tot ik stop met werken" — nooit
 * "0 mnd", nooit `fireAge` (ceil), en geen leeftijd wanneer het plan geen stopmoment kent.
 */
describe('describeEventDuration', () => {
  const totStop = { duration_months: 0, metadata: { [LIFE_EVENT_TOT_STOPMOMENT_KEY]: true } }
  const blijvend = { duration_months: 0, metadata: {} }
  const tijdelijk = { duration_months: 24, metadata: { [LIFE_EVENT_TOT_STOPMOMENT_KEY]: true } }

  it('tijdelijk → "24 mnd" (een achtergebleven stop-sleutel telt niet)', () => {
    expect(describeEventDuration(tijdelijk, 58.5)).toBe('24 mnd')
  })

  it('blijvend zonder stopkeuze → "blijvend", ongeacht het stopmoment', () => {
    expect(describeEventDuration(blijvend, 58.5)).toBe('blijvend')
    expect(describeEventDuration(blijvend, null)).toBe('blijvend')
  })

  it('tot stop met een gevonden stopmoment (solved) → leeftijd op halve jaren', () => {
    expect(describeEventDuration(totStop, 58.5)).toBe('tot stopmoment (58,5)')
  })

  it('tot stop onder een vast anker (67) → hele leeftijd zonder komma', () => {
    expect(describeEventDuration(totStop, 67)).toBe('tot stopmoment (67)')
  })

  it('tot stop zonder bereikbaar stopmoment → eerlijk label, geen leeftijd', () => {
    expect(describeEventDuration(totStop, null)).toBe('tot stopmoment — nog geen stopmoment binnen je plan')
    expect(describeEventDuration(totStop, undefined)).not.toMatch(/\d/)
  })

  it('zonder gedraaide run (hasRun: false) → kaal "tot stopmoment", geen onbereikbaar-label', () => {
    expect(describeEventDuration(totStop, null, { hasRun: false })).toBe('tot stopmoment')
    expect(describeEventDuration(blijvend, null, { hasRun: false })).toBe('blijvend')
  })

  it('bevat nooit "0 mnd"', () => {
    for (const s of [58.5, 67, null]) expect(describeEventDuration(totStop, s)).not.toContain('0 mnd')
    expect(describeEventDuration(blijvend, 58.5)).not.toContain('0 mnd')
  })
})

describe('eventStopAgeFromSim', () => {
  it('vast anker wint van het solver-moment', () => {
    expect(eventStopAgeFromSim({ vastStopLeeftijd: 67, fireAgeFractional: 58.5 })).toBe(67)
  })
  it('zonder anker: het fractionele solver-moment (nooit de ceil-leeftijd)', () => {
    expect(eventStopAgeFromSim({ vastStopLeeftijd: null, fireAgeFractional: 58.5 })).toBe(58.5)
    expect(eventStopAgeFromSim({ fireAgeFractional: 58.5 })).toBe(58.5)
  })
  it('onbereikbaar (fireAgeFractional null) of geen run → null', () => {
    expect(eventStopAgeFromSim({ vastStopLeeftijd: null, fireAgeFractional: null })).toBeNull()
    expect(eventStopAgeFromSim(null)).toBeNull()
    expect(eventStopAgeFromSim(undefined)).toBeNull()
  })
})
