import { describe, it, expect } from 'vitest'
import { resolveLabAntwoorden } from './lab-antwoorden'
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

describe('resolveLabAntwoorden — de drie hefbomen als antwoorden (spec §3)', () => {
  it('geeft drie antwoorden bij een tekort met tweede run en hint', () => {
    const a = resolveLabAntwoorden({ dekking: tekort, solvedFireAge: 61.2, planMaandHint: 500, baseline })
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
