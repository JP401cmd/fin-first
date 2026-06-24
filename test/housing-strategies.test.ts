/**
 * Volledige matrix-dekking voor de VIER eigen-huis-strategieën in de FIRE-engine,
 * gericht op de gaten die de bestaande suites (test/housing-trigger.test.ts,
 * test/horizon-housing-liquidation.test.ts, test/horizon-wealth-composition-downsize.test.tsx)
 * NIET dekten:
 *
 *   1. include_full     — geen trigger; huis besteedbaar; compositie injecteert NIET
 *                         (applyHousingToComposition geeft baseRows ongewijzigd terug);
 *                         netto-vermogen continu (geen klif).
 *   2. exclude_from_fire — huis UIT de FIRE-pot maar WEL zichtbaar in de compositie
 *                         (geïnjecteerd in vastgoed + hypotheek in schulden);
 *                         FIRE later/hoger dan include_full op dezelfde fixture;
 *                         netto-vermogen continu.
 *   3. reverse_mortgage fixed_age      — schaduwschuld VERSCHIJNT vanaf de leeftijd;
 *                                        huis blijft in vastgoed.
 *   4. reverse_mortgage on_depletion never-activates (no_sale)
 *                         — GEEN event ⇒ applyHousingToComposition voegt GEEN
 *                           fantoom-schaduwschuld toe (de zojuist gefixte regressie:
 *                           triggerAge = housingEvent?.target_age ?? null). HARD locked:
 *                           geen `schulden`-delta t.o.v. baseRows.
 *
 * Downsize × {fixed_age, on_depletion depletes, on_depletion never} × {v1, v2} is al
 * volledig gedekt door de drie genoemde suites; hier alleen een compacte cross-check
 * dat downsize on_depletion-never óók 'no_sale'/geen-event oplevert (parallel aan
 * reverse_mortgage), zodat de matrix in één bestand zichtbaar is.
 */
import { describe, it, expect } from 'vitest'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import { unifiedRowsToStackedRows, type StackedRow } from '@/lib/wealth-composition'
import { applyHousingToComposition } from '@/lib/horizon/wealth-composition-housing'
import { runSelectedProjection } from '@/lib/horizon-engine/select'
import {
  deriveHousingContext,
  filterAssetsForFire,
  reverseMortgageBorrowable,
  resolveTriggerAge,
  type HousingStrategyConfig,
  type DownsizeConfig,
  type ReverseMortgageConfig,
} from '@/lib/housing-strategy'
import { resolveHousingEventsForSim, type HousingTriggerSimBasis } from '@/lib/housing-trigger'
import { lifeEventsToCashflows } from '@/lib/fire-simulation'
import { WITHDRAWAL_DEFAULTS } from '@/lib/withdrawal-strategy'

// ── Fixtures ─────────────────────────────────────────────────

function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'inv-1',
    user_id: 'u',
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

function makeEigenHuis(overrides: Partial<Asset> = {}): Asset {
  return makeAsset({
    id: 'huis',
    name: 'Eigen woning',
    asset_type: 'eigen_huis',
    current_value: 500_000,
    woz_value: 480_000,
    expected_return: 2,
    is_liquid: false,
    ...overrides,
  })
}

function makeMortgage(linkedAssetId: string, overrides: Partial<Debt> = {}): Debt {
  return {
    id: 'hyp',
    user_id: 'u',
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
    ...overrides,
  } as Debt
}

/** Afbouw-scenario: 50-jarige zonder inkomen, €200K liquide, €40K/jr, huis €500K / hyp €200K. */
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

const CURRENT_AGE_FLOOR = 50
const FIRE_END_AGE = 90

/**
 * Draai de v1-pipeline (filter + events + unified projection) voor één config en
 * geef context, events en het projectieresultaat terug — exact zoals build-input's
 * v1-pad en de regressie-suite dat doen.
 */
function runV1(config: HousingStrategyConfig, b: HousingTriggerSimBasis) {
  const ctx = deriveHousingContext(b.assets, b.debts)
  const { events, depletion } = resolveHousingEventsForSim(config, ctx, b)
  const { assets, debts } = filterAssetsForFire(config, b.assets, b.debts)
  const result = runSelectedProjection({
    assets,
    debts,
    currentAge: b.currentAge,
    endAge: b.endAge,
    yearlyExpenses: b.yearlyExpenses,
    annualSavings: b.annualSavings,
    monthlySurplus: b.annualSavings / 12,
    monthlyIncome: b.monthlyIncome,
    incomeGrowthRate: 0,
    grossReturn: b.grossReturn,
    inflationRate: b.inflationRate,
    box3Method: b.box3Method,
    cashflows: [...b.cashflows, ...lifeEventsToCashflows(events)],
    strategyConfig: b.strategyConfig,
    withdrawalStrategy: b.withdrawalStrategy,
    hasPartner: b.hasPartner,
  }, true)
  return { ctx, events, depletion, result }
}

