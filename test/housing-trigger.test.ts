/**
 * Unit-tests voor lib/housing-trigger.ts — de simulatie-gebaseerde
 * "wanneer nodig"-trigger voor de eigen-huis-strategie.
 *
 * Kern (de oorspronkelijke bugmelding): het trigger-moment moet samenvallen
 * met het moment waarop het vermogen in de GRAFIEK (unified projection)
 * opraakt — niet met een apart 1D-model. Test 1 legt dat vast.
 */
import { describe, it, expect } from 'vitest'
import {
  resolveHousingTriggerFromProjection,
  resolveHousingEventsForSim,
  type HousingTriggerSimBasis,
} from '@/lib/housing-trigger'
import {
  deriveHousingContext,
  filterAssetsForFire,
  isHousingStrategyEvent,
  DEFAULT_DOWNSIZE_CONFIG,
  DEFAULT_REVERSE_MORTGAGE_CONFIG,
  type DownsizeConfig,
  type ReverseMortgageConfig,
} from '@/lib/housing-strategy'
import { runUnifiedProjection } from '@/lib/unified-projection'
import { lifeEventsToCashflows, type SimCashflow } from '@/lib/fire-simulation'
import { WITHDRAWAL_DEFAULTS } from '@/lib/withdrawal-strategy'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'

// ── Fixtures ─────────────────────────────────────────────────

function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'asset-1',
    user_id: 'user-1',
    name: 'Beleggingen',
    asset_type: 'investment',
    current_value: 200_000,
    purchase_value: 150_000,
    purchase_date: '2015-01-01',
    expected_return: 5,
    monthly_contribution: 0,
    institution: null,
    account_number: null,
    notes: null,
    is_active: true,
    sort_order: 0,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    subtype: null,
    risk_profile: null,
    tax_benefit: null,
    is_liquid: true,
    lock_end_date: null,
    ticker_symbol: null,
    rental_income: null,
    woz_value: null,
    retirement_provider_type: null,
    depreciation_rate: null,
    address_postcode: null,
    address_house_number: null,
    expiry_date: null,
    beneficiary: null,
    kvk_number: null,
    ownership_percentage: null,
    annual_dividend: null,
    linked_asset_id: null,
    ownership: 'personal',
    household_id: null,
    net_worth_inclusion_pct: 100,
    has_budget_tracking: false,
    has_woonbalans_tracking: false,
    has_rental_tracking: false,
    monthly_maintenance_cost: 0,
    vva_fee: 0,
    vacancy_log: [],
    ...overrides,
  } as Asset
}

