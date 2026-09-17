import { describe, it, expect } from 'vitest'
import { labelVan, maandLabel, mooieMax, procent, UITGESTELD_LABEL, weekKort, weekLabel } from './opmaak'

describe('opmaak /beheer/gebruik', () => {
  it('weeklabels', () => {
    expect(weekLabel('2026-W38')).toBe('week 38, 2026')
    expect(weekLabel('2026-W01')).toBe('week 1, 2026')
    expect(weekKort('2026-W09')).toBe('wk 9')
    expect(weekLabel('onzin')).toBe('onzin')
  })

  it('maandlabels, met "Eerder" voor null', () => {
    expect(maandLabel('2026-09')).toBe('september 2026')
    expect(maandLabel('2025-12')).toBe('december 2025')
    expect(maandLabel(null)).toBe('Eerder')
  })

  it('procent', () => {
    expect(procent(0.4)).toBe('40%')
    expect(procent(0)).toBe('0%')
    expect(procent(0.004)).toBe('0,4%')
  })

  it('mooieMax rondt op naar een leesbare asgrens', () => {
    expect(mooieMax(0)).toBe(5)
    expect(mooieMax(3)).toBe(5)
    expect(mooieMax(27)).toBe(50)
    expect(mooieMax(20)).toBe(20)
    expect(mooieMax(21)).toBe(25)
    expect(mooieMax(101)).toBe(200)
  })

  it('labelVan valt terug op een leesbare sleutel', () => {
    expect(labelVan(UITGESTELD_LABEL, 'income')).toBe('Inkomen')
    expect(labelVan(UITGESTELD_LABEL, 'nieuw_veld')).toBe('nieuw veld')
  })
})
