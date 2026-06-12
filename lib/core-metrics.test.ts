import { describe, it, expect } from 'vitest'
import {
  computeEffectiveExpenses,
  computeFireTarget,
  depleteFireTarget,
  computeFreedomPercentage,
  computeFreedomTime,
  computeSavingsRate,
  // NB: bestaat nog niet — canonieke helper uit het fix-ontwerp.
  // Tests hieronder pinnen de gewenste semantiek; ze zijn ROOD tot de helper bestaat.
  computeFreedomProgress,
} from './core-metrics'

// ── computeEffectiveExpenses ────────────────────────────────

describe('computeEffectiveExpenses', () => {
  it('prefers must-expenses when > 0', () => {
    expect(computeEffectiveExpenses(30000, 48000)).toBe(30000)
  })

  it('falls back to yearly expenses when must is 0', () => {
    expect(computeEffectiveExpenses(0, 48000)).toBe(48000)
  })

  it('falls back to yearly expenses when must is negative', () => {
    expect(computeEffectiveExpenses(-1, 48000)).toBe(48000)
  })
})

// ── computeFireTarget ───────────────────────────────────────

describe('computeFireTarget', () => {
  it('computes target at 4% SWR', () => {
    expect(computeFireTarget(40000, 0.04)).toBe(1_000_000)
  })

  it('returns 0 when expenses are 0', () => {
    expect(computeFireTarget(0, 0.04)).toBe(0)
  })

  it('uses NL SWR correctly', () => {
    const nlSwr = 0.02883
    expect(computeFireTarget(40000, nlSwr)).toBeCloseTo(40000 / nlSwr, 2)
  })
})

// ── depleteFireTarget ──────────────────────────────────────

describe('depleteFireTarget', () => {
  it('PV annuity: lower target than perpetual', () => {
    const perpetual = 40_000 / 0.05 // 800_000
    const deplete = depleteFireTarget(40_000, 0.05, 30)
    expect(deplete).toBeLessThan(perpetual)
    // PV annuity: 40_000 * (1 - 1.05^(-30)) / 0.05 ≈ 614_886
    expect(deplete).toBeCloseTo(614_886, -2)
  })

  it('returns 0 for zero expenses', () => {
    expect(depleteFireTarget(0, 0.05, 30)).toBe(0)
  })

  it('handles zero return: simple multiplication', () => {
    expect(depleteFireTarget(40_000, 0, 30)).toBe(40_000 * 30) // 1_200_000
  })

  it('approaches perpetual as years increase', () => {
    const perpetual = 40_000 / 0.05
    const longTerm = depleteFireTarget(40_000, 0.05, 200)
    // With 200 years, PV annuity approaches expenses/r
    expect(longTerm).toBeCloseTo(perpetual, -3)
  })

  it('short horizon = lower target', () => {
    const short = depleteFireTarget(40_000, 0.05, 10)
    const long = depleteFireTarget(40_000, 0.05, 30)
    expect(short).toBeLessThan(long)
  })
})

// ── computeFireTarget with strategy options ─────────────────

describe('computeFireTarget with strategy', () => {
  it('deplete strategy returns lower target', () => {
    const perpetualTarget = computeFireTarget(40_000, 0.04)
    const depleteTarget = computeFireTarget(40_000, 0.04, {
      strategy: 'deplete',
      yearsInRetirement: 30,
      realReturn: 0.05,
    })
    expect(depleteTarget).toBeLessThan(perpetualTarget)
  })

  it('perpetual strategy uses classic formula', () => {
    const result = computeFireTarget(40_000, 0.04, {
      strategy: 'perpetual',
      yearsInRetirement: 30,
      realReturn: 0.05,
    })
    expect(result).toBe(40_000 / 0.04)
  })

  it('no options = classic formula (backwards compat)', () => {
    expect(computeFireTarget(40_000, 0.04)).toBe(1_000_000)
  })

  it('deplete without yearsInRetirement = classic formula', () => {
    const result = computeFireTarget(40_000, 0.04, {
      strategy: 'deplete',
    })
    expect(result).toBe(1_000_000)
  })
})

// ── computeFreedomPercentage ────────────────────────────────

describe('computeFreedomPercentage', () => {
  it('computes 50% when halfway', () => {
    expect(computeFreedomPercentage(500_000, 1_000_000)).toBe(50)
  })

  it('clamps to 100 when over target', () => {
    expect(computeFreedomPercentage(1_500_000, 1_000_000)).toBe(100)
  })

  it('clamps to 0 when negative net worth', () => {
    expect(computeFreedomPercentage(-100_000, 1_000_000)).toBe(0)
  })

  it('returns 0 when fireTarget is 0', () => {
    expect(computeFreedomPercentage(500_000, 0)).toBe(0)
  })

  it('returns exactly 100 when equal to target', () => {
    expect(computeFreedomPercentage(1_000_000, 1_000_000)).toBe(100)
  })
})

