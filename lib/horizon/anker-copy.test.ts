import { describe, it, expect } from 'vitest'
import {
  ankerVraag,
  ankerVrijZin,
  ANKER_KPI_LABEL,
  ankerGrafiekZin,
  ankerKort,
  ankerKpiCaption,
  ankerReachFromRunway,
  ankerReachFromSim,
  ankerReachYear,
  ankerReachesAge,
  ankerStopFromSim,
  ankerTitel,
  ankerZin,
  ankerZinKort,
  fireAgeGoalNotApplicableReason,
  formatStopAge,
  type AnkerReach,
  type AnkerStop,
} from './anker-copy'
import {
  nuStoppenGrafiekZin,
  nuStoppenZin,
  nuStoppenZinKort,
} from './nu-stoppen-copy'
import type { RunwayResult } from './runway'
import { HORIZON_PLAFOND_LEEFTIJD } from '@/lib/constants'

/**
 * ADR 0129 F3a — de anker-generieke opvolger van `nu-stoppen-copy.test.ts`. De
 * toon-invarianten uit de bijlage van het besluit gelden nu over ÁLLE ankers:
 * geen aansporing, geen eeuwigheidsclaim, geen "AOW" in een tekortzin, en de
 * grondslag heet "liquide vermogen". Plus: het nu-anker is byte-identiek aan de
 * ADR 0127-kopij (de compat-laag bewijst dat).
 */

const STOPS: readonly [string, AnkerStop][] = [
  ['now', { kind: 'now' }],
  ['aow 67', { kind: 'aow', stopAge: 67 }],
  ['age 58,5', { kind: 'age', stopAge: 58.5 }],
  ['age 62', { kind: 'age', stopAge: 62 }],
]

const REACHES: readonly AnkerReach[] = [
  { kind: 'gedekt', endAge: 90 },
  { kind: 'gedekt', endAge: null },
  { kind: 'reikt-tot', age: 57.5, endAge: 90 },
  { kind: 'reikt-tot', age: 57.5, endAge: null },
  { kind: 'nu-op' },
  { kind: 'onbekend' },
]

describe('ankerStopFromSim — het stopmoment uit de kernel-echo (bevinding 11)', () => {
  it('leeftijd-anker: vastStopLeeftijd wint, fractioneel', () => {
    expect(ankerStopFromSim({ stopAnker: { soort: 'leeftijd', leeftijd: 58.5 }, vastStopLeeftijd: 58.5 })).toEqual({ kind: 'age', stopAge: 58.5 })
    // Zonder vastStopLeeftijd de ankerleeftijd zelf — nooit iets afgeronds.
    expect(ankerStopFromSim({ stopAnker: { soort: 'leeftijd', leeftijd: 58.5 }, vastStopLeeftijd: undefined })).toEqual({ kind: 'age', stopAge: 58.5 })
  })
  it('aow: de leeftijd van de run; zonder leeftijd geen stopmoment', () => {
    expect(ankerStopFromSim({ stopAnker: { soort: 'aow' }, vastStopLeeftijd: 67.25 })).toEqual({ kind: 'aow', stopAge: 67.25 })
    expect(ankerStopFromSim({ stopAnker: { soort: 'aow' }, vastStopLeeftijd: null })).toBeNull()
  })
  it('nu → now; solved → null', () => {
    expect(ankerStopFromSim({ stopAnker: { soort: 'nu' }, vastStopLeeftijd: 42 })).toEqual({ kind: 'now' })
    expect(ankerStopFromSim({ stopAnker: null, vastStopLeeftijd: 55 })).toBeNull()
    expect(ankerStopFromSim({ stopAnker: undefined, vastStopLeeftijd: undefined })).toBeNull()
  })
})

