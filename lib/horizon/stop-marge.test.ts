import { describe, it, expect } from 'vitest'
import { computeStopMarge, resolveVoorzichtigeRand, TERUGVAL_RAND_JAREN } from './stop-marge'

describe('computeStopMarge — driezone (tekort/krap/stevig)', () => {
  it('stop < verwacht → tekort', () => {
    const r = computeStopMarge({
      stopAge: 50,
      verwachtFireAgeFractional: 52,
      laatstFireAgeFractional: 55,
      baseFireAgeFractional: 52,
    })
    expect(r.zone).toBe('tekort')
    expect(r.margeJaren).toBe(-2)
  })

  it('verwacht ≤ stop < laatst → krap', () => {
    const r = computeStopMarge({
      stopAge: 53,
      verwachtFireAgeFractional: 52,
      laatstFireAgeFractional: 55,
      baseFireAgeFractional: 52,
    })
    expect(r.zone).toBe('krap')
    expect(r.margeJaren).toBe(1)
  })

  it('stop op verwacht (ondergrens) → krap', () => {
    const r = computeStopMarge({
      stopAge: 52,
      verwachtFireAgeFractional: 52,
      laatstFireAgeFractional: 55,
      baseFireAgeFractional: 52,
    })
    expect(r.zone).toBe('krap')
    expect(r.margeJaren).toBe(0)
  })

  it('stop ≥ laatst → stevig', () => {
    const r = computeStopMarge({
      stopAge: 55,
      verwachtFireAgeFractional: 52,
      laatstFireAgeFractional: 55,
      baseFireAgeFractional: 52,
    })
    expect(r.zone).toBe('stevig')
    expect(r.margeJaren).toBe(3)
  })

  it('stop ruim voorbij laatst → stevig', () => {
    const r = computeStopMarge({
      stopAge: 60,
      verwachtFireAgeFractional: 52,
      laatstFireAgeFractional: 55,
      baseFireAgeFractional: 52,
    })
    expect(r.zone).toBe('stevig')
  })

  it('halve jaren worden ondersteund (stap 0,5)', () => {
    const r = computeStopMarge({
      stopAge: 54.5,
      verwachtFireAgeFractional: 52.25,
      laatstFireAgeFractional: 55,
      baseFireAgeFractional: 52.25,
    })
    expect(r.zone).toBe('krap')
    expect(r.margeJaren).toBeCloseTo(2.25, 6)
  })
})

describe('computeStopMarge — deltaVsBasis', () => {
  it('verwacht − basis, negatief = eerder vrij dan basis', () => {
    const r = computeStopMarge({
      stopAge: 55,
      verwachtFireAgeFractional: 48, // scenario is eerder vrij
      laatstFireAgeFractional: 51,
      baseFireAgeFractional: 52,
    })
    expect(r.deltaVsBasis).toBe(-4)
  })

  it('zonder scenario (verwacht === basis) → deltaVsBasis 0', () => {
    const r = computeStopMarge({
      stopAge: 55,
      verwachtFireAgeFractional: 52,
      laatstFireAgeFractional: 55,
      baseFireAgeFractional: 52,
    })
    expect(r.deltaVsBasis).toBe(0)
  })

  it('basis onbereikbaar (null) → deltaVsBasis null, marge/zone blijven bepaald', () => {
    const r = computeStopMarge({
      stopAge: 55,
      verwachtFireAgeFractional: 52,
      laatstFireAgeFractional: 55,
      baseFireAgeFractional: null,
    })
    expect(r.deltaVsBasis).toBeNull()
    expect(r.zone).toBe('stevig')
    expect(r.margeJaren).toBe(3)
  })
})

describe('computeStopMarge — randgevallen', () => {
  it('verwacht onbereikbaar (null) → alles null', () => {
    const r = computeStopMarge({
      stopAge: 55,
      verwachtFireAgeFractional: null,
      laatstFireAgeFractional: 60,
      baseFireAgeFractional: 52,
    })
    expect(r).toEqual({ margeJaren: null, zone: null, deltaVsBasis: null })
  })

  it("laatst === null → terugval-rand op verwacht + TERUGVAL_RAND_JAREN: 'krap' binnen de rand, 'stevig' erop/erna", () => {
    // De voorzichtige variant haalt het doel binnen de planperiode niet (het pessimist-pad
    // volgt het kasstroompatroon van de hoofdsim en kruist na de hoofd-FIRE vrijwel nooit
    // meer). Dat is structureel gangbaar — de zone mag dan niet permanent 'krap' blijven:
    // vanaf een marge van TERUGVAL_RAND_JAREN telt de stop als 'stevig'.
    const krap = computeStopMarge({
      stopAge: 52 + TERUGVAL_RAND_JAREN - 0.5, // binnen de terugval-rand
      verwachtFireAgeFractional: 52,
      laatstFireAgeFractional: null,
      baseFireAgeFractional: 52,
    })
    expect(krap.zone).toBe('krap')

    const stevig = computeStopMarge({
      stopAge: 52 + TERUGVAL_RAND_JAREN, // precies op de terugval-rand
      verwachtFireAgeFractional: 52,
      laatstFireAgeFractional: null,
      baseFireAgeFractional: 52,
    })
    expect(stevig.zone).toBe('stevig')
    expect(stevig.margeJaren).toBe(TERUGVAL_RAND_JAREN)

    const tekort = computeStopMarge({
      stopAge: 50,
      verwachtFireAgeFractional: 52,
      laatstFireAgeFractional: null,
      baseFireAgeFractional: 52,
    })
    expect(tekort.zone).toBe('tekort')
  })

  it('resolveVoorzichtigeRand: echte rand (geclamped op verwacht) wint; zonder rand de terugval; zonder verwacht null', () => {
    // Eén bron voor band én zone — de UI-band en computeStopMarge mogen niet drijven.
    expect(resolveVoorzichtigeRand(52, 55)).toBe(55)
    expect(resolveVoorzichtigeRand(52, 50)).toBe(52) // defensieve clamp
    expect(resolveVoorzichtigeRand(52, null)).toBe(52 + TERUGVAL_RAND_JAREN)
    expect(resolveVoorzichtigeRand(null, 55)).toBeNull()
  })

  it('laatst < verwacht wordt defensief geclamped (laatst = max(laatst, verwacht))', () => {
    // laatst (50) ligt vóór verwacht (52) — mag niet; clamp → laatst = 52.
    // stop op 52 → stop ≥ geclampte laatst → 'stevig'.
    const r = computeStopMarge({
      stopAge: 52,
      verwachtFireAgeFractional: 52,
      laatstFireAgeFractional: 50,
      baseFireAgeFractional: 52,
    })
    expect(r.zone).toBe('stevig')
    expect(r.margeJaren).toBe(0)
  })
})
