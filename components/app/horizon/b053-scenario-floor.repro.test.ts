/**
 * B-053 — regressiecase (19 sep 2026): de scenario-varianten Voorzichtig/
 * Optimistisch kennen GEEN halt-op-nul.
 *
 * `buildScenarioVariants` (sim-chart.tsx) voedt `horizon-client.tsx`
 * (`setScenarioData` -> `<SimChart scenarioOverlays=... />`, de Toekomst-grafiek
 * op /toekomst) en `buildScenarioPathsFromSim` de "Vergelijk scenario's"-modal
 * plus de verwachtingsband. Beide bouwers volgen de hoofdlijn ongeklemd: een
 * variantlijn loopt de héle reeks door en mag — net als de kernel
 * (`prognose.nettoVermogen`, zie b053-netwerth-negative.repro.test.ts) — onder
 * €0 zakken. De oude klem `Math.max(portfolio, 0)` + `break` bij ≤ 0 liet
 * "Voorzichtig" bij een tekort plat op nul eindigen terwijl de hoofdlijn ernaast
 * wél negatief tekende.
 */
import { describe, it, expect } from 'vitest'
import type { SimRow } from '@/lib/fire-simulation'
import { buildScenarioVariants, buildScenarioPathsFromSim } from './sim-chart'

function row(over: Partial<SimRow>): SimRow {
  return {
    age: 0,
    phase: 'retirement',
    startPortfolio: 0,
    growth: 0,
    savings: 0,
    withdrawal: 0,
    cashflowNet: 0,
    oneTimeNet: 0,
    endPortfolio: 0,
    grossIncome: 0,
    grossExpenses: 0,
    flowIn: 0,
    flowOut: 0,
    ...over,
  } as SimRow
}

// Een aflopend vermogen dat na jaar 2 al diep negatief gaat (tekort-lening-
// achtig patroon, vergelijkbaar met het geen-tekort-lening.test.ts-scenario).
const TEKORT_RIJEN: SimRow[] = [
  row({ age: 50, startPortfolio: 20_000, endPortfolio: 5_000, growth: 500 }),
  row({ age: 51, startPortfolio: 5_000, endPortfolio: -80_000, growth: 500 }),
  row({ age: 52, startPortfolio: -80_000, endPortfolio: -170_000, growth: -4_000 }),
  row({ age: 53, startPortfolio: -170_000, endPortfolio: -260_000, growth: -8_000 }),
]

describe('B-053 — buildScenarioVariants volgt de hoofdlijn ook onder nul', () => {
  it('de variantlijnen lopen de hele reeks door en worden negatief', () => {
    const [pessimist, optimist] = buildScenarioVariants(TEKORT_RIJEN, 0.07)

    // Seed + één punt per rij — geen vroegtijdige afkap.
    expect(pessimist.points).toHaveLength(TEKORT_RIJEN.length + 1)
    expect(optimist.points).toHaveLength(TEKORT_RIJEN.length + 1)

    const lastPess = pessimist.points[pessimist.points.length - 1]
    const lastOpt = optimist.points[optimist.points.length - 1]
    expect(lastPess[0]).toBe(54)
    expect(lastPess[1]).toBeLessThan(-100_000)
    expect(lastOpt[1]).toBeLessThan(-100_000)
    // Geen enkel punt is op 0 geklemd.
    expect(pessimist.points.some(([, v]) => v === 0)).toBe(false)
  })

  it('de hoofdlijn blijft het exacte midden tussen voorzichtig en optimistisch — ook in het rood', () => {
    const [pessimist, optimist] = buildScenarioVariants(TEKORT_RIJEN, 0.07)
    TEKORT_RIJEN.forEach((r, i) => {
      const midden = (pessimist.points[i + 1][1] + optimist.points[i + 1][1]) / 2
      expect(midden).toBeCloseTo(r.endPortfolio, 6)
    })
  })
})

describe('B-053 — buildScenarioPathsFromSim (Vergelijk scenario\'s / verwachtingsband)', () => {
  it('de variantpaden dragen negatieve netWorth-maanden en breken niet af', () => {
    const [pessimist, baseline, optimist] = buildScenarioPathsFromSim(TEKORT_RIJEN, 0.07, 500_000)

    expect(pessimist.months).toHaveLength(baseline.months.length)
    expect(optimist.months).toHaveLength(baseline.months.length)

    const laatste = pessimist.months[pessimist.months.length - 1]
    expect(laatste.netWorth).toBeLessThan(-100_000)
    // Passief inkomen uit een negatief vermogen bestaat niet: 0, niet negatief.
    expect(laatste.passiveIncome).toBe(0)
    // Geen van de varianten haalt het doel — fireAge blijft null (geen valse
    // FIRE-detectie op een geklemde 0).
    expect(pessimist.fireAge).toBeNull()
    expect(optimist.fireAge).toBeNull()
  })
})
