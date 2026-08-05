import { describe, it, expect } from 'vitest'
import type { SimRow } from '@/lib/fire-simulation'
import {
  selectDoelLijnBron,
  DOEL_LIJN_STOP_DREMPEL_JAAR,
  type DoelLijnPad,
  type SelectDoelLijnBronParams,
} from './doel-lijn-bron'

// ── Fixtures ────────────────────────────────────────────────────────────────
// De helper leest alleen `rows` (referentie-identiteit) en `fireAgeFractional`;
// een enkele rij met een herkenbaar `age` volstaat om de bron te bewijzen.
function rij(age: number): SimRow {
  return {
    age,
    phase: 'accumulation',
    startPortfolio: 0,
    growth: 0,
    savings: 0,
    withdrawal: 0,
    cashflowNet: 0,
    oneTimeNet: 0,
    endPortfolio: 1000 * age,
    grossIncome: 0,
    grossExpenses: 0,
    flowIn: 0,
    flowOut: 0,
  }
}

const stopRows = [rij(40), rij(63)]
const scenarioRows = [rij(41), rij(57)]

/** Stop-pad-fixture op een gegeven (run-)stopleeftijd — de drempel meet hiertegen. */
function stopPadOp(fireAgeFractional: number | null): DoelLijnPad {
  return { result: { rows: stopRows, fireAgeFractional } }
}

const stopPad = stopPadOp(63)
const scenario: DoelLijnPad = { result: { rows: scenarioRows, fireAgeFractional: 57.4 } }

function params(over: Partial<SelectDoelLijnBronParams> = {}): SelectDoelLijnBronParams {
  return {
    stopPad,
    scenario,
    stopKeuzeActief: true,
    verwachtFireAge: 57.4,
    hasScenario: true,
    isPensioenMode: false,
    ...over,
  }
}

describe('selectDoelLijnBron', () => {
  it('kiest het stop-pad wanneer er een stopkeuze én een actief scenario is', () => {
    const uit = selectDoelLijnBron(params())
    expect(uit).not.toBeNull()
    expect(uit!.bron).toBe('stop')
    expect(uit!.rows).toBe(stopRows)
    // fireAgeFractional komt uit de RUN — dezelfde run als de rijen.
    expect(uit!.fireAgeFractional).toBe(63)
  })

  it('geeft rijen, stip én drempel uit dezelfde RUN door — nooit uit de rauwe sliderwaarde (worker-race)', () => {
    // De gebruiker sleepte al door naar een nieuwe waarde, maar de gelande run
    // hoort nog bij 61: de helper kent de rauwe sliderwaarde niet eens.
    const oudereRun = stopPadOp(61)
    const uit = selectDoelLijnBron(params({ stopPad: oudereRun }))
    expect(uit!.bron).toBe('stop')
    expect(uit!.fireAgeFractional).toBe(61)
  })

  it('valt terug op de scenario-bron wanneer er geen stopkeuze staat', () => {
    const uit = selectDoelLijnBron(params({ stopKeuzeActief: false }))
    expect(uit!.bron).toBe('scenario')
    expect(uit!.rows).toBe(scenarioRows)
    expect(uit!.fireAgeFractional).toBe(57.4)
  })

  it('valt terug op de scenario-bron wanneer het stop-pad nog niet geland is (pending/null)', () => {
    expect(selectDoelLijnBron(params({ stopPad: null }))!.bron).toBe('scenario')
    expect(selectDoelLijnBron(params({ stopPad: undefined }))!.bron).toBe('scenario')
  })

  it('onderdrukt de stop-bron in pensioen-modus', () => {
    const uit = selectDoelLijnBron(params({ isPensioenMode: true }))
    expect(uit!.bron).toBe('scenario')
  })

  it('geeft null wanneer er geen scenario is en de stop-bron niet wint — dus ook géén pill (review H1)', () => {
    expect(
      selectDoelLijnBron(params({ scenario: null, stopKeuzeActief: false, hasScenario: false })),
    ).toBeNull()
    expect(
      selectDoelLijnBron(params({ scenario: null, stopPad: null, hasScenario: false })),
    ).toBeNull()
    // Pensioen-modus zonder scenario → ook niets te tekenen (en dus geen pill).
    expect(
      selectDoelLijnBron(params({ scenario: undefined, hasScenario: false, isPensioenMode: true })),
    ).toBeNull()
  })

  describe('stop-only (geen scenario) — drempel van een half jaar, gemeten op de RUN-leeftijd', () => {
    const stopOnly = { hasScenario: false, scenario: null, verwachtFireAge: 60 }

    it('tekent het stop-pad wanneer de stopkeuze ver genoeg van de verwachting ligt', () => {
      const uit = selectDoelLijnBron(params({ ...stopOnly, stopPad: stopPadOp(63) }))
      expect(uit!.bron).toBe('stop')
      expect(uit!.rows).toBe(stopRows)
    })

    it('tekent het stop-pad precies OP de drempel (0,5 jaar telt mee)', () => {
      const boven = selectDoelLijnBron(
        params({ ...stopOnly, stopPad: stopPadOp(60 + DOEL_LIJN_STOP_DREMPEL_JAAR) }),
      )
      expect(boven!.bron).toBe('stop')
      const onder = selectDoelLijnBron(
        params({ ...stopOnly, stopPad: stopPadOp(60 - DOEL_LIJN_STOP_DREMPEL_JAAR) }),
      )
      expect(onder!.bron).toBe('stop')
    })

    it('onderdrukt lijn ÉN pill wanneer de stopkeuze binnen een half jaar van de verwachting ligt', () => {
      expect(selectDoelLijnBron(params({ ...stopOnly, stopPad: stopPadOp(60) }))).toBeNull()
      expect(selectDoelLijnBron(params({ ...stopOnly, stopPad: stopPadOp(60.4) }))).toBeNull()
      expect(selectDoelLijnBron(params({ ...stopOnly, stopPad: stopPadOp(59.6) }))).toBeNull()
    })

    it('tekent het stop-pad wanneer de verwachte FIRE-leeftijd onbekend is (onbereikbaar)', () => {
      const uit = selectDoelLijnBron(
        params({ ...stopOnly, verwachtFireAge: null, stopPad: stopPadOp(60) }),
      )
      expect(uit!.bron).toBe('stop')
    })

    it('tekent het stop-pad wanneer de run-leeftijd onbekend is (defensief — drempel niet meetbaar)', () => {
      const uit = selectDoelLijnBron(params({ ...stopOnly, stopPad: stopPadOp(null) }))
      expect(uit!.bron).toBe('stop')
      expect(uit!.fireAgeFractional).toBeNull()
    })

    it('negeert de drempel zodra er WEL een scenario draait (stop dicht op verwacht blijft doel-lijn)', () => {
      const uit = selectDoelLijnBron(params({ stopPad: stopPadOp(57.4), verwachtFireAge: 57.4 }))
      expect(uit!.bron).toBe('stop')
    })
  })
})