describe('ankerReachFromSim — kernel-uitvoer → bereik (anker-onafhankelijk)', () => {
  it('undefined uitputtingsmaand is ONBEKEND, null is GEDEKT, 0 is NU-OP', () => {
    expect(ankerReachFromSim({ startAge: 42, kernelDepletionMonth: undefined, endAge: 90 })).toEqual({ kind: 'onbekend' })
    expect(ankerReachFromSim({ startAge: 42, kernelDepletionMonth: null, endAge: 90 })).toEqual({ kind: 'gedekt', endAge: 90 })
    expect(ankerReachFromSim({ startAge: 42, kernelDepletionMonth: 0, endAge: 90 })).toEqual({ kind: 'nu-op' })
  })
  it('maand > 0 vóór de eindleeftijd → reikt-tot op de kernel-tijdas (startAge + m/12)', () => {
    const reach = ankerReachFromSim({ startAge: 42, kernelDepletionMonth: 480, endAge: 90 })
    expect(reach).toEqual({ kind: 'reikt-tot', age: 82, endAge: 90 })
    expect(ankerReachesAge(reach)).toBe(82)
  })
  it('gedekt zonder plan-einde reikt tot het horizonplafond (nooit "oneindig")', () => {
    expect(ankerReachesAge({ kind: 'gedekt', endAge: null })).toBe(HORIZON_PLAFOND_LEEFTIJD)
    expect(ankerReachesAge({ kind: 'nu-op' })).toBeNull()
  })
  it('uit een RunwayResult: alle vijf vormen', () => {
    const basis = { expenseBasis: { yearly: 30_000, method: 'essential_budgets' as const }, strategy: 'Vermogen opeten' as never, solverStatus: 'reached_now' as never, startAge: 42 }
    expect(ankerReachFromRunway({ ...basis, kind: 'months', months: 126, depletionAge: 52.5, endAge: 90 } as RunwayResult)).toEqual({ kind: 'reikt-tot', age: 52.5, endAge: 90 })
    expect(ankerReachFromRunway({ ...basis, kind: 'reaches-end-age', endAge: 90 } as RunwayResult)).toEqual({ kind: 'gedekt', endAge: 90 })
    expect(ankerReachFromRunway({ ...basis, kind: 'beyond-horizon' } as RunwayResult)).toEqual({ kind: 'gedekt', endAge: null })
    expect(ankerReachFromRunway({ ...basis, kind: 'deficit' } as RunwayResult)).toEqual({ kind: 'nu-op' })
    expect(ankerReachFromRunway({ kind: 'unavailable', reason: 'kern-fout' })).toEqual({ kind: 'onbekend' })
  })
})

describe('woorden — stopmoment en titel', () => {
  it('formatStopAge: hele jaren kaal, halve jaren met komma', () => {
    expect(formatStopAge(62)).toBe('62')
    expect(formatStopAge(58.5)).toBe('58,5')
  })
  it('de titel volgt het anker', () => {
    expect(ankerTitel({ kind: 'now' })).toBe('Je rekent alsof je nu stopt')
    expect(ankerTitel({ kind: 'age', stopAge: 58.5 })).toBe('Je rekent met stoppen op 58,5')
    expect(ankerTitel({ kind: 'aow', stopAge: 67 })).not.toMatch(/\bAOW\b/)
  })
  it('afronding volgt het hero-kopgetal; korte regel en caption', () => {
    expect(ankerReachYear({ kind: 'reikt-tot', age: 57.5, endAge: 90 })).toBe(58)
    expect(ankerReachYear({ kind: 'gedekt', endAge: null })).toBeNull()
    expect(ankerKort({ kind: 'reikt-tot', age: 57.5, endAge: 90 })).toBe(`${ANKER_KPI_LABEL}: 58 jr`)
    expect(ankerKpiCaption({ kind: 'gedekt', endAge: 90 })).toContain('einde van je plan')
  })
})

describe('de zinnen uit de ADR-bijlage', () => {
  it('gedekt onder een vast stopmoment: "tot voorbij je {eind}e — het einde van je plan"', () => {
    expect(ankerZin({ kind: 'gedekt', endAge: 90 }, { kind: 'age', stopAge: 62 })).toBe(
      'Als je op 62 stopt, reikt je liquide vermogen tot voorbij je 90e — het einde van je plan.',
    )
  })
  it('tekort onder een vast stopmoment: "reikt tot je {reikt}e. Je plan loopt tot je {eind}e."', () => {
    expect(ankerZin({ kind: 'reikt-tot', age: 83.4, endAge: 90 }, { kind: 'aow', stopAge: 67 })).toBe(
      'Als je op 67 stopt, reikt je liquide vermogen tot je 83e. Je plan loopt tot je 90e.',
    )
  })
  it('het nu-anker is byte-identiek aan de ADR 0127-kopij (de compat-laag)', () => {
    for (const r of REACHES) {
      expect(nuStoppenZin(r)).toBe(ankerZin(r, { kind: 'now' }))
      expect(nuStoppenZinKort(r)).toBe(ankerZinKort(r, { kind: 'now' }))
      expect(nuStoppenGrafiekZin(r)).toBe(ankerGrafiekZin(r, { kind: 'now' }))
    }
    expect(ankerZin({ kind: 'gedekt', endAge: 90 }, { kind: 'now' })).toBe(
      'Als je nu stopt, reikt je liquide vermogen tot je 90e — het einde van je plan.',
    )
  })
  it('de fire_age-doelnotitie noemt het stopmoment en het plan-einde', () => {
    expect(fireAgeGoalNotApplicableReason('age', 62, 90)).toBe(
      'Je stopmoment ligt vast op 62, dus dit doel heeft geen uitkomst om naar te kijken. Wat telt, is of je plan tot je 90e reikt.',
    )
    expect(fireAgeGoalNotApplicableReason('now', null, 90)).toMatch(/^Je rekent alsof je nu stopt/)
    expect(fireAgeGoalNotApplicableReason('aow', 67, null)).toContain('tot je eindleeftijd reikt')
  })
})