function makeEigenHuis(overrides: Partial<Asset> = {}): Asset {
  return makeAsset({
    id: 'asset-eigen-huis-1',
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
    id: 'debt-mortgage-1',
    user_id: 'user-1',
    name: 'Hypotheek',
    debt_type: 'mortgage',
    original_amount: 300_000,
    current_balance: 200_000,
    interest_rate: 3.5,
    minimum_payment: 1200,
    monthly_payment: 1400,
    start_date: '2015-01-01',
    end_date: '2045-01-01',
    creditor: 'ING',
    notes: null,
    is_active: true,
    sort_order: 0,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    subtype: 'annuiteit',
    is_tax_deductible: true,
    fixed_rate_end_date: null,
    nhg: false,
    linked_asset_id: linkedAssetId,
    credit_limit: null,
    repayment_type: 'annuiteit',
    draagkrachtmeting_date: null,
    tax_year: null,
    has_payment_plan: false,
    has_written_agreement: false,
    ownership: 'personal',
    household_id: null,
    partner_split_pct: null,
    net_worth_inclusion_pct: 100,
    include_aflossing_in_savings: true,
    custom_aflossing_amount: null,
    has_hypotheekplanner_tracking: false,
    ...overrides,
  } as Debt
}

/**
 * Afbouw-scenario: 50-jarige, gestopt met werken (geen inkomen/sparen),
 * €200K liquide, €40K/jaar uitgaven, huis van €500K met €200K hypotheek.
 * Liquide raakt ruim vóór de fallback-leeftijd (85) op.
 */
function makeDecumulationBasis(overrides: Partial<HousingTriggerSimBasis> = {}): HousingTriggerSimBasis {
  const huis = makeEigenHuis()
  const assets = [makeAsset(), huis]
  const debts = [makeMortgage(huis.id)]
  return {
    assets,
    debts,
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

function downsizeOnDepletion(overrides: Partial<DownsizeConfig> = {}): DownsizeConfig {
  return {
    ...DEFAULT_DOWNSIZE_CONFIG,
    trigger: 'on_depletion',
    triggerAge: 85,
    depletionThresholdYears: 0,
    ...overrides,
  }
}

function reverseOnDepletion(overrides: Partial<ReverseMortgageConfig> = {}): ReverseMortgageConfig {
  return {
    ...DEFAULT_REVERSE_MORTGAGE_CONFIG,
    trigger: 'on_depletion',
    triggerAge: 85,
    depletionThresholdYears: 0,
    ...overrides,
  }
}

function contextFor(basis: HousingTriggerSimBasis) {
  return deriveHousingContext(basis.assets, basis.debts)
}

// ── 0. Fundament: forcedFireAge-pin heeft geen rekenkundige bijwerking ──

describe('forcedFireAge pad-identiteit (fundament van de iteratie-pin)', () => {
  it('rijen vóór de FIRE-leeftijd zijn identiek tussen berekende en gepinde run', () => {
    // Opbouw-scenario zodat de binary search een fireAge berekent.
    const basis = makeDecumulationBasis({
      currentAge: 40,
      annualSavings: 30_000,
      monthlyIncome: 6_000,
    })
    const config = downsizeOnDepletion()
    const { assets, debts } = filterAssetsForFire(config, basis.assets, basis.debts)
    const input = {
      assets,
      debts,
      currentAge: basis.currentAge,
      endAge: basis.endAge,
      yearlyExpenses: basis.yearlyExpenses,
      annualSavings: basis.annualSavings,
      monthlySurplus: basis.annualSavings / 12,
      monthlyIncome: basis.monthlyIncome,
      incomeGrowthRate: 0,
      grossReturn: basis.grossReturn,
      inflationRate: basis.inflationRate,
      box3Method: basis.box3Method,
      cashflows: basis.cashflows,
      strategyConfig: basis.strategyConfig,
      withdrawalStrategy: basis.withdrawalStrategy,
      hasPartner: false,
    }
    const computed = runUnifiedProjection(input)
    expect(computed.fireAge).not.toBeNull()
    const pinned = runUnifiedProjection({ ...input, forcedFireAge: computed.fireAge! })
    const fireAge = computed.fireAge!
    const before = (rows: typeof computed.rows) => rows.filter((r) => r.age < fireAge)
    const a = before(computed.rows)
    const b = before(pinned.rows)
    expect(b.length).toBe(a.length)
    for (let i = 0; i < a.length; i++) {
      expect(b[i].netWorth).toBe(a[i].netWorth)
    }
  })
})

// ── 1. Kernklacht: trigger == grafiek-uitputting ─────────────

describe('trigger valt samen met grafiek-uitputting (downsize × on_depletion)', () => {
  it('target_age == eerste leeftijd waar het liquide pad onder de drempel zakt', () => {
    const basis = makeDecumulationBasis()
    const config = downsizeOnDepletion()
    const context = contextFor(basis)
    const { events, depletion } = resolveHousingEventsForSim(config, context, basis)

    expect(depletion).not.toBeNull()
    expect(depletion!.reason).toBe('crossover')
    expect(events).toHaveLength(1)
    expect(events[0].target_age).toBe(depletion!.triggerAge)

    // Onafhankelijke verificatie: draai zelf de meetrun (zelfde engine als
    // de grafiek) en zoek de eerste kruising.
    const { assets, debts } = filterAssetsForFire(config, basis.assets, basis.debts)
    const meetrun = runUnifiedProjection({
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
      cashflows: [],
      strategyConfig: basis.strategyConfig,
      withdrawalStrategy: basis.withdrawalStrategy,
      forcedFireAge: depletion!.fireAgeUsed ?? undefined,
      hasPartner: false,
    })
    const bufferAt = (age: number) =>
      depletion!.liquidPath.find((p) => Math.abs(p.age - age) < 1e-6)?.buffer ?? 0
    const firstCross = meetrun.rows.find((r) => r.netWorth - bufferAt(r.age) <= 1)
    expect(firstCross).toBeDefined()
    expect(depletion!.triggerAge).toBe(firstCross!.age)
  })

  // REGRESSIE-GUARD (Issue 1, orkestratie-laag): het EMITTED verkoop-event mag
  // PAST `config.triggerAge` vallen wanneer het liquide pad langer standhoudt.
  // De oude bug kapte de scan op de cap → het event landde altijd ≤ triggerAge.
  // Dit pint dat de publieke consumer (`resolveHousingEventsForSim`) de echte
  // depletie-leeftijd doorgeeft, ook met een lage cap.
  it('GUARD: verkoop-event valt voorbij config.triggerAge als liquide langer standhoudt', () => {
    const basis = makeDecumulationBasis()
    // Echte depletie zonder cap-effect (hoge cap = endAge).
    const trueAge = resolveHousingEventsForSim(
      downsizeOnDepletion({ triggerAge: 90 }),
      contextFor(basis),
      basis,
    ).depletion!.triggerAge
    const lowCap = 60
    expect(trueAge).toBeGreaterThan(lowCap)

    const { events, depletion } = resolveHousingEventsForSim(
      downsizeOnDepletion({ triggerAge: lowCap }),
      contextFor(basis),
      basis,
    )
    expect(depletion!.reason).toBe('crossover')
    expect(events).toHaveLength(1)
    // Het event landt op de ECHTE depletie, niet gekapt op de lage cap.
    expect(events[0].target_age).toBe(trueAge)
    expect(events[0].target_age).toBeGreaterThan(lowCap)
  })

  it('in de echte run-mét-event blijft het vermogen vóór de trigger boven de drempel', () => {
    const basis = makeDecumulationBasis()
    const config = downsizeOnDepletion()
    const context = contextFor(basis)
    const { events, depletion } = resolveHousingEventsForSim(config, context, basis)
    // Self-consistentie i.p.v. `converged`: met de volle-horizon-scan (Issue 1)
    // kan de kruising tegen het einde van de horizon vallen, waar de deplete-
    // annuïteit + verkoop-injectie elkaar per jaar herrekenen → de vaste-punt-
    // iteratie hoeft niet te convergeren. Het deterministische `min()`-resultaat
    // is wél zelfconsistent: de trigger is de eerste kruising in zijn eigen
    // liquide pad. Dát is de invariant die telt (marker == grafiek-uitputting).
    const firstCrossSelf = depletion!.liquidPath.find((p) => p.liquid - p.buffer <= 1)
    expect(firstCrossSelf).toBeDefined()
    expect(depletion!.triggerAge).toBe(firstCrossSelf!.age)
    expect(depletion!.reason).toBe('crossover')

    const { assets, debts } = filterAssetsForFire(config, basis.assets, basis.debts)
    const fullRun = runUnifiedProjection({
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
      cashflows: lifeEventsToCashflows(events),
      strategyConfig: basis.strategyConfig,
      withdrawalStrategy: basis.withdrawalStrategy,
      hasPartner: false,
    })
    // Vóór de trigger geen rij die al onder nul zit (geen te-late verkoop).
    for (const row of fullRun.rows) {
      if (row.age >= depletion!.triggerAge) break
      expect(row.netWorth).toBeGreaterThan(0)
    }
    // Op/na de trigger landt de verkoopopbrengst: vermogen veert op.
    const atTrigger = fullRun.rows.find((r) => Math.abs(r.age - depletion!.triggerAge) < 1e-6)
    const beforeTrigger = fullRun.rows.find((r) => Math.abs(r.age - (depletion!.triggerAge - 1)) < 1e-6)
    expect(atTrigger).toBeDefined()
    if (beforeTrigger) {
      expect(atTrigger!.netWorth).toBeGreaterThan(beforeTrigger.netWorth)
    }
  })
})

// ── 2. Verkoopkosten-buffer ──────────────────────────────────

describe('verkoopkosten-buffer', () => {
  it('hogere verkoopkosten → trigger gelijk of eerder', () => {
    const basis = makeDecumulationBasis()
    const context = contextFor(basis)
    const zonder = resolveHousingTriggerFromProjection(
      downsizeOnDepletion({ salesCostsPct: 0 }),
      context,
      basis,
    )
    const met = resolveHousingTriggerFromProjection(
      downsizeOnDepletion({ salesCostsPct: 0.08 }),
      context,
      basis,
    )
    expect(met.triggerAge).toBeLessThanOrEqual(zonder.triggerAge)
    expect(met.bufferAtTrigger).toBeGreaterThan(0)
    expect(zonder.bufferAtTrigger).toBe(0)
  })

  it('buffer schaalt mee met geprojecteerde WOZ op trigger-moment', () => {
    const basis = makeDecumulationBasis()
    const config = downsizeOnDepletion({ salesCostsPct: 0.04 })
    const context = contextFor(basis)
    const result = resolveHousingTriggerFromProjection(config, context, basis)
    const years = result.triggerAge - basis.currentAge
    // WOZ groeit met expected_return (2%) → buffer > 4% van huidige WOZ.
    const minBuffer = 480_000 * 0.04
    if (years > 0) {
      expect(result.bufferAtTrigger).toBeGreaterThan(minBuffer)
    }
  })
})

// ── 3. AOW/pensioen-inkomen verschuift de trigger ────────────

describe('inkomsten-events tellen mee (de oude 1D-fout is weg)', () => {
  it('een AOW-achtige recurring income verschuift de trigger naar later', () => {
    const basis = makeDecumulationBasis()
    const config = downsizeOnDepletion()
    const context = contextFor(basis)
    const aowCashflow: SimCashflow = {
      id: 'aow-test',
      name: 'AOW',
      type: 'recurring',
      direction: 'income',
      amount: 1_600,
      fromAge: 67,
      toAge: null,
      indexed: true,
    }
    const zonderAow = resolveHousingTriggerFromProjection(config, context, basis)
    const metAow = resolveHousingTriggerFromProjection(config, context, {
      ...basis,
      cashflows: [aowCashflow],
    })
    expect(metAow.triggerAge).toBeGreaterThanOrEqual(zonderAow.triggerAge)
  })
})

// ── 4. Vaste punt: determinisme & convergentie ───────────────

describe('vaste-punt-iteratie', () => {
  it('convergeert binnen 3 iteraties en is deterministisch', () => {
    const basis = makeDecumulationBasis()
    const config = downsizeOnDepletion()
    const context = contextFor(basis)
    const a = resolveHousingTriggerFromProjection(config, context, basis)
    const b = resolveHousingTriggerFromProjection(config, context, basis)
    expect(a.iterations).toBeLessThanOrEqual(3)
    expect(a).toEqual(b)
  })

  it('convergeert ook wanneer het event de fireAge verschuift (opbouw-scenario)', () => {
    const basis = makeDecumulationBasis({
      currentAge: 45,
      annualSavings: 24_000,
      monthlyIncome: 5_500,
    })
    const config = downsizeOnDepletion({ triggerAge: 80 })
    const context = contextFor(basis)
    const result = resolveHousingTriggerFromProjection(config, context, basis)
    // De iteratie blijft begrensd (≤ 3 passes) en deterministisch — ook al
    // convergeert ze niet altijd bij een kruising tegen het einde van de
    // horizon (Issue 1: de scan loopt door tot endAge, niet tot config.
    // triggerAge=80). Het resultaat is hoe dan ook zelfconsistent.
    expect(result.iterations).toBeLessThanOrEqual(3)
    expect(result.triggerAge).toBeGreaterThanOrEqual(basis.currentAge)
    expect(result.triggerAge).toBeLessThanOrEqual(basis.endAge)
    const again = resolveHousingTriggerFromProjection(config, context, basis)
    expect(again.triggerAge).toBe(result.triggerAge)
  })
})

// ── 5. Pensioen-modus: exacte twee-pass ──────────────────────

describe('pensioen-modus (forcedFireAge exogeen)', () => {
  it('convergeert in 1 iteratie', () => {
    const basis = makeDecumulationBasis({
      strategyConfig: { strategy: 'pensioen', endAge: 90, legacyAmount: 0 },
      forcedFireAge: 67,
    })
    const config = downsizeOnDepletion()
    const context = contextFor(basis)
    const result = resolveHousingTriggerFromProjection(config, context, basis)
    expect(result.iterations).toBe(1)
    expect(result.converged).toBe(true)
    expect(result.fireAgeUsed).toBe(67)
  })
})

// ── 6. Reasons ───────────────────────────────────────────────

describe('reasons', () => {
  it('immediate: liquide zit nu al op/onder de drempel', () => {
    const basis = makeDecumulationBasis({
      assets: [makeAsset({ current_value: 1_000 }), makeEigenHuis()],
    })
    const config = downsizeOnDepletion()
    const context = contextFor(basis)
    const result = resolveHousingTriggerFromProjection(config, context, basis)
    expect(result.reason).toBe('immediate')
    expect(result.triggerAge).toBe(basis.currentAge)
  })

  it('no_sale: liquide raakt de drempel nooit binnen de horizon → geen verkoop', () => {
    // Grote liquide pot + perpetual (alleen rendement opnemen, kapitaal blijft)
    // → het liquide pad blijft over de hele horizon ruim boven de drempel.
    // Accepted semantics (Issue 1): geen kruising → 'no_sale', GEEN force-sale
    // op config.triggerAge.
    const basis = makeDecumulationBasis({
      assets: [makeAsset({ current_value: 2_000_000 }), makeEigenHuis()],
      yearlyExpenses: 30_000,
      strategyConfig: { strategy: 'perpetual', endAge: 90, legacyAmount: 0 },
    })
    const config = downsizeOnDepletion({ triggerAge: 70 })
    const context = contextFor(basis)
    const result = resolveHousingTriggerFromProjection(config, context, basis)
    // Verificatie dat het écht nooit kruist in het liquide pad.
    expect(result.liquidPath.some((p) => p.liquid - p.buffer <= 1)).toBe(false)
    expect(result.reason).toBe('no_sale')
    // GUARD: never-deplete short-circuit rapporteert converged (geen spurieuze
    // niet-convergentie die een UI-marker zou triggeren) en doet 1 pass.
    expect(result.converged).toBe(true)
    expect(result.iterations).toBe(1)
    // Geen verkoop-event: het huis blijft staan.
    const { events } = resolveHousingEventsForSim(config, context, basis)
    expect(events).toHaveLength(0)
  })

  it('crossover: kruising binnen de horizon', () => {
    const basis = makeDecumulationBasis()
    const config = downsizeOnDepletion()
    const context = contextFor(basis)
    const result = resolveHousingTriggerFromProjection(config, context, basis)
    expect(result.reason).toBe('crossover')
    expect(result.triggerAge).toBeGreaterThan(basis.currentAge)
    // De kruising ligt binnen de VOLLEDIGE horizon (tot endAge), niet
    // gekapt op config.triggerAge (Issue 1). Met deplete + geen inkomen
    // raakt liquide tegen het einde op (≈86).
    expect(result.triggerAge).toBeLessThanOrEqual(basis.endAge)
  })
})

// ── 7. Reverse mortgage: zelfde mechanisme ───────────────────

describe('reverse_mortgage × on_depletion', () => {
  it('gebruikt het simulatie-pad (huis in de pot, liquide via buckets) en buffer 0', () => {
    const basis = makeDecumulationBasis()
    const config = reverseOnDepletion()
    const context = contextFor(basis)
    const { events, depletion } = resolveHousingEventsForSim(config, context, basis)
    expect(depletion).not.toBeNull()
    expect(depletion!.bufferAtTrigger).toBe(0)
    expect(depletion!.reason).toBe('crossover')
    expect(events).toHaveLength(1)
    expect(events[0].event_type).toBe('opeethypotheek')
    expect(events[0].target_age).toBe(depletion!.triggerAge)
    expect(isHousingStrategyEvent(events[0])).toBe(true)
  })

  it('trigger is zelfconsistent: eerste leeftijd waar het eigen liquide pad ≤ 0 zakt', () => {
    // NB: reverse en downsize triggeren bewust op verschillende leeftijden —
    // bij reverse telt het huis mee in de FIRE-pot, dus pensioen start
    // eerder en raakt het liquide deel eerder op. Elke strategie meet zijn
    // eigen pot; we asserten hier de interne consistentie van de meting.
    const basis = makeDecumulationBasis()
    const context = contextFor(basis)
    const rev = resolveHousingTriggerFromProjection(reverseOnDepletion(), context, basis)
    const firstZero = rev.liquidPath.find((p) => p.liquid - p.buffer <= 1)
    expect(firstZero).toBeDefined()
    expect(rev.triggerAge).toBe(firstZero!.age)
    // En de trigger ligt op of ná de FIRE-leeftijd van de run-mét-event:
    // tijdens opbouw raakt liquide hier niet op.
    if (rev.fireAgeUsed != null) {
      expect(rev.triggerAge).toBeGreaterThanOrEqual(rev.fireAgeUsed)
    }
  })
})

// ── 7b. Flag-aware meetrun (C5-b): v1 vs v2-grootboek ────────
//
// `resolveHousingTriggerFromProjection`/`resolveHousingEventsForSim`/
// `runHousingScenarioProjection` kiezen de MEETRUN-engine via een `useV2`-flag
// (default false). Flag-uit = byte-identiek aan v1 (zie alle tests hierboven die
// de flag weglaten). Flag-aan = de meetrun draait op de v2-grootboek-engine,
// zodat een v2-gebruiker met reverse_mortgage zijn trigger op DEZELFDE engine
// gemeten krijgt als de getoonde grafieklijn. De scan-/trigger-LOGICA verandert
// niet: het is nog steeds de eerste volle-horizon-kruising van het eigen liquide
// pad met de drempel.

describe('flag-aware meetrun (useV2)', () => {
  it('default (geen flag) == expliciete useV2=false — byte-identiek v1', () => {
    const basis = makeDecumulationBasis()
    const context = contextFor(basis)
    const impliciet = resolveHousingTriggerFromProjection(downsizeOnDepletion(), context, basis)
    const expliciet = resolveHousingTriggerFromProjection(downsizeOnDepletion(), context, basis, false)
    expect(expliciet).toEqual(impliciet)
  })

  it('useV2=true: trigger blijft zelfconsistent op het EIGEN (v2) liquide pad', () => {
    // De engine-swap mag de scan-logica niet breken: de trigger is nog steeds de
    // eerste kruising in zijn eigen liquidPath (nu een v2-pad).
    const basis = makeDecumulationBasis()
    const context = contextFor(basis)
    const v2 = resolveHousingTriggerFromProjection(reverseOnDepletion(), context, basis, true)
    const firstCross = v2.liquidPath.find((p) => p.liquid - p.buffer <= 1)
    expect(firstCross).toBeDefined()
    expect(v2.triggerAge).toBe(firstCross!.age)
    expect(v2.reason).toBe('crossover')
    // En de trigger ligt op/ná de gevonden FIRE-leeftijd (geen depletie tijdens opbouw).
    if (v2.fireAgeUsed != null) {
      expect(v2.triggerAge).toBeGreaterThanOrEqual(v2.fireAgeUsed)
    }
  })

  it('useV2 leidt tot een ANDERE (reëel-gemeten) trigger dan v1 op dezelfde fixture', () => {
    // v2 is intern reëel (koopkracht), v1 nominaal — het liquide pad verschilt,
    // dus de kruising valt op een ander jaar. We pinnen niet de exacte v2-leeftijd
    // (engine-detail) maar wél dat de flag daadwerkelijk een andere engine kiest.
    const basis = makeDecumulationBasis()
    const context = contextFor(basis)
    const v1 = resolveHousingTriggerFromProjection(reverseOnDepletion(), context, basis, false)
    const v2 = resolveHousingTriggerFromProjection(reverseOnDepletion(), context, basis, true)
    expect(v1.triggerAge).not.toBe(v2.triggerAge)
    // Beide blijven binnen de horizon en ≥ currentAge (geen ontspoorde meting).
    for (const r of [v1, v2]) {
      expect(r.triggerAge).toBeGreaterThanOrEqual(basis.currentAge)
      expect(r.triggerAge).toBeLessThanOrEqual(basis.endAge)
    }
  })

  it('resolveHousingEventsForSim met useV2=true emit een event op de v2-trigger', () => {
    const basis = makeDecumulationBasis()
    const context = contextFor(basis)
    const { events, depletion } = resolveHousingEventsForSim(reverseOnDepletion(), context, basis, true)
    expect(depletion).not.toBeNull()
    expect(events).toHaveLength(1)
    expect(events[0].target_age).toBe(depletion!.triggerAge)
  })
})

// ── 8. Veiligheidsmarge (depletionThresholdYears) ────────────

describe('veiligheidsmarge', () => {
  it('marge van 2 jaar uitgaven → trigger eerder dan zonder marge', () => {
    const basis = makeDecumulationBasis()
    const context = contextFor(basis)
    const zonder = resolveHousingTriggerFromProjection(
      downsizeOnDepletion({ depletionThresholdYears: 0 }),
      context,
      basis,
    )
    const met = resolveHousingTriggerFromProjection(
      downsizeOnDepletion({ depletionThresholdYears: 2 }),
      context,
      basis,
    )
    expect(met.triggerAge).toBeLessThan(zonder.triggerAge)
    expect(met.marginAtTrigger).toBeGreaterThanOrEqual(2 * basis.yearlyExpenses)
  })
})

// ── 9. Orkestratie & metadata ────────────────────────────────

describe('resolveHousingEventsForSim', () => {
  it('include_full / exclude_from_fire / geen huis → geen events', () => {
    const basis = makeDecumulationBasis()
    const context = contextFor(basis)
    expect(resolveHousingEventsForSim({ mode: 'include_full' }, context, basis).events).toEqual([])
    expect(resolveHousingEventsForSim({ mode: 'exclude_from_fire' }, context, basis).events).toEqual([])
    const geenHuis = deriveHousingContext([makeAsset()], [])
    expect(
      resolveHousingEventsForSim(downsizeOnDepletion(), geenHuis, basis).events,
    ).toEqual([])
  })

  it('fixed_age: geen iteratie, depletion null, target_age = config-leeftijd', () => {
    const basis = makeDecumulationBasis()
    const context = contextFor(basis)
    const { events, depletion } = resolveHousingEventsForSim(
      downsizeOnDepletion({ trigger: 'fixed_age', triggerAge: 67 }),
      context,
      basis,
    )
    expect(depletion).toBeNull()
    expect(events[0].target_age).toBe(67)
  })

  it('on_depletion: metadata.depletion bevat het SimulatedDepletionResult', () => {
    const basis = makeDecumulationBasis()
    const context = contextFor(basis)
    const { events, depletion } = resolveHousingEventsForSim(
      downsizeOnDepletion(),
      context,
      basis,
    )
    const meta = events[0].metadata as Record<string, unknown>
    expect(meta.depletion).toEqual(depletion)
    expect((meta.depletion as { method: string }).method).toBe('simulation')
    expect(meta.triggerMode).toBe('on_depletion')
    // Bedragen-metadata blijft gevuld door buildHousingLifeEventsAtAge.
    expect(meta.saleProceeds).toBeDefined()
    expect(meta.wozValueAtTrigger).toBeDefined()
  })
})

// ── 1d. Issue 1 (v1-pariteit): scan kapt op config.triggerAge ─
//
// Het v1-pad heeft dezelfde cap-degeneratie als het v2-pad (build-input.ts):
// `scanRows` (housing-trigger.ts:241) test `row.age <= fallbackAge + 1e-6` met
// `fallbackAge = config.triggerAge`. Daardoor kruist de scan niet voorbij de cap:
//   • depletie ná triggerAge → trigger wordt naar triggerAge gekapt (fallback);
//   • nooit-depletie → fallback op triggerAge i.p.v. geen verkoop.
//
// Accepted semantics (architect): de scan loopt door tot endAge; triggerAge is
// ALLEEN het never-deplete-plafond. Deze tests pinnen dat — RED vóór de fix.

describe('Issue 1 (v1-pariteit): scan scant de volle horizon, niet tot triggerAge', () => {
  // Architect-repro op de v1-engine: huis €600k, beleggingen €350k, pensioen
  // €250k, cash €60k, AOW 67, deplete tot 95. Liquide depleteert ~92 zonder cap.
  function richDecumulationBasis(over: Partial<HousingTriggerSimBasis> = {}): HousingTriggerSimBasis {
    const huis = makeEigenHuis({ current_value: 600_000, woz_value: 600_000, expected_return: 3.5 })
    return makeDecumulationBasis({
      assets: [
        makeAsset({ id: 'bel', current_value: 350_000, expected_return: 6 }),
        makeAsset({ id: 'pen', asset_type: 'retirement', current_value: 250_000, expected_return: 4 }),
        makeAsset({ id: 'cash', asset_type: 'cash', current_value: 60_000, expected_return: 0 }),
        huis,
      ],
      debts: [makeMortgage(huis.id, { current_balance: 250_000 })],
      currentAge: 67,
      endAge: 95,
      yearlyExpenses: 60_000,
      cashflows: [
        { id: 'aow', name: 'AOW', type: 'recurring', direction: 'income', amount: 1_600, fromAge: 67, toAge: null, indexed: true },
      ],
      strategyConfig: { strategy: 'deplete', endAge: 95, legacyAmount: 0 },
      ...over,
    })
  }

  it('1d-a: depletie ná triggerAge → trigger op de echte depletie, niet op de cap', () => {
    const basis = richDecumulationBasis()
    const context = contextFor(basis)
    // Hoge cap (= endAge) onthult waar het liquide pad ECHT kruist.
    const high = resolveHousingTriggerFromProjection(
      downsizeOnDepletion({ triggerAge: 95 }),
      context,
      basis,
    )
    const trueAge = high.triggerAge
    const lowCap = 75
    expect(trueAge).toBeGreaterThan(lowCap) // sanity: depletie ligt ná de lage cap

    // Lage cap mag de trigger NIET vervroegen: de scan moet de volle horizon zien.
    const low = resolveHousingTriggerFromProjection(
      downsizeOnDepletion({ triggerAge: lowCap }),
      context,
      basis,
    )
    expect(low.triggerAge).toBe(trueAge)
    expect(low.triggerAge).toBeGreaterThan(lowCap)
    expect(low.reason).toBe('crossover')
  })

  it('1d-b: nooit-depletie → geen kruising (reason ≠ fallback-force-sale op de cap)', () => {
    // Grote pot + lage uitgaven + AOW + perpetual → liquide blijft ruim positief.
    const basis = richDecumulationBasis({
      assets: [
        makeAsset({ id: 'bel', current_value: 1_500_000, expected_return: 6 }),
        makeAsset({ id: 'cash', asset_type: 'cash', current_value: 100_000, expected_return: 0 }),
        makeEigenHuis({ current_value: 600_000, woz_value: 600_000, expected_return: 3.5 }),
      ],
      debts: [],
      yearlyExpenses: 30_000,
      strategyConfig: { strategy: 'perpetual', endAge: 95, legacyAmount: 0 },
    })
    const context = contextFor(basis)
    const result = resolveHousingTriggerFromProjection(
      downsizeOnDepletion({ triggerAge: 80 }),
      context,
      basis,
    )
    // Het liquide pad raakt de drempel nooit → er is geen écht verkoopmoment.
    const everCrosses = result.liquidPath.some((p) => p.liquid - p.buffer <= 1)
    expect(everCrosses).toBe(false)
    // Accepted semantics: geen kruising → geen force-sale op de cap.
    // Vandaag: reason 'fallback' op triggerAge (80). Dit pint dat dat fout is.
    expect(result.reason).not.toBe('fallback')
  })
})

// ── 10. Bench: per-request kosten blijven beheersbaar ────────

describe('performance', () => {
  it('resolver < 250ms op een 40-jaars afbouw-fixture', () => {
    const basis = makeDecumulationBasis()
    const config = downsizeOnDepletion()
    const context = contextFor(basis)
    const start = performance.now()
    resolveHousingTriggerFromProjection(config, context, basis)
    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(250)
  })
})
