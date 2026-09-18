import { describe, it, expect, vi } from 'vitest'
import { labAntwoordenPerSlider, labAntwoordGezetMelding, resolveLabAntwoorden } from './lab-antwoorden'
import { formatCurrency } from '@/lib/format'
import type { LabUitkomstDekking } from './lab-uitkomst'
import type { WhatIfOverrides } from '@/lib/types/horizon-whatif'

const baseline: WhatIfOverrides = { monthlyIncome: 4000, workDaysPerWeek: 5, savingsRate: 20, expectedReturn: 6, extraContribution: 0 }

const tekort: LabUitkomstDekking = {
  kind: 'dekking',
  stop: { kind: 'age', stopAge: 58 },
  eind: 90,
  basisPct: 65,
  basisReach: { kind: 'reikt-tot', age: 82, endAge: 90 },
  scenarioPct: null, scenarioReach: null,
  verkendPct: null, verkendReach: null, verkendStopAge: null,
  basisEindvermogen: null, scenarioEindvermogen: null, verkendEindvermogen: null,
  tekort: true,
  maandHint: 500,
  promotie: { kind: 'geen', reden: 'geen-verkenning' },
}

// Pure verplaatsing (geen gedragswijziging): gedeeld met de 'vierde antwoord'-describe
// hieronder, die deze invoer hergebruikt in de volgorde-test.
const tekortInput = { dekking: tekort, solvedFireAge: 61.2, planMaandHint: 500, baseline }

describe('resolveLabAntwoorden — de drie hefbomen als antwoorden (spec §3)', () => {
  it('geeft drie antwoorden bij een tekort met tweede run en hint', () => {
    const a = resolveLabAntwoorden(tekortInput)
    expect(a.map((x) => x.kind)).toEqual(['doorwerken', 'extra_opzij', 'minder_uitgeven'])
    expect(a[0].zin).toBe('Doorwerken tot 61,5 dekt je plan.')
    expect(a[0].actie).toEqual({ kind: 'stop', stopAge: 61.5 })
    expect(a[1].actie).toEqual({ kind: 'slider', key: 'extra_inleg', value: 500 })
    expect(a[1].bovenBereik).toBe(false)
    // €500 minder uitgeven op €4.000 = +12,5 pp → 32,5 → afgerond 33; range ±15 pp (5–35) → past
    expect(a[2].actie).toEqual({ kind: 'slider', key: 'savings', value: 33 })
    expect(a[2].bovenBereik).toBe(false)
  })

  it('een hele opgeloste leeftijd blijft heel ("61"), een fractie gaat naar het volgende halve jaar', () => {
    expect(resolveLabAntwoorden({ dekking: tekort, solvedFireAge: 61, planMaandHint: 500, baseline })[0]).toMatchObject({
      zin: 'Doorwerken tot 61 dekt je plan.',
      actie: { kind: 'stop', stopAge: 61 },
    })
    expect(resolveLabAntwoorden({ dekking: tekort, solvedFireAge: 61.6, planMaandHint: 500, baseline })[0].actie).toEqual({ kind: 'stop', stopAge: 62 })
  })

  it('"doorwerken" alleen als de tweede run een leeftijd ná het stopmoment vindt', () => {
    expect(resolveLabAntwoorden({ dekking: tekort, solvedFireAge: null, planMaandHint: 500, baseline }).map((x) => x.kind)).toEqual(['extra_opzij', 'minder_uitgeven'])
    expect(resolveLabAntwoorden({ dekking: tekort, solvedFireAge: 55, planMaandHint: 500, baseline }).map((x) => x.kind)).toEqual(['extra_opzij', 'minder_uitgeven'])
  })

  it('de bedragen volgen de PLAN-hint, nooit de hint van het verkende stop-pad (eindreview I1)', () => {
    // labDekking.maandHint laat het stop-pad voorgaan (verkende stop 62, €180); het
    // antwoordenblok spreekt over het plan-stopmoment en moet de plan-hint (€500) tonen.
    const verkend: LabUitkomstDekking = { ...tekort, maandHint: 180, verkendStopAge: 62, verkendPct: 97 }
    const a = resolveLabAntwoorden({ dekking: verkend, solvedFireAge: null, planMaandHint: 500, baseline })
    expect(a.map((x) => x.kind)).toEqual(['extra_opzij', 'minder_uitgeven'])
    expect(a[0].actie).toEqual({ kind: 'slider', key: 'extra_inleg', value: 500 })
    expect(a[0].zin).toContain('500')
    expect(a[0].zin).not.toContain('180')
    expect(a[1].zin).toContain('500')
    // en een stop-pad-hint zonder plan-hint levert géén bedrag-antwoorden op
    expect(resolveLabAntwoorden({ dekking: verkend, solvedFireAge: null, planMaandHint: null, baseline })).toEqual([])
  })

  it('boven het slider-bereik zegt het antwoord dat eerlijk en klemt de actie op het maximum', () => {
    const a = resolveLabAntwoorden({ dekking: tekort, solvedFireAge: null, planMaandHint: 22_695, baseline })
    expect(a[0].bovenBereik).toBe(true)
    expect(a[0].actie).toEqual({ kind: 'slider', key: 'extra_inleg', value: 1200 }) // 30% van 4000
    // en de spaarquote-regel klemt op basis + 15 pp
    expect(a[1].bovenBereik).toBe(true)
    expect(a[1].actie).toEqual({ kind: 'slider', key: 'savings', value: 35 })
  })

  it('geen antwoorden zonder tekort, onder now, of zonder stopmoment', () => {
    expect(resolveLabAntwoorden({ dekking: { ...tekort, tekort: false }, solvedFireAge: 61, planMaandHint: 500, baseline })).toEqual([])
    expect(resolveLabAntwoorden({ dekking: { ...tekort, stop: { kind: 'now' } }, solvedFireAge: 61, planMaandHint: 500, baseline })).toEqual([])
    expect(resolveLabAntwoorden({ dekking: { ...tekort, stop: null }, solvedFireAge: 61, planMaandHint: 500, baseline })).toEqual([])
    expect(resolveLabAntwoorden({ dekking: null, solvedFireAge: 61, planMaandHint: 500, baseline })).toEqual([])
  })

  it('zonder hint (of hint ≤ 0) geen bedrag-antwoorden; zonder basisinkomen geen "minder uitgeven"', () => {
    expect(resolveLabAntwoorden({ dekking: tekort, solvedFireAge: 61, planMaandHint: null, baseline }).map((x) => x.kind)).toEqual(['doorwerken'])
    expect(resolveLabAntwoorden({ dekking: tekort, solvedFireAge: 61, planMaandHint: 0, baseline }).map((x) => x.kind)).toEqual(['doorwerken'])
    expect(
      resolveLabAntwoorden({ dekking: tekort, solvedFireAge: null, planMaandHint: 500, baseline: { ...baseline, monthlyIncome: 0 } }).map((x) => x.kind),
    ).toEqual(['extra_opzij'])
  })

  it('zonder baseline blijft alleen "doorwerken" over; masked maskeert de bedragen', () => {
    expect(resolveLabAntwoorden({ dekking: tekort, solvedFireAge: 61, planMaandHint: 500, baseline: null }).map((x) => x.kind)).toEqual(['doorwerken'])
    const m = resolveLabAntwoorden({ dekking: tekort, solvedFireAge: 61, planMaandHint: 500, baseline, masked: true })
    expect(m[1].zin).not.toContain('500')
    expect(m[2].zin).not.toContain('500')
  })
})

