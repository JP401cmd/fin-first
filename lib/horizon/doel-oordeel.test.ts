import { describe, expect, it } from 'vitest'
import {
  buildCompleetHorizonFixture,
  buildCompleetKernelProfileBase,
} from '@/lib/regression-tests/horizon-strategie/persona-fixture'
import type { KernelInput } from '@/lib/horizon-kernel/types'
import type { WhatIfOverrides } from '@/lib/types/horizon-whatif'
import { computeLabGrenzen, standGedekt, type LabSolve } from './lab-grenzen'
import type { LabGrenzenContext } from './lab-grenzen-types'
import { assetsMetRendementDelta, type ToekomstScenarioDoel } from './toekomst-scenario'
import { doelStandNaarLab } from './doel-stand'
import { vastgelegdDoelGedekt } from './doel-oordeel'

/**
 * ADR 0175 — het plan-stoplicht beoordeelt het vastgelegde doel server-side. De belofte is
 * dat die toets HETZELFDE oordeel is als het zone-woord van het doelscenario-lab. Deze suite
 * bewijst dat op de KernelInput: de server bouwt byte-voor-byte de invoer die de
 * grenzen-batch voor dezelfde stand bouwt, en leest dezelfde shortfall-set.
 */

const BASELINE: WhatIfOverrides = {
  monthlyIncome: 5000,
  workDaysPerWeek: 5,
  savingsRate: 20,
  expectedReturn: 0.07,
  extraContribution: 0,
}

function ctx(over: Partial<LabGrenzenContext> = {}): LabGrenzenContext {
  const fx = buildCompleetHorizonFixture(42)
  return {
    profile: {
      ...buildCompleetKernelProfileBase(42),
      fire_end_strategy: 'legacy',
      fire_end_age: 90,
      fire_legacy_amount: 100_000,
      housing_strategy_config: { mode: 'include_full' },
    },
    assets: fx.assets,
    debts: fx.debts,
    lifeEvents: fx.lifeEvents,
    aowRows: [],
    baseline: BASELINE,
    currentAge: 42,
    waarden: { verdienen: 0, uitgeven: 20, uitgaveNaPensioen: null, nalatenschap: null, stop: 55 },
    planAnkerVast: false,
    planStopAge: null,
    eindVorm: 'legacy',
    bereik: {},
    ...over,
  }
}

const gedekt = { status: 'reached_at' as const }
const tekort = { status: 'anchor_shortfall' as const }
const leeftijd = (input: KernelInput): number =>
  input.stopAnker?.soort === 'leeftijd' ? input.stopAnker.leeftijd : Number.NaN
/** Een solve die de invoer bewaart en gedekt is vanaf stopleeftijd `vanaf`. */
function meeKijker(vanaf: number): { solve: LabSolve; gezien: KernelInput[] } {
  const gezien: KernelInput[] = []
  return {
    gezien,
    solve: (input) => {
      gezien.push(input)
      return leeftijd(input) >= vanaf ? gedekt : tekort
    },
  }
}

const DOEL: ToekomstScenarioDoel = {
  gezetOp: '2026-09-20T10:00:00Z',
  parameters: { fire: true, uitgaveNaPensioen: true, nalatenschap: true },
  stand: {
    sliders: { extraInleg: 300, savings: 25 },
    returnDeltaByCategorie: { Beleggingen: -0.01 },
    stopAge: 52,
    uitgaveNaPensioen: 41_400,
    nalatenschap: 120_000,
  },
}

function rawContext(c: LabGrenzenContext) {
  return { profile: c.profile, assets: c.assets, debts: c.debts, lifeEvents: c.lifeEvents, aowRows: c.aowRows }
}

