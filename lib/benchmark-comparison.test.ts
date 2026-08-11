import { describe, it, expect } from 'vitest'
import {
  buildPortfolioHistory,
  clipBenchmarkSeries,
  compareToBenchmarks,
  computeTwrSeries,
  computeTwrOutcome,
  benchmarkInterval,
  resolveComparisonWindow,
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

/**
 * Snapshot-fabriek: standaard een volledig waarneembare maand zonder kasstroom.
 *
 * `observedValue`/`observedNetFlow` volgen standaard de totalen — dat is de
 * situatie "élke positie noteert". Een test die een blinde vlek wil, zet ze
 * expliciet; dat is precies het onderscheid dat de motor maakt.
 */
function snap(overrides: Partial<HoldingSnapshot> & { date: string; totalValue: number }): HoldingSnapshot {
  const netFlow = overrides.netFlow ?? 0
  return {
    totalCost: overrides.totalValue,
    netFlow,
    pricedFromHistory: true,
    observedValue: overrides.totalValue,
    observedNetFlow: netFlow,
    ...overrides,
  }
}

/** Maand zonder énige koersobservatie: het mandje is leeg. */
function blindSnap(
  overrides: Partial<HoldingSnapshot> & { date: string; totalValue: number },
): HoldingSnapshot {
  return snap({ ...overrides, pricedFromHistory: false, observedValue: 0, observedNetFlow: 0 })
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

  // Given een terugval op de volledige historie (te weinig snapshots in de
  // periode); When de route bepaalt vanaf welke datum hij de indexreeks ophaalt;
  // Then is dat exact het venster dat de motor gebruikt. Zonder deze binding
  // haalde de route drie maanden index op naast dertig maanden portfolio en
  // heette het verschil "alpha" (F2).
  it('geeft de route hetzelfde teruggevallen venster als de motor gebruikt', () => {
    const short = [snap({ date: '2024-01-31', totalValue: 1000 }), snap({ date: '2024-02-29', totalValue: 1100 })]
    const window = resolveComparisonWindow(short, PERIOD('3m'), NOW)
    const result = compareToBenchmarks(short, PERIOD('3m'), realData(benchSeries()), NOW)!

    expect(window.windowFallback).toBe(true)
    expect(window.windowStart).toBe(result.windowStart)
    // En de periode-start (die de route vóór de fix gebruikte) ligt er ruim ná.
    const periodeStart = dateStr(resolvePeriodStart(PERIOD('3m'), short[0].date, NOW))
    expect(periodeStart > window.windowStart).toBe(true)
  })

  // Given een portefeuille waarvan de koershistorie pas halverwege het venster
  // begint; When er vergeleken wordt; Then meten portfolio én index vanaf dat
  // punt, en meldt het resultaat dat het venster is ingekort.
  it('knipt het venster tot waar de koershistorie begint, ook voor de indices', () => {
    const snapshots: HoldingSnapshot[] = [
      ...Array.from({ length: 9 }, (_, i) => blindSnap({ date: monthEndAgo(12 - i), totalValue: 1000 })),
      snap({ date: monthEndAgo(3), totalValue: 1000, observedNetFlow: 1000 }),
      snap({ date: monthEndAgo(2), totalValue: 1050 }),
      snap({ date: monthEndAgo(1), totalValue: 1100 }),
    ]
    const result = compareToBenchmarks(snapshots, PERIOD('1y'), realData(benchSeries()), NOW)!

    expect(result.windowClipped).toBe(true)
    expect(result.windowStart).toBe(monthEndAgo(3))
    expect(result.portfolio.returnPct).toBeCloseTo(10, 6)
    for (const b of result.benchmarks) {
      expect(b.dataPoints.every(p => p.date >= result.windowStart)).toBe(true)
    }
  })

  // Regressie (F12): snapshots landen op maandeinden, requestedStart is "nu min
  // N maanden" — een dag midden in de maand. Zonder koershistorie-gat mag dat
  // roosterverschil windowClipped niet naar true duwen: anders meldt elke vaste
  // periode ten onrechte "koershistorie begint later" terwijl de dekking
  // volledig is.
  it('meldt geen clipping puur door het snapshot-rooster t.o.v. een periode-start midden in de maand', () => {
    const volledig: HoldingSnapshot[] = Array.from({ length: 24 }, (_, i) =>
      snap({ date: monthEndAgo(23 - i), totalValue: 1000 * 1.01 ** i }),
    )
    for (const id of ['1m', '3m', '6m', '1y', 'ytd'] as const) {
      const result = compareToBenchmarks(volledig, PERIOD(id), realData(benchSeries()), NOW)!
      expect(result.windowClipped).toBe(false)
    }
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
    const zonderKoers = snapshots.map(s =>
      ({ ...s, pricedFromHistory: false, observedValue: 0, observedNetFlow: 0 }),
    )
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

  it('geeft null zodra geen enkele maand een koersobservatie heeft', () => {
    const snapshots: HoldingSnapshot[] = [
      blindSnap({ date: '2026-01-31', totalValue: 1000 }),
      blindSnap({ date: '2026-02-28', totalValue: 1100 }),
    ]
    expect(computeTwrSeries(snapshots)).toBeNull()
    expect(computeTwrOutcome(snapshots)).toEqual({ ok: false, gap: 'no_price_history' })
  })

  it('geeft null bij minder dan twee snapshots', () => {
    expect(computeTwrSeries([snap({ date: '2026-01-31', totalValue: 1000 })])).toBeNull()
  })

  // Given één onnoteerbare positie (turbo, delisting) naast noterende posities;
  // When het rendement wordt berekend;
  // Then meet de motor het noterende deel i.p.v. het hele venster te blokkeren.
  // Dit is F1 na de release: op productie blankte één positie van €289 — 1% van
  // de waarde — het rendement van een portefeuille van €27.925.
  it('meet het waarneembare deel door, ook als één positie niet noteert', () => {
    const snapshots: HoldingSnapshot[] = [
      snap({ date: '2026-01-31', totalValue: 1289, observedValue: 1000, observedNetFlow: 1000 }),
      snap({
        date: '2026-02-28',
        totalValue: 1389,
        pricedFromHistory: false,
        observedValue: 1100,
        observedNetFlow: 0,
      }),
    ]
    const outcome = computeTwrOutcome(snapshots)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.series.returnPct).toBeCloseTo(10, 6)
    // En het contract zegt hóé hard dat getal is: de dunste maand telt
    // (1000/1289 in januari, tegen 1100/1389 in februari).
    expect(outcome.series.observedShare).toBeCloseTo(1000 / 1289, 4)
  })

  // Given een positie die pas halverwege het venster een koersbron krijgt
  // (de dagelijkse cron begon in mei);
  // When de meting loopt;
  // Then telt haar intrede als kasstroom, niet als koerswinst.
  it('boekt een positie die het mandje instapt als inleg, niet als rendement', () => {
    const snapshots: HoldingSnapshot[] = [
      snap({ date: '2026-01-31', totalValue: 2000, observedValue: 1000, observedNetFlow: 1000 }),
      // Tweede positie (€900) wordt nu ook waarneembaar; de eerste staat stil.
      snap({ date: '2026-02-28', totalValue: 2000, observedValue: 1900, observedNetFlow: 900 }),
    ]
    // Zonder de instroomboeking zou dit 1900/1000 − 1 = +90% zijn geweest.
    expect(computeTwrSeries(snapshots)!.returnPct).toBe(0)
  })

  // Given een venster waarvan de eerste maanden geen enkele koersbron hebben;
  // When de meting loopt;
  // Then begint hij bij de eerste waarneming en meldt hij dat via `measuredFrom`
  // — de blinde maanden zijn geen 0%-rendement.
  it('begint de meting bij de eerste waarneming, niet bij de eerste maand', () => {
    const snapshots: HoldingSnapshot[] = [
      blindSnap({ date: '2026-01-31', totalValue: 1000 }),
      blindSnap({ date: '2026-02-28', totalValue: 1000 }),
      snap({ date: '2026-03-31', totalValue: 1000, observedNetFlow: 1000 }),
      snap({ date: '2026-04-30', totalValue: 1200 }),
    ]
    const series = computeTwrSeries(snapshots)!
    expect(series.measuredFrom).toBe('2026-03-31')
    expect(series.indexPoints.map(p => p.date)).toEqual(['2026-03-31', '2026-04-30'])
    expect(series.returnPct).toBeCloseTo(20, 6)
  })

  // Given een portefeuille die volledig verkocht wordt en later terugkeert;
  // When het rendement wordt berekend;
  // Then is een maand zonder kapitaal 0%, geen −50%. (F3/F6)
  it('leest een volledige verkoop als 0%, niet als een halvering', () => {
    const snapshots: HoldingSnapshot[] = [
      snap({ date: '2026-01-31', totalValue: 1000, observedNetFlow: 1000 }),
      // Alles verkocht: waarde 0, uitstroom −1000.
      snap({ date: '2026-02-28', totalValue: 0, observedValue: 0, observedNetFlow: -1000 }),
      snap({ date: '2026-03-31', totalValue: 0, observedValue: 0, observedNetFlow: 0 }),
      // Herkoop tegen dezelfde koers.
      snap({ date: '2026-04-30', totalValue: 1000, observedNetFlow: 1000 }),
    ]
    // Het defect maakte hier −50% van: de verkoopmaand viel weg en de keten
    // knoopte januari rechtstreeks aan april, met de kasstromen buiten beeld.
    expect(computeTwrSeries(snapshots)!.returnPct).toBe(0)
  })

  // Given een opname die groter is dan de stand aan het begin van de maand;
  // When het rendement wordt berekend;
  // Then weigert de motor het venster met een eigen reden. (F6, was ongetest)
  it('weigert een venster waarin meer is opgenomen dan er stond', () => {
    const snapshots: HoldingSnapshot[] = [
      snap({ date: '2026-01-31', totalValue: 1000, observedNetFlow: 1000 }),
      snap({ date: '2026-02-28', totalValue: 100, observedValue: 100, observedNetFlow: -1500 }),
    ]
    expect(computeTwrOutcome(snapshots)).toEqual({ ok: false, gap: 'unmeasurable_window' })
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

  // Given een portefeuille waarvan de dagkoersen in `investment_holding_prices`
  // staan en `valuations` (zoals bij elk echt account) leeg is;
  // When de historie wordt opgebouwd;
  // Then is élke maand waarneembaar en levert het rendement een lijn op — de
  // situatie waarin de grafiek "Je eigen lijn ontbreekt nog" meldde.
  it('waardeert op de dagelijkse slotkoersen, ook zonder één enkele valuation-rij', () => {
    const dagkoersen = [
      { holding_id: 'h1', date: '2026-06-30', close_price: 110 },
      { holding_id: 'h1', date: '2026-07-31', close_price: 120 },
      { holding_id: 'h1', date: '2026-08-31', close_price: 130 },
    ]
    const history = buildPortfolioHistory([holding], [], buys, NOW, dagkoersen)

    expect(history.every(s => s.pricedFromHistory)).toBe(true)
    expect(history.map(s => s.totalValue)).toEqual([1100, 2400, 3900])
    expect(computeTwrSeries(history)).not.toBeNull()
  })

  it('pakt de laatste slotkoers vóór het maandeinde, niet een latere', () => {
    const dagkoersen = [
      { holding_id: 'h1', date: '2026-06-26', close_price: 110 }, // vrijdag vóór maandeinde
      { holding_id: 'h1', date: '2026-07-31', close_price: 120 },
      { holding_id: 'h1', date: '2026-09-15', close_price: 999 }, // ná NOW — mag nooit meetellen
    ]
    const history = buildPortfolioHistory([holding], [], buys, NOW, dagkoersen)

    expect(history[0].totalValue).toBe(1100)
    // Augustus heeft geen eigen koers meer; de laatste bekende (juli) geldt.
    expect(history[2].totalValue).toBe(3600)
  })

  it('negeert onbruikbare koersrijen (nul, negatief, niet-numeriek)', () => {
    const rommel = [
      { holding_id: 'h1', date: '2026-06-30', close_price: 0 },
      { holding_id: 'h1', date: '2026-07-31', close_price: -5 },
      { holding_id: 'h1', date: '2026-08-31', close_price: 'n/a' },
    ]
    const history = buildPortfolioHistory([holding], [], buys, NOW, rommel)
    // Terugval op het oude gedrag: alleen de lopende maand is waarneembaar.
    expect(history.map(s => s.pricedFromHistory)).toEqual([false, false, true])
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

  // Given een echte portefeuille: één noterende positie naast één turbo die
  // Yahoo niet kan oplossen (op productie 13 van de 14 open posities noteert);
  // When de historie wordt opgebouwd;
  // Then blijft de turbo buiten het gemeten mandje maar blokkeert hij het
  // rendement niet meer, en meldt de dekking hoeveel waarde eronder ligt.
  it('meet door bij een gemengde portefeuille en meldt de dekking', () => {
    const turbo = {
      id: 'h2',
      units: 10,
      avg_purchase_price: 30,
      current_price: 30,
      purchase_date: '2026-06-10',
      created_at: '2026-06-01T00:00:00.000Z',
    }
    const turboBuys = [
      { holding_id: 'h2', type: 'buy' as const, units: 10, price_per_unit: 30, date: '2026-06-10' },
    ]
    const dagkoersen = [
      { holding_id: 'h1', date: '2026-06-30', close_price: 100 },
      { holding_id: 'h1', date: '2026-07-31', close_price: 110 },
      { holding_id: 'h1', date: '2026-08-14', close_price: 121 },
    ]
    const history = buildPortfolioHistory(
      [holding, turbo],
      [],
      [...buys, ...turboBuys],
      NOW,
      dagkoersen,
    )

    // De turbo drukt de dekking, maar zet de maand niet meer op onmeetbaar.
    expect(history.every(s => s.pricedFromHistory)).toBe(false)
    expect(history.every(s => s.observedValue > 0)).toBe(true)

    const outcome = computeTwrOutcome(history)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    // Juli: 2200 / (1000 + 1000 inleg) = +10%.
    // Augustus: de turbo stapt het mandje in via `current_price` en telt als
    // instroom (300), dus 3930 / (2200 + 1000 + 300) = +12,29%.
    expect(outcome.series.returnPct).toBeCloseTo(23.51, 2)

    // De dekking is de ZWAKSTE maand, niet de laatste: in juni/juli stond de
    // turbo (10 × €30) buiten beeld. Juni is het dunst: 1000 / 1300.
    expect(outcome.series.observedShare).toBeCloseTo(1000 / 1300, 4)
  })

  // Given een portefeuille die in maart volledig verkocht wordt en in mei
  // terugkeert tegen dezelfde koers;
  // When de historie wordt opgebouwd;
  // Then verdwijnt de verkoopmaand niet uit de keten (F3).
  it('houdt de maand van een volledige verkoop in de reeks', () => {
    const positie = {
      id: 'h1',
      units: 0,
      avg_purchase_price: 100,
      current_price: 100,
      purchase_date: '2026-06-10',
      created_at: '2026-06-01T00:00:00.000Z',
    }
    const txs = [
      { holding_id: 'h1', type: 'buy' as const, units: 10, price_per_unit: 100, date: '2026-06-10' },
      { holding_id: 'h1', type: 'sell' as const, units: 10, price_per_unit: 100, date: '2026-07-10' },
    ]
    const dagkoersen = [
      { holding_id: 'h1', date: '2026-06-30', close_price: 100 },
      { holding_id: 'h1', date: '2026-07-31', close_price: 100 },
      { holding_id: 'h1', date: '2026-08-14', close_price: 100 },
    ]
    const history = buildPortfolioHistory([positie], [], txs, NOW, dagkoersen)

    // Juni (gekocht), juli (leeg na verkoop), augustus (nog steeds leeg).
    expect(history.map(s => s.date.substring(0, 7))).toEqual(['2026-06', '2026-07', '2026-08'])
    expect(history[1].totalValue).toBe(0)
    // De verkoop verlaat het mandje als kasstroom, niet als koersverlies.
    expect(history[1].observedNetFlow).toBe(-1000)
    expect(computeTwrSeries(history)!.returnPct).toBe(0)
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
