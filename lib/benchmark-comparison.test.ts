import { describe, it, expect } from 'vitest'
import {
  buildPortfolioHistory,
  clipBenchmarkSeries,
  compareToBenchmarks,
  computeTwrSeries,
  benchmarkInterval,
  resolvePeriodStart,
  TIME_PERIODS,
  type BenchmarkDataPoint,
  type BenchmarkId,
  type HoldingSnapshot,
} from './benchmark-comparison'

/**
 * Regressie bij testbug-ffa902 (/core/assets/holdings — benchmarkvergelijking).
 *
 * Twee defecten, allebei hier vastgepind:
 *   1. Het benchmarkvenster volgde de periodekeuze niet — een "1J"-selectie
 *      toonde het indexrendement sinds de eerste aankoop (~3 jaar), met een
 *      X-as en een alpha die daarbij hoorden.
 *   2. Het "portfoliorendement" was de groei van de INLEG: elke historische
 *      maand werd tegen de koers van vandaag gewaardeerd en de "TWR" was
 *      simpelweg V_eind/V_start − 1.
 *
 * De module had nul tests; dit bestand is de dekking waarmee de fix bewezen is.
 */

const PERIOD = (id: string) => TIME_PERIODS.find(p => p.id === id)!

/** Vaste "nu" zodat vensters en snapshots deterministisch zijn. */
const NOW = new Date(2026, 7, 15) // 15 augustus 2026 (lokale tijd)

function dateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Laatste dag van de maand die `monthsBack` maanden vóór NOW ligt. */
function monthEndAgo(monthsBack: number): string {
  return dateStr(new Date(NOW.getFullYear(), NOW.getMonth() - monthsBack + 1, 0))
}

/**
 * Benchmarkreeks van 36 maandpunten, genormaliseerd op 100 bij het eerste punt
 * (zoals Yahoo hem oplevert). De eerste 24 maanden verdrievoudigen de index,
 * de laatste 12 doen precies +12,0%.
 */
function benchSeries(): BenchmarkDataPoint[] {
  const points: BenchmarkDataPoint[] = []
  for (let i = 35; i >= 0; i--) {
    const d = new Date(NOW.getFullYear(), NOW.getMonth() - i, 1)
    // maand 0..23: lineair 100 → 300; maand 24..35: 300 → 336 (+12%)
    const idx = 35 - i
    const value = idx <= 23 ? 100 + (200 * idx) / 23 : 300 + (36 * (idx - 23)) / 12
    points.push({ date: dateStr(d), value: Math.round(value * 100) / 100 })
  }
  return points
}

function realData(points: BenchmarkDataPoint[]): Map<BenchmarkId, BenchmarkDataPoint[] | null> {
  return new Map<BenchmarkId, BenchmarkDataPoint[] | null>([
    ['aex', points],
    ['msci_world', points],
    ['sp500', points],
  ])
}

/** Snapshot-fabriek: standaard mét koersobservatie en zonder kasstroom. */
function snap(overrides: Partial<HoldingSnapshot> & { date: string; totalValue: number }): HoldingSnapshot {
  return {
    totalCost: overrides.totalValue,
    netFlow: 0,
    pricedFromHistory: true,
    ...overrides,
  }
}

describe('resolvePeriodStart — één venster voor route en motor', () => {
  it('rekent maanden terug vanaf nu voor de vaste perioden', () => {
    expect(dateStr(resolvePeriodStart(PERIOD('1y'), '2023-09-30', NOW))).toBe('2025-08-15')
    expect(dateStr(resolvePeriodStart(PERIOD('3m'), '2023-09-30', NOW))).toBe('2026-05-15')
  })

  it('start YTD op 1 januari en Alles bij de eerste snapshot', () => {
    expect(dateStr(resolvePeriodStart(PERIOD('ytd'), '2023-09-30', NOW))).toBe('2026-01-01')
    expect(dateStr(resolvePeriodStart(PERIOD('all'), '2023-09-30', NOW))).toBe('2023-09-30')
  })
})

describe('clipBenchmarkSeries — knippen én hernormaliseren', () => {
  it('start op 100 bij het eerste punt binnen het venster', () => {
    const clipped = clipBenchmarkSeries(benchSeries(), monthEndAgo(12))
    expect(clipped[0].value).toBe(100)
    expect(clipped.every(p => p.date >= monthEndAgo(12))).toBe(true)
  })

  it('geeft niets terug bij minder dan twee punten in het venster', () => {
    expect(clipBenchmarkSeries(benchSeries(), '2030-01-01')).toEqual([])
    expect(clipBenchmarkSeries(null, '2020-01-01')).toEqual([])
  })
})