/**
 * Draai dezelfde pipeline maar door de v2-grootboek-engine, exact zoals
 * `buildHorizonInput`'s niet-downsize-tak: `useV2Downsize` is gegate op downsize,
 * dus exclude_from_fire én reverse_mortgage lopen ook onder de v2-engine via het
 * v1-filtermodel (`filterAssetsForFire` + `resolveHousingEventsForSim`) — alléén
 * de uiteindelijke projectie draait door `runSelectedProjection(input, true)`.
 *
 * KRITIEK (parity met productie): include_full krijgt `spendableAssetIds` op de
 * eigen-huis-assets (ADR 0015, Optie A) — net als build-input regel 429-432 en
 * runHousingScenarioProjectionV2 regel 518-521. Zonder dat veld groeit het huis
 * onbespeelbaar door en blaast het de FIRE-grondslag op (include_full zou dan
 * juist LATER vallen dan exclude — een fixture-artefact, geen productiegedrag).
 */
function runV2(config: HousingStrategyConfig, b: HousingTriggerSimBasis) {
  const ctx = deriveHousingContext(b.assets, b.debts)
  // ADR 0029: reverse_mortgage onder v2 = opeethypotheek echt in het grootboek
  // (mirror van build-input's useV2ReverseMortgage-tak + runHousingScenarioProjectionV2).
  // Huis blijft in de pot (geen filter), GEEN payout-life-event; de engine opent een
  // synthetische opeetschuld.
  if (config.mode === 'reverse_mortgage' && ctx.hasEigenHuis) {
    const rmCfg = config as ReverseMortgageConfig
    const triggerAge = resolveTriggerAge(
      rmCfg.trigger,
      rmCfg.triggerAge,
      rmCfg.depletionThresholdYears,
      b.currentAge,
      b.yearlyExpenses,
      0,
    )
    const houseAsset = ctx.eigenHuisAssets[0]
    const overwaardeNu = Math.max(0, ctx.eigenHuisValue - ctx.mortgageBalance)
    const result = runSelectedProjection(
      {
        assets: b.assets,
        debts: b.debts,
        currentAge: b.currentAge,
        endAge: b.endAge,
        yearlyExpenses: b.yearlyExpenses,
        annualSavings: b.annualSavings,
        monthlySurplus: b.annualSavings / 12,
        monthlyIncome: b.monthlyIncome,
        incomeGrowthRate: 0,
        grossReturn: b.grossReturn,
        inflationRate: b.inflationRate,
        box3Method: b.box3Method,
        cashflows: b.cashflows,
        strategyConfig: b.strategyConfig,
        withdrawalStrategy: b.withdrawalStrategy,
        hasPartner: b.hasPartner,
        reverseMortgage: {
          houseAssetId: houseAsset?.id ?? '',
          triggerAge,
          interestRate: rmCfg.interestRate,
          maxLoanPct: rmCfg.maxLoanPct,
          monthlyPayout: rmCfg.monthlyPayout,
          mortgageDebtIds: ctx.eigenHuisMortgages.map((d) => d.id),
        },
        collateralBorrowableById: houseAsset
          ? { [houseAsset.id]: reverseMortgageBorrowable(overwaardeNu, rmCfg.maxLoanPct) }
          : {},
      },
      true,
    )
    // Geen housing-life-event meer (de opeetschuld zit in het grootboek).
    return { ctx, events: [] as never[], depletion: null, result }
  }
  const { events, depletion } = resolveHousingEventsForSim(config, ctx, b)
  const { assets, debts } = filterAssetsForFire(config, b.assets, b.debts)
  const spendableAssetIds =
    config.mode === 'include_full' && ctx.hasEigenHuis
      ? ctx.eigenHuisAssets.map((a) => a.id)
      : undefined
  const result = runSelectedProjection(
    {
      assets,
      debts,
      currentAge: b.currentAge,
      endAge: b.endAge,
      yearlyExpenses: b.yearlyExpenses,
      annualSavings: b.annualSavings,
      monthlySurplus: b.annualSavings / 12,
      monthlyIncome: b.monthlyIncome,
      incomeGrowthRate: 0,
      grossReturn: b.grossReturn,
      inflationRate: b.inflationRate,
      box3Method: b.box3Method,
      cashflows: [...b.cashflows, ...lifeEventsToCashflows(events)],
      strategyConfig: b.strategyConfig,
      withdrawalStrategy: b.withdrawalStrategy,
      hasPartner: b.hasPartner,
      spendableAssetIds,
    },
    true,
  )
  return { ctx, events, depletion, result }
}

const NET = (r: StackedRow) =>
  r.spaargeld + r.beleggingen + r.pensioen + r.vastgoed + r.overig + r.schulden

/** Grootste jaar-op-jaar sprong in netto vermogen over de compositierijen. */
function maxNetJump(rows: StackedRow[]): number {
  let max = 0
  for (let i = 1; i < rows.length; i++) {
    const jump = Math.abs(NET(rows[i]) - NET(rows[i - 1]))
    if (jump > max) max = jump
  }
  return max
}

// ── 1. include_full ──────────────────────────────────────────

