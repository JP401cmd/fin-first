import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_RETURN } from '@/lib/constants'
import {
  computeNetWorthProjection,
  formatProjectedValue,
  getProjectionMessage,
} from './net-worth-projection'

/**
 * Eerste vangrail voor de tactische 5-jaarsprojectie (catalogus-entry
 * `netto-vermogen-tactische-projectie`). Gedocumenteerde formule:
 *   per maand: netWorth = netWorth × (1 + jaarrendement/12) + maandelijkseBesparing
 * De tests leggen de gesloten vorm van die recursie vast, de mijlpalen
 * (jaar 1/3/5), de FIRE-kruising en de tekstlaag — zonder de motor te wijzigen.
 *
 * Datum wordt gepind (fake timers, lokale middag) zodat de maandlabels en
 * -datums reproduceerbaar zijn.
 */

const NOW = new Date(2026, 8, 3, 12, 0, 0) // 3 sep 2026, 12:00 lokaal

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})
afterEach(() => {
  vi.useRealTimers()
})

/** Gesloten vorm van de maandrecursie: NW_n = NW0·g^n + S·(g^n − 1)/(g − 1), g = 1 + r/12. */
function closedForm(nw0: number, s: number, annualReturn: number, n: number): number {
  const g = 1 + annualReturn / 12
  if (annualReturn === 0) return nw0 + s * n
  const gn = Math.pow(g, n)
  return nw0 * gn + s * (gn - 1) / (g - 1)
}

describe('computeNetWorthProjection — maandrecursie', () => {
  it('levert 61 punten (maand 0 t/m 60) met maand 0 = het huidige vermogen', () => {
    const r = computeNetWorthProjection(100_000, 500, 1_000_000)
    expect(r.points).toHaveLength(61)
    expect(r.points.map((p) => p.month)).toEqual(Array.from({ length: 61 }, (_, i) => i))
    expect(r.points[0].netWorth).toBe(100_000)
    expect(r.current).toBe(100_000)
    expect(r.monthlySavings).toBe(500)
    expect(r.fireTarget).toBe(1_000_000)
  })

  it('volgt de gedocumenteerde formule exact (gesloten vorm van de recursie, default DEFAULT_RETURN)', () => {
    const r = computeNetWorthProjection(100_000, 500, 1_000_000)
    for (const n of [1, 12, 36, 60]) {
      expect(r.points[n].netWorth).toBeCloseTo(closedForm(100_000, 500, DEFAULT_RETURN, n), 6)
    }
    expect(r.year1).toBeCloseTo(closedForm(100_000, 500, DEFAULT_RETURN, 12), 6)
    expect(r.year3).toBeCloseTo(closedForm(100_000, 500, DEFAULT_RETURN, 36), 6)
    expect(r.year5).toBeCloseTo(closedForm(100_000, 500, DEFAULT_RETURN, 60), 6)
  })

  it('neemt een expliciet jaarrendement over (per-gebruiker, geen vaste 7%)', () => {
    const r = computeNetWorthProjection(100_000, 500, 1_000_000, 0.04)
    expect(r.year5).toBeCloseTo(closedForm(100_000, 500, 0.04, 60), 6)
    expect(r.year5).not.toBeCloseTo(closedForm(100_000, 500, DEFAULT_RETURN, 60), 0)
  })

  it('rendement 0 → lineair: NW + 60 × besparing', () => {
    const r = computeNetWorthProjection(10_000, 250, 0, 0)
    expect(r.year1).toBe(10_000 + 12 * 250)
    expect(r.year5).toBe(10_000 + 60 * 250)
    expect(r.isGrowing).toBe(true)
  })

  it('negatieve besparing die het rendement overtreft → dalend, isGrowing=false', () => {
    const r = computeNetWorthProjection(10_000, -1_000, 0)
    expect(r.year5).toBeLessThan(10_000)
    expect(r.isGrowing).toBe(false)
  })

  it('stilstand (0 besparing, 0 rendement) → isGrowing=false, vermogen blijft gelijk', () => {
    const r = computeNetWorthProjection(10_000, 0, 0, 0)
    expect(r.year5).toBe(10_000)
    expect(r.isGrowing).toBe(false)
  })
})

describe('computeNetWorthProjection — FIRE-kruising (fireReachedMonth)', () => {
  it('is de eerste maand waarin het geprojecteerde vermogen ≥ het doel is (inclusieve grens)', () => {
    // r = 0, S = 1.000: NW_n = n × 1.000 → doel 12.000 exact op maand 12.
    expect(computeNetWorthProjection(0, 1_000, 12_000, 0).fireReachedMonth).toBe(12)
    expect(computeNetWorthProjection(0, 1_000, 12_001, 0).fireReachedMonth).toBe(13)
    expect(computeNetWorthProjection(0, 1_000, 5_000, 0).fireReachedMonth).toBe(5)
  })

  it('null als het doel niet binnen 60 maanden wordt gehaald', () => {
    expect(computeNetWorthProjection(0, 1_000, 60_001, 0).fireReachedMonth).toBeNull()
    expect(computeNetWorthProjection(0, 1_000, 60_000, 0).fireReachedMonth).toBe(60)
  })

  it('null bij doel ≤ 0 (geen referentielijn)', () => {
    expect(computeNetWorthProjection(100_000, 1_000, 0).fireReachedMonth).toBeNull()
    expect(computeNetWorthProjection(100_000, 1_000, -1).fireReachedMonth).toBeNull()
  })

  it('huidig gedrag (bevinding NWP-1): vermogen dat het doel al op maand 0 haalt, meldt maand 1 — niet 0', () => {
    // De kruisingscheck begint bij m = 1; maand 0 wordt niet getoetst. Wie al
    // "vrij" is krijgt dus "over 1 maand". Bewust vastgelegd als karakterisering;
    // een correctie is een uitkomst-wijziging en hoort in een eigen kaart.
    const r = computeNetWorthProjection(20_000, 0, 10_000, 0)
    expect(r.fireReachedMonth).toBe(1)
  })
})

