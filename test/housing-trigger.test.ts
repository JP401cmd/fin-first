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

  it('in de echte run-mét-event blijft het vermogen vóór de trigger boven de drempel', () => {
    const basis = makeDecumulationBasis()
    const config = downsizeOnDepletion()
    const context = contextFor(basis)
    const { events, depletion } = resolveHousingEventsForSim(config, context, basis)
    expect(depletion!.converged).toBe(true)

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
    expect(result.iterations).toBeLessThanOrEqual(3)
    expect(result.triggerAge).toBeGreaterThanOrEqual(basis.currentAge)
    expect(result.triggerAge).toBeLessThanOrEqual(80)
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

  it('fallback: nog-sparende gebruiker kruist niet → uiterste leeftijd', () => {
    const basis = makeDecumulationBasis({
      currentAge: 40,
      annualSavings: 36_000,
      monthlyIncome: 6_500,
    })
    const config = downsizeOnDepletion({ triggerAge: 70 })
    const context = contextFor(basis)
    const result = resolveHousingTriggerFromProjection(config, context, basis)
    // Met €36K sparen + rendement op €200K raakt liquide nooit op vóór 70.
    expect(result.reason).toBe('fallback')
    expect(result.triggerAge).toBe(70)
  })

  it('crossover: kruising binnen het venster', () => {
    const basis = makeDecumulationBasis()
    const config = downsizeOnDepletion()
    const context = contextFor(basis)
    const result = resolveHousingTriggerFromProjection(config, context, basis)
    expect(result.reason).toBe('crossover')
    expect(result.triggerAge).toBeGreaterThan(basis.currentAge)
    expect(result.triggerAge).toBeLessThan(85)
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