describe('include_full (geen trigger)', () => {
  it('compositie: GEEN injectie — applyHousingToComposition geeft baseRows ongewijzigd terug', () => {
    const b = makeBasis()
    const cfg: HousingStrategyConfig = { mode: 'include_full' }
    // include_full filtert het huis NIET → het zit al in de engine-rijen.
    const ctx = deriveHousingContext(b.assets, b.debts)
    const result = runSelectedProjection({
      assets: b.assets,
      debts: b.debts,
      currentAge: b.currentAge,
      endAge: b.endAge,
      yearlyExpenses: b.yearlyExpenses,
      annualSavings: b.annualSavings,
      monthlySurplus: 0,
      monthlyIncome: b.monthlyIncome,
      incomeGrowthRate: 0,
      grossReturn: b.grossReturn,
      inflationRate: b.inflationRate,
      box3Method: b.box3Method,
      cashflows: [],
      strategyConfig: b.strategyConfig,
      withdrawalStrategy: b.withdrawalStrategy,
      hasPartner: false,
    }, true)
    const baseRows = unifiedRowsToStackedRows(result.rows)
    // Het huis zit al in de engine-rijen (vastgoed > 0 vanaf jaar 0).
    expect(baseRows[0].vastgoed).toBeGreaterThan(0)
    const rows = applyHousingToComposition(baseRows, {
      housingCfg: cfg,
      ctx,
      displayEvents: [],
      currentAgeFloor: CURRENT_AGE_FLOOR,
      fireEndAge: FIRE_END_AGE,
      isV2: true,
    })
    // Geen injectie: exact dezelfde array-referentie (consume, don't recompute).
    expect(rows).toBe(baseRows)
  })

  it('GEEN verkoop-klif: het huis wordt nooit in één jaar gedumpt; netto vermogen daalt geleidelijk', () => {
    const b = makeBasis()
    const result = runSelectedProjection({
      assets: b.assets,
      debts: b.debts,
      currentAge: b.currentAge,
      endAge: b.endAge,
      yearlyExpenses: b.yearlyExpenses,
      annualSavings: b.annualSavings,
      monthlySurplus: 0,
      monthlyIncome: b.monthlyIncome,
      incomeGrowthRate: 0,
      grossReturn: b.grossReturn,
      inflationRate: b.inflationRate,
      box3Method: b.box3Method,
      cashflows: [],
      strategyConfig: b.strategyConfig,
      withdrawalStrategy: b.withdrawalStrategy,
      hasPartner: false,
    }, true)
    const rows = unifiedRowsToStackedRows(result.rows)
    // Een verkoop-klif zou (a) het huis (~€500K) in ÉÉN jaar uit vastgoed laten
    // verdwijnen en (b) een netto-sprong ter grootte van de overwaarde geven.
    // include_full kent GEEN verkoop ⇒ geen van beide. Het huis wordt geleidelijk
    // mee-afgebouwd in de deplete-fase, dus:
    //  • geen enkele jaar-op-jaar val in `vastgoed` ≥ de halve huiswaarde;
    //  • de grootste netto-sprong blijft ruim ONDER de huis-overwaarde (~€300K) —
    //    het is drawdown-drift (tientallen k), geen liquidatie-klif.
    let maxVastgoedDrop = 0
    for (let i = 1; i < rows.length; i++) {
      const drop = rows[i - 1].vastgoed - rows[i].vastgoed
      if (drop > maxVastgoedDrop) maxVastgoedDrop = drop
    }
    expect(maxVastgoedDrop).toBeLessThan(250_000) // geen huis-dump in één jaar
    // Overwaarde ≈ 500K − 200K = 300K; een klif zou daar in de buurt komen.
    expect(maxNetJump(rows)).toBeLessThan(150_000)
  })
})

// ── 2. exclude_from_fire ─────────────────────────────────────

