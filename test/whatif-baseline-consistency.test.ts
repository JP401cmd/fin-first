import { describe, it, expect } from 'vitest'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import type { FinancialInput, LifeEvent } from '@/lib/horizon-data'
import { buildHorizonInput } from '@/lib/horizon-engine/build-input'
import { runSelectedProjection } from '@/lib/horizon-engine/select'
import { toSimResult, type UnifiedProjectionInput } from '@/lib/unified-projection'
import { lifeEventsToCashflows } from '@/lib/fire-simulation'
import { filterAssetsForFire, type HousingStrategyConfig } from '@/lib/housing-strategy'
import { WITHDRAWAL_DEFAULTS } from '@/lib/withdrawal-strategy'

// B (review): de what-if-baseline MOET identiek zijn aan de hoofd-/toekomst-
// grafiek wanneer een gekoppeld verkoop-event bestaat. Vóór de fix bouwde de
// what-if-pagina zijn baseline-input INLINE (zonder buildHorizonInput) → géén
// assetLiquidations/skipEventIds → de opbrengst van een gekoppeld verkoop-event
// verdampte en de baseline-FIRE-leeftijd weken af van de (correcte) grafiek.
//
// Deze suite borgt de invariant op het gedeelde rekenniveau: beide paden roepen
// nu buildHorizonInput aan met dezelfde config → identieke FIRE-leeftijd. De
// derde test bewijst dat het verschil ECHT was (de oude inline-aanpak geeft een
// andere uitkomst).

// 69-jarige met een te liquideren stacaravan (physical) op 73; geen schulden.
const ASSETS: Asset[] = (
  [
    ['bel', 'Beleggen', 'investment', 280000, 5, null],
    ['cash', 'Spaar', 'cash', 40000, 0, null],
    ['caravan', 'Stacaravan', 'physical', 25000, -5, 5],
  ] as const
).map(([id, name, t, v, r, dep]) => ({
  id, name, asset_type: t, current_value: v, expected_return: r,
  is_active: true, net_worth_inclusion_pct: 100, depreciation_rate: dep,
  // sale_config vast_moment: de caravan wordt op 73 verkocht in buildShared (SSoT).
  // Dit is nodig zodat de "regressie-bewijs"-test een meetbaar verschil ziet:
  // buildShared liquideert de caravan via de engine op 73; buildLegacyInline (oud
  // inline-pad) heeft geen assetLiquidations → de caravan blijft onbeweged in de
  // pot → meetbaar verschil in endPortfolio op verkoopjaar.
  ...(id === 'caravan' ? { sale_config: { stand: 'vast_moment', triggerAge: 73 } } : {}),
}) as unknown as Asset)

const NO_DEBTS: Debt[] = []

const HORIZON_INPUT: FinancialInput = {
  monthlyContributions: 0,
  yearlyMustExpenses: 28000,
  dateOfBirth: '1957-01-01',
  monthlyIncome: 0,
} as unknown as FinancialInput

const SALE_EVENT: LifeEvent = {
  id: 'sale-caravan', name: 'Stacaravan verkopen', event_type: 'custom',
  target_age: 73, target_date: null, one_time_cost: 0, monthly_cost_change: -100,
  monthly_income_change: 0, duration_months: 0, icon: 'Home', is_active: true,
  sort_order: 1, is_indexed: false, metadata: { verkoopprijs: 20000 }, linked_asset_id: 'caravan',
} as unknown as LifeEvent

const HOUSING: HousingStrategyConfig = { mode: 'include_full' }

/** Gedeelde builder-aanroep (zoals zowel /toekomst als de what-if-baseline nu doen). */
function buildShared(events: LifeEvent[]) {
  return buildHorizonInput({
    horizonInput: HORIZON_INPUT,
    lifeEvents: events,
    fireStrategy: { strategy: 'deplete', endAge: 90, legacyAmount: 0 },
    grossReturn: 0.05,
    inflation: 0.02,
    assets: ASSETS,
    debts: NO_DEBTS,
    box3Method: 'forfaitair',
    hasPartner: true,
    housingStrategy: HOUSING,
    horizonEngineV2: true,
  })!
}

/** Reconstructie van de OUDE inline what-if-baseline (vóór de fix): géén
 *  assetLiquidations, géén skipIds — cashflows los uit lifeEventsToCashflows. */
