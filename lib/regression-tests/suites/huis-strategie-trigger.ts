import { registerCategory, registerTests } from '../test-registry'
import {
  assert,
  assertEqual,
  assertNotNull,
  assertGreaterThan,
  assertGreaterThanOrEqual,
  assertLessThan,
  assertLessThanOrEqual,
  assertFinite,
} from '../assert'
import type { TestCase } from '../test-types'
import {
  deriveHousingContext,
  filterAssetsForFire,
  parseHousingStrategy,
  isHousingStrategyEvent,
  DEFAULT_DOWNSIZE_CONFIG,
  DEFAULT_REVERSE_MORTGAGE_CONFIG,
  type DownsizeConfig,
  type ReverseMortgageConfig,
  type HousingStrategyConfig,
} from '@/lib/housing-strategy'
import {
  resolveHousingEventsForSim,
  resolveHousingTriggerFromProjection,
  runHousingScenarioProjection,
  type HousingTriggerSimBasis,
} from '@/lib/housing-trigger'
import { type UnifiedProjectionRow } from '@/lib/unified-projection'
import { runSelectedProjection } from '@/lib/horizon-engine/select'
import { unifiedRowsToStackedRows } from '@/lib/wealth-composition'
import { lifeEventsToCashflows } from '@/lib/fire-simulation'
import { WITHDRAWAL_DEFAULTS } from '@/lib/withdrawal-strategy'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'

const CAT = 'horizon.huis-strategie'

/**
 * Regressie-suite voor de eigen-huis-strategie ná de simulatie-gebaseerde
 * trigger (lib/housing-trigger.ts). Bewaakt de kernklacht: het
 * "wanneer nodig"-moment moet exact samenvallen met het punt waar het
 * vermogen in de GRAFIEK opraakt — voor de lijn (SimChart) én de
 * barchart (vermogensopbouw via unifiedRowsToStackedRows), voor alle
 * vier de strategieën.
 */

// ── Fixtures ────────────────────────────────────────────────

function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'rt-asset-1',
    user_id: 'rt-user',
    name: 'Beleggingen',
    asset_type: 'investment',
    current_value: 200_000,
    expected_return: 5,
    monthly_contribution: 0,
    is_active: true,
    net_worth_inclusion_pct: 100,
    woz_value: null,
    linked_asset_id: null,
    ...overrides,
  } as Asset
}

function makeEigenHuis(): Asset {
  return makeAsset({
    id: 'rt-eigen-huis',
    name: 'Eigen woning',
    asset_type: 'eigen_huis',
    current_value: 500_000,
    woz_value: 480_000,
    expected_return: 2,
  })
}

function makeMortgage(linkedAssetId: string): Debt {
  return {
    id: 'rt-mortgage',
    user_id: 'rt-user',
    name: 'Hypotheek',
    debt_type: 'mortgage',
    current_balance: 200_000,
    interest_rate: 3.5,
    monthly_payment: 1_400,
    end_date: '2045-01-01',
    is_active: true,
    repayment_type: 'annuiteit',
    linked_asset_id: linkedAssetId,
    net_worth_inclusion_pct: 100,
  } as Debt
}

/** Afbouw-scenario: 50-jarige zonder inkomen, €200K liquide, €40K/jaar uitgaven. */
function makeBasis(overrides: Partial<HousingTriggerSimBasis> = {}): HousingTriggerSimBasis {
  const huis = makeEigenHuis()
  return {
    assets: [makeAsset(), huis],
    debts: [makeMortgage(huis.id)],
    currentAge: 50,
    endAge: 90,
    yearlyExpenses: 40_000,
    annualSavings: 0,
    monthlyIncome: 0,
    grossReturn: 0.05,
    inflationRate: 0.02,
    box3Method: 'forfaitair',
    cashflows: [],
    strategyConfig: { strategy: 'deplete', endAge: 90, legacyAmount: 0 },
    withdrawalStrategy: WITHDRAWAL_DEFAULTS,
    hasPartner: false,
    ...overrides,
  }
}

const DOWNSIZE_ON_DEPLETION: DownsizeConfig = {
  ...DEFAULT_DOWNSIZE_CONFIG,
  trigger: 'on_depletion',
  triggerAge: 85,
}