describe('labAntwoordenPerSlider — elk antwoord onder zijn eigen knop (spec antwoorden-naast-sliders)', () => {
  it('verdeelt: meer salaris → extra_inleg, minder uitgeven → savings, doorwerken → stop; workdays blijft leeg', () => {
    const a = resolveLabAntwoorden({ dekking: tekort, solvedFireAge: 61.2, planMaandHint: 500, baseline })
    const per = labAntwoordenPerSlider(a, () => {})
    expect(per.stop?.tekst).toBe('Doorwerken tot 61,5 dekt je plan.')
    expect(per.sliders.extra_inleg?.tekst).toBe("Zo'n €500/mnd meer salaris hoort bij een gedekt plan.")
    expect(per.sliders.savings?.tekst).toBe("Zo'n €500/mnd minder uitgeven hoort bij een gedekt plan.")
    expect(Object.keys(per.sliders).sort()).toEqual(['extra_inleg', 'savings'])
    expect(per.sliders.extra_inleg?.knop?.label).toBe('Reken hiermee')
  })

  it('roept de actie NOOIT bij het mappen aan — alleen op klik, met de eigen actie (ADR 0145 D7)', () => {
    const onActie = vi.fn()
    const a = resolveLabAntwoorden({ dekking: tekort, solvedFireAge: 61.2, planMaandHint: 500, baseline })
    const per = labAntwoordenPerSlider(a, onActie)
    expect(onActie).not.toHaveBeenCalled()
    per.sliders.savings?.knop?.onClick()
    expect(onActie).toHaveBeenCalledTimes(1)
    expect(onActie).toHaveBeenCalledWith({ kind: 'slider', key: 'savings', value: 33 })
    per.stop?.knop?.onClick()
    expect(onActie).toHaveBeenLastCalledWith({ kind: 'stop', stopAge: 61.5 })
  })

  it('boven bereik: vlag aan en de knop heet "Reken met maximum"', () => {
    const a = resolveLabAntwoorden({ dekking: tekort, solvedFireAge: null, planMaandHint: 22_695, baseline })
    const per = labAntwoordenPerSlider(a, () => {})
    expect(per.sliders.extra_inleg).toMatchObject({ bovenBereik: true, knop: { label: 'Reken met maximum' } })
    expect(per.sliders.savings).toMatchObject({ bovenBereik: true, knop: { label: 'Reken met maximum' } })
    expect(per.stop).toBeNull()
  })

  it('privacy-weergave: zinnen blijven, géén knop', () => {
    const a = resolveLabAntwoorden({ dekking: tekort, solvedFireAge: 61, planMaandHint: 500, baseline, masked: true })
    const per = labAntwoordenPerSlider(a, () => {}, { masked: true })
    expect(per.stop?.knop).toBeNull()
    expect(per.sliders.extra_inleg?.knop).toBeNull()
    expect(per.sliders.savings?.knop).toBeNull()
    expect(per.sliders.extra_inleg?.tekst).not.toContain('500')
  })

  it('geen antwoorden → niets te verdelen', () => {
    expect(labAntwoordenPerSlider([], () => {})).toEqual({ sliders: {}, stop: null, uitgave: null })
  })
})