function buildLegacyInline(events: LifeEvent[]): UnifiedProjectionInput {
  const { assets, debts } = filterAssetsForFire(HOUSING, ASSETS, NO_DEBTS)
  return {
    assets,
    debts,
    currentAge: 69,
    endAge: 90,
    yearlyExpenses: 28000,
    annualSavings: 0,
    monthlySurplus: 0,
    monthlyIncome: 0,
    incomeGrowthRate: 0,
    grossReturn: 0.05,
    inflationRate: 0.02,
    box3Method: 'forfaitair',
    cashflows: lifeEventsToCashflows(events), // GEEN skipIds
    strategyConfig: { strategy: 'deplete', endAge: 90, legacyAmount: 0 },
    withdrawalStrategy: WITHDRAWAL_DEFAULTS,
    forcedFireAge: undefined,
    hasPartner: true,
    bankAccountCash: 0,
    // assetLiquidations bewust ONTBREKEND (de oude bug).
  } as UnifiedProjectionInput
}

describe('B — what-if-baseline == hoofd-grafiek bij gekoppeld verkoop-event', () => {
  it('baseline (what-if) en grafiek (/toekomst) lopen door dezelfde builder → identieke FIRE-leeftijd', () => {
    // Beide paden = buildHorizonInput met dezelfde config + event-set.
    const graph = buildShared([SALE_EVENT])
    const whatifBaseline = buildShared([SALE_EVENT])

    // De gedeelde input is per constructie gelijk (assetLiquidations + skipIds).
    expect(whatifBaseline.input.assetLiquidations).toEqual(graph.input.assetLiquidations)
    expect(whatifBaseline.input.assetLiquidations?.length).toBe(1)

    const graphFire = toSimResult(runSelectedProjection(graph.input, true, graph.strategyOptions)).fireAgeFractional
    const baselineFire = toSimResult(runSelectedProjection(whatifBaseline.input, true, whatifBaseline.strategyOptions)).fireAgeFractional

    expect(baselineFire).toBe(graphFire)
  })

  it('de gedeelde baseline onderdrukt de opbrengst-dubbeltelling (skipIds) maar behoudt de liquidatie', () => {
    const built = buildShared([SALE_EVENT])
    // De one_time opbrengst-cashflow van het verkoop-event is onderdrukt...
    expect(built.cashflows.some((c) => c.id === 'le-cost-sale-caravan')).toBe(false)
    // ...maar de -100/mo onderhouds-cashflow blijft, en de liquidatie bestaat.
    expect(built.cashflows.some((c) => c.id === 'le-costchange-sale-caravan')).toBe(true)
    expect(built.input.assetLiquidations?.length).toBe(1)
  })

  it('regressie-bewijs: de OUDE inline-aanpak (geen assetLiquidations) modelleert de verkoop ANDERS', () => {
    const graph = buildShared([SALE_EVENT])
    const legacy = buildLegacyInline([SALE_EVENT])

    const graphRows = toSimResult(runSelectedProjection(graph.input, true, graph.strategyOptions)).rows
    const legacyRows = toSimResult(runSelectedProjection(legacy, true)).rows

    const portfolioAt = (rows: typeof graphRows, age: number) =>
      rows.find((r) => r.age === age)?.endPortfolio ?? 0
    const SALE_AGE = 73

    // Vóór de verkoop zijn de paden gelijk (zelfde startdata, zelfde groei).
    expect(portfolioAt(graphRows, SALE_AGE - 1)).toBeCloseTo(portfolioAt(legacyRows, SALE_AGE - 1), 0)

    // Vanaf het verkoopjaar lopen ze uiteen: de nieuwe (gedeelde) baseline
    // liquideert het asset via de engine (asset verlaat de pot, netto-opbrengst
    // − verkoopkosten naar liquide), terwijl de oude inline-aanpak géén
    // assetLiquidations had → het verkoop-event werd anders (of niet) verwerkt.
    // De fix maakt baseline == grafiek; dit borgt dat het verschil ECHT bestond.
    expect(portfolioAt(graphRows, SALE_AGE)).not.toBeCloseTo(portfolioAt(legacyRows, SALE_AGE), 0)
  })
})
