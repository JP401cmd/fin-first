/**
 * Tests for the phase Monte Carlo engine — focus on the AOW-netting contract.
 *
 * CONTRACT (C1, plan §Afbouwfase): in the withdrawal phase the engine consumes
 * `yearlyCashflow`, which the UI derives from `row.withdrawal`. That value is the
 * NET portfolio-funded outflow — AOW/pension has ALREADY been netted out exactly
 * once by `applyWithdrawalStrategy` (see lib/withdrawal-strategy.ts `applyStatic`:
 * `Math.max(0, baseExpenses - recurringIncome)`).
 *
 * Therefore the caller must pass `yearlyCashflow = -yearlyWithdrawal` and must NOT
 * subtract AOW a second time. `findCriticalSWR` likewise interprets its SWR as a
 * NET portfolio withdrawal rate and must net AOW exactly once.
 */

import { describe, it, expect } from 'vitest'
import { runPhaseMonteCarlo, findCriticalSWR } from '@/lib/phase-monte-carlo'

describe('runPhaseMonteCarlo — withdrawal AOW netting (C1)', () => {
  // Deterministic scenario: zero volatility makes every simulation identical,
  // so the success rate is a step function we can reason about exactly.
  const base = {
    startPortfolio: 200_000,
    yearsInPhase: 20,
    expectedReturn: 0.05,
    volatility: 0, // deterministic
    inflationRate: 0,
    currentAge: 67,
    box3Drag: 0, // isolate the cashflow effect
  }

  it('treats yearlyCashflow as the full net portfolio outflow (no hidden AOW credit)', () => {
    // With a net outflow of €15k/yr on €200k @5% deterministic, the portfolio
    // survives (5% of 200k = 10k growth, but withdrawal grows faster than balance
    // shrinks only when withdrawal < growth). Use a withdrawal that depletes.
    const netWithdrawal = 20_000
    const correct = runPhaseMonteCarlo({
      ...base,
      yearlyCashflow: -netWithdrawal, // CORRECT: AOW already netted once upstream
    })

    // The buggy formula would have been -(netWithdrawal - aow): a SMALLER outflow,
    // hence an artificially HIGHER ending portfolio. Emulate it to prove the gap.
    const aow = 12_000
    const buggy = runPhaseMonteCarlo({
      ...base,
      yearlyCashflow: -(netWithdrawal - aow), // double-counts AOW
    })

    // Double-counting AOW must make the (wrong) projection strictly rosier.
    expect(buggy.medianEndPortfolio).toBeGreaterThan(correct.medianEndPortfolio)
    // And the gap must be on the order of cumulative AOW (≈ aow × years, grown).
    expect(buggy.medianEndPortfolio - correct.medianEndPortfolio).toBeGreaterThan(
      aow * base.yearsInPhase * 0.8,
    )
  })

  it('depletes the portfolio when net outflow exceeds growth', () => {
    // €200k @5% → €10k growth in year 1. A €20k net withdrawal outpaces growth,
    // so a 20-year horizon should fail (portfolio hits 0 before the end).
    const result = runPhaseMonteCarlo({
      ...base,
      yearlyCashflow: -20_000,
      targetMinPortfolio: 1,
    })
    expect(result.successRate).toBeLessThan(1)
    expect(result.medianEndPortfolio).toBe(0)
  })
})

describe('runPhaseMonteCarlo — depletie-detectie bij de default targetMinPortfolio', () => {
  // De succes-toets stond ooit ná `portfolio = Math.max(0, portfolio)`. Daardoor
  // was `portfolio < 0` per definitie onwaar en gaf de default
  // targetMinPortfolio = 0 ALTIJD successRate 1 — ook voor een portefeuille die
  // tot € 0 leegliep. monte-carlo-onttrekken en sorr-analyse lazen die default
  // rechtstreeks en toonden dus onvoorwaardelijk "slagingskans 100%".
  const deterministic = {
    startPortfolio: 100_000,
    yearsInPhase: 10,
    expectedReturn: 0.05,
    volatility: 0, // deterministisch: elke simulatie is identiek
    inflationRate: 0,
    currentAge: 67,
    box3Drag: 0,
  }

  it('meldt een leeggelopen portefeuille als mislukt (default targetMinPortfolio)', () => {
    const result = runPhaseMonteCarlo({ ...deterministic, yearlyCashflow: -50_000 })
    expect(result.medianEndPortfolio).toBe(0) // volledig opgedroogd
    expect(result.successRate).toBe(0) // ... en dat moet de slagingskans óók zeggen
  })

  it('houdt een portefeuille die nooit tekortschiet op 100% (default targetMinPortfolio)', () => {
    const result = runPhaseMonteCarlo({ ...deterministic, yearlyCashflow: -1_000 })
    expect(result.medianEndPortfolio).toBeGreaterThan(deterministic.startPortfolio)
    expect(result.successRate).toBe(1)
  })

  it('laat een positieve targetMinPortfolio ongemoeid (gedragsbehoud)', () => {
    // Golden gemeten vóór de verplaatsing van de toets: clampen kan een waarde
    // alleen naar 0 tillen, en 0 ligt altijd onder een positieve drempel — dus
    // voor targetMinPortfolio > 0 is vóór/ná de clamp per constructie identiek.
    const result = runPhaseMonteCarlo({
      startPortfolio: 500_000,
      yearsInPhase: 20,
      yearlyCashflow: -30_000,
      expectedReturn: 0.07,
      volatility: 0.15,
      inflationRate: 0.02,
      currentAge: 60,
      targetMinPortfolio: 1,
    }, 200)
    expect(result.successRate).toBe(0.65)
  })
})

describe('findCriticalSWR — AOW netted exactly once (C1)', () => {
  const base = {
    startPortfolio: 200_000,
    yearsInPhase: 30,
    expectedReturn: 0.05,
    volatility: 0.12,
    inflationRate: 0.02,
    currentAge: 67,
  }

  it('returns a NET portfolio withdrawal rate that ignores AOW level', () => {
    // SWR here means: net portfolio withdrawal / startPortfolio. AOW is funded
    // outside the portfolio, so the critical NET rate must NOT depend on the AOW
    // amount passed in. Two very different AOW values must give the same answer.
    const swrLowAow = findCriticalSWR({ ...base, yearlyAowIncome: 0, baseSwr: 0.04 })
    const swrHighAow = findCriticalSWR({ ...base, yearlyAowIncome: 25_000, baseSwr: 0.04 })

    expect(swrLowAow).toBeGreaterThan(0)
    // The critical NET withdrawal rate is independent of AOW (AOW is not drawn
    // from the portfolio). Allow a tiny tolerance for binary-search granularity.
    expect(Math.abs(swrLowAow - swrHighAow)).toBeLessThan(1e-9)
  })

  it('produces a plausible critical SWR below the base rate for a long horizon', () => {
    const swr = findCriticalSWR({ ...base, yearlyAowIncome: 12_000, baseSwr: 0.06 })
    // Over 30 years with volatility, the 95%-safe NET rate should be modest.
    expect(swr).toBeGreaterThan(0)
    expect(swr).toBeLessThan(0.06)
  })
})
