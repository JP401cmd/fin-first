/**
 * Regression tests for koopkrachterosie (purchasing power erosion) calculations.
 *
 * Feature #557: Test reeel < nominaal bij positieve inflatie, gelijk bij 0%.
 *
 * Covers both opbouw (accumulation) and onttrekking (withdrawal) phase logic.
 */
import { describe, it, expect } from 'vitest'

// ── Opbouw (accumulation) erosion logic ──────────────────────────────────────
// Mirrors the useMemo in KoopkrachtErosie component
function computeOpbouwErosie(
  startVermogen: number,
  eindVermogen: number,
  inflationRate: number,
  jaren: number,
) {
  const deflator = Math.pow(1 + inflationRate, jaren)
  const reeelEindVermogen = eindVermogen / deflator
  const nominaleGroei = eindVermogen - startVermogen
  const reeleGroei = reeelEindVermogen - startVermogen // start is in today's euros
  const erosie = nominaleGroei - reeleGroei
  const erosiePercentage = nominaleGroei > 0 ? (erosie / nominaleGroei) * 100 : 0

  return { reeelEindVermogen, nominaleGroei, reeleGroei, erosie, erosiePercentage, deflator }
}

// ── Onttrekking (withdrawal) erosion logic ───────────────────────────────────
// Mirrors computeErosie() in koopkracht-erosie-onttrekken.tsx
interface ErosieRow {
  leeftijd: number
  jaar: number
  nominaal: number
  reeel: number
  erosiePct: number
}

