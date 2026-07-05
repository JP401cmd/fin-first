/**
 * Unit-snapshots voor `buildSimChartGeometry` (AC-1a van de refactor-kaart
 * "Toekomst-grafiek: geometrie en Monte-Carlo-banden niet meer per muisbeweging
 * herbouwen").
 *
 * Doel: de pure geometrie-bouwer levert exact dezelfde d-strings, tick-arrays
 * en fase/FIRE/AOW-punten als de vorige inline-render-body van `sim-chart.tsx`.
 * De inline-snapshots vergrendelen die output zodat toekomstige drift (bv. een
 * onvolledige memo-dep of een gewijzigde formule) direct zichtbaar wordt.
 */
import { describe, it, expect } from 'vitest'
import { buildSimChartGeometry, type SimChartGeometryInput } from './sim-chart-geometry'
import type { SimRow } from '@/lib/fire-simulation'
import type { ChartEventOverlay } from '@/lib/chart-event-overlay'

// ── Fixtures ──────────────────────────────────────────────────────────────

function makeRow(
  age: number,
  startPortfolio: number,
  o: Partial<SimRow> & { endPortfolio: number },
): SimRow {
  return {
    age,
    phase: o.phase ?? 'accumulation',
    startPortfolio,
    growth: o.growth ?? 0,
    savings: o.savings ?? 0,
    withdrawal: o.withdrawal ?? 0,
    cashflowNet: o.cashflowNet ?? 0,
    oneTimeNet: o.oneTimeNet ?? 0,
    endPortfolio: o.endPortfolio,
    grossIncome: o.grossIncome ?? 0,
    grossExpenses: o.grossExpenses ?? 0,
    flowIn: o.flowIn ?? 0,
    flowOut: o.flowOut ?? 0,
  }
}

/** Deterministische rijen: 5% groei, sparen tot retireAge, daarna onttrekken. */
function buildRows(
  startAge: number,
  endAge: number,
  opts: { initial?: number; retireAge?: number; savings?: number; withdrawal?: number } = {},
): SimRow[] {
  const rows: SimRow[] = []
  let p = opts.initial ?? 100000
  const retireAge = opts.retireAge ?? endAge
  for (let age = startAge; age < endAge; age++) {
    const phase = age >= retireAge ? 'retirement' : 'accumulation'
    const growth = Math.round(p * 0.05)
    const savings = phase === 'accumulation' ? (opts.savings ?? 15000) : 0
    const withdrawal = phase === 'retirement' ? (opts.withdrawal ?? 30000) : 0
    const endPortfolio = p + growth + savings - withdrawal
    rows.push(makeRow(age, p, { phase, growth, savings, withdrawal, endPortfolio }))
    p = endPortfolio
  }
  return rows
}

const baseInput: SimChartGeometryInput = {
  rows: buildRows(40, 65, { retireAge: 58 }),
  fireAge: 58,
  fireAgeFractional: 58.3,
  currentAge: 40,
  endAge: 65,
  fireTarget: 800000,
  strategy: 'deplete',
  targetEndPortfolio: 0,
  planningMode: 'fire',
  containerW: 600,
}

// ── Basis-scenario ──────────────────────────────────────────────────────────

describe('buildSimChartGeometry — basis', () => {
  const g = buildSimChartGeometry(baseInput)

  it('afmetingen en assen', () => {
    expect(g.W).toBe(600)
    expect(g.isDesktop).toBe(false)
    expect(g.PAD).toEqual({ top: 16, right: 16, bottom: 28, left: 60 })
    expect(g.innerW).toBe(524)
    expect(g.H).toBe(220)
    expect(g.minAge).toBe(40)
    expect(g.maxAge).toBe(65)
    expect(g.yTicks).toHaveLength(4)
    expect(g.xTickAges).toMatchInlineSnapshot(`
      [
        40,
        45,
        50,
        55,
        60,
        65,
      ]
    `)
  })

  it('hoofdlijn-paden (opbouw/afbouw) zijn byte-stabiel', () => {
    expect(g.accPath).toMatchInlineSnapshot(`"M 60.0 171.6 L 81.0 167.6 L 101.9 163.3 L 122.9 158.8 L 143.8 154.1 L 164.8 149.1 L 185.8 143.9 L 206.7 138.5 L 227.7 132.7 L 248.6 126.7 L 269.6 120.4 L 290.6 113.7 L 311.5 106.8 L 332.5 99.5 L 353.4 91.8 L 374.4 83.7 L 395.4 75.2 L 416.3 66.4 L 437.3 57.0 L 443.6 54.2"`)
    expect(g.decPath).toMatchInlineSnapshot(`"M 443.6 54.2 L 458.2 56.4 L 479.2 55.7 L 500.2 55.0 L 521.1 54.3 L 542.1 53.5 L 563.0 52.7 L 584.0 51.8"`)
    expect(g.allPath).toBeNull() // FIRE bereikbaar → gesplitste lijn, geen grijze
  })

  it('fase-split + FIRE-punt', () => {
    expect(g.splitFractionalAge).toBe(58.3)
    expect(g.xFire).toMatchInlineSnapshot(`443.5679999999999`)
    expect(g.yFireDot).toMatchInlineSnapshot(`54.21414259259262`)
    expect(g.isPensioenMode).toBe(false)
  })

  it('kleuren volgen de deplete-strategie', () => {
    expect(g.mainStrokeAcc).toBe('var(--hor-t, #8a6e42)')
    expect(g.mainStrokeDec).toBe('var(--kern-t, #58362d)')
  })
})