describe('standGedekt — hetzelfde predicaat als huidig.gedekt van de batch', () => {
  it.each([
    [50, true], // stop 55 ≥ 50 → gedekt
    [55, true], // precies op de grens
    [55.5, false], // net erboven → tekort
    [70, false],
  ])('gedekt vanaf %s → %s, gelijk aan de batch', (vanaf, verwacht) => {
    const c = ctx()
    const los = meeKijker(vanaf)
    const batch = meeKijker(vanaf)
    expect(standGedekt(c, { solve: los.solve })).toBe(verwacht)
    const r = computeLabGrenzen(c, { solve: batch.solve })
    expect(r.huidig?.gedekt).toBe(verwacht)
    // Eén run, en exact de invoer van de eerste batch-probe (het `huidig`-oordeel).
    expect(los.gezien).toHaveLength(1)
    expect(los.gezien[0]).toEqual(batch.gezien[0])
  })

  it('elke shortfall-status telt als niet gedekt; een andere status als gedekt', () => {
    const c = ctx()
    for (const status of ['anchor_shortfall', 'stop_now_shortfall', 'pension_shortfall'] as const) {
      expect(standGedekt(c, { solve: () => ({ status }) })).toBe(false)
    }
    expect(standGedekt(c, { solve: () => ({ status: 'reached_at' }) })).toBe(true)
  })
})

describe('vastgelegdDoelGedekt — het doel met het oordeel van het lab (ADR 0175)', () => {
  it('bouwt dezelfde KernelInput als de batch op de doel-stand (knoppen, marktbias, stop)', () => {
    const c = ctx()
    const server = meeKijker(0)
    expect(
      vastgelegdDoelGedekt(
        { doel: DOEL, rawContext: rawContext(c), baseline: BASELINE, currentAge: 42 },
        { solve: server.solve },
      ),
    ).toBe(true)

    // Wat het lab na "Herstel mijn doel" in de batch stopt.
    const lab = doelStandNaarLab(DOEL.stand, BASELINE, 42)
    const batch = meeKijker(0)
    computeLabGrenzen(
      ctx({
        assets: assetsMetRendementDelta(c.assets, lab.returnDeltaByCategorie, c.profile),
        waarden: { verdienen: 300, uitgeven: 25, uitgaveNaPensioen: 41_400, nalatenschap: 120_000, stop: 52 },
      }),
      { solve: batch.solve },
    )
    expect(server.gezien).toHaveLength(1)
    expect(server.gezien[0]).toEqual(batch.gezien[0])
    expect(leeftijd(server.gezien[0]!)).toBe(52)
  })

  it('de marktbias uit het doel landt in de assets (anders zou het oordeel de delta missen)', () => {
    const c = ctx()
    const met = meeKijker(0)
    const zonder = meeKijker(0)
    vastgelegdDoelGedekt({ doel: DOEL, rawContext: rawContext(c), baseline: BASELINE, currentAge: 42 }, { solve: met.solve })
    const zonderDelta: ToekomstScenarioDoel = { ...DOEL, stand: { ...DOEL.stand, returnDeltaByCategorie: {} } }
    vastgelegdDoelGedekt({ doel: zonderDelta, rawContext: rawContext(c), baseline: BASELINE, currentAge: 42 }, { solve: zonder.solve })
    expect(met.gezien[0]).not.toEqual(zonder.gezien[0])
  })

  it.each([
    [52, true], // doel-stop 52 haalt een grens van 52
    [52.5, false], // grens net boven de doel-stop → reikt niet
  ])('grens %s → %s', (vanaf, verwacht) => {
    const c = ctx()
    expect(
      vastgelegdDoelGedekt(
        { doel: DOEL, rawContext: rawContext(c), baseline: BASELINE, currentAge: 42 },
        { solve: meeKijker(vanaf).solve },
      ),
    ).toBe(verwacht)
  })

  it('niets te beoordelen ⇒ null: geen doel, of een doel zonder stopleeftijd — zonder kernel-run', () => {
    const c = ctx()
    const k = meeKijker(0)
    const input = { rawContext: rawContext(c), baseline: BASELINE, currentAge: 42 }
    expect(vastgelegdDoelGedekt({ ...input, doel: null }, { solve: k.solve })).toBeNull()
    expect(vastgelegdDoelGedekt({ ...input, doel: undefined }, { solve: k.solve })).toBeNull()
    const zonderStop: ToekomstScenarioDoel = { ...DOEL, stand: { ...DOEL.stand, stopAge: null } }
    expect(vastgelegdDoelGedekt({ ...input, doel: zonderStop }, { solve: k.solve })).toBeNull()
    const stopWeg: ToekomstScenarioDoel = { ...DOEL, stand: { sliders: { savings: 25 } } }
    expect(vastgelegdDoelGedekt({ ...input, doel: stopWeg }, { solve: k.solve })).toBeNull()
    expect(k.gezien).toHaveLength(0)
  })

  it('de stopleeftijd telt alleen als hij zelf doel is (parameters.fire) — zonder kernel-run', () => {
    const c = ctx()
    const k = meeKijker(100) // zou "reikt niet" zeggen als hij draaide
    const input = { rawContext: rawContext(c), baseline: BASELINE, currentAge: 42 }
    const alleenSpaarquote: ToekomstScenarioDoel = { ...DOEL, parameters: { spaarquote: true } }
    expect(vastgelegdDoelGedekt({ ...input, doel: alleenSpaarquote }, { solve: k.solve })).toBeNull()
    expect(k.gezien).toHaveLength(0)
    // Met fire erbij draait hij wél, op dezelfde stand.
    expect(vastgelegdDoelGedekt({ ...input, doel: { ...DOEL, parameters: { spaarquote: true, fire: true } } }, { solve: k.solve })).toBe(false)
    expect(k.gezien).toHaveLength(1)
  })

  it('een kern-fout geeft null, nooit een exception (het stoplicht valt dan terug op haalbaar)', () => {
    const c = ctx()
    expect(
      vastgelegdDoelGedekt(
        { doel: DOEL, rawContext: rawContext(c), baseline: BASELINE, currentAge: 42 },
        {
          solve: () => {
            throw new Error('kern stuk')
          },
        },
      ),
    ).toBeNull()
  })
})

