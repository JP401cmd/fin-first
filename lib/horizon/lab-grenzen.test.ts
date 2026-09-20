import { describe, expect, it } from 'vitest'
import {
  buildCompleetHorizonFixture,
  buildCompleetKernelProfileBase,
} from '@/lib/regression-tests/horizon-strategie/persona-fixture'
import type { KernelInput } from '@/lib/horizon-kernel/types'
import type { WhatIfOverrides } from '@/lib/types/horizon-whatif'
import { LAB_RUIM_MARGE } from '@/lib/constants'
import { bisecteerGrens, computeLabGrenzen, type LabSolve } from './lab-grenzen'
import {
  zoneVanHuidig,
  zoneVanWaarde,
  type HefboomGrenzen,
  type LabGrenzenContext,
} from './lab-grenzen-types'

/**
 * PURE tests van de grenzen-batch (ADR 0170): het kern-oordeel wordt geïnjecteerd als
 * predicaat op de KernelInput, zodat de test bewijst dat elke knop-variatie op het juiste
 * kernel-veld landt en de bisectie/bracket/vangrail doen wat ze beloven — zonder de motor.
 * De echte motor draait in `lab-grenzen.kernel.test.ts`.
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
      fire_end_strategy: 'deplete',
      fire_end_age: 90,
      fire_legacy_amount: 0,
      housing_strategy_config: { mode: 'include_full' },
      fire_stop_anchor: 'age',
      fire_stop_age: 62,
    },
    assets: fx.assets,
    debts: fx.debts,
    lifeEvents: fx.lifeEvents,
    aowRows: [],
    baseline: BASELINE,
    currentAge: 42,
    waarden: { verdienen: 0, uitgeven: 20, uitgaveNaPensioen: null, nalatenschap: null, stop: 62 },
    planAnkerVast: true,
    planStopAge: 62,
    eindVorm: 'deplete',
    bereik: {
      verdienen: { min: -1500, max: 1500, stap: 50 },
      uitgeven: { min: 5, max: 35, stap: 1 },
      uitgaveNaPensioen: { min: 24_000, max: 84_000, stap: 600 },
      nalatenschap: { min: 0, max: 300_000, stap: 10_000 },
      stop: { min: 50, max: 70, stap: 0.5 },
    },
    ...over,
  }
}

const gedekt = { status: 'reached_at' as const }
const tekort = { status: 'anchor_shortfall' as const }
const solveOp = (pred: (input: KernelInput) => boolean): LabSolve => (input) => (pred(input) ? gedekt : tekort)
const leeftijd = (input: KernelInput): number =>
  input.stopAnker?.soort === 'leeftijd' ? input.stopAnker.leeftijd : Number.NaN

/** Het basis-jaarinkomen van de fixture (verdienen 0, uitgeven op de basis) via een lege batch. */
function basisJaarinkomen(): number {
  let gezien: number | null = null
  computeLabGrenzen(ctx({ bereik: {} }), {
    solve: (input) => {
      gezien = input.inkomenUitgaven.nettoJaarinkomen
      return gedekt
    },
  })
  if (gezien == null) throw new Error('fixture: geen solve-aanroep')
  return gezien
}