// ── What-if: MC + scenario + baseline ────────────────────────────────────────

describe('buildSimChartGeometry — what-if (MC + scenario + baseline)', () => {
  const mcYears = 26 // startAge 40 t/m 65
  const mc = {
    startAge: 40,
    p10: Array.from({ length: mcYears }, (_, i) => 100000 + i * 8000),
    p25: Array.from({ length: mcYears }, (_, i) => 100000 + i * 10000),
    p50: Array.from({ length: mcYears }, (_, i) => 100000 + i * 13000),
    p75: Array.from({ length: mcYears }, (_, i) => 100000 + i * 16000),
    p90: Array.from({ length: mcYears }, (_, i) => 100000 + i * 20000),
  }
  const g = buildSimChartGeometry({
    ...baseInput,
    baselineRows: buildRows(40, 65, { retireAge: 60, savings: 12000 }),
    scenarioOverlays: [
      { name: 'pessimist', label: 'Voorzichtig', color: '#9e6b50', points: [[40, 100000], [50, 300000], [60, 700000], [65, 500000]] },
      { name: 'optimist', label: 'Optimistisch', color: '#5b8c5a', points: [[40, 100000], [50, 400000], [60, 900000], [65, 800000]] },
    ],
    monteCarloOverlay: mc,
  })

  it('baseline-pad', () => {
    expect(g.baselinePath).toMatchInlineSnapshot(`"M 60.0 173.9 L 81.0 170.8 L 101.9 167.6 L 122.9 164.2 L 143.8 160.6 L 164.8 156.9 L 185.8 153.0 L 206.7 148.8 L 227.7 144.5 L 248.6 140.0 L 269.6 135.2 L 290.6 130.2 L 311.5 124.9 L 332.5 119.4 L 353.4 113.6 L 374.4 107.5 L 395.4 101.1 L 416.3 94.4 L 437.3 87.3 L 458.2 79.9 L 479.2 72.1 L 500.2 71.5 L 521.1 71.0 L 542.1 70.3 L 563.0 69.7 L 584.0 69.0"`)
  })

  it('Monte-Carlo-band-paden', () => {
    expect(g.mcPaths).toMatchInlineSnapshot(`
      {
        "inner": "M 60.0,173.9 L 81.0,171.0 L 101.9,168.1 L 122.9,165.2 L 143.8,162.3 L 164.8,159.4 L 185.8,156.5 L 206.7,153.6 L 227.7,150.7 L 248.6,147.8 L 269.6,144.9 L 290.6,142.0 L 311.5,139.1 L 332.5,136.2 L 353.4,133.3 L 374.4,130.4 L 395.4,127.5 L 416.3,124.6 L 437.3,121.7 L 458.2,118.8 L 479.2,116.0 L 500.2,113.1 L 521.1,110.2 L 542.1,107.3 L 563.0,104.4 L 584.0,101.5 L 584.0,128.6 L 563.0,130.4 L 542.1,132.2 L 521.1,134.1 L 500.2,135.9 L 479.2,137.7 L 458.2,139.5 L 437.3,141.3 L 416.3,143.1 L 395.4,144.9 L 374.4,146.7 L 353.4,148.5 L 332.5,150.4 L 311.5,152.2 L 290.6,154.0 L 269.6,155.8 L 248.6,157.6 L 227.7,159.4 L 206.7,161.2 L 185.8,163.0 L 164.8,164.8 L 143.8,166.7 L 122.9,168.5 L 101.9,170.3 L 81.0,172.1 L 60.0,173.9 Z",
        "innerMid": "M 60.0,173.9 L 81.0,171.3 L 101.9,168.6 L 122.9,166.0 L 143.8,163.4 L 164.8,160.8 L 185.8,158.1 L 206.7,155.5 L 227.7,152.9 L 248.6,150.3 L 269.6,147.6 L 290.6,145.0 L 311.5,142.4 L 332.5,139.8 L 353.4,137.1 L 374.4,134.5 L 395.4,131.9 L 416.3,129.3 L 437.3,126.6 L 458.2,124.0 L 479.2,121.4 L 500.2,118.8 L 521.1,116.1 L 542.1,113.5 L 563.0,110.9 L 584.0,108.3 L 584.0,121.8 L 563.0,123.9 L 542.1,126.0 L 521.1,128.1 L 500.2,130.2 L 479.2,132.2 L 458.2,134.3 L 437.3,136.4 L 416.3,138.5 L 395.4,140.6 L 374.4,142.7 L 353.4,144.7 L 332.5,146.8 L 311.5,148.9 L 290.6,151.0 L 269.6,153.1 L 248.6,155.2 L 227.7,157.2 L 206.7,159.3 L 185.8,161.4 L 164.8,163.5 L 143.8,165.6 L 122.9,167.6 L 101.9,169.7 L 81.0,171.8 L 60.0,173.9 Z",
        "median": "M 60.0 173.9 L 81.0 171.5 L 101.9 169.2 L 122.9 166.8 L 143.8 164.5 L 164.8 162.1 L 185.8 159.8 L 206.7 157.4 L 227.7 155.1 L 248.6 152.7 L 269.6 150.4 L 290.6 148.0 L 311.5 145.6 L 332.5 143.3 L 353.4 140.9 L 374.4 138.6 L 395.4 136.2 L 416.3 133.9 L 437.3 131.5 L 458.2 129.2 L 479.2 126.8 L 500.2 124.5 L 521.1 122.1 L 542.1 119.8 L 563.0 117.4 L 584.0 115.0",
        "outerMid": "M 60.0,173.9 L 81.0,170.6 L 101.9,167.4 L 122.9,164.1 L 143.8,160.9 L 164.8,157.6 L 185.8,154.3 L 206.7,151.1 L 227.7,147.8 L 248.6,144.6 L 269.6,141.3 L 290.6,138.0 L 311.5,134.8 L 332.5,131.5 L 353.4,128.3 L 374.4,125.0 L 395.4,121.7 L 416.3,118.5 L 437.3,115.2 L 458.2,112.0 L 479.2,108.7 L 500.2,105.4 L 521.1,102.2 L 542.1,98.9 L 563.0,95.7 L 584.0,92.4 L 584.0,133.2 L 563.0,134.8 L 542.1,136.4 L 521.1,138.0 L 500.2,139.7 L 479.2,141.3 L 458.2,142.9 L 437.3,144.6 L 416.3,146.2 L 395.4,147.8 L 374.4,149.4 L 353.4,151.1 L 332.5,152.7 L 311.5,154.3 L 290.6,156.0 L 269.6,157.6 L 248.6,159.2 L 227.7,160.9 L 206.7,162.5 L 185.8,164.1 L 164.8,165.7 L 143.8,167.4 L 122.9,169.0 L 101.9,170.6 L 81.0,172.3 L 60.0,173.9 Z",
        "outermost": "M 60.0,173.9 L 81.0,170.3 L 101.9,166.7 L 122.9,163.0 L 143.8,159.4 L 164.8,155.8 L 185.8,152.2 L 206.7,148.5 L 227.7,144.9 L 248.6,141.3 L 269.6,137.7 L 290.6,134.1 L 311.5,130.4 L 332.5,126.8 L 353.4,123.2 L 374.4,119.6 L 395.4,116.0 L 416.3,112.3 L 437.3,108.7 L 458.2,105.1 L 479.2,101.5 L 500.2,97.8 L 521.1,94.2 L 542.1,90.6 L 563.0,87.0 L 584.0,83.4 L 584.0,137.7 L 563.0,139.1 L 542.1,140.6 L 521.1,142.0 L 500.2,143.5 L 479.2,144.9 L 458.2,146.4 L 437.3,147.8 L 416.3,149.3 L 395.4,150.7 L 374.4,152.2 L 353.4,153.6 L 332.5,155.1 L 311.5,156.5 L 290.6,158.0 L 269.6,159.4 L 248.6,160.9 L 227.7,162.3 L 206.7,163.8 L 185.8,165.2 L 164.8,166.7 L 143.8,168.1 L 122.9,169.5 L 101.9,171.0 L 81.0,172.4 L 60.0,173.9 Z",
      }
    `)
  })

  it('scenario-paden behouden volgorde + kleur', () => {
    expect(g.scenarioPaths.map(s => s.name)).toEqual(['pessimist', 'optimist'])
    expect(g.scenarioPaths.map(s => s.color)).toEqual(['#9e6b50', '#5b8c5a'])
    expect(g.scenarioPaths).toMatchInlineSnapshot(`
      [
        {
          "color": "#9e6b50",
          "d": "M 60.0 173.9 L 269.6 137.7 L 479.2 65.3 L 584.0 101.5",
          "name": "pessimist",
        },
        {
          "color": "#5b8c5a",
          "d": "M 60.0 173.9 L 269.6 119.6 L 479.2 29.0 L 584.0 47.1",
          "name": "optimist",
        },
      ]
    `)
  })
})