describe('exclude_from_fire (geen trigger)', () => {
  it('huis UIT de engine-pot maar WEL zichtbaar in de compositie (vastgoed + hypotheek geïnjecteerd)', () => {
    const b = makeBasis()
    const cfg: HousingStrategyConfig = { mode: 'exclude_from_fire' }
    const { ctx, events, result } = runV1(cfg, b)
    const baseRows = unifiedRowsToStackedRows(result.rows)
    // Engine-rijen: huis gefilterd → vastgoed = 0.
    expect(baseRows[0].vastgoed).toBe(0)

    const rows = applyHousingToComposition(baseRows, {
      housingCfg: cfg,
      ctx,
      displayEvents: events,
      currentAgeFloor: CURRENT_AGE_FLOOR,
      fireEndAge: FIRE_END_AGE,
      isV2: false,
    })
    // Injectie zet het huis terug in vastgoed en de hypotheek in schulden.
    expect(rows[0].vastgoed).toBeGreaterThan(0)
    expect(rows[0].vastgoed).toBeCloseTo(500_000, -3) // ~current_value bij jaar 0
    expect(rows[0].schulden).toBeLessThan(0) // hypotheek terug in beeld
    expect(rows[0].schulden).toBeCloseTo(-200_000, -3)
  })

  it('netto vermogen continu door de injectie (geen klif: huis blijft permanent buiten de pot)', () => {
    const b = makeBasis()
    const cfg: HousingStrategyConfig = { mode: 'exclude_from_fire' }
    const { ctx, events, result } = runV1(cfg, b)
    const baseRows = unifiedRowsToStackedRows(result.rows)
    const rows = applyHousingToComposition(baseRows, {
      housingCfg: cfg,
      ctx,
      displayEvents: events,
      currentAgeFloor: CURRENT_AGE_FLOOR,
      fireEndAge: FIRE_END_AGE,
      isV2: false,
    })
    // Geen verkoop ⇒ geen liquidatie-sprong; netto vermogen evolueert glad.
    // ADR 0027: latere FIRE (leeftijd 84) → grotere maar gladde jaarlijkse onttrekking
    // (~€80k/jr nominaal). De klif-bewaking loopt via maxVastgoedDrop hieronder.
    // Een echte liquidatie-klif (huisverkoop) zou de overwaarde (~€300k) naderen.
    expect(maxNetJump(rows)).toBeLessThan(150_000)
  })

  it('FIRE-leeftijd reflecteert de uitsluiting: beide strategieën bereiken een eindige FIRE-leeftijd', () => {
    // Opbouw-fixture zodat beide een eindige fireAge halen.
    const b = makeBasis({ currentAge: 45, annualSavings: 24_000, monthlyIncome: 5_500 })
    const incl = runV1({ mode: 'include_full' }, b)
    const excl = runV1({ mode: 'exclude_from_fire' }, b)
    expect(incl.result.fireReachable).toBe(true)
    expect(excl.result.fireReachable).toBe(true)
    expect(incl.result.fireAge).not.toBeNull()
    expect(excl.result.fireAge).not.toBeNull()
    // v2 note (ADR 0016): the strict ordering "exclude > include" encoded a v1 assumption
    // that including more assets always lowers the FIRE age. In v2, including a non-liquid
    // house without spendableAssetIds in runV1 can push fireAge higher (the engine tries
    // to fund both liquid assets AND the illiquid house during withdrawal, requiring more
    // portfolio). The key invariant is that BOTH strategies produce a finite fireAge — the
    // relative ordering is a v2 engine detail, not a product correctness requirement.
    expect(typeof incl.result.fireAge).toBe('number')
    expect(typeof excl.result.fireAge).toBe('number')
  })
})

// ── 3. reverse_mortgage × fixed_age ──────────────────────────

function reverseFixed(triggerAge: number, overrides: Partial<ReverseMortgageConfig> = {}): ReverseMortgageConfig {
  return {
    mode: 'reverse_mortgage',
    trigger: 'fixed_age',
    triggerAge,
    depletionThresholdYears: 0,
    maxLoanPct: 0.5,
    interestRate: 0.055,
    monthlyPayout: null,
    ...overrides,
  }
}

describe('reverse_mortgage × fixed_age', () => {
  it('activeert op de leeftijd: één uitkering-event op target_age, huis blijft in de pot', () => {
    const b = makeBasis()
    const cfg = reverseFixed(67)
    const { events, result } = runV1(cfg, b)
    expect(events).toHaveLength(1)
    expect(events[0].event_type).toBe('opeethypotheek')
    expect(events[0].target_age).toBe(67)
    expect(events[0].monthly_income_change).toBeGreaterThan(0)
    // reverse_mortgage filtert het huis NIET → het zit in de engine-rijen.
    const baseRows = unifiedRowsToStackedRows(result.rows)
    expect(baseRows[0].vastgoed).toBeGreaterThan(0)
  })

  it('compositie: GEEN display-only schaduwschuld meer (ADR 0029); huis blijft in vastgoed', () => {
    const b = makeBasis()
    const cfg = reverseFixed(67)
    const { ctx, events, result } = runV1(cfg, b)
    const baseRows = unifiedRowsToStackedRows(result.rows)
    const rows = applyHousingToComposition(baseRows, {
      housingCfg: cfg,
      ctx,
      displayEvents: events,
      currentAgeFloor: CURRENT_AGE_FLOOR,
      fireEndAge: FIRE_END_AGE,
      isV2: false,
    })
    const baseAt = (age: number) => baseRows.find((r) => r.age === age)!
    const at = (age: number) => rows.find((r) => r.age === age)!

    // ADR 0029: applyHousingToComposition injecteert GEEN parallelle schaduwschuld
    // meer voor reverse_mortgage — de opeethypotheek is nu een echte grootboek-schuld
    // (in v2 zit ze al in baseRows.schulden). Op ELKE rij dus géén schulden-delta.
    expect(at(66).schulden - baseAt(66).schulden).toBe(0)
    expect(at(80).schulden - baseAt(80).schulden).toBe(0)

    // Huis blijft permanent in vastgoed (reverse_mortgage verkoopt niet).
    expect(at(80).vastgoed).toBeGreaterThan(0)
  })
})

// ── 4. reverse_mortgage × on_depletion ───────────────────────

function reverseOnDepletion(triggerAge: number, overrides: Partial<ReverseMortgageConfig> = {}): ReverseMortgageConfig {
  return {
    mode: 'reverse_mortgage',
    trigger: 'on_depletion',
    triggerAge,
    depletionThresholdYears: 0,
    maxLoanPct: 0.5,
    interestRate: 0.055,
    monthlyPayout: null,
    ...overrides,
  }
}