// ── computeFreedomTime ──────────────────────────────────────

describe('computeFreedomTime', () => {
  it('computes years and months correctly', () => {
    // 600k / 40k = 15 years, 0 months
    expect(computeFreedomTime(600_000, 40_000)).toEqual({ years: 15, months: 0 })
  })

  it('handles partial years', () => {
    // 50k / 40k = 1.25 years = 1 year, 3 months
    expect(computeFreedomTime(50_000, 40_000)).toEqual({ years: 1, months: 3 })
  })

  it('returns 0/0 when expenses are 0', () => {
    expect(computeFreedomTime(500_000, 0)).toEqual({ years: 0, months: 0 })
  })

  it('clamps negative net worth to 0/0', () => {
    expect(computeFreedomTime(-100_000, 40_000)).toEqual({ years: 0, months: 0 })
  })
})

// ── computeSavingsRate ──────────────────────────────────────

describe('computeSavingsRate', () => {
  it('computes 40% savings rate', () => {
    expect(computeSavingsRate(5000, 3000)).toBe(40)
  })

  it('returns 0 when income is 0', () => {
    expect(computeSavingsRate(0, 1000)).toBe(0)
  })

  it('returns negative when overspending', () => {
    expect(computeSavingsRate(3000, 5000)).toBeCloseTo(-66.67, 1)
  })

  it('returns 100 when expenses are 0', () => {
    expect(computeSavingsRate(5000, 0)).toBe(100)
  })

  it('includes savingsBudgetSpent in rate (savings budgets count as saving, not expense)', () => {
    // Income 1000, expenses 900 (includes 200 savings budget), savingsBudgetSpent 200
    // Rate = (1000 - 900 + 200) / 1000 * 100 = 30%
    expect(computeSavingsRate(1000, 900, 200)).toBe(30)
  })

  it('defaults savingsBudgetSpent to 0 (backward compatible)', () => {
    expect(computeSavingsRate(5000, 3000)).toBe(40)
  })
})

// ── computeFreedomProgress (canonieke vrijheidsvoortgang) ───────
//
// BUG: /overzicht toont 100% vrijheidsvoortgang naast "nog 6 jaar".
// Root cause: freedomPct = volledig netto vermogen (incl. eigen huis)
// ÷ simpel FIRE-doel (computeFireTarget ≈ uitgaven/SWR), geclampt op 100.
// De "nog X jaar" komt uit runUnifiedProjection op de FIRE-eligible
// grondslag (huis gefilterd via housing-strategie). Die twee gebruiken
// verschillende grondslagen → percentage en jaren spreken elkaar tegen.
//
// Fix-ontwerp: één canonieke helper computeFreedomProgress dat de
// FIRE-eligible netto-waarde afzet tegen de benodigde portfolio uit de
// unified projection (requiredPortfolio), geclampt op [0,100].
//
// Deze tests pinnen de gewenste invarianten en zijn ROOD tot de helper
// bestaat. De aparte "huidig foute pad"-test verderop faalt op het
// HUIDIGE gedrag (niet alleen op "functie ontbreekt").

