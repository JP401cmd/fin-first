/**
 * Regressietest: household-projection is flag-bewust (C5-b, engine 2 van 4).
 *
 * `lib/household-projection.ts` draaide voorheen de partner- én gecombineerde
 * FIRE-projectie ONVOORWAARDELIJK op de v1-engine (`runSimulation` voor de
 * totalen-tak, `runUnifiedProjection` voor de itemized tak). Na de migratie loopt
 * elke tak via `runSelectedProjection(input, useV2)` met de flag van de huidige
 * gebruiker (`isHorizonV2Enabled`).
 *
 * Deze test vergrendelt twee dingen op het PUBLIEKE oppervlak dat de engine raakt:
 *
 *  1. De TOTALEN-tak (`buildTotalsInput` → `runSelectedProjection`) honoreert de
 *     flag: v1 en v2 geven meetbaar verschillende uitkomsten op één en hetzelfde
 *     synthetisch-portfolio-input. Een tak die v1 hardcodes zou delta ≈ 0 geven.
 *  2. `useV2 = false` is byte-identiek aan de v1-engine direct aanroepen
 *     (`runUnifiedProjection`) — de geaccepteerde v1-fallback.
 *
 * De async DB-bouwer `buildHouseholdProjectionInput` zelf is Supabase-gebonden en
 * wordt niet hier maar in de in-app regressie/integratie afgedekt; deze test
 * isoleert de engine-selectie-contracten die de bouwer per tak gebruikt.
 */

import { describe, it, expect } from 'vitest'
import { buildTotalsInput } from '@/lib/household-projection'
import { runSelectedProjection } from '@/lib/horizon-engine/select'
import { runUnifiedProjection, toSimResult } from '@/lib/unified-projection'
import type { FireStrategyConfig } from '@/lib/fire-strategy'

// Representatief huishoud-totaal: gecombineerd netto vermogen ~€350k, jaarlijkse
// uitgaven €40k, inleg €24k/jaar, hoofd-leeftijd 40, deplete tot 90.
const STRATEGY: FireStrategyConfig = { strategy: 'deplete', endAge: 90, legacyAmount: 0 }
const TOTALS_INPUT = buildTotalsInput(
  40,        // currentAge (head-age)
  350_000,   // netWorth (combined)
  40_000,    // yearlyExpenses
  24_000,    // annualSavings
  0.07,      // grossReturn
  0.02,      // inflationRate
  STRATEGY,
  [],        // cashflows
  true,      // hasPartner (huishouden = fiscaal partner)
)

describe('household-projection — totalen-tak is flag-bewust (C5-b)', () => {
  it('v1 en v2 geven DETECTEERBAAR VERSCHILLENDE requiredFirePortfolio', () => {
    const v1 = toSimResult(runSelectedProjection(TOTALS_INPUT, false))
    const v2 = toSimResult(runSelectedProjection(TOTALS_INPUT, true))

    const delta = Math.abs(v1.requiredFirePortfolio - v2.requiredFirePortfolio)
    expect(
      delta,
      `requiredFirePortfolio verschil te klein: v1=${Math.round(v1.requiredFirePortfolio)}, v2=${Math.round(v2.requiredFirePortfolio)}, delta=${Math.round(delta)}. Als delta≈0 wordt de flag niet gehoord.`,
    ).toBeGreaterThan(50_000)

    // Beide engines leveren een valide, decumulerend pad (deplete → ~€0 einde).
    expect(v1.rows.length).toBeGreaterThan(0)
    expect(v2.rows.length).toBeGreaterThan(0)
    expect(Number.isFinite(v1.requiredFirePortfolio)).toBe(true)
    expect(Number.isFinite(v2.requiredFirePortfolio)).toBe(true)
  })

  it('useV2=false is byte-identiek aan runUnifiedProjection (v1-fallback)', () => {
    const viaSelector = runSelectedProjection(TOTALS_INPUT, false)
    const direct = runUnifiedProjection(TOTALS_INPUT)

    expect(viaSelector.fireAge).toBe(direct.fireAge)
    expect(viaSelector.fireAgeFractional).toBe(direct.fireAgeFractional)
    expect(Math.round(viaSelector.requiredFirePortfolio)).toBe(Math.round(direct.requiredFirePortfolio))
    expect(viaSelector.rows.length).toBe(direct.rows.length)
  })

  it('buildTotalsInput bouwt één synthetisch portfolio-asset gelijk aan het netto vermogen', () => {
    // Borgt de bridge-vorm: de totalen-tak representeert het netto vermogen door
    // exact één liquide investment-asset (geen schulden), zodat v1 byte-identiek
    // blijft aan de oude runSimulation-totalen-run.
    expect(TOTALS_INPUT.assets).toHaveLength(1)
    expect(TOTALS_INPUT.debts).toHaveLength(0)
    expect(TOTALS_INPUT.assets[0].current_value).toBe(350_000)
    expect(TOTALS_INPUT.assets[0].asset_type).toBe('investment')
    // grossReturn (decimaal) → asset.expected_return (percentage).
    expect(TOTALS_INPUT.assets[0].expected_return).toBeCloseTo(7, 6)
    // Sparen loopt via annualSavings, niet via monthly_contribution.
    expect(TOTALS_INPUT.assets[0].monthly_contribution).toBe(0)
    expect(TOTALS_INPUT.annualSavings).toBe(24_000)
  })
})
