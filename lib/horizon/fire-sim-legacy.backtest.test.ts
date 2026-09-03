import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NL_SWR } from '@/lib/constants'
import { MSCI_REAL_RETURNS, NAMED_PERIODS } from '@/lib/msci-data'
import type { FinancialInput } from '@/lib/core-metrics'
import { ageAtDate } from './fire-format'
import { runBacktest } from './fire-sim-legacy'

/**
 * Eerste vangrail voor `runBacktest` (catalogus-entry `backtest`). De motor
 * loopt alle startjaren 1970..(2024 − jaren) over de MSCI-World-reële
 * rendementen en telt per pad:
 *   nw_y = nw_{y-1} × (1 + r_{start+y−1}) + 12 × (inkomen − uitgaven), geklemd op 0
 * succes = nw > 0 aan het eind; FIRE-doel = 12 × uitgaven / SWR (NL_SWR of override).
 * De tests leggen de padrecursie, de slaagkans, de named paths, de banden en
 * de randen vast — zonder de motor te wijzigen.
 */

const NOW = new Date(2026, 8, 3, 12, 0, 0)

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})
afterEach(() => {
  vi.useRealTimers()
})

const BASE: FinancialInput = {
  totalAssets: 250_000,
  totalDebts: 50_000,
  monthlyIncome: 4_000,
  monthlyExpenses: 2_500,
  yearlyMustExpenses: 30_000,
  monthlyContributions: 0,
  dateOfBirth: '1990-01-15',
}

/** Onafhankelijke referentie-implementatie van één pad (zelfde float-volgorde als de motor). */
function referencePath(netWorth: number, monthlySavings: number, startYear: number, years: number) {
  let nw = netWorth
  const values = [Math.round(nw)]
  let depletionYear: number | null = null
  for (let y = 1; y <= years; y++) {
    const r = MSCI_REAL_RETURNS[startYear + y - 1]
    nw = nw * (1 + r) + monthlySavings * 12
    if (nw <= 0) {
      nw = 0
      if (depletionYear === null) depletionYear = y
    }
    values.push(Math.round(nw))
  }
  return { values, depletionYear, success: nw > 0 }
}

describe('runBacktest — startjaren en padvorm', () => {
  it('gebruikt alle startjaren 1970..(2024 − jaren): 30 jaar → 25 paden, 54 jaar → 1 pad', () => {
    expect(runBacktest(BASE, 30).allPaths.map((p) => p.startYear))
      .toEqual(Array.from({ length: 25 }, (_, i) => 1970 + i))
    expect(runBacktest(BASE, 54).allPaths.map((p) => p.startYear)).toEqual([1970])
  })

  it('elk pad heeft jaren+1 waarden en start op het afgeronde netto vermogen', () => {
    const r = runBacktest(BASE, 30)
    expect(r.years).toBe(30)
    for (const p of r.allPaths) {
      expect(p.values).toHaveLength(31)
      expect(p.values[0]).toBe(200_000) // 250k − 50k
    }
  })

  it('volgt de gedocumenteerde recursie exact (referentie-pad 2000, 10 jaar)', () => {
    const r = runBacktest(BASE, 10)
    const path = r.allPaths.find((p) => p.startYear === 2000)!
    const ref = referencePath(200_000, 1_500, 2000, 10)
    expect(path.values).toEqual(ref.values)
    expect(path.depletionYear).toBe(ref.depletionYear)
    expect(path.success).toBe(ref.success)
    // Jaar 1 met de hand: 200.000 × (1 − 0,128) + 18.000 = 192.400
    expect(path.values[1]).toBe(192_400)
  })
})