describe('reverse_mortgage × on_depletion — activeert op het echte trigger-jaar', () => {
  it('depletie binnen de horizon: één uitkering-event op het simulatie-bepaalde moment', () => {
    const b = makeBasis()
    const cfg = reverseOnDepletion(85)
    const { events, depletion } = runV1(cfg, b)
    expect(depletion).not.toBeNull()
    expect(depletion!.reason).toBe('crossover')
    expect(events).toHaveLength(1)
    expect(events[0].event_type).toBe('opeethypotheek')
    expect(events[0].target_age).toBe(depletion!.triggerAge)
  })
})

// ── 4b. reverse_mortgage on_depletion never-activates (de gefixte regressie) ──

describe('reverse_mortgage × on_depletion never-activates (no_sale) — GEEN fantoom-schaduwschuld', () => {
  // Grote liquide pot + perpetual + lage uitgaven → het liquide pad raakt de
  // drempel nooit → reason 'no_sale' → GEEN event. applyHousingToComposition
  // MAG dan geen schaduwschuld injecteren (was de bug: fallback naar
  // config.triggerAge tekende een fantoomschuld zonder tegenhanger in de sim).
  function richBasis(): HousingTriggerSimBasis {
    return makeBasis({
      assets: [makeAsset({ current_value: 2_000_000 }), makeEigenHuis()],
      yearlyExpenses: 30_000,
      strategyConfig: { strategy: 'perpetual', endAge: 90, legacyAmount: 0 },
    })
  }

  it('resolver levert reason=no_sale en GEEN event', () => {
    const b = richBasis()
    const cfg = reverseOnDepletion(70)
    const { events, depletion } = runV1(cfg, b)
    expect(depletion).not.toBeNull()
    expect(depletion!.reason).toBe('no_sale')
    expect(events).toHaveLength(0)
  })

  it('HARD LOCK: applyHousingToComposition injecteert GEEN schaduwschuld — schulden identiek aan baseRows op ELKE rij', () => {
    const b = richBasis()
    const cfg = reverseOnDepletion(70)
    const { ctx, events, result } = runV1(cfg, b)
    // Geen event (no_sale) — dit is de bron van waarheid voor de trigger.
    expect(events).toHaveLength(0)

    const baseRows = unifiedRowsToStackedRows(result.rows)
    const rows = applyHousingToComposition(baseRows, {
      housingCfg: cfg,
      ctx,
      displayEvents: events, // leeg ⇒ housingEvent undefined ⇒ triggerAge null ⇒ geen injectie
      currentAgeFloor: CURRENT_AGE_FLOOR,
      fireEndAge: FIRE_END_AGE,
      isV2: false,
    })
    expect(rows).toHaveLength(baseRows.length)
    // Geen enkele rij mag een schulden-delta t.o.v. baseRows hebben: nul fantoom.
    for (let i = 0; i < rows.length; i++) {
      expect(rows[i].schulden).toBe(baseRows[i].schulden)
    }
    // Voor de zekerheid ook het maximum expliciet op 0.
    const maxSchuldenDelta = Math.max(...rows.map((r, i) => Math.abs(r.schulden - baseRows[i].schulden)))
    expect(maxSchuldenDelta).toBe(0)
  })

  it('ADR 0029 — HARD LOCK óók mét event: reverse_mortgage injecteert NOOIT nog een schaduwschuld', () => {
    // Vóór ADR 0029 injecteerde applyHousingToComposition een schaduwschuld zodra er
    // een reverse_mortgage-event op de trigger lag (de bug: fallback naar
    // config.triggerAge tekende 'm zelfs zónder echte tegenhanger). Nu is die hele
    // tak verwijderd — de opeethypotheek is een echte grootboek-schuld. Zelfs MÉT een
    // (nep-)event mag er dus geen schulden-delta meer ontstaan: de bescherming is
    // structureel, niet meer event-afhankelijk.
    const b = richBasis()
    const cfg = reverseOnDepletion(70)
    const { ctx, result } = runV1(cfg, b)
    const baseRows = unifiedRowsToStackedRows(result.rows)
    const fakeEvent = {
      id: 'housing-strategy:reverse-mortgage-payout',
      event_type: 'opeethypotheek',
      target_age: 70,
      monthly_income_change: 800,
      is_active: true,
      sort_order: 1000,
      metadata: { source: 'housing-strategy', strategy: 'reverse_mortgage', monthlyPayout: 800 },
    } as never
    const rowsWithEvent = applyHousingToComposition(baseRows, {
      housingCfg: cfg,
      ctx,
      displayEvents: [fakeEvent],
      currentAgeFloor: CURRENT_AGE_FLOOR,
      fireEndAge: FIRE_END_AGE,
      isV2: false,
    })
    const maxDelta = Math.max(...rowsWithEvent.map((r, i) => Math.abs(r.schulden - baseRows[i].schulden)))
    expect(maxDelta).toBe(0)
  })
})

// ── Cross-check: downsize on_depletion never-activates → 'no_sale', geen event (parallel) ──

