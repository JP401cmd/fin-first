import { describe, it, expect } from 'vitest'
import {
  NU_STOPPEN_KPI_LABEL,
  nuStoppenGrafiekZin,
  nuStoppenKort,
  nuStoppenKpiCaption,
  nuStoppenReachFromRunway,
  nuStoppenReachFromSim,
  nuStoppenReachYear,
  nuStoppenZin,
  nuStoppenZinKort,
  type NuStoppenReach,
} from './nu-stoppen-copy'
import type { RunwayResult } from './runway'

/**
 * ADR 0127 — de takken die de COMPILER NIET afdwingt.
 *
 * De hele klasse fouten die dit besluit oploste zat in stille dispatch: een
 * `switch` met `default` en een `=== 'pensioen'`-vergelijking kiezen zwijgend de
 * verkeerde tak zodra er een vijfde lid bij komt. Deze suite pint daarom niet
 * "er staat een string" maar (a) de MAPPING van kernel-uitvoer naar bereik en
 * (b) de toon-invarianten die het besluit als harde randvoorwaarde stelt.
 */

const RUNWAY_BASIS = {
  expenseBasis: { yearly: 30_000, method: 'essential_budgets' as const },
  strategy: 'Vermogen opeten' as never,
  solverStatus: 'stop_now_shortfall' as never,
  startAge: 47,
}

describe('nuStoppenReachFromSim — kernel-uitvoer → bereik', () => {
  it('undefined uitputtingsmaand (geen kernel-pad) is ONBEKEND, nooit "gedekt"', () => {
    // De gevaarlijke shorthand is `kernelDepletionMonth ?? null`: die maakt van
    // "geen antwoord" stilzwijgend "geen uitputting" = volledige dekking.
    expect(
      nuStoppenReachFromSim({ startAge: 47, kernelDepletionMonth: undefined, endAge: 90 }),
    ).toEqual({ kind: 'onbekend' })
  })

  it('null uitputtingsmaand = het geld reikt tot de eindleeftijd', () => {
    expect(
      nuStoppenReachFromSim({ startAge: 47, kernelDepletionMonth: null, endAge: 90 }),
    ).toEqual({ kind: 'gedekt', endAge: 90 })
  })

  it('maand 0 = vandaag al niet gedekt (geen leeftijd om te noemen)', () => {
    expect(
      nuStoppenReachFromSim({ startAge: 47, kernelDepletionMonth: 0, endAge: 90 }),
    ).toEqual({ kind: 'nu-op' })
  })

  it('maand > 0 vóór de eindleeftijd → reikt-tot, leeftijd = startAge + maanden/12', () => {
    const reach = nuStoppenReachFromSim({ startAge: 47, kernelDepletionMonth: 126, endAge: 90 })
    expect(reach.kind).toBe('reikt-tot')
    if (reach.kind !== 'reikt-tot') throw new Error('verkeerde tak')
    expect(reach.age).toBeCloseTo(57.5, 6)
    expect(reach.endAge).toBe(90)
  })

  it('uitputting op/voorbij de eindleeftijd telt als gedekt (spiegel van computeRunwayFromSolve)', () => {
    expect(
      nuStoppenReachFromSim({ startAge: 47, kernelDepletionMonth: 12 * 43, endAge: 90 }),
    ).toEqual({ kind: 'gedekt', endAge: 90 })
  })

  it('zonder bruikbare startleeftijd valt er niets te zeggen', () => {
    expect(
      nuStoppenReachFromSim({ startAge: null, kernelDepletionMonth: 120, endAge: 90 }),
    ).toEqual({ kind: 'onbekend' })
  })
})

describe('nuStoppenReachFromRunway — alle vijf RunwayResult-vormen', () => {
  it('months vóór het einde → reikt-tot', () => {
    const runway = {
      ...RUNWAY_BASIS,
      kind: 'months',
      months: 126,
      depletionAge: 57.5,
      endAge: 90,
    } as unknown as RunwayResult
    expect(nuStoppenReachFromRunway(runway)).toEqual({
      kind: 'reikt-tot',
      age: 57.5,
      endAge: 90,
    })
  })

  it('reaches-end-age → gedekt met de eindleeftijd', () => {
    const runway = { ...RUNWAY_BASIS, kind: 'reaches-end-age', endAge: 90 } as unknown as RunwayResult
    expect(nuStoppenReachFromRunway(runway)).toEqual({ kind: 'gedekt', endAge: 90 })
  })

  it('beyond-horizon → gedekt ZONDER plan-einde (nooit "oneindig")', () => {
    const runway = { ...RUNWAY_BASIS, kind: 'beyond-horizon' } as unknown as RunwayResult
    expect(nuStoppenReachFromRunway(runway)).toEqual({ kind: 'gedekt', endAge: null })
  })

  it('deficit → nu-op', () => {
    const runway = { ...RUNWAY_BASIS, kind: 'deficit' } as unknown as RunwayResult
    expect(nuStoppenReachFromRunway(runway)).toEqual({ kind: 'nu-op' })
  })

  it('unavailable → onbekend', () => {
    const runway = { kind: 'unavailable', reason: 'geen-geboortedatum' } as RunwayResult
    expect(nuStoppenReachFromRunway(runway)).toEqual({ kind: 'onbekend' })
  })
})