describe('toon — de harde randvoorwaarden, over ALLE ankers gedraaid', () => {
  const zinnen = (r: AnkerReach, s: AnkerStop) => [ankerZin(r, s), ankerZinKort(r, s), ankerGrafiekZin(r, s)]

  it.each(STOPS)('%s — beschrijvend, nooit aansporend, nooit oneindig, nooit AOW, altijd liquide', (_l, stop) => {
    for (const reach of REACHES) {
      for (const zin of zinnen(reach, stop)) {
        expect(zin).not.toMatch(/je kunt (nu )?(al )?stoppen/i)
        expect(zin).not.toMatch(/stop met werken/i)
        expect(zin).not.toMatch(/oneindig|eeuwig|voorgoed|voor altijd/i)
        expect(zin).not.toMatch(/\bAOW\b/i)
        if (/vermogen/i.test(zin)) {
          expect(zin, `grondslag ontbreekt: "${zin}"`).toMatch(/liquide vermogen/i)
        }
      }
    }
  })

  it('een tekort wordt onder geen enkel anker als volledige dekking geformuleerd', () => {
    for (const [, stop] of STOPS) {
      const zin = ankerZin({ kind: 'reikt-tot', age: 57.5, endAge: 90 }, stop)
      expect(zin).toContain('58')
      expect(zin).not.toMatch(/einde van je plan\.$/)
      expect(ankerGrafiekZin({ kind: 'reikt-tot', age: 57.5, endAge: 90 }, stop)).not.toMatch(/naar nul rond leeftijd/i)
    }
  })

  it('de notitie op de doelkaart draagt dezelfde toon', () => {
    for (const a of ['aow', 'now', 'age'] as const) {
      const n = fireAgeGoalNotApplicableReason(a, 62, 90)
      expect(n).not.toMatch(/je kunt (nu )?(al )?stoppen|oneindig|\bAOW\b/i)
    }
  })
})

describe('ankerVraag — de vraag draagt de modus (B10)', () => {
  it('solved · vast anker · nu', () => {
    expect(ankerVraag(null)).toBe('Wanneer kun je stoppen?')
    expect(ankerVraag({ kind: 'age', stopAge: 58.5 })).toBe('Kun je op 58,5 stoppen?')
    expect(ankerVraag({ kind: 'aow', stopAge: 67 })).toBe('Kun je op 67 stoppen?')
    expect(ankerVraag({ kind: 'now' })).toBe('Hoe ver reikt je vermogen?')
  })
})

describe('ankerVrijZin — "vrij mogelijk vanaf" als inzicht (D7/B9)', () => {
  it('gedekt onder age, vrij vóór het stopmoment: de bijlage-zin met de jaren bovenop het plan', () => {
    expect(ankerVrijZin({ solvedFireAge: 55.2, currentAge: 45, stop: { kind: 'age', stopAge: 58.5 }, gedekt: true })).toBe(
      'Vrij was al mogelijk vanaf je 55e; de jaren die je langer werkt komen bovenop je plan.',
    )
  })

  it('onbereikbaar: de vaste zin uit de bijlage', () => {
    expect(ankerVrijZin({ solvedFireAge: null, currentAge: 45, stop: { kind: 'aow', stopAge: 67 } })).toBe(
      'De app vindt binnen dit plan nog geen leeftijd waarop je vermogen het zelf draagt.',
    )
  })

  it('nu-anker: verleden tijd als vrij vóór de huidige leeftijd lag, anders tegenwoordige tijd', () => {
    expect(ankerVrijZin({ solvedFireAge: 42.6, currentAge: 47, stop: { kind: 'now' } })).toBe('Vrij was mogelijk vanaf je 43e.')
    expect(ankerVrijZin({ solvedFireAge: 61, currentAge: 47, stop: { kind: 'now' } })).toBe('Vrij mogelijk vanaf je 61e.')
  })

  it('tekort onder age: geen "jaren bovenop je plan"-belofte', () => {
    const zin = ankerVrijZin({ solvedFireAge: 63, currentAge: 45, stop: { kind: 'age', stopAge: 58.5 }, gedekt: false })
    expect(zin).toBe('Vrij mogelijk vanaf je 63e.')
    expect(zin).not.toMatch(/je kunt (nu )?(al )?stoppen/i)
  })
})
