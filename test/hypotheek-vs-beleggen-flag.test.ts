/**
 * Regressietest: hypotheek-vs-beleggen FIRE-impact is flag-bewust (C5-b, engine 4 van 4).
 *
 * `compareMortgageVsInvest` draaide de FIRE-impact (`computeFireImpact`) voorheen
 * TWEE FIRE-scenario's (extra aflossen vs. extra beleggen) ONVOORWAARDELIJK op de
 * legacy v1-engine (`runSimulation`). Na de migratie kiest de 2e parameter `useV2`
 * de engine:
 *
 *  • `useV2 = false` (default)  → beide scenario's byte-identiek op de legacy
 *    v1-engine (`runSimulation`) — exact het gedrag van vóór deze migratie.
 *  • `useV2 = true`             → beide scenario's op de v2-grootboek-engine via
 *    `runSelectedProjection` op de synthetisch-portfolio-bridge (`buildHvBSimInput`).
 *
 * De twee scenario's verschillen alléén in `annualSavings` (aflossen = ongewijzigd,
 * beleggen = + extra·12). De aflossing-/beleggen-scenario's en breakeven draaien op
 * deterministische amortisatie-/groeischema's (géén FIRE-engine) en zijn dus per
 * constructie flag-onafhankelijk — alleen `fireImpactMaanden` verandert.
 *
 * Deze test vergrendelt:
 *  1. flag-off is byte-identiek aan de directe legacy `runSimulation`-aanroep (de
 *     geaccepteerde v1-fallback) — geen stille gedragswijziging.
 *  2. default (geen 2e arg) == useV2=false — de bestaande callers blijven v1.
 *  3. de niet-FIRE-velden (aflossing/beleggen/breakeven/verschil/aanbeveling) zijn
 *     identiek tussen flag-off en flag-on — de flag raakt ENKEL de FIRE-impact.
 *  4. flag-on selecteert v2: de FIRE-impact verschilt detecteerbaar van v1 (een tak
 *     die v1 hardcodet zou identieke maanden geven).
 *  5. de FIRE-impact blijft betekenisvol op beide engines: bij rendement (7%) boven
 *     de hypotheekrente (3,5%) wint beleggen (positieve impact).
 *
 * De bridge `buildHvBSimInput` is bewust lokaal in `lib/hypotheek-vs-beleggen.ts`
 * gehouden (puur, DB-vrij) i.p.v. de household-/fee-bridge te importeren.
 */

import { describe, it, expect } from 'vitest'
import {
  compareMortgageVsInvest,
  buildHvBSimInput,
  type HvBParams,
} from '@/lib/hypotheek-vs-beleggen'
import { runSimulation } from '@/lib/fire-simulation'

// Params MÉT FIRE-impact-velden, zodat `computeFireImpact` daadwerkelijk de engine
// raakt (zonder deze velden retourneert hij vroegtijdig `null`).
const BASE: HvBParams = {
  extraBedrag: 300,
  hypotheekBalance: 250_000,
  rente: 3.5, // percentage
  repaymentType: 'annuity',
  restLooptijd: 300, // 25 jaar
  isTaxDeductible: true,
  marginaalTarief: 0.3697,
  verwachtRendement: 0.07,
  inflatie: 0.02,
  hasPartner: false,
  horizonJaren: 10,
  // FIRE-impact-velden
  currentAge: 35,
  currentPortfolio: 150_000,
  yearlyExpenses: 36_000,
  annualSavings: 18_000,
  cashflows: [],
}

/** Reproduceer de exacte v1-FIRE-impact die de functie vóór de migratie deed. */
function v1FireImpactMonths(p: HvBParams): number | null {
  const endAge = 100
  const baseCashflows = p.cashflows ?? []
  const simAflossen = runSimulation(
    p.currentAge!, endAge, p.currentPortfolio!,
    p.yearlyExpenses!, p.annualSavings!,
    p.verwachtRendement, 'nl_box3', p.inflatie,
    baseCashflows,
  )
  const simBeleggen = runSimulation(
    p.currentAge!, endAge, p.currentPortfolio!,
    p.yearlyExpenses!, p.annualSavings! + p.extraBedrag * 12,
    p.verwachtRendement, 'nl_box3', p.inflatie,
    baseCashflows,
  )
  const ageA = simAflossen.fireAgeFractional
  const ageB = simBeleggen.fireAgeFractional
  if (ageA == null && ageB == null) return null
  if (ageA == null) return 120
  if (ageB == null) return -120
  return Math.round((ageA - ageB) * 12)
}