describe('labAntwoordGezetMelding — de sr-only melding na een klik', () => {
  it('noemt de knop en de nieuwe stand', () => {
    expect(labAntwoordGezetMelding({ kind: 'slider', key: 'extra_inleg', value: 1800 })).toBe(`Meer salaris staat nu op ${formatCurrency(1800)}.`)
    expect(labAntwoordGezetMelding({ kind: 'slider', key: 'savings', value: 33 })).toBe('Spaarquote staat nu op 33%.')
    expect(labAntwoordGezetMelding({ kind: 'stop', stopAge: 61.5 })).toBe('Doorwerken tot staat nu op 61,5.')
  })
})

describe('vierde antwoord — uitgave na pensioen', () => {
  const hu = { perJaar: 31_200, eindleeftijd: 90, huidigPerJaar: 38_640, richting: 'minder' } as const
  const leeg = { dekking: null, solvedFireAge: null, planMaandHint: null, baseline: null }

  it('verschijnt ook zonder tekort (overschot: je mag meer uitgeven)', () => {
    const a = resolveLabAntwoorden({
      ...leeg,
      haalbareUitgave: { ...hu, richting: 'meer', perJaar: 44_000 },
    })
    expect(a).toHaveLength(1)
    expect(a[0].kind).toBe('uitgave_na_pensioen')
    expect(a[0].actie).toEqual({ kind: 'uitgave', perJaar: 44_000 })
  })

  it('verschijnt niet bij richting "gelijk"', () => {
    expect(resolveLabAntwoorden({ ...leeg, haalbareUitgave: { ...hu, richting: 'gelijk' } })).toHaveLength(0)
  })

  it('staat achteraan, zodat de bestaande volgorde niet verschuift', () => {
    const a = resolveLabAntwoorden({ ...tekortInput, haalbareUitgave: hu })
    expect(a.map((x) => x.kind)).toEqual(['doorwerken', 'extra_opzij', 'minder_uitgeven', 'uitgave_na_pensioen'])
    expect(a[0].zin).toMatch(/^Doorwerken tot /)
    expect(a[a.length - 1].kind).toBe('uitgave_na_pensioen')
  })

  it('klemt nooit — een antwoord ruim ónder de band zet het exacte bedrag, geen bovenBereik', () => {
    // Band rond huidigPerJaar 38.640: [23.400, 54.000]. 12.000 ligt daar ruim onder.
    const a = resolveLabAntwoorden({ ...leeg, haalbareUitgave: { ...hu, perJaar: 12_000 } })
    expect(a[0].actie).toEqual({ kind: 'uitgave', perJaar: 12_000 })
    expect(a[0].bovenBereik).toBe(false)
  })

  it('klemt nooit — een antwoord ruim bóven de band (de 3×-klem van de solver) zet het exacte bedrag', () => {
    // 115.920 = 38.640 × 3 (BOVENGRENS_FACTOR in haalbare-uitgave.ts) — ruim boven [23.400, 54.000].
    const a = resolveLabAntwoorden({ ...leeg, haalbareUitgave: { ...hu, richting: 'meer', perJaar: 115_920 } })
    expect(a[0].actie).toEqual({ kind: 'uitgave', perJaar: 115_920 })
    expect(a[0].bovenBereik).toBe(false)
  })

  it('landt op zijn eigen uitgang in labAntwoordenPerSlider', () => {
    const per = labAntwoordenPerSlider(resolveLabAntwoorden({ ...leeg, haalbareUitgave: hu }), () => {})
    expect(per.uitgave?.tekst).toBe(`Zo'n ${formatCurrency(31_200)} per jaar uitgeven hoort bij een gedekt plan.`)
    expect(per.uitgave?.knop?.label).toBe('Reken hiermee')
    expect(per.stop).toBeNull()
  })

  it('meldt de nieuwe stand na een klik', () => {
    expect(labAntwoordGezetMelding({ kind: 'uitgave', perJaar: 31_200 }))
      .toBe(`Uitgave na pensioen staat nu op ${formatCurrency(31_200)}.`)
  })
})