describe('bisecteerGrens — raster-bisectie met bracket en vangrail', () => {
  it('stijgend: vindt de eerste rasterwaarde aan de gedekte kant in 2 + ⌈log2 n⌉ probes', () => {
    let probes = 0
    const r = bisecteerGrens({ min: 0, max: 1500, stap: 50, richting: 'stijgend' }, (v) => {
      probes += 1
      return v >= 730
    })
    expect(r).toEqual({ grens: 750, heel: null })
    expect(probes).toBe(2 + Math.ceil(Math.log2(30)))
  })

  it('dalend: spiegelt — de grens is de hoogste rasterwaarde die nog dekt', () => {
    const r = bisecteerGrens({ min: 24_000, max: 84_000, stap: 600, richting: 'dalend' }, (v) => v <= 41_000)
    expect(r).toEqual({ grens: 40_800, heel: null })
  })

  it('bracket: beide uiteinden gedekt ⇒ heel gedekt; geen van beide ⇒ heel ongedekt (2 probes)', () => {
    let probes = 0
    expect(bisecteerGrens({ min: 0, max: 100, stap: 10, richting: 'stijgend' }, () => (probes += 1, true))).toEqual({ grens: null, heel: 'gedekt' })
    expect(probes).toBe(2)
    probes = 0
    expect(bisecteerGrens({ min: 0, max: 100, stap: 10, richting: 'stijgend' }, () => (probes += 1, false))).toEqual({ grens: null, heel: 'ongedekt' })
    expect(probes).toBe(2)
  })

  it('vangrail: dekking aan de VERKEERDE kant (richting klopt niet) ⇒ null, geen grens', () => {
    // Stijgend beloofd, maar de lage kant dekt en de hoge niet.
    expect(bisecteerGrens({ min: 0, max: 100, stap: 10, richting: 'stijgend' }, (v) => v < 50)).toEqual({ grens: null, heel: null })
    expect(bisecteerGrens({ min: 0, max: 100, stap: 10, richting: 'dalend' }, (v) => v > 50)).toEqual({ grens: null, heel: null })
  })

  it('cache: geen rasterindex wordt twee keer geprobed', () => {
    const gezien: number[] = []
    bisecteerGrens({ min: 50, max: 70, stap: 0.5, richting: 'stijgend' }, (v) => {
      gezien.push(v)
      return v >= 61.3
    })
    expect(new Set(gezien).size).toBe(gezien.length)
    expect(gezien.every((v) => Number.isInteger(v * 2))).toBe(true) // netjes op het 0,5-raster
  })

  it('ongeldig bereik (stap ≤ 0, max < min) ⇒ null zonder probes; min == max ⇒ alleen heel', () => {
    let probes = 0
    const tel = () => (probes += 1, true)
    expect(bisecteerGrens({ min: 0, max: 10, stap: 0, richting: 'stijgend' }, tel)).toEqual({ grens: null, heel: null })
    expect(bisecteerGrens({ min: 10, max: 0, stap: 1, richting: 'stijgend' }, tel)).toEqual({ grens: null, heel: null })
    expect(probes).toBe(0)
    expect(bisecteerGrens({ min: 5, max: 5, stap: 1, richting: 'stijgend' }, tel)).toEqual({ grens: null, heel: 'gedekt' })
    expect(probes).toBe(1)
  })
})