// ── Household ────────────────────────────────────────────────────────────────

describe('buildSimChartGeometry — household', () => {
  const g = buildSimChartGeometry({
    ...baseInput,
    householdOverlays: [
      {
        name: 'Partner',
        color: '#0d9488',
        fireAge: 61,
        fireAgeFractional: 61.4,
        points: [[40, 80000], [50, 250000], [61, 650000], [62, 690000], [65, 620000]],
      },
      {
        name: 'Gezamenlijk',
        color: '#334155',
        fireAge: 57,
        isDashed: true,
        points: [[40, 180000], [50, 550000], [57, 1200000], [65, 1500000]],
      },
    ],
  })

  it('household-paden + FIRE-stippen', () => {
    expect(g.householdPaths.map(h => ({ name: h.name, isDashed: h.isDashed }))).toEqual([
      { name: 'Partner', isDashed: false },
      { name: 'Gezamenlijk', isDashed: true },
    ])
    expect(g.householdPaths).toMatchInlineSnapshot(`
      [
        {
          "color": "#0d9488",
          "d": "M 60.0 183.3 L 269.6 164.8 L 500.2 121.4 L 521.1 117.0 L 584.0 124.6",
          "fireDot": {
            "cx": 508.544,
            "cy": 119.64444444444445,
          },
          "isDashed": false,
          "name": "Partner",
        },
        {
          "color": "#334155",
          "d": "M 60.0 172.4 L 269.6 132.2 L 416.3 61.6 L 584.0 29.0",
          "fireDot": {
            "cx": 416.32000000000005,
            "cy": 61.62962962962965,
          },
          "isDashed": true,
          "name": "Gezamenlijk",
        },
      ]
    `)
  })
})

