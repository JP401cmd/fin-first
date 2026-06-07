import { describe, it, expect } from 'vitest'
import { getTaxDeadlines, TAX_DEADLINES, type TaxDeadline } from './tax-calendar'

// Vaste referentie: 7 juni 2026 (UTC-middernacht).
const NOW = new Date(Date.UTC(2026, 5, 7))

describe('getTaxDeadlines — basis', () => {
  it('geeft één deadline per template terug', () => {
    const result = getTaxDeadlines(NOW)
    expect(result).toHaveLength(TAX_DEADLINES.length)
  })

  it('alle daysUntil zijn >= 0', () => {
    const result = getTaxDeadlines(NOW)
    for (const d of result) {
      expect(d.daysUntil).toBeGreaterThanOrEqual(0)
    }
  })

  it('is gesorteerd op daysUntil oplopend', () => {
    const result = getTaxDeadlines(NOW)
    for (let i = 1; i < result.length; i++) {
      expect(result[i].daysUntil).toBeGreaterThanOrEqual(result[i - 1].daysUntil)
    }
  })

  it('elke date is geldig ISO yyyy-mm-dd en daysUntil komt overeen', () => {
    const result = getTaxDeadlines(NOW)
    const nowUtc = Date.UTC(2026, 5, 7)
    for (const d of result) {
      expect(d.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      const [y, m, day] = d.date.split('-').map(Number)
      const occUtc = Date.UTC(y, m - 1, day)
      const expected = Math.round((occUtc - nowUtc) / 86_400_000)
      expect(d.daysUntil).toBe(expected)
    }
  })
})

describe('getTaxDeadlines — eerstvolgende voorkomen', () => {
  const byId = (result: TaxDeadline[], id: string) =>
    result.find((d) => d.id === id)!

  it('1 jul (voorlopige aanslag) is dichtbij vanaf 7 jun 2026', () => {
    const result = getTaxDeadlines(NOW)
    const va = byId(result, 'voorlopige-aanslag')
    expect(va.date).toBe('2026-07-01')
    // 7 jun → 1 jul 2026 = 24 dagen
    expect(va.daysUntil).toBe(24)
  })

  it('aangifte (1 mei) is al gepasseerd → schuift naar volgend jaar', () => {
    const result = getTaxDeadlines(NOW)
    const aangifte = byId(result, 'aangifte-ib')
    expect(aangifte.date).toBe('2027-05-01')
  })

  it('Box 3 peildatum (1 jan) is gepasseerd → 1 jan 2027', () => {
    const result = getTaxDeadlines(NOW)
    const peil = byId(result, 'box3-peildatum')
    expect(peil.date).toBe('2027-01-01')
  })

  it('31-dec-items komen vóór 1 jan van het jaar erna', () => {
    const result = getTaxDeadlines(NOW)
    const dec31 = byId(result, 'box3-arbitrage')
    const jan1 = byId(result, 'box3-peildatum')
    expect(dec31.date).toBe('2026-12-31')
    expect(jan1.date).toBe('2027-01-01')
    expect(dec31.daysUntil).toBeLessThan(jan1.daysUntil)
    // ze verschillen precies 1 dag
    expect(jan1.daysUntil - dec31.daysUntil).toBe(1)
  })

  it('drie 31-dec-deadlines bestaan en delen dezelfde daysUntil', () => {
    const result = getTaxDeadlines(NOW)
    const dec31Ids = ['dga-leengrens', 'jaarruimte-lijfrente', 'box3-arbitrage']
    const days = dec31Ids.map((id) => byId(result, id).daysUntil)
    expect(new Set(days).size).toBe(1)
    for (const d of dec31Ids) {
      expect(byId(result, d).date).toBe('2026-12-31')
    }
  })
})

describe('getTaxDeadlines — randgevallen', () => {
  it('deadline op exact now-datum heeft daysUntil 0 (niet doorgeschoven)', () => {
    const onJan1 = new Date(Date.UTC(2026, 0, 1))
    const result = getTaxDeadlines(onJan1)
    const peil = result.find((d) => d.id === 'box3-peildatum')!
    expect(peil.date).toBe('2026-01-01')
    expect(peil.daysUntil).toBe(0)
  })

  it('eerste element heeft de kleinste daysUntil', () => {
    const result = getTaxDeadlines(NOW)
    const min = Math.min(...result.map((d) => d.daysUntil))
    expect(result[0].daysUntil).toBe(min)
  })

  it('optionele year-param verandert het resultaat niet', () => {
    const withYear = getTaxDeadlines(NOW, 2026)
    const without = getTaxDeadlines(NOW)
    expect(withYear).toEqual(without)
  })

  it('box-waarden zijn correct toegewezen', () => {
    const result = getTaxDeadlines(NOW)
    const box = (id: string) => result.find((d) => d.id === id)!.box
    expect(box('box3-peildatum')).toBe(3)
    expect(box('aangifte-ib')).toBe(null)
    expect(box('voorlopige-aanslag')).toBe(null)
    expect(box('dga-leengrens')).toBe(2)
    expect(box('jaarruimte-lijfrente')).toBe(1)
    expect(box('box3-arbitrage')).toBe(3)
  })
})