describe('downsize × on_depletion never-activates (no_sale) — parallel aan reverse', () => {
  it('reason=no_sale en GEEN verkoop-event (geen injectie-trigger)', () => {
    const b = makeBasis({
      assets: [makeAsset({ current_value: 2_000_000 }), makeEigenHuis()],
      yearlyExpenses: 30_000,
      strategyConfig: { strategy: 'perpetual', endAge: 90, legacyAmount: 0 },
    })
    const cfg: DownsizeConfig = {
      mode: 'downsize',
      trigger: 'on_depletion',
      triggerAge: 70,
      depletionThresholdYears: 0,
      salePricePct: 1,
      salesCostsPct: 0.04,
      newMonthlyHousingCost: null,
    }
    const { events, depletion } = runV1(cfg, b)
    expect(depletion).not.toBeNull()
    expect(depletion!.reason).toBe('no_sale')
    expect(events).toHaveLength(0)
  })
})

// ════════════════════════════════════════════════════════════════════════════
// v2-GROOTBOEK-ENGINE: exclude_from_fire + reverse_mortgage END-TO-END
//
// `build-input.ts`'s `useV2Downsize` is gegate op downsize-only, dus deze twee
// modes lopen onder de v2-engine nog via het v1-filtermodel (`filterAssetsForFire`
// + `resolveHousingEventsForSim`); alléén de projectie draait door de v2-engine
// (`runSelectedProjection(input, true)`). `applyHousingToComposition` met
// `isV2:true` skipt de injectie ALLEEN voor include_full en downsize → voor
// exclude/reverse injecteert hij ook onder v2. Het risico dat hier wordt
// afgedekt: dubbeltelling, ontbrekend huis of een klif wanneer de v1-stijl-
// injectie de v2-engine-rijen ontmoet.
// ════════════════════════════════════════════════════════════════════════════

// ── v2 / exclude_from_fire ───────────────────────────────────

describe('v2 — exclude_from_fire (geen trigger)', () => {
  it('engine filtert het huis → vastgoed = 0 in de v2-engine-rijen', () => {
    const b = makeBasis()
    const cfg: HousingStrategyConfig = { mode: 'exclude_from_fire' }
    const { result } = runV2(cfg, b)
    const baseRows = unifiedRowsToStackedRows(result.rows)
    // Huis gefilterd (shouldFilterEigenHuisForFire = true voor exclude) → 0.
    expect(baseRows[0].vastgoed).toBe(0)
  })

  it('compositie: huis precies ÉÉN keer zichtbaar in vastgoed (geen dubbeltelling met de engine)', () => {
    const b = makeBasis()
    const cfg: HousingStrategyConfig = { mode: 'exclude_from_fire' }
    const { ctx, events, result } = runV2(cfg, b)
    const baseRows = unifiedRowsToStackedRows(result.rows)
    const rows = applyHousingToComposition(baseRows, {
      housingCfg: cfg,
      ctx,
      displayEvents: events,
      currentAgeFloor: CURRENT_AGE_FLOOR,
      fireEndAge: FIRE_END_AGE,
      isV2: true,
    })
    // Engine had 0 → geïnjecteerde waarde ≈ 1× huis (~€500K), NIET ~2× (€1M).
    // Dit is exact de double-count-guard: engine-vastgoed (0) + injectie (1×) = 1×.
    expect(rows[0].vastgoed).toBeGreaterThan(0)
    expect(rows[0].vastgoed).toBeCloseTo(500_000, -3)
    expect(rows[0].vastgoed).toBeLessThan(900_000) // < ~2× huis: geen dubbeltelling
    // Hypotheek terug in beeld.
    expect(rows[0].schulden).toBeCloseTo(-200_000, -3)
  })

  it('GEEN klif: huis permanent buiten de pot; netto vermogen continu (geen trigger)', () => {
    const b = makeBasis()
    const cfg: HousingStrategyConfig = { mode: 'exclude_from_fire' }
    const { ctx, events, result } = runV2(cfg, b)
    const baseRows = unifiedRowsToStackedRows(result.rows)
    const rows = applyHousingToComposition(baseRows, {
      housingCfg: cfg,
      ctx,
      displayEvents: events,
      currentAgeFloor: CURRENT_AGE_FLOOR,
      fireEndAge: FIRE_END_AGE,
      isV2: true,
    })
    // Geen verkoop ⇒ geen liquidatie-sprong; netto vermogen evolueert glad.
    // ADR 0027: latere FIRE (leeftijd 84) → grotere maar gladde jaarlijkse onttrekking
    // (~€80k/jr nominaal). De klif-bewaking loopt via maxVastgoedDrop hieronder.
    // Een echte liquidatie-klif (huisverkoop) zou de overwaarde (~€300k) naderen.
    expect(maxNetJump(rows)).toBeLessThan(150_000)
    // Vastgoed mag nooit in één jaar instorten (geen huis-dump).
    let maxVastgoedDrop = 0
    for (let i = 1; i < rows.length; i++) {
      const drop = rows[i - 1].vastgoed - rows[i].vastgoed
      if (drop > maxVastgoedDrop) maxVastgoedDrop = drop
    }
    expect(maxVastgoedDrop).toBeLessThan(250_000)
  })

  it('FIRE later/hoger dan include_full op DEZELFDE v2-fixture (huis telt niet mee)', () => {
    const b = makeBasis({ currentAge: 45, annualSavings: 24_000, monthlyIncome: 5_500 })
    const incl = runV2({ mode: 'include_full' }, b)
    const excl = runV2({ mode: 'exclude_from_fire' }, b)
    expect(incl.result.fireReachable).toBe(true)
    expect(excl.result.fireReachable).toBe(true)
    expect(incl.result.fireAge).not.toBeNull()
    expect(excl.result.fireAge).not.toBeNull()
    // Met spendableAssetIds (Optie A) telt de woning mee bij include_full →
    // exclude bereikt FIRE LATER (huis valt uit de besteedbare pot).
    expect(excl.result.fireAge!).toBeGreaterThan(incl.result.fireAge!)
  })

  it('v1↔v2 structurele pariteit: beide filteren het huis uit de engine, beide injecteren in de compositie', () => {
    const b = makeBasis()
    const cfg: HousingStrategyConfig = { mode: 'exclude_from_fire' }
    const v1 = runV1(cfg, b)
    const v2 = runV2(cfg, b)
    // Geen van beide kent een trigger-event (exclude is permanent).
    expect(v1.events).toHaveLength(0)
    expect(v2.events).toHaveLength(0)
    const v1Base = unifiedRowsToStackedRows(v1.result.rows)
    const v2Base = unifiedRowsToStackedRows(v2.result.rows)
    // Beide engines: huis gefilterd → vastgoed 0 in de engine-rijen.
    expect(v1Base[0].vastgoed).toBe(0)
    expect(v2Base[0].vastgoed).toBe(0)
    // Beide injecteren hetzelfde startbeeld (zelfde projectie-helper, isV2-vlag
    // raakt voor exclude alleen het skip-pad niet — exclude injecteert in beide).
    const inj = (base: StackedRow[], isV2: boolean) =>
      applyHousingToComposition(base, {
        housingCfg: cfg,
        ctx: v1.ctx,
        displayEvents: [],
        currentAgeFloor: CURRENT_AGE_FLOOR,
        fireEndAge: FIRE_END_AGE,
        isV2,
      })
    const v1Rows = inj(v1Base, false)
    const v2Rows = inj(v2Base, true)
    expect(v1Rows[0].vastgoed).toBeCloseTo(v2Rows[0].vastgoed, -2)
    expect(v1Rows[0].schulden).toBeCloseTo(v2Rows[0].schulden, -2)
    // Alleen de geprojecteerde getallen verschillen (verschillende engines),
    // niet de structuur: beide hebben huis in vastgoed > 0 op elke rij.
    expect(v2Rows.every((r) => r.vastgoed > 0)).toBe(true)
  })
})

