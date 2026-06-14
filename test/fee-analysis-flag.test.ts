/**
 * Regressietest: fee-analysis FIRE-impact is flag-bewust (C5-b, engine 3 van 4).
 *
 * `computeFeeImpactOnFire` draaide voorheen TWEE FIRE-scenario's (met/zonder fee-
 * drag) ONVOORWAARDELIJK op de legacy v1-engine (`runSimulation`). Na de migratie
 * kiest de 3e parameter `useV2` de engine:
 *
 *  • `useV2 = false` (default)  → beide scenario's byte-identiek op de legacy
 *    v1-engine (`runSimulation`) — exact het gedrag van vóór deze migratie.
 *  • `useV2 = true`             → beide scenario's op de v2-grootboek-engine via
 *    `runSelectedProjection` op de synthetisch-portfolio-bridge (`buildFeeSimInput`).
 *
 * Deze test vergrendelt drie dingen:
 *  1. flag-off is byte-identiek aan de directe legacy `runSimulation`-aanroep (de
 *     geaccepteerde v1-fallback) — geen stille gedragswijziging.
 *  2. flag-on selecteert v2: de FIRE-leeftijden verschillen detecteerbaar van v1
 *     (een tak die v1 hardcodet zou identieke leeftijden geven).
 *  3. de fee-drag-DELTA (de gerapporteerde fee-impact) blijft betekenisvol en
 *     stijgt monotoon met de TER op beide engines; 0% TER → 0 impact.
 *
 * De bridge `buildFeeSimInput` is bewust lokaal in `lib/fee-analysis.ts` gehouden
 * (puur, DB-vrij) i.p.v. de household-`buildTotalsInput` te importeren.
 */

import { describe, it, expect } from 'vitest'
import { computeFeeImpactOnFire, buildFeeSimInput, type FeeSimParams } from '@/lib/fee-analysis'
import { runSimulation } from '@/lib/fire-simulation'

const BASE: FeeSimParams = {
  currentAge: 30,
  endAge: 90,
  currentPortfolio: 100_000,
  yearlyExpenses: 30_000,
  annualSavings: 20_000,
  grossReturn: 0.07,
  returnModel: 'nl_box3',
  inflation: 0.02,
  cashflows: [],
}
const TER = 0.005 // 0.5%

describe('fee-analysis — FIRE-impact is flag-bewust (C5-b)', () => {
  it('useV2=false is byte-identiek aan de legacy runSimulation-fee-drag (v1-fallback)', () => {
    const impact = computeFeeImpactOnFire(BASE, TER, false)

    // Reproduceer de exacte v1-berekening die de functie vóór de migratie deed.
    const simWithout = runSimulation(
      BASE.currentAge, BASE.endAge, BASE.currentPortfolio, BASE.yearlyExpenses,
      BASE.annualSavings, BASE.grossReturn, BASE.returnModel, BASE.inflation,
      BASE.cashflows, BASE.strategyConfig, BASE.withdrawalStrategy,
    )
    const simWith = runSimulation(
      BASE.currentAge, BASE.endAge, BASE.currentPortfolio, BASE.yearlyExpenses,
      BASE.annualSavings, BASE.grossReturn - TER, BASE.returnModel, BASE.inflation,
      BASE.cashflows, BASE.strategyConfig, BASE.withdrawalStrategy,
    )

    expect(impact.fireAgeWithoutFees).toBe(simWithout.fireAgeFractional)
    expect(impact.fireAgeWithFees).toBe(simWith.fireAgeFractional)
    expect(impact.bothReachable).toBe(simWithout.fireReachable && simWith.fireReachable)
    expect(impact.feeImpactMonths).toBe(
      Math.round(((simWith.fireAgeFractional ?? 0) - (simWithout.fireAgeFractional ?? 0)) * 12),
    )
  })

  it('default (geen 3e arg) == useV2=false — de regressie-suite-callers blijven v1', () => {
    const implicit = computeFeeImpactOnFire(BASE, TER)
    const explicit = computeFeeImpactOnFire(BASE, TER, false)
    expect(implicit).toEqual(explicit)
  })

  it('useV2=true selecteert v2: DETECTEERBAAR andere FIRE-leeftijden dan v1', () => {
    const v1 = computeFeeImpactOnFire(BASE, TER, false)
    const v2 = computeFeeImpactOnFire(BASE, TER, true)

    // v2 rekent reëel → de absolute FIRE-leeftijd verschuift t.o.v. v1. Als de
    // tak v1 zou hardcoden, waren beide identiek.
    expect(v2.fireAgeWithoutFees).not.toBe(v1.fireAgeWithoutFees)
    expect(v2.fireAgeWithoutFees).not.toBeNull()
    expect(v2.fireAgeWithFees).not.toBeNull()
  })

  it('v2 fee-drag-delta is betekenisvol: 0% TER → 0, hogere TER → grotere vertraging', () => {
    const zero = computeFeeImpactOnFire(BASE, 0, true)
    const low = computeFeeImpactOnFire(BASE, 0.005, true)
    const high = computeFeeImpactOnFire(BASE, 0.01, true)

    // 0% TER → identieke leeftijd → geen vertraging.
    expect(zero.feeImpactMonths).toBe(0)
    expect(zero.fireAgeWithFees).toBe(zero.fireAgeWithoutFees)

    // Fee-drag is nooit negatief en stijgt monotoon met de TER.
    expect(low.feeImpactMonths).toBeGreaterThanOrEqual(0)
    expect(high.feeImpactMonths).toBeGreaterThanOrEqual(low.feeImpactMonths)
    expect(high.feeImpactMonths).toBeGreaterThan(0)
  })

  it('buildFeeSimInput bouwt één synthetisch portfolio-asset gelijk aan het portfolio', () => {
    const input = buildFeeSimInput(BASE, BASE.grossReturn)
    expect(input.assets).toHaveLength(1)
    expect(input.debts).toHaveLength(0)
    expect(input.assets[0].current_value).toBe(100_000)
    expect(input.assets[0].asset_type).toBe('investment')
    // effectieve return (decimaal) → asset.expected_return (percentage).
    expect(input.assets[0].expected_return).toBeCloseTo(7, 6)
    // Een lagere effectieve return (fee-scenario) zet een lagere asset-return.
    const feeInput = buildFeeSimInput(BASE, BASE.grossReturn - TER)
    expect(feeInput.assets[0].expected_return).toBeCloseTo(6.5, 6)
    expect(feeInput.grossReturn).toBeCloseTo(0.065, 6)
    // Sparen loopt via annualSavings, niet via monthly_contribution.
    expect(input.assets[0].monthly_contribution).toBe(0)
    expect(input.annualSavings).toBe(20_000)
  })
})
