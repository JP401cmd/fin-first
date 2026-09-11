/**
 * lib/history-basis.ts — de historiebasis (ADR 0138): afgesloten maanden, één
 * deler per gebruiker. Pure functies; de klok gaat expliciet mee.
 */
import { describe, it, expect } from 'vitest'
import {
  annualizeHistorySum,
  clampHistoryMonths,
  closedMonthsSince,
  historyMonthKeys,
  historyMonthsFromRows,
} from './history-basis'
import { HISTORY_WINDOW_MONTHS } from './constants'

const NOW = new Date(2026, 8, 11, 12, 0, 0) // 11 sep 2026, lokaal

describe('historyMonthKeys — twaalf AFGESLOTEN maanden, oud → nieuw', () => {
  it('loopt van 12 maanden terug t/m de vorige maand; de lopende maand ontbreekt', () => {
    const keys = historyMonthKeys(NOW)
    expect(keys).toHaveLength(HISTORY_WINDOW_MONTHS)
    expect(keys[0]).toBe('2025-09')
    expect(keys[keys.length - 1]).toBe('2026-08')
    expect(keys).not.toContain('2026-09')
  })

  it('is tijdzone-veilig over een jaargrens (januari → vorig jaar)', () => {
    const keys = historyMonthKeys(new Date(2027, 0, 3, 0, 30, 0))
    expect(keys[0]).toBe('2026-01')
    expect(keys[keys.length - 1]).toBe('2026-12')
  })
})

describe('closedMonthsSince — kalendermaand-verschil, lopende maand exclusief', () => {
  it('telt hele maanden, ongeacht de dag', () => {
    expect(closedMonthsSince(NOW, '2026-08-30')).toBe(1)
    expect(closedMonthsSince(NOW, '2026-06-01')).toBe(3)
    expect(closedMonthsSince(NOW, '2025-09-15')).toBe(12)
    expect(closedMonthsSince(NOW, '2024-01-01')).toBe(32)
  })

  it('een datum in de lopende maand of in de toekomst → 0, nooit negatief', () => {
    expect(closedMonthsSince(NOW, '2026-09-02')).toBe(0)
    expect(closedMonthsSince(NOW, '2027-01-01')).toBe(0)
  })

  it('een onleesbare datum → 0', () => {
    expect(closedMonthsSince(NOW, 'geen-datum')).toBe(0)
  })
})

describe('clampHistoryMonths — de ene klem 1..12', () => {
  it('klemt onder en boven en rondt naar beneden af', () => {
    expect(clampHistoryMonths(0)).toBe(1)
    expect(clampHistoryMonths(-3)).toBe(1)
    expect(clampHistoryMonths(5.9)).toBe(5)
    expect(clampHistoryMonths(12)).toBe(12)
    expect(clampHistoryMonths(40)).toBe(12)
  })

  it('NaN/Infinity → het volle venster', () => {
    expect(clampHistoryMonths(Number.NaN)).toBe(HISTORY_WINDOW_MONTHS)
    expect(clampHistoryMonths(Number.POSITIVE_INFINITY)).toBe(HISTORY_WINDOW_MONTHS)
  })
})

describe('historyMonthsFromRows — DE deler: vroegste boeking in het venster → spanwijdte', () => {
  const keys = historyMonthKeys(NOW) // 2025-09 … 2026-08
  const row = (month: string, extra: Partial<{ sum_positief: number; sum_negatief: number; count: number }> = {}) => ({
    month,
    sum_positief: 0,
    sum_negatief: 0,
    count: 1,
    ...extra,
  })

  it('vroegste transactie 11 afgesloten maanden geleden → 11 (B-045-scenario)', () => {
    expect(historyMonthsFromRows([row('2025-10', { sum_negatief: -250 }), row('2026-08', { sum_negatief: -1200 })], keys)).toBe(11)
  })

  it('de oudste maand van het venster bezet → 12; oudere boekingen buiten het venster veranderen niets', () => {
    expect(historyMonthsFromRows([row('2025-09', { sum_positief: 1 }), row('2021-01', { sum_positief: 1 })], keys)).toBe(12)
  })

  it('alleen de lopende maand → geen enkele afgesloten maand → het volle venster (eindig, niet 0)', () => {
    expect(historyMonthsFromRows([row('2026-09', { sum_negatief: -1200 })], keys)).toBe(HISTORY_WINDOW_MONTHS)
  })

  it('geen rijen → het volle venster', () => {
    expect(historyMonthsFromRows([], keys)).toBe(HISTORY_WINDOW_MONTHS)
  })

  it('"van welke soort dan ook": een transfer of een rij zonder budget telt als historie', () => {
    // De rij draagt geen type/budget — de telling kijkt alleen naar maand en inhoud.
    expect(historyMonthsFromRows([row('2026-03', { sum_positief: 500 })], keys)).toBe(6)
  })

  it('een lege groep (som 0, count 0) is geen historie', () => {
    expect(historyMonthsFromRows([row('2025-09', { count: 0 })], keys)).toBe(HISTORY_WINDOW_MONTHS)
  })

  it('een gat aan de vensterrand telt de maanden MET data (in-venster, niet all-time)', () => {
    // Bewuste interpretatie (zie de module-kop): geen boekingen in de oudste
    // vensterhelft → de deler is de spanwijdte vanaf de eerste boeking in het
    // venster, ook al bestaan er oudere boekingen buiten het venster.
    expect(historyMonthsFromRows([row('2024-05', { sum_positief: 1 }), row('2026-04', { sum_positief: 1 })], keys)).toBe(5)
  })
})

describe('annualizeHistorySum — één schaalformule', () => {
  it('korte historie schaalt naar een jaar, volle historie niet', () => {
    expect(annualizeHistorySum(1200, 11)).toBeCloseTo((1200 / 11) * 12, 10)
    expect(annualizeHistorySum(1200, 12)).toBe(1200)
    expect(annualizeHistorySum(1200, 40)).toBe(1200)
  })

  it('geen som → 0, nooit NaN of Infinity', () => {
    expect(annualizeHistorySum(0, 3)).toBe(0)
    expect(annualizeHistorySum(Number.NaN, 3)).toBe(0)
    expect(annualizeHistorySum(1200, 0)).toBe(14400) // deler klemt op 1
    expect(Number.isFinite(annualizeHistorySum(1200, Number.NaN))).toBe(true)
  })
})
