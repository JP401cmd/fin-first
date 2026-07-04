import { describe, it, expect } from 'vitest'
import { clipRowsToPlanEnd } from './clip-rows-to-plan-end'

/**
 * Besluit 4 juli 2026 (eigenaar): weergave t/m `displayEndAge − 1`. Het laatste
 * levensjaar (terminale modelmarge) verdwijnt uit beeld op de weergave-oppervlakken.
 */

function rows(...ages: number[]): { age: number; tag: string }[] {
  return ages.map((age) => ({ age, tag: `r${age}` }))
}

describe('clipRowsToPlanEnd', () => {
  it('clipt rijen op age <= endAge − 1 (eindleeftijd 93 → t/m 92)', () => {
    const out = clipRowsToPlanEnd(rows(90, 91, 92, 93), 93)
    expect(out.map((r) => r.age)).toEqual([90, 91, 92])
  })

  it('boundary: age = endAge − 1 is inclusief, age = endAge valt weg', () => {
    const out = clipRowsToPlanEnd(rows(91, 92, 93), 93)
    expect(out.map((r) => r.age)).toEqual([91, 92])
    // exact op de grens t/m 92, niets op/na 93
    expect(out.some((r) => r.age >= 93)).toBe(false)
  })

  it('doorlopende strategie: displayEndAge 100 → t/m 99', () => {
    const out = clipRowsToPlanEnd(rows(98, 99, 100), 100)
    expect(out.map((r) => r.age)).toEqual([98, 99])
  })

  it('geen endAge (null/undefined/NaN) ⇒ ongewijzigd', () => {
    const input = rows(90, 91, 92, 93)
    expect(clipRowsToPlanEnd(input, null).map((r) => r.age)).toEqual([90, 91, 92, 93])
    expect(clipRowsToPlanEnd(input, undefined).map((r) => r.age)).toEqual([90, 91, 92, 93])
    expect(clipRowsToPlanEnd(input, Number.NaN).map((r) => r.age)).toEqual([90, 91, 92, 93])
  })

  it('lege of null/undefined rijen ⇒ lege array', () => {
    expect(clipRowsToPlanEnd([], 93)).toEqual([])
    expect(clipRowsToPlanEnd(null, 93)).toEqual([])
    expect(clipRowsToPlanEnd(undefined, 93)).toEqual([])
  })

  it('idempotent: dubbel clippen levert dezelfde rijen', () => {
    const once = clipRowsToPlanEnd(rows(90, 91, 92, 93), 93)
    const twice = clipRowsToPlanEnd(once, 93)
    expect(twice.map((r) => r.age)).toEqual(once.map((r) => r.age))
  })

  it('geeft een nieuwe array terug (muteert de input niet)', () => {
    const input = rows(90, 91, 92, 93)
    const out = clipRowsToPlanEnd(input, 93)
    expect(out).not.toBe(input)
    expect(input).toHaveLength(4)
  })
})