describe('runBacktest — slaagkans en uitputting', () => {
  it('positieve besparing + positief vermogen → elk pad slaagt, slaagkans exact 1', () => {
    const r = runBacktest(BASE, 30)
    expect(r.allPaths.every((p) => p.success && p.depletionYear === null)).toBe(true)
    expect(r.successRate).toBe(1)
  })

  it('structureel tekort dat het vermogen opeet → klem op 0, depletionYear = eerste jaar ≤ 0, slaagkans 0', () => {
    const r = runBacktest({ ...BASE, totalAssets: 10_000, totalDebts: 0, monthlyIncome: 1_000, monthlyExpenses: 3_000 }, 5)
    // 10.000 × (1 + r) − 24.000 < 0 voor elk startjaar (r ≤ 0,418) → jaar 1 al leeg.
    for (const p of r.allPaths) {
      expect(p.depletionYear).toBe(1)
      expect(p.success).toBe(false)
      expect(p.values.slice(1)).toEqual([0, 0, 0, 0, 0])
    }
    expect(r.successRate).toBe(0)
  })

  it('slaagkans = geslaagde paden / alle paden (gemengde uitkomst)', () => {
    // Klein vermogen, licht negatieve besparing: sommige startjaren overleven 5 jaar, andere niet.
    const r = runBacktest({ ...BASE, totalAssets: 30_000, totalDebts: 0, monthlyIncome: 2_000, monthlyExpenses: 2_500 }, 5)
    const successes = r.allPaths.filter((p) => p.success).length
    expect(r.successRate).toBe(successes / r.allPaths.length)
    expect(r.successRate).toBeGreaterThan(0)
    expect(r.successRate).toBeLessThan(1)
  })
})

describe('runBacktest — FIRE-doel en fireAgeReached', () => {
  const SAVER: FinancialInput = { ...BASE, totalAssets: 0, totalDebts: 0, monthlyIncome: 2_000, monthlyExpenses: 1_000 }

  it('FIRE-doel = jaaruitgaven / SWR; fireAgeReached = huidige leeftijd + eerste jaar ≥ doel', () => {
    const swr = 0.04 // doel = 12.000 / 0,04 = 300.000
    const r = runBacktest(SAVER, 30, swr)
    const currentAge = ageAtDate(SAVER.dateOfBirth!)
    expect(currentAge).toBe(36)
    for (const p of r.allPaths) {
      // Referentie: eerste jaar waarin het ONafgeronde vermogen het doel haalt.
      let nw = 0
      let firstYear: number | null = null
      for (let y = 1; y <= 30; y++) {
        nw = nw * (1 + MSCI_REAL_RETURNS[p.startYear + y - 1]) + 12_000
        if (firstYear === null && nw >= 300_000) firstYear = y
      }
      expect(p.fireAgeReached).toBe(firstYear === null ? null : currentAge + firstYear)
    }
    // Sanity: minstens één pad haalt 300k binnen 30 jaar bij €12k/jaar inleg.
    expect(r.allPaths.some((p) => p.fireAgeReached !== null)).toBe(true)
  })

  it('zonder override geldt NL_SWR (afgeleide constante, geen vaste 4%)', () => {
    const viaDefault = runBacktest(SAVER, 30)
    const viaExplicit = runBacktest(SAVER, 30, NL_SWR)
    expect(viaDefault.allPaths.map((p) => p.fireAgeReached)).toEqual(viaExplicit.allPaths.map((p) => p.fireAgeReached))
    // Lagere SWR → hoger doel → nooit eerder dan bij 4%.
    const via4 = runBacktest(SAVER, 30, 0.04)
    expect(NL_SWR).toBeLessThan(0.04)
    viaDefault.allPaths.forEach((p, i) => {
      const at4 = via4.allPaths[i].fireAgeReached
      if (p.fireAgeReached !== null && at4 !== null) expect(p.fireAgeReached).toBeGreaterThanOrEqual(at4)
      if (p.fireAgeReached !== null) expect(at4).not.toBeNull()
    })
  })

  it('geen geboortedatum → geen leeftijd-as → fireAgeReached null op elk pad', () => {
    const r = runBacktest({ ...SAVER, dateOfBirth: null }, 30, 0.04)
    expect(r.allPaths.every((p) => p.fireAgeReached === null)).toBe(true)
  })

  it('uitgaven 0 → FIRE-doel 0 → geen kruising (null), maar wel een slaagkans', () => {
    const r = runBacktest({ ...SAVER, monthlyExpenses: 0 }, 30, 0.04)
    expect(r.allPaths.every((p) => p.fireAgeReached === null)).toBe(true)
    expect(r.successRate).toBe(1)
  })
})