describe('computeLabGrenzen — elke knop landt op het juiste kernel-veld', () => {
  it('stop: het anker gaat op de KernelInput; vast anker ⇒ ruim = gedekt (oprek raakt de leeftijd niet)', () => {
    const r = computeLabGrenzen(ctx(), { solve: solveOp((i) => leeftijd(i) >= 60) })
    expect(r.grenzen.stop).toEqual({ gedekt: 60, ruim: 60, heel: null })
    // Met stop 62 is de huidige stand gedekt én ruim; de andere knoppen zijn heel gedekt.
    expect(r.huidig).toEqual({ gedekt: true, ruim: true })
    expect(zoneVanHuidig(r.huidig)).toBe('groen')
    for (const k of ['verdienen', 'uitgeven', 'uitgaveNaPensioen', 'nalatenschap'] as const) {
      expect(r.grenzen[k]).toEqual({ gedekt: null, ruim: null, heel: 'gedekt' })
    }
  })

  it('stop onder 60 ⇒ huidig rood en de andere knoppen heel ongedekt', () => {
    const r = computeLabGrenzen(ctx({ waarden: { ...ctx().waarden, stop: 55 } }), { solve: solveOp((i) => leeftijd(i) >= 60) })
    expect(r.huidig).toEqual({ gedekt: false, ruim: false })
    expect(zoneVanHuidig(r.huidig)).toBe('rood')
    expect(r.grenzen.stop).toEqual({ gedekt: 60, ruim: 60, heel: null })
    for (const k of ['verdienen', 'uitgeven', 'uitgaveNaPensioen', 'nalatenschap'] as const) {
      expect(r.grenzen[k]).toEqual({ gedekt: null, ruim: null, heel: 'ongedekt' })
    }
  })

  it("solved: ruim ankert op S′ = (S + marge·nu)/(1 + marge) ⇒ ruim-grens = ⌈(1 + marge)·vrij − marge·nu⌉ op het raster", () => {
    const gezien: number[] = []
    const r = computeLabGrenzen(ctx({ planAnkerVast: false, planStopAge: null }), {
      solve: (i) => {
        gezien.push(i.startLeeftijd)
        return leeftijd(i) >= 60 ? gedekt : tekort
      },
    })
    expect(gezien.length).toBeGreaterThan(0)
    const nu = gezien[0]
    expect(new Set(gezien).size).toBe(1) // de startleeftijd hangt alleen aan het profiel
    const verwacht = Math.ceil(((1 + LAB_RUIM_MARGE) * 60 - LAB_RUIM_MARGE * nu) / 0.5) * 0.5
    expect(r.grenzen.stop).toEqual({ gedekt: 60, ruim: verwacht, heel: null })
    expect(verwacht).toBeGreaterThan(60)
  })

  it('verdienen: het extra-inleg-event landt op nettoJaarinkomen (×12)', () => {
    const basis = basisJaarinkomen()
    const r = computeLabGrenzen(ctx(), { solve: solveOp((i) => i.inkomenUitgaven.nettoJaarinkomen >= basis + 12 * 310) })
    expect(r.grenzen.verdienen).toMatchObject({ gedekt: 350, heel: null })
    expect(r.huidig).toEqual({ gedekt: false, ruim: false })
  })

  it('uitgeven: de spaarquote-stand (pp) landt via het savings-event op het salariskanaal', () => {
    const basis = basisJaarinkomen()
    // Δpp × basisinkomen/100 = € 50/pp/mnd ⇒ € 250/mnd vraagt ≥ 5 pp boven de basis (20) ⇒ 25.
    const r = computeLabGrenzen(ctx(), { solve: solveOp((i) => i.inkomenUitgaven.nettoJaarinkomen >= basis + 12 * 250) })
    expect(r.grenzen.uitgeven).toMatchObject({ gedekt: 25, heel: null })
  })

  it('uitgaveNaPensioen: de custom_amount-patch landt op uitgaveNaPensioenPerJaar (dalend)', () => {
    const r = computeLabGrenzen(ctx(), { solve: solveOp((i) => i.inkomenUitgaven.uitgaveNaPensioenPerJaar <= 41_000) })
    expect(r.grenzen.uitgaveNaPensioen).toMatchObject({ gedekt: 40_800, heel: null })
  })

  it('nalatenschap: patchNalatenschap landt op eindstrategie.nalatenschapBedrag (dalend); zonder stand is het bedrag het plan (0)', () => {
    const bedragen: number[] = []
    const r = computeLabGrenzen(ctx(), {
      solve: (i) => {
        bedragen.push(i.eindstrategie.nalatenschapBedrag)
        return i.eindstrategie.nalatenschapBedrag <= 125_000 ? gedekt : tekort
      },
    })
    expect(r.grenzen.nalatenschap).toMatchObject({ gedekt: 120_000, heel: null })
    // De andere knoppen rekenen met de plan-nalatenschap (0) — de knop-stand is null.
    expect(bedragen.filter((b) => b === 0).length).toBeGreaterThan(0)
  })

  it('ruim onder een vast anker: de eindleeftijd wordt opgerekt met marge × (eind − planStop)', () => {
    // Dekking hangt hier aan de eindleeftijd: 90 → 41.000, elk jaar later 1.000 minder.
    const r = computeLabGrenzen(ctx(), {
      solve: solveOp((i) => i.inkomenUitgaven.uitgaveNaPensioenPerJaar <= 41_000 - 1_000 * (i.eindstrategie.eindleeftijdOpeten - 90)),
    })
    const oprek = 90 + LAB_RUIM_MARGE * (90 - 62) // 92,8
    const drempel = 41_000 - 1_000 * (oprek - 90) // 38.200
    const verwachtRuim = 24_000 + Math.floor((drempel - 24_000) / 600) * 600 // 37.800
    expect(r.grenzen.uitgaveNaPensioen).toEqual({ gedekt: 40_800, ruim: verwachtRuim, heel: null })
    expect(verwachtRuim).toBeLessThan(40_800)
  })

  it('alles gedekt maar niet overal ruim ⇒ gedekt op de rand (rood leeg) met ruim als grens', () => {
    const r = computeLabGrenzen(ctx(), {
      solve: solveOp((i) => i.inkomenUitgaven.uitgaveNaPensioenPerJaar <= 100_000 - 8_000 * (i.eindstrategie.eindleeftijdOpeten - 90)),
    })
    // Bij eind 90 dekt alles (≤ 84.000 < 100.000); bij 92,8 dekt tot 77.600.
    expect(r.grenzen.uitgaveNaPensioen).toEqual({ gedekt: 84_000, ruim: 77_400, heel: null })
    expect(zoneVanWaarde(84_000, r.grenzen.uitgaveNaPensioen!, 'dalend')).toBe('oranje')
    expect(zoneVanWaarde(60_000, r.grenzen.uitgaveNaPensioen!, 'dalend')).toBe('groen')
  })

  it('perpetual: ruim ≡ gedekt en huidig.ruim = huidig.gedekt, zonder extra runs', () => {
    const r = computeLabGrenzen(ctx({ eindVorm: 'perpetual' }), { solve: solveOp((i) => leeftijd(i) >= 60) })
    expect(r.grenzen.stop).toEqual({ gedekt: 60, ruim: 60, heel: null })
    expect(r.huidig).toEqual({ gedekt: true, ruim: true })
    // 1 run voor huidig + 2 bracket per knop, + de stop-bisectie (n = 40 ⇒ 6): 1 + 4×2 + 8.
    expect(r.runs).toBe(1 + 4 * 2 + 2 + Math.ceil(Math.log2(40)))
  })

  it('een knop buiten ctx.bereik wordt niet gesolved', () => {
    const bedragen = new Set<number>()
    const r = computeLabGrenzen(ctx({ bereik: { stop: { min: 50, max: 70, stap: 0.5 } } }), {
      solve: (i) => {
        bedragen.add(i.eindstrategie.nalatenschapBedrag)
        return leeftijd(i) >= 60 ? gedekt : tekort
      },
    })
    expect(Object.keys(r.grenzen)).toEqual(['stop'])
    expect([...bedragen]).toEqual([0])
  })

  it('maxRuns als noodrem: daarboven blijven de resterende grenzen null, runs = maxRuns', () => {
    const r = computeLabGrenzen(ctx({ maxRuns: 3 }), { solve: solveOp((i) => leeftijd(i) >= 60) })
    expect(r.runs).toBe(3)
    expect(r.huidig).toEqual({ gedekt: true, ruim: true })
    for (const k of ['uitgeven', 'uitgaveNaPensioen', 'nalatenschap', 'stop'] as const) {
      expect(r.grenzen[k]).toEqual({ gedekt: null, ruim: null, heel: null })
    }
  })

  it('een kern-fout maakt alleen díe knop null, de batch en huidig blijven staan', () => {
    const r = computeLabGrenzen(ctx(), {
      solve: (i) => {
        if (i.eindstrategie.nalatenschapBedrag > 0) throw new Error('kern-fout')
        return leeftijd(i) >= 60 ? gedekt : tekort
      },
    })
    expect(r.huidig).toEqual({ gedekt: true, ruim: true })
    expect(r.grenzen.nalatenschap).toEqual({ gedekt: null, ruim: null, heel: null })
    expect(r.grenzen.stop).toEqual({ gedekt: 60, ruim: 60, heel: null })
    expect(r.grenzen.verdienen).toEqual({ gedekt: null, ruim: null, heel: 'gedekt' })
  })

  it('een kern-fout op de huidige stand ⇒ huidig null (grijs), de knoppen rekenen door', () => {
    let eerste = true
    const r = computeLabGrenzen(ctx(), {
      solve: (i) => {
        if (eerste) {
          eerste = false
          throw new Error('kern-fout')
        }
        return leeftijd(i) >= 60 ? gedekt : tekort
      },
    })
    expect(r.huidig).toBeNull()
    expect(zoneVanHuidig(r.huidig)).toBeNull()
    expect(r.grenzen.stop).toEqual({ gedekt: 60, ruim: 60, heel: null })
  })

  it('een volledige batch blijft ruim onder het default-runbudget', () => {
    const r = computeLabGrenzen(ctx(), { solve: solveOp((i) => leeftijd(i) >= 60) })
    expect(r.runs).toBeLessThan(100)
  })
})