// ── Pensioen-modus ──────────────────────────────────────────────────────────

describe('buildSimChartGeometry — pensioen-modus', () => {
  const g = buildSimChartGeometry({
    ...baseInput,
    planningMode: 'pensioen',
    aowAgeFractional: 67.25,
    fireTarget: undefined,
    endAge: 90,
    rows: buildRows(40, 90, { retireAge: 67, withdrawal: 45000 }),
  })

  it('AOW-split ipv FIRE', () => {
    expect(g.isPensioenMode).toBe(true)
    expect(g.aowAgeFractional).toBe(67.25)
    expect(g.aowFractionalPt).toMatchInlineSnapshot(`
      [
        67.25,
        1197054.25,
      ]
    `)
    expect(g.splitFractionalAge).toBe(67.25)
  })

  it('opbouw/afbouw-paden rond AOW', () => {
    expect(g.accPath).toMatchInlineSnapshot(`"M 60.0 183.0 L 70.5 181.1 L 81.0 179.2 L 91.4 177.2 L 101.9 175.2 L 112.4 173.0 L 122.9 170.6 L 133.4 168.2 L 143.8 165.7 L 154.3 163.0 L 164.8 160.2 L 175.3 157.2 L 185.8 154.1 L 196.2 150.9 L 206.7 147.5 L 217.2 143.9 L 227.7 140.1 L 238.2 136.2 L 248.6 132.0 L 259.1 127.7 L 269.6 123.1 L 280.1 118.3 L 290.6 113.3 L 301.0 108.0 L 311.5 102.4 L 322.0 96.6 L 332.5 90.5 L 343.0 84.0 L 345.6 83.7"`)
    expect(g.decPath).toMatchInlineSnapshot(`"M 345.6 83.7 L 353.4 82.7 L 363.9 81.3 L 374.4 79.8 L 384.9 78.3 L 395.4 76.7 L 405.8 75.0 L 416.3 73.2 L 426.8 71.4 L 437.3 69.4 L 447.8 67.3 L 458.2 65.2 L 468.7 62.9 L 479.2 60.5 L 489.7 58.0 L 500.2 55.4 L 510.6 52.6 L 521.1 49.7 L 531.6 46.7 L 542.1 43.5 L 552.6 40.1 L 563.0 36.6 L 573.5 32.9 L 584.0 29.0"`)
  })

  it('depletion-zone wanneer vermogen op raakt', () => {
    // Zware onttrekking (45k) → portfolio kan onder nul zakken.
    expect(g.depletion).toMatchInlineSnapshot(`null`)
  })
})

