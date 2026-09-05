import { describe, it, expect } from 'vitest'
import { closingSentenceFor, unreachableMessageFor } from './chapter-data'
import { ankerGrafiekZin, ankerZin, type AnkerReach, type AnkerStop } from '@/lib/horizon/anker-copy'

/**
 * ADR 0129 F3b — de grafiek-uitleg onder ÉLK vast anker (aow/age, naast het
 * nu-anker uit ADR 0127). De zinnen zijn anker-generiek: het bereik + het
 * stopmoment, gepind tegen de canonieke kopij uit anker-copy — de eind-vorm-tak
 * (`switch (strategy)`) komt onder een vast anker niet meer aan bod.
 */

const REIKT_TOT: AnkerReach = { kind: 'reikt-tot', age: 83.4, endAge: 90 }
const GEDEKT: AnkerReach = { kind: 'gedekt', endAge: 90 }
const STOPS: Array<[string, AnkerStop]> = [
  ['age 58,5', { kind: 'age', stopAge: 58.5 }],
  ['aow 67', { kind: 'aow', stopAge: 67 }],
  ['nu', { kind: 'now' }],
]

describe('closingSentenceFor — onder een vast anker volgt de afsluiting het bereik', () => {
  it.each(STOPS)('%s: tekort en gedekt uit anker-copy, ongeacht de eind-vorm', (_l, stop) => {
    for (const strategy of ['deplete', 'legacy', 'perpetual'] as const) {
      expect(closingSentenceFor(strategy, 90, 0, REIKT_TOT, stop)).toBe(ankerGrafiekZin(REIKT_TOT, stop))
      expect(closingSentenceFor(strategy, 90, 0, GEDEKT, stop)).toBe(ankerGrafiekZin(GEDEKT, stop))
    }
  })

  it('age-tekort noemt het stopmoment en de bereikte leeftijd, niet "af naar nul rond 90"', () => {
    const zin = closingSentenceFor('deplete', 90, 0, REIKT_TOT, { kind: 'age', stopAge: 58.5 })
    expect(zin).toContain('58,5')
    expect(zin).toContain('83')
    expect(zin).not.toMatch(/naar nul rond leeftijd/i)
  })

  it('zonder bereik (solved) blijven de eind-vorm-zinnen byte-identiek', () => {
    expect(closingSentenceFor('deplete', 90, 0)).toContain('naar nul rond leeftijd 90')
    expect(closingSentenceFor('perpetual', 90, 0)).toContain('koopkracht')
  })
})

describe('unreachableMessageFor — onder een vast anker de bereik-zin, geen aansporing', () => {
  it.each(STOPS)('%s', (_l, stop) => {
    const msg = unreachableMessageFor('deplete', 90, REIKT_TOT, stop)
    expect(msg).toBe(ankerZin(REIKT_TOT, stop))
    expect(msg).not.toMatch(/verhoog je|verlaag je|niet haalbaar/i)
    expect(msg).not.toMatch(/\bAOW\b/)
  })
})