describe('zoneVanWaarde / zoneVanHuidig — de driekleurige schaal uit de grenzen', () => {
  const g: HefboomGrenzen = { gedekt: 300, ruim: 500, heel: null }
  it('stijgend: rood onder gedekt, oranje tot ruim, groen erop en erboven', () => {
    expect(zoneVanWaarde(250, g, 'stijgend')).toBe('rood')
    expect(zoneVanWaarde(300, g, 'stijgend')).toBe('oranje')
    expect(zoneVanWaarde(499, g, 'stijgend')).toBe('oranje')
    expect(zoneVanWaarde(500, g, 'stijgend')).toBe('groen')
  })
  it('dalend spiegelt', () => {
    const d: HefboomGrenzen = { gedekt: 40_800, ruim: 37_800, heel: null }
    expect(zoneVanWaarde(41_400, d, 'dalend')).toBe('rood')
    expect(zoneVanWaarde(40_800, d, 'dalend')).toBe('oranje')
    expect(zoneVanWaarde(37_800, d, 'dalend')).toBe('groen')
  })
  it('ruim null ⇒ oranje aan de gedekte kant; heel gedekt ⇒ groen; heel ongedekt ⇒ rood; onbekend ⇒ null', () => {
    expect(zoneVanWaarde(1000, { gedekt: 300, ruim: null, heel: null }, 'stijgend')).toBe('oranje')
    expect(zoneVanWaarde(0, { gedekt: null, ruim: null, heel: 'gedekt' }, 'stijgend')).toBe('groen')
    expect(zoneVanWaarde(0, { gedekt: null, ruim: null, heel: 'ongedekt' }, 'stijgend')).toBe('rood')
    expect(zoneVanWaarde(0, { gedekt: null, ruim: null, heel: null }, 'stijgend')).toBeNull()
    expect(zoneVanWaarde(0, null, 'stijgend')).toBeNull()
  })
  it('zoneVanHuidig: null ⇒ null, niet gedekt ⇒ rood, gedekt ⇒ oranje/groen naar ruim', () => {
    expect(zoneVanHuidig(null)).toBeNull()
    expect(zoneVanHuidig({ gedekt: false, ruim: false })).toBe('rood')
    expect(zoneVanHuidig({ gedekt: true, ruim: false })).toBe('oranje')
    expect(zoneVanHuidig({ gedekt: true, ruim: true })).toBe('groen')
  })
})