// ── Legacy-strategie met inflatie-doellijn ───────────────────────────────────

describe('buildSimChartGeometry — legacy doellijn', () => {
  const factors = Array.from({ length: 26 }, (_, i) => ({ age: 40 + i, factor: Math.pow(1.02, i) }))
  const g = buildSimChartGeometry({
    ...baseInput,
    strategy: 'legacy',
    targetEndPortfolio: 500000,
    targetInflationFactors: factors,
  })

  it('oplopende doellijn', () => {
    expect(g.targetLine).not.toBeNull()
    expect(g.targetLine?.realTargetNow).toMatchInlineSnapshot(`304765.43526413944`)
    expect(g.targetLine?.d).toMatchInlineSnapshot(`"M 60.0 129.9 L 81.0 128.7 L 101.9 127.4 L 122.9 126.1 L 143.8 124.8 L 164.8 123.5 L 185.8 122.1 L 206.7 120.7 L 227.7 119.3 L 248.6 117.8 L 269.6 116.3 L 290.6 114.8 L 311.5 113.3 L 332.5 111.7 L 353.4 110.1 L 374.4 108.4 L 395.4 106.8 L 416.3 105.1 L 437.3 103.3 L 458.2 101.6 L 479.2 99.7 L 500.2 97.9 L 521.1 96.0 L 542.1 94.1 L 563.0 92.1 L 584.0 90.1"`)
  })
})

// ── eventOverlay → icoon-marge ───────────────────────────────────────────────

describe('buildSimChartGeometry — eventOverlay', () => {
  const events: ChartEventOverlay[] = [
    { id: 'e1', label: 'Erfenis', age: 55, side: 'above', color: '#8a6e42', icon: 'Gift', kind: 'life_event', sourceId: 'src1' },
    { id: 'e2', label: 'Pensioen', age: 55, side: 'above', color: '#58362d', icon: 'Calendar', kind: 'life_event', sourceId: 'src2' },
    { id: 'e3', label: 'Verhuizing', age: 48, side: 'above', color: '#0d9488', icon: 'Home', kind: 'life_event', sourceId: 'src3' },
  ]
  const g = buildSimChartGeometry({ ...baseInput, eventOverlay: events })

  it('reserveert icoon-marge (extraTop) en verschuift PAD/H/innerH', () => {
    // Twee events op leeftijd 55 → stapel van 2 → extraTop > 0 → grotere PAD.top.
    expect(g.PAD.top).toBeGreaterThan(16)
    expect(g.H).toBeGreaterThan(220)
    expect(g.iconClampTopY).toMatchInlineSnapshot(`50`)
  })

  it('paden schalen mee met de nieuwe innerH', () => {
    expect(g.accPath).toMatchInlineSnapshot(`"M 60.0 223.6 L 81.0 219.6 L 101.9 215.3 L 122.9 210.8 L 143.8 206.1 L 164.8 201.1 L 185.8 195.9 L 206.7 190.5 L 227.7 184.7 L 248.6 178.7 L 269.6 172.4 L 290.6 165.7 L 311.5 158.8 L 332.5 151.5 L 353.4 143.8 L 374.4 135.7 L 395.4 127.2 L 416.3 118.4 L 437.3 109.0 L 443.6 106.2"`)
  })
})