describe('weergave', () => {
  it('rondt af op hele jaren, dezelfde regel als het hero-kopgetal', () => {
    expect(nuStoppenReachYear({ kind: 'reikt-tot', age: 57.5, endAge: 90 })).toBe(58)
    expect(nuStoppenReachYear({ kind: 'reikt-tot', age: 57.4, endAge: 90 })).toBe(57)
    expect(nuStoppenReachYear({ kind: 'gedekt', endAge: 90 })).toBe(90)
    expect(nuStoppenReachYear({ kind: 'gedekt', endAge: null })).toBeNull()
    expect(nuStoppenReachYear({ kind: 'nu-op' })).toBeNull()
    expect(nuStoppenReachYear({ kind: 'onbekend' })).toBeNull()
  })

  it('de korte regel vervangt "FIRE: 47 jr" door de reikwijdte', () => {
    expect(nuStoppenKort({ kind: 'reikt-tot', age: 57.5, endAge: 90 })).toBe(
      `${NU_STOPPEN_KPI_LABEL}: 58 jr`,
    )
    expect(nuStoppenKort({ kind: 'nu-op' })).toContain('vandaag')
  })

  it('het onderschrift benoemt de dekking, niet een vrijheidsmoment', () => {
    expect(nuStoppenKpiCaption({ kind: 'gedekt', endAge: 90 })).toContain('einde van je plan')
    expect(nuStoppenKpiCaption({ kind: 'reikt-tot', age: 57.5, endAge: 90 })).toBe('jaar')
    expect(nuStoppenKpiCaption({ kind: 'nu-op' })).not.toMatch(/jaar$/)
  })
})

describe('toon — de harde randvoorwaarden van het besluit', () => {
  const alle: NuStoppenReach[] = [
    { kind: 'gedekt', endAge: 90 },
    { kind: 'gedekt', endAge: null },
    { kind: 'reikt-tot', age: 57.5, endAge: 90 },
    { kind: 'reikt-tot', age: 57.5, endAge: null },
    { kind: 'nu-op' },
    { kind: 'onbekend' },
  ]
  const zinnen = (r: NuStoppenReach) => [
    nuStoppenZin(r),
    nuStoppenZinKort(r),
    nuStoppenGrafiekZin(r),
  ]

  it.each(alle.map((r) => [r.kind, r] as const))(
    '%s — beschrijvend, nooit aansporend',
    (_kind, reach) => {
      for (const zin of zinnen(reach)) {
        // Geen aansporing: de app zegt niet dat je kúnt of moet stoppen.
        expect(zin).not.toMatch(/je kunt (nu )?(al )?stoppen/i)
        expect(zin).not.toMatch(/stop met werken/i)
        // Geen eeuwigheidsclaim: het model stopt bij leeftijd 100.
        expect(zin).not.toMatch(/oneindig|eeuwig|voorgoed|voor altijd/i)
        // Geen AOW: dit tekort kan ook ná de AOW vallen (D2).
        expect(zin).not.toMatch(/\bAOW\b/i)

        // GRONDSLAG IN DE ZIN. De runway rekent op Prognose!J — netto vermogen
        // MINUS niet-liquide bezit, dus zonder je eigen woning tenzij je
        // woonstrategie hem liquide maakt. Op /overzicht staat het netto
        // vermogen mét woning er direct boven, en dat verschil kan een veelvoud
        // zijn. Noemt een zin "je vermogen" zonder "liquide", dan legt de lezer
        // twee ongelijke grootheden op elkaar — precies wat CLAUDE.md verbiedt
        // voor netto vermogen versus de liquide portefeuille. Een latere
        // "verkorting" van de copy mag dat woord dus niet wegnemen.
        if (/vermogen/i.test(zin)) {
          expect(zin, `grondslag ontbreekt: "${zin}"`).toMatch(/liquide vermogen/i)
        }
      }
    },
  )

  it('een tekort wordt NOOIT als volledige dekking geformuleerd', () => {
    const kort = nuStoppenZin({ kind: 'reikt-tot', age: 57.5, endAge: 90 })
    expect(kort).toContain('58')
    expect(kort).not.toMatch(/einde van je plan\.$/)
  })

  it('de grafiek-zin belooft bij een tekort GEEN afbouw naar nul op de eindleeftijd', () => {
    // Dit was de deplete-`default` waar 'nu-stoppen' vóór dit besluit op viel.
    const zin = nuStoppenGrafiekZin({ kind: 'reikt-tot', age: 57.5, endAge: 90 })
    expect(zin).not.toMatch(/naar nul rond leeftijd/i)
    expect(zin).toContain('58')
  })
})