describe('compareToBenchmarks — het venster volgt de periodekeuze', () => {
  // Portfolio met échte maandwaarderingen over 36 maanden, koers vlak.
  const snapshots: HoldingSnapshot[] = Array.from({ length: 36 }, (_, i) =>
    snap({ date: monthEndAgo(35 - i), totalValue: 1000 }),
  )

  it('rekent bij 1J het rendement van dát jaar, niet van de hele historie', () => {
    const series = benchSeries()
    const result = compareToBenchmarks(snapshots, PERIOD('1y'), realData(series), NOW)!
    const aex = result.benchmarks.find(b => b.id === 'aex')!

    // Verwacht = het rendement van precies de punten binnen het venster. De
    // fixture zet maandpunten op de 1e; een venster dat halverwege de maand
    // begint pakt dus vanaf de vólgende maandbar (in productie dekt het
    // fijnere interval van `benchmarkInterval` dat af).
    const inWindow = series.filter(p => p.date >= result.windowStart)
    const expected = (inWindow[inWindow.length - 1].value / inWindow[0].value - 1) * 100
    expect(aex.returnPct).toBeCloseTo(expected, 2)
    expect(aex.dataSource).toBe('yahoo_finance')

    // En het onderscheid dat de kaart aanwijst: het defect gaf hier het
    // rendement van de VOLLEDIGE reeks (>200%) bij een 1J-selectie.
    const fullHistory = (series[series.length - 1].value / series[0].value - 1) * 100
    expect(fullHistory).toBeGreaterThan(200)
    expect(aex.returnPct).toBeLessThan(fullHistory / 10)
  })

  it('laat geen benchmark-datapunt vóór de vensterstart staan', () => {
    const result = compareToBenchmarks(snapshots, PERIOD('1y'), realData(benchSeries()), NOW)!
    const aex = result.benchmarks.find(b => b.id === 'aex')!

    expect(aex.dataPoints.every(p => p.date >= result.windowStart)).toBe(true)
    // 36 punten was de X-as van de melding; een jaarvenster hoort er ~13 te tonen.
    expect(aex.dataPoints.length).toBeLessThanOrEqual(14)
    expect(aex.dataPoints.length).toBeGreaterThanOrEqual(12)
  })

  it('geeft per periode een ander benchmarkrendement', () => {
    const perPeriod = ['3m', '6m', '1y', 'all'].map(id => {
      const r = compareToBenchmarks(snapshots, PERIOD(id), realData(benchSeries()), NOW)!
      return r.benchmarks.find(b => b.id === 'aex')!.returnPct
    })
    expect(new Set(perPeriod).size).toBe(perPeriod.length)
    // 'all' is het grootste venster en dus het hoogste rendement in deze reeks.
    expect(perPeriod[3]).toBeGreaterThan(perPeriod[2])
  })

  it('knipt ook de portfolio-snapshots op hetzelfde venster', () => {
    const result = compareToBenchmarks(snapshots, PERIOD('6m'), realData(benchSeries()), NOW)!
    expect(result.windowFallback).toBe(false)
    expect(result.portfolio.dataPoints.every(p => p.date >= result.windowStart)).toBe(true)
  })

  it('meldt het als er te weinig snapshots in de periode zitten', () => {
    const short = [snap({ date: '2024-01-31', totalValue: 1000 }), snap({ date: '2024-02-29', totalValue: 1100 })]
    const result = compareToBenchmarks(short, PERIOD('1m'), realData(benchSeries()), NOW)!
    expect(result.windowFallback).toBe(true)
    expect(result.windowStart).toBe('2024-01-31')
  })
})

describe('compareToBenchmarks — alpha', () => {
  // Portefeuille die elke maand 1% in waarde stijgt, zonder kasstromen.
  const snapshots: HoldingSnapshot[] = Array.from({ length: 36 }, (_, i) =>
    snap({ date: monthEndAgo(35 - i), totalValue: 1000 * 1.01 ** i }),
  )

  it('trekt portfolio en benchmark uit hetzelfde venster van elkaar af', () => {
    const result = compareToBenchmarks(snapshots, PERIOD('1y'), realData(benchSeries()), NOW)!
    for (const b of result.benchmarks) {
      expect(b.alpha).toBeCloseTo(result.portfolio.returnPct! - b.returnPct, 5)
    }
  })

  it('laat de alpha weg zodra het portfoliorendement niet meetbaar is', () => {
    const zonderKoers = snapshots.map(s => ({ ...s, pricedFromHistory: false }))
    const result = compareToBenchmarks(zonderKoers, PERIOD('1y'), realData(benchSeries()), NOW)!
    expect(result.portfolio.returnPct).toBeNull()
    expect(result.portfolio.gap).toBe('no_price_history')
    expect(result.portfolio.dataPoints).toEqual([])
    expect(result.benchmarks.every(b => b.alpha === null)).toBe(true)
    // De indices blijven wél gewoon leesbaar over de juiste periode.
    expect(result.benchmarks.every(b => b.returnPct !== 0)).toBe(true)
  })
})