describe('computeNetWorthProjection — datums en labels', () => {
  it('maand m ≥ 1 krijgt de lokale eerste van de maand (YYYY-MM-01), met jaarovergang', () => {
    const r = computeNetWorthProjection(0, 0, 0)
    expect(r.points[1].date).toBe('2026-10-01')
    expect(r.points[4].date).toBe('2027-01-01')
    expect(r.points[12].date).toBe('2027-09-01')
    expect(r.points[60].date).toBe('2031-09-01')
  })

  it('maand 0 draagt de datum van vandaag (ISO, UTC-kalenderdag)', () => {
    // NB (bevinding NWP-2): maand 0 gebruikt toISOString (UTC), latere maanden
    // localMonthStart (lokaal). Rond middernacht NL-tijd kan de maand-0-datum
    // daardoor een dag achterlopen. Deze test pint de middag, buiten die rand.
    const r = computeNetWorthProjection(0, 0, 0)
    expect(r.points[0].date).toBe(NOW.toISOString().split('T')[0])
  })

  it('labels dragen het juiste jaar (nl-NL maand + jaar)', () => {
    const r = computeNetWorthProjection(0, 0, 0)
    expect(r.points[0].label).toContain('2026')
    expect(r.points[4].label).toContain('2027')
    expect(r.points[60].label).toContain('2031')
  })
})

describe('formatProjectedValue', () => {
  it('≥ €1M als "€x,yM" met komma', () => {
    expect(formatProjectedValue(1_200_000)).toBe('€1,2M')
    expect(formatProjectedValue(10_000_000)).toBe('€10,0M')
  })

  it('< €1M als nl-NL euro zonder decimalen', () => {
    expect(formatProjectedValue(125_000)).toMatch(/^€\s?125\.000$/)
    expect(formatProjectedValue(999_999)).toMatch(/^€\s?999\.999$/)
  })
})

describe('getProjectionMessage', () => {
  it('lege situatie → uitnodiging om gegevens toe te voegen', () => {
    const r = computeNetWorthProjection(0, 0, 0)
    expect(getProjectionMessage(r)).toBe('Voeg inkomsten en uitgaven toe om je vermogensprognose te zien.')
  })

  it('FIRE binnen 5 jaar → "volledige vrijheid" met jaren/maanden-grammatica', () => {
    expect(getProjectionMessage(computeNetWorthProjection(0, 1_000, 5_000, 0)))
      .toBe('Op dit tempo bereik je volledige vrijheid over 5 maanden.')
    expect(getProjectionMessage(computeNetWorthProjection(0, 1_000, 1_000, 0)))
      .toBe('Op dit tempo bereik je volledige vrijheid over 1 maand.')
    expect(getProjectionMessage(computeNetWorthProjection(0, 1_000, 12_000, 0)))
      .toBe('Op dit tempo bereik je volledige vrijheid over 1 jaar.')
    expect(getProjectionMessage(computeNetWorthProjection(0, 1_000, 13_000, 0)))
      .toBe('Op dit tempo bereik je volledige vrijheid over 1 jaar en 1 maand.')
    expect(getProjectionMessage(computeNetWorthProjection(0, 1_000, 26_000, 0)))
      .toBe('Op dit tempo bereik je volledige vrijheid over 2 jaar en 2 maanden.')
  })

  it('groeiend zonder FIRE binnen 5 jaar → 5-jaarsbedrag', () => {
    const r = computeNetWorthProjection(10_000, 250, 1_000_000, 0)
    expect(getProjectionMessage(r)).toMatch(/^Op dit tempo bereik je €\s?25\.000 over 5 jaar\.$/)
  })

  it('dalend → waarschuwing met het 5-jaarsbedrag', () => {
    const r = computeNetWorthProjection(10_000, -100, 1_000_000, 0)
    expect(getProjectionMessage(r)).toMatch(/^Let op: op dit tempo daalt je vermogen naar €\s?4\.000 over 5 jaar\.$/)
  })

  it('stabiel (geen groei, geen daling) → "blijft stabiel"', () => {
    const r = computeNetWorthProjection(10_000, 0, 1_000_000, 0)
    expect(getProjectionMessage(r)).toMatch(/^Je vermogen blijft stabiel rond €\s?10\.000\.$/)
  })
})