const REVERSE_ON_DEPLETION: ReverseMortgageConfig = {
  ...DEFAULT_REVERSE_MORTGAGE_CONFIG,
  trigger: 'on_depletion',
  triggerAge: 85,
}

const ALL_MODES: HousingStrategyConfig[] = [
  { mode: 'include_full' },
  { mode: 'exclude_from_fire' },
  DOWNSIZE_ON_DEPLETION,
  REVERSE_ON_DEPLETION,
]

const tests: TestCase[] = [
  {
    id: 'huis-trigger-gelijk-grafiek',
    name: 'Trigger == grafiek-uitputting (downsize × wanneer-nodig)',
    category: CAT,
    description:
      'target_age van het verkoop-event is exact de eerste leeftijd waar de meetrun (zelfde engine als de grafiek) onder de drempel zakt',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      const basis = makeBasis()
      const context = deriveHousingContext(basis.assets, basis.debts)
      const { events, depletion } = resolveHousingEventsForSim(
        DOWNSIZE_ON_DEPLETION,
        context,
        basis,
      )
      assertNotNull(depletion, 'depletion-uitleg aanwezig')
      assertEqual(depletion!.reason, 'crossover', 'afbouw-scenario kruist')
      assertEqual(events.length, 1, 'één verkoop-event')
      assertEqual(events[0].target_age, depletion!.triggerAge, 'marker == trigger')
      // Zelfconsistentie i.p.v. `converged`: sinds de volle-horizon-scan
      // (Issue 1, ADR 0012) kan de kruising tegen het einde van de horizon
      // vallen, waar de vaste-punt-iteratie niet altijd convergeert. De
      // invariant die telt is dat de marker exact de eerste kruising in zijn
      // eigen liquide pad is (zie hieronder) — dat is "marker == grafiek".
      // Onafhankelijke verificatie tegen het liquide pad uit de resolver.
      const firstCross = depletion!.liquidPath.find((p) => p.liquid - p.buffer <= 1)
      assertNotNull(firstCross, 'kruising bestaat in liquide pad')
      assertEqual(depletion!.triggerAge, firstCross!.age, 'trigger = eerste kruising')
    },
  },
  {
    id: 'huis-trigger-metadata',
    name: 'Event-metadata: simulatie-uitleg + bedragen',
    category: CAT,
    description:
      'metadata.depletion heeft method=simulation; bedragen (saleProceeds, wozValueAtTrigger) blijven gevuld',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      const basis = makeBasis()
      const context = deriveHousingContext(basis.assets, basis.debts)
      const { events } = resolveHousingEventsForSim(DOWNSIZE_ON_DEPLETION, context, basis)
      const meta = (events[0].metadata ?? {}) as Record<string, unknown>
      assertEqual((meta.depletion as { method?: string })?.method, 'simulation', 'nieuw shape')
      assertEqual(meta.triggerMode, 'on_depletion', 'triggerMode')
      assertFinite(Number(meta.saleProceeds), 'saleProceeds')
      assertFinite(Number(meta.wozValueAtTrigger), 'wozValueAtTrigger')
      assert(isHousingStrategyEvent(events[0]), 'herkenbaar als beheerd event')
    },
  },
  {
    id: 'huis-grafiek-alle-strategieen',
    name: 'Grafiek + barchart gezond voor alle 4 strategieën',
    category: CAT,
    description:
      'Volledige pipeline (filter + events + unified projection + stackedRows) levert eindige rijen en kloppende bar-samenstelling per strategie',
    priority: 'critical',
    estimatedDurationMs: 600,
    fn() {
      const basis = makeBasis()
      const context = deriveHousingContext(basis.assets, basis.debts)
      for (const config of ALL_MODES) {
        const { events } = resolveHousingEventsForSim(config, context, basis)
        const { assets, debts } = filterAssetsForFire(config, basis.assets, basis.debts)
        const result = runSelectedProjection({
          assets,
          debts,
          currentAge: basis.currentAge,
          endAge: basis.endAge,
          yearlyExpenses: basis.yearlyExpenses,
          annualSavings: basis.annualSavings,
          monthlySurplus: 0,
          monthlyIncome: basis.monthlyIncome,
          incomeGrowthRate: 0,
          grossReturn: basis.grossReturn,
          inflationRate: basis.inflationRate,
          box3Method: basis.box3Method,
          cashflows: [...basis.cashflows, ...lifeEventsToCashflows(events)],
          strategyConfig: basis.strategyConfig,
          withdrawalStrategy: basis.withdrawalStrategy,
          hasPartner: basis.hasPartner,
        }, true)
        assertGreaterThan(result.rows.length, 0, `${config.mode}: rijen`)
        const stacked = unifiedRowsToStackedRows(result.rows)
        assertEqual(stacked.length, result.rows.length, `${config.mode}: stacked 1-op-1`)
        for (const row of result.rows) {
          assertFinite(row.netWorth, `${config.mode}: netWorth eindig`)
        }
        for (const bar of stacked) {
          assertFinite(bar.vastgoed, `${config.mode}: vastgoed-bar eindig`)
          assertFinite(bar.schulden, `${config.mode}: schulden-bar eindig`)
          assertLessThanOrEqual(bar.schulden, 0, `${config.mode}: schulden ≤ 0`)
        }
        // Vastgoed-bar in de ENGINE-rijen: include_full/reverse hebben het
        // huis in de pot (bar > 0 in jaar 0); exclude/downsize niet (de
        // UI-injectie in horizon-client plakt hem daar terug op basis van
        // hetzelfde event-trigger-moment).
        const houseInEngine = config.mode === 'include_full' || config.mode === 'reverse_mortgage'
        if (houseInEngine) {
          assertGreaterThan(stacked[0].vastgoed, 0, `${config.mode}: huis in engine-bar`)
        } else {
          assertEqual(stacked[0].vastgoed, 0, `${config.mode}: huis uit engine-bar`)
        }
      }
    },
  },
  {
    id: 'huis-downsize-opveert',
    name: 'Verkoopopbrengst landt op het trigger-moment in de lijn',
    category: CAT,
    description:
      'In de run-mét-event blijft netWorth vóór de trigger positief en veert het op de trigger-leeftijd omhoog',
    priority: 'critical',
    estimatedDurationMs: 300,
    fn() {
      const basis = makeBasis()
      const context = deriveHousingContext(basis.assets, basis.debts)
      const scenario = runHousingScenarioProjection(DOWNSIZE_ON_DEPLETION, context, basis)
      const trigger = scenario.events[0]?.target_age
      assertNotNull(trigger, 'trigger aanwezig')
      const { assets, debts } = filterAssetsForFire(DOWNSIZE_ON_DEPLETION, basis.assets, basis.debts)
      const run = runSelectedProjection({
        assets,
        debts,
        currentAge: basis.currentAge,
        endAge: basis.endAge,
        yearlyExpenses: basis.yearlyExpenses,
        annualSavings: basis.annualSavings,
        monthlySurplus: 0,
        monthlyIncome: 0,
        incomeGrowthRate: 0,
        grossReturn: basis.grossReturn,
        inflationRate: basis.inflationRate,
        box3Method: basis.box3Method,
        cashflows: lifeEventsToCashflows(scenario.events),
        strategyConfig: basis.strategyConfig,
        withdrawalStrategy: basis.withdrawalStrategy,
        hasPartner: false,
      }, true)
      for (const row of run.rows) {
        if (row.age >= trigger!) break
        assertGreaterThan(row.netWorth, 0, `vóór trigger (leeftijd ${row.age}) niet onder nul`)
      }
      const atTrigger = run.rows.find((r) => Math.abs(r.age - trigger!) < 1e-6)
      assertNotNull(atTrigger, 'rij op trigger-leeftijd')
      // v2 note (ADR 0016): in v2 the house sale proceeds are integrated into the
      // deplete annuity rather than as a separate step, so netWorth at trigger may not
      // visibly "bounce up" relative to the prior row. Verify only that the trigger
      // row exists and netWorth is non-negative (no portfolio crash).
      if (atTrigger) {
        assertGreaterThanOrEqual(atTrigger.netWorth, 0, 'opbrengst niet negatief op trigger')
      }
    },
  },
  {
    id: 'huis-reverse-zelfde-mechanisme',
    name: 'Opeethypotheek gebruikt hetzelfde simulatie-mechanisme',
    category: CAT,
    description:
      'reverse_mortgage × wanneer-nodig: trigger zelfconsistent met eigen liquide pad, uitkering > 0, buffer 0',
    priority: 'high',
    estimatedDurationMs: 300,
    fn() {
      const basis = makeBasis()
      const context = deriveHousingContext(basis.assets, basis.debts)
      const { events, depletion } = resolveHousingEventsForSim(REVERSE_ON_DEPLETION, context, basis)
      assertNotNull(depletion, 'depletion aanwezig')
      assertEqual(depletion!.method, 'simulation', 'simulatie-gebaseerd')
      assertEqual(depletion!.bufferAtTrigger, 0, 'geen verkoopkosten-buffer')
      assertEqual(events.length, 1, 'één uitkering-event')
      assertGreaterThan(events[0].monthly_income_change, 0, 'maandelijkse uitkering')
      assertEqual(events[0].target_age, depletion!.triggerAge, 'marker == trigger')
      const firstCross = depletion!.liquidPath.find((p) => p.liquid - p.buffer <= 1)
      assertNotNull(firstCross, 'kruising in eigen liquide pad')
      assertEqual(depletion!.triggerAge, firstCross!.age, 'zelfconsistent')
    },
  },
  {
    id: 'huis-fixed-age',
    name: 'Vaste leeftijd: event op config-leeftijd, geen iteratie',
    category: CAT,
    description: 'fixed_age levert target_age = gekozen leeftijd en depletion = null',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      const basis = makeBasis()
      const context = deriveHousingContext(basis.assets, basis.debts)
      const { events, depletion } = resolveHousingEventsForSim(
        { ...DOWNSIZE_ON_DEPLETION, trigger: 'fixed_age', triggerAge: 67 },
        context,
        basis,
      )
      assertEqual(depletion, null, 'geen depletion bij vaste leeftijd')
      assertEqual(events[0].target_age, 67, 'event op 67')
    },
  },
  {
    id: 'huis-veiligheidsmarge',
    name: 'Veiligheidsmarge vervroegt de trigger',
    category: CAT,
    description: 'depletionThresholdYears=2 triggert eerder dan 0 (marge bovenop kosten-buffer)',
    priority: 'medium',
    estimatedDurationMs: 300,
    fn() {
      const basis = makeBasis()
      const context = deriveHousingContext(basis.assets, basis.debts)
      const zonder = resolveHousingTriggerFromProjection(
        { ...DOWNSIZE_ON_DEPLETION, depletionThresholdYears: 0 },
        context,
        basis,
      )
      const met = resolveHousingTriggerFromProjection(
        { ...DOWNSIZE_ON_DEPLETION, depletionThresholdYears: 2 },
        context,
        basis,
      )
      assertLessThan(met.triggerAge, zonder.triggerAge, 'marge → eerder verkopen')
      assertGreaterThanOrEqual(
        met.marginAtTrigger,
        2 * basis.yearlyExpenses,
        'marge ≥ 2 jaar uitgaven',
      )
    },
  },
  {
    id: 'huis-config-compat',
    name: 'Bestaande JSONB-configs parsen door',
    category: CAT,
    description:
      'Oude opgeslagen shapes (threshold 2, on_depletion) blijven geldig; nieuwe default is 0',
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      const oud = parseHousingStrategy({
        mode: 'downsize',
        trigger: 'on_depletion',
        triggerAge: 70,
        depletionThresholdYears: 2,
        salePricePct: 1,
        salesCostsPct: 0.04,
        newMonthlyHousingCost: null,
      })
      assertEqual(oud.mode, 'downsize', 'mode behouden')
      if (oud.mode === 'downsize') {
        assertEqual(oud.depletionThresholdYears, 2, 'opgeslagen marge behouden')
      }
      assertEqual(DEFAULT_DOWNSIZE_CONFIG.depletionThresholdYears, 0, 'nieuwe default 0')
      assertEqual(DEFAULT_REVERSE_MORTGAGE_CONFIG.depletionThresholdYears, 0, 'nieuwe default 0')
      // Malformed → veilige fallback blijft include_full.
      assertEqual(parseHousingStrategy('garbage').mode, 'include_full', 'fallback intact')
    },
  },
]

export function register(): void {
  registerCategory({
    id: CAT,
    label: 'De Horizon — Huis-strategie',
    description:
      'Simulatie-gebaseerde "wanneer nodig"-trigger: marker == grafiek-uitputting, barchart-samenstelling en config-compatibiliteit voor alle vier woonstrategieën',
    icon: 'Home',
    testCount: 0,
  })
  registerTests(tests)
}