describe('hypotheek-vs-beleggen — FIRE-impact is flag-bewust (C5-b)', () => {
  it('useV2=false is byte-identiek aan de legacy runSimulation-FIRE-impact (v1-fallback)', () => {
    const result = compareMortgageVsInvest(BASE, false)
    expect(result.fireImpactMaanden).toBe(v1FireImpactMonths(BASE))
  })

  it('default (geen 2e arg) == useV2=false — bestaande callers blijven v1', () => {
    const implicit = compareMortgageVsInvest(BASE)
    const explicit = compareMortgageVsInvest(BASE, false)
    expect(implicit).toEqual(explicit)
  })

  it('de flag raakt ENKEL de FIRE-impact — alle andere velden zijn identiek', () => {
    const v1 = compareMortgageVsInvest(BASE, false)
    const v2 = compareMortgageVsInvest(BASE, true)
    // Deterministische (niet-FIRE) onderdelen draaien flag-onafhankelijk.
    expect(v2.aflossing).toEqual(v1.aflossing)
    expect(v2.beleggen).toEqual(v1.beleggen)
    expect(v2.verschil).toBe(v1.verschil)
    expect(v2.breakevenRendement).toBe(v1.breakevenRendement)
    expect(v2.aanbeveling).toBe(v1.aanbeveling)
    expect(v2.jaarlijkseVergelijking).toEqual(v1.jaarlijkseVergelijking)
  })

  it('useV2=true selecteert v2: DETECTEERBAAR andere FIRE-impact dan v1', () => {
    const v1 = compareMortgageVsInvest(BASE, false)
    const v2 = compareMortgageVsInvest(BASE, true)
    // v2 rekent reëel → de FIRE-leeftijden (en dus de delta) verschuiven t.o.v. v1.
    // Als de tak v1 zou hardcoden, waren beide identiek.
    expect(v2.fireImpactMaanden).not.toBe(v1.fireImpactMaanden)
    expect(v2.fireImpactMaanden).not.toBeNull()
  })

  it('FIRE-impact blijft betekenisvol op beide engines: 7% > 3,5% rente → beleggen wint', () => {
    const v1 = compareMortgageVsInvest(BASE, false)
    const v2 = compareMortgageVsInvest(BASE, true)
    // Positief = beleggen brengt FIRE eerder. Bij rendement boven de hypotheekrente
    // is dat de verwachte richting op beide engines.
    expect(v1.fireImpactMaanden!).toBeGreaterThan(0)
    expect(v2.fireImpactMaanden!).toBeGreaterThan(0)
  })

  it('zonder FIRE-impact-velden retourneert null — engine-arm wordt niet bereikt (flag-irrelevant)', () => {
    const noFireParams: HvBParams = {
      ...BASE,
      currentAge: undefined,
      currentPortfolio: undefined,
      yearlyExpenses: undefined,
      annualSavings: undefined,
    }
    expect(compareMortgageVsInvest(noFireParams, false).fireImpactMaanden).toBeNull()
    expect(compareMortgageVsInvest(noFireParams, true).fireImpactMaanden).toBeNull()
  })

  it('buildHvBSimInput bouwt één synthetisch portfolio-asset gelijk aan het portfolio', () => {
    const input = buildHvBSimInput(35, 150_000, 36_000, 18_000, 0.07, 0.02, [])
    expect(input.assets).toHaveLength(1)
    expect(input.debts).toHaveLength(0)
    expect(input.assets[0].current_value).toBe(150_000)
    expect(input.assets[0].asset_type).toBe('investment')
    // bruto return (decimaal) → asset.expected_return (percentage).
    expect(input.assets[0].expected_return).toBeCloseTo(7, 6)
    expect(input.grossReturn).toBeCloseTo(0.07, 6)
    // Sparen loopt via annualSavings, niet via monthly_contribution.
    expect(input.assets[0].monthly_contribution).toBe(0)
    expect(input.annualSavings).toBe(18_000)
    // Het beleggen-scenario verhoogt enkel annualSavings (+ extra·12).
    const beleggen = buildHvBSimInput(35, 150_000, 36_000, 18_000 + 300 * 12, 0.07, 0.02, [])
    expect(beleggen.annualSavings).toBe(18_000 + 3_600)
    expect(beleggen.assets[0].current_value).toBe(150_000)
  })
})