describe('doelStandNaarLab — één vertaling voor "Herstel mijn doel" en het stoplicht', () => {
  it('zet sliders om naar events en leest alle knoppen', () => {
    const lab = doelStandNaarLab(DOEL.stand, BASELINE, 42)
    expect(lab.sliderEvents.map((e) => e.id).sort()).toHaveLength(2)
    expect(lab).toMatchObject({
      returnDeltaByCategorie: { Beleggingen: -0.01 },
      stopAge: 52,
      uitgaveNaPensioen: 41_400,
      nalatenschap: 120_000,
    })
  })

  it('afwezige velden ⇒ null ("wat het plan rekent"); geen baseline of leeftijd ⇒ geen events', () => {
    expect(doelStandNaarLab({}, BASELINE, 42)).toEqual({
      sliderEvents: [],
      returnDeltaByCategorie: {},
      stopAge: null,
      uitgaveNaPensioen: null,
      nalatenschap: null,
    })
    expect(doelStandNaarLab(DOEL.stand, null, 42).sliderEvents).toEqual([])
    expect(doelStandNaarLab(DOEL.stand, BASELINE, null).sliderEvents).toEqual([])
  })

  it('een legacy sliders.income wordt genegeerd (knop vervallen, spec §2)', () => {
    expect(doelStandNaarLab({ sliders: { income: 6_000 } }, BASELINE, 42).sliderEvents).toEqual([])
  })

  it('geeft een kopie van de rendement-delta terug, niet de doel-referentie', () => {
    const lab = doelStandNaarLab(DOEL.stand, BASELINE, 42)
    expect(lab.returnDeltaByCategorie).not.toBe(DOEL.stand.returnDeltaByCategorie)
  })
})
