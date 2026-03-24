/**
 * Standalone vitest wrapper for the levensgebeurtenissen-ui regression suite.
 * Imports each regression test and runs it as a vitest case.
 */
import { describe, it, expect } from 'vitest'
import {
  splitLifeEvents,
  classifyLifeEvent,
  computeLifeEventNetImpact,
  type LifeEvent,
} from '@/lib/horizon-data'

// ── Mock LifeEvent factory ──────────────────────────────────────────────────

function makeEvent(overrides: Partial<LifeEvent> & { name: string }): LifeEvent {
  return {
    id: overrides.id ?? `evt-${overrides.name.toLowerCase().replace(/\s/g, '-')}`,
    name: overrides.name,
    event_type: overrides.event_type ?? 'custom',
    target_age: overrides.target_age ?? null,
    target_date: overrides.target_date ?? null,
    one_time_cost: overrides.one_time_cost ?? 0,
    monthly_cost_change: overrides.monthly_cost_change ?? 0,
    monthly_income_change: overrides.monthly_income_change ?? 0,
    duration_months: overrides.duration_months ?? 0,
    icon: overrides.icon ?? '📋',
    is_active: overrides.is_active ?? true,
    sort_order: overrides.sort_order ?? 0,
    is_indexed: overrides.is_indexed ?? false,
  }
}

// ── Test data ───────────────────────────────────────────────────────────────

// DB convention: positive one_time_cost = expense, negative = income
const erfenis = makeEvent({ name: 'Erfenis', event_type: 'inheritance', target_age: 55, one_time_cost: -100_000 })
const aow = makeEvent({ name: 'AOW', event_type: 'aow', target_age: 67, monthly_income_change: 1200, duration_months: 240 })
const huisVerkoop = makeEvent({ name: 'Huis verkoop', event_type: 'house_sale', target_age: 60, one_time_cost: -250_000 })
const kinderen = makeEvent({ name: 'Kinderen', event_type: 'children', target_age: 35, one_time_cost: 5_000, monthly_cost_change: 500, duration_months: 216 })
const verbouwing = makeEvent({ name: 'Verbouwing', event_type: 'renovation', target_age: 40, one_time_cost: 50_000 })
const wereldreis = makeEvent({ name: 'Wereldreis', event_type: 'world_trip', target_age: 45, one_time_cost: 30_000, duration_months: 12, monthly_cost_change: 1500 })

describe('Levensgebeurtenissen UI — twee-kolommen rendering', () => {
  it('gemixte events vullen beide kolommen', () => {
    const { opbouwen, investeren } = splitLifeEvents([erfenis, kinderen, aow, verbouwing])
    expect(opbouwen.length).toBeGreaterThan(0)
    expect(investeren.length).toBeGreaterThan(0)
    expect(opbouwen.length + investeren.length).toBe(4)
    expect(opbouwen.some(e => e.name === 'Erfenis')).toBe(true)
    expect(investeren.some(e => e.name === 'Kinderen')).toBe(true)
  })

  it('alleen opbouwen-events → rechterkolom leeg', () => {
    const { opbouwen, investeren } = splitLifeEvents([erfenis, aow, huisVerkoop])
    expect(opbouwen.length).toBe(3)
    expect(investeren.length).toBe(0)
  })

  it('alleen investeren-events → linkerkolom leeg', () => {
    const { opbouwen, investeren } = splitLifeEvents([kinderen, verbouwing, wereldreis])
    expect(opbouwen.length).toBe(0)
    expect(investeren.length).toBe(3)
  })

  it('geen events → beide kolommen leeg', () => {
    const { opbouwen, investeren } = splitLifeEvents([])
    expect(opbouwen.length).toBe(0)
    expect(investeren.length).toBe(0)
  })

  it('classificatie keys matchen kolom-headers', () => {
    expect(classifyLifeEvent(erfenis)).toBe('opbouwen')   // → "Vrijheid opbouwen"
    expect(classifyLifeEvent(kinderen)).toBe('investeren') // → "Vrijheid investeren"
  })

  it('totalen per kolom correct berekend', () => {
    const mixed = [erfenis, kinderen, aow, verbouwing, huisVerkoop, wereldreis]
    const { opbouwen, investeren } = splitLifeEvents(mixed)
    const totalOpbouwen = opbouwen.reduce((sum, ev) => sum + computeLifeEventNetImpact(ev), 0)
    const totalInvesteren = investeren.reduce((sum, ev) => sum + computeLifeEventNetImpact(ev), 0)

    expect(computeLifeEventNetImpact(erfenis)).toBe(100_000)
    expect(computeLifeEventNetImpact(aow)).toBe(288_000)
    expect(computeLifeEventNetImpact(huisVerkoop)).toBe(250_000)
    expect(totalOpbouwen).toBe(638_000)

    expect(computeLifeEventNetImpact(kinderen)).toBe(-113_000)
    expect(computeLifeEventNetImpact(verbouwing)).toBe(-50_000)
    expect(computeLifeEventNetImpact(wereldreis)).toBe(-48_000)
    expect(totalInvesteren).toBe(-211_000)
    expect(totalOpbouwen).toBeGreaterThan(0)
    expect(totalInvesteren).toBeLessThanOrEqual(0)
  })

  it('events chronologisch gesorteerd binnen kolom', () => {
    const sortByAge = (a: LifeEvent, b: LifeEvent) => (a.target_age ?? 999) - (b.target_age ?? 999)
    const { opbouwen, investeren } = splitLifeEvents([aow, erfenis, huisVerkoop, wereldreis, kinderen, verbouwing])
    const opbouwenSorted = [...opbouwen].sort(sortByAge)
    const investerenSorted = [...investeren].sort(sortByAge)

    expect(opbouwenSorted.map(e => e.name)).toEqual(['Erfenis', 'Huis verkoop', 'AOW'])
    expect(investerenSorted.map(e => e.name)).toEqual(['Kinderen', 'Verbouwing', 'Wereldreis'])
  })

  it('null target_age sorteert als laatste', () => {
    const noAge = makeEvent({ name: 'Ongedateerd', one_time_cost: 10_000, target_age: null })
    const withAge = makeEvent({ name: 'Gedateerd', one_time_cost: 20_000, target_age: 50 })
    const sortByAge = (a: LifeEvent, b: LifeEvent) => (a.target_age ?? 999) - (b.target_age ?? 999)
    const { investeren } = splitLifeEvents([noAge, withAge])
    const sorted = [...investeren].sort(sortByAge)
    expect(sorted[0].name).toBe('Gedateerd')
    expect(sorted[1].name).toBe('Ongedateerd')
  })

  it('nul-impact event classificeert als investeren (conservatief)', () => {
    const zeroImpact = makeEvent({ name: 'Neutraal' })
    expect(computeLifeEventNetImpact(zeroImpact)).toBe(0)
    expect(classifyLifeEvent(zeroImpact)).toBe('investeren')
    const { opbouwen, investeren } = splitLifeEvents([zeroImpact])
    expect(opbouwen.length).toBe(0)
    expect(investeren.length).toBe(1)
  })
})