describe('runBacktest — named paths, extremen en banden', () => {
  it('named paths = de NAMED_PERIODS waarvan het startjaar binnen de horizon past, in catalogusvolgorde', () => {
    const r30 = runBacktest(BASE, 30) // max startjaar 1994 → oliecrisis (1973) + stagflatie (1979)
    expect(r30.namedPaths.map((p) => p.startYear)).toEqual([1973, 1979])
    expect(r30.namedPaths.map((p) => p.label)).toEqual(['Oliecrisis', 'Stagflatie'])

    const r10 = runBacktest(BASE, 10) // max startjaar 2014 → alle vijf
    expect(r10.namedPaths.map((p) => p.startYear)).toEqual(NAMED_PERIODS.map((p) => p.startYear))
    for (const np of r10.namedPaths) {
      const period = NAMED_PERIODS.find((p) => p.startYear === np.startYear)!
      expect(np.label).toBe(period.label)
      expect(np.description).toBe(period.description)
      expect(np.color).toBe(period.color)
    }
    // Niet-genoemde startjaren dragen geen label.
    expect(r10.allPaths.find((p) => p.startYear === 1985)!.label).toBeUndefined()
  })

  it('worst/mediaan/best zijn gesorteerd op eindwaarde; mediaan = element floor(n/2)', () => {
    const r = runBacktest(BASE, 30)
    const finals = r.allPaths.map((p) => p.values[30]).sort((a, b) => a - b)
    expect(r.worstCase.values[30]).toBe(finals[0])
    expect(r.bestCase.values[30]).toBe(finals[finals.length - 1])
    expect(r.medianPath.values[30]).toBe(finals[Math.floor(finals.length / 2)])
    expect(r.worstCase.values[30]).toBeLessThanOrEqual(r.medianPath.values[30])
    expect(r.medianPath.values[30]).toBeLessThanOrEqual(r.bestCase.values[30])
  })

  it('banden: jaren+1 lang, min ≤ P25 ≤ P75 ≤ max, en op jaar 0 allemaal het startvermogen', () => {
    const r = runBacktest(BASE, 30)
    for (const band of [r.bandMin, r.bandP25, r.bandP75, r.bandMax]) expect(band).toHaveLength(31)
    expect([r.bandMin[0], r.bandP25[0], r.bandP75[0], r.bandMax[0]]).toEqual([200_000, 200_000, 200_000, 200_000])
    for (let y = 0; y <= 30; y++) {
      const vals = r.allPaths.map((p) => p.values[y]).sort((a, b) => a - b)
      expect(r.bandMin[y]).toBe(vals[0])
      expect(r.bandMax[y]).toBe(vals[vals.length - 1])
      expect(r.bandP25[y]).toBe(vals[Math.floor(vals.length * 0.25)])
      expect(r.bandP75[y]).toBe(vals[Math.floor(vals.length * 0.75)])
      expect(r.bandMin[y]).toBeLessThanOrEqual(r.bandP25[y])
      expect(r.bandP25[y]).toBeLessThanOrEqual(r.bandP75[y])
      expect(r.bandP75[y]).toBeLessThanOrEqual(r.bandMax[y])
    }
  })

  it('huidig gedrag (bevinding BT-1): horizon langer dan de dataset (≥ 55 jaar) → geen paden, slaagkans 0', () => {
    // 2024 − 55 < 1970: geen enkel startjaar. De motor guardt dit niet; worst/median/best
    // zijn dan runtime undefined ondanks het type. Vastgelegd als karakterisering.
    const r = runBacktest(BASE, 55)
    expect(r.allPaths).toEqual([])
    expect(r.namedPaths).toEqual([])
    expect(r.successRate).toBe(0)
    expect(r.bandMin).toHaveLength(56)
    expect(r.bandMin.every((v) => v === 0)).toBe(true)
  })
})
