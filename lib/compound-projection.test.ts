import { describe, it, expect } from 'vitest'
import { projectCompound, compareCompound } from './compound-projection'

describe('projectCompound — basis', () => {
  it('returnt principal bij years=0', () => {
    expect(projectCompound(10_000, 100, 0, 0.07)).toBe(10_000)
  })

  it('handelt 0% rente lineair af', () => {
    // €10k + €100/mnd × 12 × 10 = 10k + 12k = 22k
    expect(projectCompound(10_000, 100, 10, 0)).toBe(22_000)
  })

  it('berekent compound bij 7%', () => {
    // €10k @ 7% × 30 = 10k × (1.07^30) ≈ €76.1k
    const result = projectCompound(10_000, 0, 30, 0.07)
    expect(result).toBeGreaterThan(76_000)
    expect(result).toBeLessThan(77_000)
  })

  it('voegt maandelijkse inleg toe', () => {
    // €100/mnd × 30j @ 7%: FV_monthly = 1200 × ((1.07^30 − 1) / 0.07)
    // ≈ 1200 × (7.612 − 1) / 0.07 ≈ €113.353
    const result = projectCompound(0, 100, 30, 0.07)
    expect(result).toBeGreaterThan(110_000)
    expect(result).toBeLessThan(115_000)
  })
})

describe('compareCompound — scenarios', () => {
  it('berekent verschil tussen sparen en beleggen', () => {
    const result = compareCompound({
      principal: 10_000,
      monthlyContribution: 100,
      years: 30,
      conservativeRate: 0.005,
      ambitiousRate: 0.07,
    })
    expect(result.conservative).toBeLessThan(result.ambitious)
    expect(result.difference).toBeGreaterThan(100_000)
    expect(result.multiplier).toBeGreaterThan(3) // beleggen wint dik
  })

  it('hasDramaticDelta=true bij ambitious >= 5% boven conservative', () => {
    const result = compareCompound({
      principal: 10_000,
      monthlyContribution: 100,
      years: 30,
      conservativeRate: 0.005,
      ambitiousRate: 0.07,
    })
    expect(result.hasDramaticDelta).toBe(true)
  })

  it('hasDramaticDelta=false bij gelijke rentes', () => {
    const result = compareCompound({
      principal: 10_000,
      monthlyContribution: 100,
      years: 30,
      conservativeRate: 0.05,
      ambitiousRate: 0.05,
    })
    expect(result.hasDramaticDelta).toBe(false)
  })

  it('hasDramaticDelta=false bij conservative = 0', () => {
    const result = compareCompound({
      principal: 0,
      monthlyContribution: 0,
      years: 30,
      conservativeRate: 0.005,
      ambitiousRate: 0.07,
    })
    expect(result.hasDramaticDelta).toBe(false)
  })

  it('returnt 0-difference bij 0 jaren', () => {
    const result = compareCompound({
      principal: 10_000,
      monthlyContribution: 100,
      years: 0,
      conservativeRate: 0.005,
      ambitiousRate: 0.07,
    })
    expect(result.difference).toBe(0)
  })
})