function computeOnttrekkingErosie(
  yearlyWithdrawal: number,
  inflationRate: number,
  startAge: number,
  endAge: number,
  yearlyAowIncome: number = 0,
) {
  const totalIncome = yearlyWithdrawal + yearlyAowIncome
  const durationYears = Math.max(Math.round(endAge - startAge), 1)
  const rows: ErosieRow[] = []

  // Start row
  rows.push({
    leeftijd: Math.round(startAge),
    jaar: 0,
    nominaal: totalIncome,
    reeel: totalIncome,
    erosiePct: 0,
  })

  // Every 5th year
  for (let y = 5; y < durationYears; y += 5) {
    const age = Math.round(startAge) + y
    const deflator = Math.pow(1 + inflationRate, y)
    const reeel = totalIncome / deflator

    rows.push({
      leeftijd: age,
      jaar: y,
      nominaal: totalIncome,
      reeel: Math.round(reeel),
      erosiePct: Math.round((1 - reeel / totalIncome) * 100),
    })
  }

  // Final year
  const lastYear = durationYears
  const lastAge = Math.round(startAge) + lastYear
  if (rows[rows.length - 1].jaar !== lastYear) {
    const deflator = Math.pow(1 + inflationRate, lastYear)
    const reeel = totalIncome / deflator
    rows.push({
      leeftijd: lastAge,
      jaar: lastYear,
      nominaal: totalIncome,
      reeel: Math.round(reeel),
      erosiePct: Math.round((1 - reeel / totalIncome) * 100),
    })
  }

  // Overall stats
  const finalDeflator = Math.pow(1 + inflationRate, durationYears)
  const reeelLaatsteJaar = Math.round(totalIncome / finalDeflator)
  const totalErosiePct = Math.round((1 - reeelLaatsteJaar / totalIncome) * 100)

  return { rows, totalErosiePct, reeelLaatsteJaar, durationYears }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('Koopkrachterosie — opbouw (accumulation)', () => {
  it('Stap 1: 2% inflatie, 20 jaar — reeel ≈ 67% van nominaal', () => {
    // 1/(1.02^20) ≈ 0.6730
    const result = computeOpbouwErosie(100_000, 500_000, 0.02, 20)

    const ratio = result.reeelEindVermogen / 500_000
    expect(ratio).toBeCloseTo(0.6730, 2) // ~67.3%
    expect(result.reeelEindVermogen).toBeLessThan(500_000)
    expect(result.erosie).toBeGreaterThan(0)
    expect(result.erosiePercentage).toBeGreaterThan(0)
  })

  it('Stap 2: 0% inflatie — reeel === nominaal', () => {
    const result = computeOpbouwErosie(100_000, 500_000, 0, 20)

    expect(result.reeelEindVermogen).toBe(500_000)
    expect(result.reeleGroei).toBe(result.nominaleGroei)
    expect(result.erosie).toBe(0)
    expect(result.erosiePercentage).toBe(0)
  })

  it('Stap 3: 5% inflatie, 20 jaar — reeel ≈ 38% van nominaal', () => {
    // 1/(1.05^20) ≈ 0.3769
    const result = computeOpbouwErosie(100_000, 500_000, 0.05, 20)

    const ratio = result.reeelEindVermogen / 500_000
    expect(ratio).toBeCloseTo(0.3769, 2) // ~37.7%
    expect(result.reeelEindVermogen).toBeLessThan(500_000 * 0.40)
  })

  it('Stap 4: erosie percentage formule correct — erosie / nominaleGroei * 100', () => {
    const result = computeOpbouwErosie(200_000, 800_000, 0.03, 15)

    // Manual calculation
    const deflator = Math.pow(1.03, 15)
    const reeelEind = 800_000 / deflator
    const nominaleGroei = 800_000 - 200_000
    const reeleGroei = reeelEind - 200_000
    const expectedErosie = nominaleGroei - reeleGroei
    const expectedPct = (expectedErosie / nominaleGroei) * 100

    expect(result.erosiePercentage).toBeCloseTo(expectedPct, 6)
    expect(result.erosie).toBeCloseTo(expectedErosie, 6)
  })

  it('handles negative growth (eindVermogen < startVermogen)', () => {
    const result = computeOpbouwErosie(500_000, 300_000, 0.02, 10)

    // nominaleGroei is negative, erosiePercentage should be 0 (guard)
    expect(result.nominaleGroei).toBeLessThan(0)
    expect(result.erosiePercentage).toBe(0)
    // reeel should still be less than nominaal
    expect(result.reeelEindVermogen).toBeLessThan(300_000)
  })

  it('higher inflation = more erosion', () => {
    const low = computeOpbouwErosie(100_000, 500_000, 0.01, 20)
    const mid = computeOpbouwErosie(100_000, 500_000, 0.03, 20)
    const high = computeOpbouwErosie(100_000, 500_000, 0.05, 20)

    expect(low.erosiePercentage).toBeLessThan(mid.erosiePercentage)
    expect(mid.erosiePercentage).toBeLessThan(high.erosiePercentage)
  })
})

describe('Koopkrachterosie — onttrekking (withdrawal)', () => {
  it('Stap 1: 2% inflatie, 20 jaar — reeel ≈ 67% van nominaal', () => {
    const result = computeOnttrekkingErosie(50_000, 0.02, 67, 87)

    // 1/(1.02^20) ≈ 0.6730 → totalErosiePct ≈ 33%
    const expectedRatio = 1 / Math.pow(1.02, 20)
    expect(result.reeelLaatsteJaar / 50_000).toBeCloseTo(expectedRatio, 2)
    expect(result.totalErosiePct).toBeCloseTo(33, 0) // ~33% erosion
    expect(result.reeelLaatsteJaar).toBeLessThan(50_000)
  })

  it('Stap 2: 0% inflatie — reeel === nominaal, erosie 0%', () => {
    const result = computeOnttrekkingErosie(50_000, 0, 67, 87)

    expect(result.totalErosiePct).toBe(0)
    expect(result.reeelLaatsteJaar).toBe(50_000)

    // All rows should have reeel === nominaal
    for (const row of result.rows) {
      expect(row.reeel).toBe(row.nominaal)
      expect(row.erosiePct).toBe(0)
    }
  })

  it('Stap 3: 5% inflatie, 20 jaar — reeel ≈ 38%', () => {
    // 1/(1.05^20) ≈ 0.3769 → totalErosiePct ≈ 62%
    const result = computeOnttrekkingErosie(50_000, 0.05, 67, 87)

    const expectedRatio = 1 / Math.pow(1.05, 20)
    expect(result.reeelLaatsteJaar / 50_000).toBeCloseTo(expectedRatio, 2)
    expect(result.totalErosiePct).toBeCloseTo(62, 1) // ~62% erosion
  })

  it('Stap 4: erosie percentage formule correct per row', () => {
    const result = computeOnttrekkingErosie(60_000, 0.03, 65, 90)

    for (const row of result.rows) {
      if (row.jaar === 0) {
        expect(row.erosiePct).toBe(0)
        expect(row.reeel).toBe(row.nominaal)
        continue
      }
      // Manual: erosiePct = round((1 - (income / (1+r)^y) / income) * 100)
      const deflator = Math.pow(1.03, row.jaar)
      const expectedReeel = Math.round(60_000 / deflator)
      const expectedPct = Math.round((1 - (60_000 / deflator) / 60_000) * 100)

      expect(row.reeel).toBe(expectedReeel)
      expect(row.erosiePct).toBe(expectedPct)
    }
  })

  it('Stap 5a: onttrekking includes AOW income in calculations', () => {
    const withoutAow = computeOnttrekkingErosie(50_000, 0.02, 67, 87, 0)
    const withAow = computeOnttrekkingErosie(50_000, 0.02, 67, 87, 15_000)

    // With AOW, total income is higher so nominal is higher
    expect(withAow.rows[0].nominaal).toBe(65_000)
    expect(withoutAow.rows[0].nominaal).toBe(50_000)

    // But erosion percentage is the same (same inflation, same duration)
    expect(withAow.totalErosiePct).toBe(withoutAow.totalErosiePct)
  })

  it('Stap 5b: opbouw erosion is consistent with longer time horizons', () => {
    const short = computeOpbouwErosie(100_000, 500_000, 0.02, 10)
    const long = computeOpbouwErosie(100_000, 500_000, 0.02, 30)

    // Longer period = more erosion
    expect(long.erosiePercentage).toBeGreaterThan(short.erosiePercentage)
    expect(long.reeelEindVermogen).toBeLessThan(short.reeelEindVermogen)
  })

  it('rows are generated at 5-year intervals plus final year', () => {
    const result = computeOnttrekkingErosie(50_000, 0.02, 67, 87)

    // 20 years: expect rows at 0, 5, 10, 15, 20
    const years = result.rows.map(r => r.jaar)
    expect(years).toEqual([0, 5, 10, 15, 20])
  })

  it('erosion increases monotonically over time', () => {
    const result = computeOnttrekkingErosie(50_000, 0.03, 65, 95)

    for (let i = 1; i < result.rows.length; i++) {
      expect(result.rows[i].erosiePct).toBeGreaterThanOrEqual(result.rows[i - 1].erosiePct)
      expect(result.rows[i].reeel).toBeLessThanOrEqual(result.rows[i - 1].reeel)
    }
  })
})