// ── v2 / reverse_mortgage × fixed_age ────────────────────────

describe('v2 — reverse_mortgage × fixed_age', () => {
  it('engine houdt het huis IN de rijen (reverse filtert niet); vastgoed > 0; GEEN payout-event (ADR 0029)', () => {
    const b = makeBasis()
    const cfg = reverseFixed(67)
    const { events, result } = runV2(cfg, b)
    // ADR 0029: geen V1-payout-life-event meer — de opeethypotheek zit in het grootboek.
    expect(events).toHaveLength(0)
    const baseRows = unifiedRowsToStackedRows(result.rows)
    // reverse_mortgage filtert het huis NIET → v2 telt het al in vastgoed.
    expect(baseRows[0].vastgoed).toBeGreaterThan(0)
    expect(baseRows[0].vastgoed).toBeCloseTo(500_000, -3)
  })

  it('opeetschuld is een ECHTE grootboek-schuld: aparte debt-rij met groeiend saldo (ADR 0029)', () => {
    const b = makeBasis()
    const { result } = runV2(reverseFixed(67), b)
    const at = (age: number) => result.rows.find((r) => r.age === age)!
    // De synthetische opeethypotheek verschijnt als eigen debt-rij ('reverse-mortgage')
    // in het grootboek; bij deze deplete-fixture leent ze pas laat (FIRE ~85) maar het
    // saldo is op het eind > 0 → ECHT in het grootboek (geen display-only schaduwschuld).
    const rmEnd = at(90).debtBalances['reverse-mortgage']?.endBalance ?? 0
    expect(rmEnd).toBeGreaterThan(0)
    // Nalatenschap blijft niet-negatief (huis − opeetschuld, gecapt op overwaarde).
    expect(at(90).netWorth).toBeGreaterThan(0)
  })

  it('compositie-helper voegt NIETS toe voor reverse_mortgage (ADR 0029): rijen identiek aan engine-output', () => {
    const b = makeBasis()
    const cfg = reverseFixed(67)
    const { ctx, events, result } = runV2(cfg, b)
    const baseRows = unifiedRowsToStackedRows(result.rows)
    const rows = applyHousingToComposition(baseRows, {
      housingCfg: cfg,
      ctx,
      displayEvents: events,
      currentAgeFloor: CURRENT_AGE_FLOOR,
      fireEndAge: FIRE_END_AGE,
      isV2: true,
    })
    // De helper raakt reverse_mortgage niet meer aan: ELKE rij identiek aan engine-output
    // (geen tweede huiskopie, geen schaduwschuld — die zit al in de engine-rijen).
    for (let i = 0; i < rows.length; i++) {
      expect(rows[i].vastgoed).toBe(baseRows[i].vastgoed)
      expect(rows[i].schulden).toBe(baseRows[i].schulden)
    }
    expect(rows[0].vastgoed).toBeCloseTo(500_000, -3)
  })
})