describe('computeFreedomProgress', () => {
  it('invariant 1: nog jaren te gaan (eligible < required) ⇒ strikt < 100% — ook als totaal vermogen incl. huis boven het simpele doel ligt', () => {
    // Minimale repro: belegbaar (FIRE-eligible) €600k, benodigde
    // portfolio uit de sim ±€1M ⇒ ~60%, NIET 100% — ook al ligt het
    // totale vermogen (incl. €500k huis = €1,1M) boven het simpele doel.
    const pct = computeFreedomProgress({
      fireEligibleNetWorth: 600_000,
      requiredPortfolio: 1_000_000,
    })
    expect(pct).toBeLessThan(100)
    expect(pct).toBeCloseTo(60, 5)
  })

  it('invariant 2: doel bereikt (eligible ≥ required) ⇒ exact 100%', () => {
    expect(
      computeFreedomProgress({ fireEligibleNetWorth: 1_000_000, requiredPortfolio: 1_000_000 }),
    ).toBe(100)
    expect(
      computeFreedomProgress({ fireEligibleNetWorth: 1_200_000, requiredPortfolio: 1_000_000 }),
    ).toBe(100)
  })

  it('invariant 3a: requiredPortfolio = 0 ⇒ 0% (geen deling door nul / Infinity)', () => {
    const pct = computeFreedomProgress({ fireEligibleNetWorth: 600_000, requiredPortfolio: 0 })
    expect(pct).toBe(0)
    expect(Number.isFinite(pct)).toBe(true)
  })

  it('invariant 3b: requiredPortfolio < 0 of niet berekenbaar (null) ⇒ 0%', () => {
    expect(
      computeFreedomProgress({ fireEligibleNetWorth: 600_000, requiredPortfolio: -50_000 }),
    ).toBe(0)
    expect(
      computeFreedomProgress({ fireEligibleNetWorth: 600_000, requiredPortfolio: null }),
    ).toBe(0)
  })

  it('invariant 3c: geen NaN/Infinity bij rare invoer', () => {
    const a = computeFreedomProgress({ fireEligibleNetWorth: 600_000, requiredPortfolio: 0 })
    const b = computeFreedomProgress({ fireEligibleNetWorth: NaN, requiredPortfolio: 1_000_000 })
    expect(Number.isNaN(a)).toBe(false)
    expect(Number.isFinite(a)).toBe(true)
    expect(Number.isNaN(b)).toBe(false)
    expect(Number.isFinite(b)).toBe(true)
  })

  it('invariant 4: negatief eligible vermogen ⇒ 0%', () => {
    expect(
      computeFreedomProgress({ fireEligibleNetWorth: -100_000, requiredPortfolio: 1_000_000 }),
    ).toBe(0)
  })

  it('lineair tussen 0 en 100 bij gewone invoer', () => {
    expect(
      computeFreedomProgress({ fireEligibleNetWorth: 250_000, requiredPortfolio: 1_000_000 }),
    ).toBe(25)
  })
})

// ── Bug-demonstratie: HUIDIG foute pad vs. gewenste uitkomst ────
//
// Deze test gebruikt UITSLUITEND bestaande functies en demonstreert dat
// het huidige loader-recept (computeFreedomPercentage(totaalNetWorth,
// computeFireTarget(...))) in de minimale repro 100% oplevert, terwijl de
// canonieke uitkomst < 100% hoort te zijn. Faalt dus op HUIDIG GEDRAG,
// niet op een ontbrekende functie.

describe('vrijheidsvoortgang bug — huidig pad geeft 100% in minimale repro', () => {
  // Minimale repro (uit requirements):
  //   - totaal netto vermogen €1,1M, waarvan €500k eigen huis
  //   - FIRE-eligible (belegbaar) vermogen €600k
  //   - jaarlijkse uitgaven €40k, SWR 4% ⇒ simpel FIRE-doel = €1,0M
  //   - benodigde portfolio uit de sim ±€1,0M
  const totaalNetWorth = 1_100_000
  const fireEligibleNetWorth = 600_000
  const yearlyExpenses = 40_000
  const swr = 0.04
  const simpelFireDoel = computeFireTarget(yearlyExpenses, swr) // 1_000_000
  const requiredPortfolio = 1_000_000 // ±gelijk aan simpel doel in deze repro

  it('het simpele FIRE-doel is €1,0M (sanity)', () => {
    expect(simpelFireDoel).toBe(1_000_000)
  })

  it('HUIDIG (fout): totaal vermogen incl. huis ÷ simpel doel, geclampt ⇒ 100%', () => {
    // Dit is exact wat de loaders nu doen (dashboard-data-loader.ts:575
    // en horizon-data-loader.ts:572): netWorth = volledig totaal incl. huis.
    const huidigPct = computeFreedomPercentage(totaalNetWorth, simpelFireDoel)
    expect(huidigPct).toBe(100)
  })

  it('GEWENST (canoniek): FIRE-eligible vermogen ÷ required portfolio ⇒ ~60%, NIET 100%', () => {
    // Wat de loaders zouden moeten voeden: de FIRE-eligible grondslag
    // (huis gefilterd) afgezet tegen de required portfolio uit de sim.
    const gewenstPct = computeFreedomProgress({ fireEligibleNetWorth, requiredPortfolio })
    expect(gewenstPct).toBeLessThan(100)
    expect(gewenstPct).toBeCloseTo(60, 5)
  })

  it('de twee paden verschillen ⇒ bewijst de tegenstrijdigheid (100% naast "nog jaren")', () => {
    const huidigPct = computeFreedomPercentage(totaalNetWorth, simpelFireDoel)
    const gewenstPct = computeFreedomProgress({ fireEligibleNetWorth, requiredPortfolio })
    expect(huidigPct).not.toBeCloseTo(gewenstPct, 0)
  })
})