describe('computeTwrSeries — inleg is geen rendement', () => {
  it('geeft 0% bij drie bijkopen tegen een onveranderde koers', () => {
    const snapshots: HoldingSnapshot[] = [
      snap({ date: '2026-01-31', totalValue: 1000, netFlow: 1000 }),
      snap({ date: '2026-02-28', totalValue: 2000, netFlow: 1000 }),
      snap({ date: '2026-03-31', totalValue: 3000, netFlow: 1000 }),
    ]
    const twr = computeTwrSeries(snapshots)!
    // Het defect maakte hier +200% van ("3000/1000 − 1").
    expect(twr.returnPct).toBe(0)
    expect(twr.indexPoints.map(p => p.value)).toEqual([100, 100, 100])
  })

  it('meet koersbeweging wél, ook als er in dezelfde maand is bijgestort', () => {
    const snapshots: HoldingSnapshot[] = [
      snap({ date: '2026-01-31', totalValue: 1000 }),
      // +1000 gestort en de portefeuille sluit op 2200 → 10% koerswinst.
      snap({ date: '2026-02-28', totalValue: 2200, netFlow: 1000 }),
    ]
    expect(computeTwrSeries(snapshots)!.returnPct).toBeCloseTo(10, 6)
  })

  it('ketent maandrendementen samengesteld', () => {
    const snapshots: HoldingSnapshot[] = [
      snap({ date: '2026-01-31', totalValue: 1000 }),
      snap({ date: '2026-02-28', totalValue: 1100 }),
      snap({ date: '2026-03-31', totalValue: 1210 }),
    ]
    expect(computeTwrSeries(snapshots)!.returnPct).toBeCloseTo(21, 6)
  })

  it('geeft null zodra één maand geen koersobservatie heeft', () => {
    const snapshots: HoldingSnapshot[] = [
      snap({ date: '2026-01-31', totalValue: 1000 }),
      snap({ date: '2026-02-28', totalValue: 1100, pricedFromHistory: false }),
    ]
    expect(computeTwrSeries(snapshots)).toBeNull()
  })

  it('geeft null bij minder dan twee snapshots', () => {
    expect(computeTwrSeries([snap({ date: '2026-01-31', totalValue: 1000 })])).toBeNull()
  })
})

describe('buildPortfolioHistory — kasstroom en koersdekking', () => {
  const holding = {
    id: 'h1',
    units: 30,
    avg_purchase_price: 100,
    current_price: 100,
    purchase_date: '2026-06-10',
    created_at: '2026-06-01T00:00:00.000Z',
  }
  const buys = [
    { holding_id: 'h1', type: 'buy' as const, units: 10, price_per_unit: 100, date: '2026-06-10' },
    { holding_id: 'h1', type: 'buy' as const, units: 10, price_per_unit: 100, date: '2026-07-10' },
    { holding_id: 'h1', type: 'buy' as const, units: 10, price_per_unit: 100, date: '2026-08-10' },
  ]

  it('boekt de aankoop van de maand als kasstroom van die maand', () => {
    const history = buildPortfolioHistory([holding], [], buys, NOW)
    expect(history.map(s => s.netFlow)).toEqual([1000, 1000, 1000])
    expect(history.map(s => s.totalValue)).toEqual([1000, 2000, 3000])
  })

  it('markeert maanden zonder waardering als niet-waarneembaar', () => {
    const history = buildPortfolioHistory([holding], [], buys, NOW)
    // Alleen de lopende maand heeft een echte koers (current_price).
    expect(history.map(s => s.pricedFromHistory)).toEqual([false, false, true])
    // En dus: geen rendement, i.p.v. "+200%".
    expect(computeTwrSeries(history)).toBeNull()
  })

  it('levert wél een rendement zodra elke maand een waardering heeft', () => {
    const valuations = [
      { entity_id: 'h1', entity_type: 'holding', value: 1000, valuation_date: '2026-06-30' },
      { entity_id: 'h1', entity_type: 'holding', value: 2000, valuation_date: '2026-07-31' },
    ]
    const history = buildPortfolioHistory([holding], valuations, buys, NOW)
    expect(history.every(s => s.pricedFromHistory)).toBe(true)
    // Drie stortingen tegen dezelfde koers → 0% rendement.
    expect(computeTwrSeries(history)!.returnPct).toBe(0)
  })

  it('vult maanden vóór de eerste transactie niet met de stukken van vandaag', () => {
    const laat = {
      ...holding,
      purchase_date: '2026-06-10',
      units: 30,
    }
    const alleenAugustus = [buys[2]]
    const history = buildPortfolioHistory([laat], [], alleenAugustus, NOW)
    // Juni en juli bestonden nog niet in het transactieboek → geen snapshot.
    expect(history).toHaveLength(1)
    expect(history[0].totalValue).toBe(1000)
  })
})

describe('benchmarkInterval — dichtheid volgt het venster', () => {
  it('kiest een fijner interval naarmate het venster korter is', () => {
    const end = NOW
    const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000)
    expect(benchmarkInterval(daysAgo(30), end)).toBe('1d')
    expect(benchmarkInterval(daysAgo(200), end)).toBe('1wk')
    expect(benchmarkInterval(daysAgo(1200), end)).toBe('1mo')
  })
})