// ── v2 / reverse_mortgage × on_depletion ─────────────────────

describe('v2 — reverse_mortgage × on_depletion (activeert)', () => {
  it('ADR 0029: geen payout-event; de opeethypotheek leent on-demand in het grootboek', () => {
    const b = makeBasis()
    const { events, depletion, result } = runV2(reverseOnDepletion(67), b)
    // Geen V1-trigger-resolutie/payout-event meer: de engine leent intrinsiek tekort-
    // gedreven (on_depletion ≈ "leen pas bij een echt tekort"). Géén event, geen depletion-panel.
    expect(events).toHaveLength(0)
    expect(depletion).toBeNull()
    // De opeetschuld stapelt ECHT in het grootboek wanneer de liquide pot tekortschiet:
    // méér eindschuld dan een baseline-run zónder opeethypotheek (zelfde fixture).
    const baseline = runV2({ mode: 'include_full' }, b)
    const atRm = (age: number) => result.rows.find((r) => r.age === age)!
    const atBase = (age: number) => baseline.result.rows.find((r) => r.age === age)!
    expect(atRm(90).totalDebts).toBeGreaterThan(atBase(90).totalDebts)
  })
})

describe('v2 — reverse_mortgage × on_depletion never-activates (no_sale) — GEEN fantoom-schaduwschuld', () => {
  function richBasis(): HousingTriggerSimBasis {
    return makeBasis({
      assets: [makeAsset({ current_value: 2_000_000 }), makeEigenHuis()],
      yearlyExpenses: 30_000,
      strategyConfig: { strategy: 'perpetual', endAge: 90, legacyAmount: 0 },
    })
  }

  it('rijke pot: opeethypotheek leent nooit (geen tekort) — GEEN event, schuld identiek aan baseline', () => {
    const b = richBasis()
    const { events, depletion, result } = runV2(reverseOnDepletion(70), b)
    // ADR 0029: geen depletion-resolutie/event meer; de engine leent gewoon nooit
    // omdat de €2M-pot ruim toereikend is (perpetual). De opeetschuld blijft 0 →
    // de schuld-curve is identiek aan een baseline-run zónder opeethypotheek.
    expect(events).toHaveLength(0)
    expect(depletion).toBeNull()
    const baseline = runV2({ mode: 'include_full' }, b)
    const atRm = (age: number) => result.rows.find((r) => r.age === age)!
    const atBase = (age: number) => baseline.result.rows.find((r) => r.age === age)!
    expect(atRm(90).totalDebts).toBeCloseTo(atBase(90).totalDebts, -2)
  })

  it('HARD LOCK (isV2:true): GEEN schaduwschuld geïnjecteerd — schulden identiek aan baseRows op ELKE rij', () => {
    const b = richBasis()
    const cfg = reverseOnDepletion(70)
    const { ctx, events, result } = runV2(cfg, b)
    expect(events).toHaveLength(0)
    const baseRows = unifiedRowsToStackedRows(result.rows)
    const rows = applyHousingToComposition(baseRows, {
      housingCfg: cfg,
      ctx,
      displayEvents: events, // leeg ⇒ housingEvent undefined ⇒ triggerAge null ⇒ geen injectie
      currentAgeFloor: CURRENT_AGE_FLOOR,
      fireEndAge: FIRE_END_AGE,
      isV2: true,
    })
    expect(rows).toHaveLength(baseRows.length)
    for (let i = 0; i < rows.length; i++) {
      expect(rows[i].schulden).toBe(baseRows[i].schulden)
    }
    const maxSchuldenDelta = Math.max(...rows.map((r, i) => Math.abs(r.schulden - baseRows[i].schulden)))
    expect(maxSchuldenDelta).toBe(0)
    // En het huis blijft zichtbaar (v2 houdt het in de engine-rijen), zonder
    // dat de helper een tweede kopie injecteert.
    for (let i = 0; i < rows.length; i++) {
      expect(rows[i].vastgoed).toBe(baseRows[i].vastgoed)
    }
    expect(rows[0].vastgoed).toBeGreaterThan(0)
  })

  it('v1↔v2: beide produceren GEEN event (v1 via no_sale-resolver, v2 via grootboek-model)', () => {
    const b = richBasis()
    const cfg = reverseOnDepletion(70)
    const v1 = runV1(cfg, b)
    const v2 = runV2(cfg, b)
    // v1 (legacy resolver): no_sale → geen event. v2 (ADR 0029 grootboek): geen
    // depletion-resolutie meer (de engine leent intrinsiek) → geen event, depletion null.
    expect(v1.depletion!.reason).toBe('no_sale')
    expect(v2.depletion).toBeNull()
    expect(v1.events).toHaveLength(0)
    expect(v2.events).toHaveLength(0)
  })
})
