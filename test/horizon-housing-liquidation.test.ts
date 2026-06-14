import { describe, it, expect } from 'vitest'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import { buildHorizonInput, runHousingScenarioProjectionV2 } from '@/lib/horizon-engine/build-input'
import { runHorizonLedger } from '@/lib/horizon-engine'
import { runSelectedProjection } from '@/lib/horizon-engine/select'
import { deriveHousingContext, type HousingStrategyConfig, type DownsizeConfig } from '@/lib/housing-strategy'
import { WITHDRAWAL_DEFAULTS } from '@/lib/withdrawal-strategy'
import type { HousingTriggerSimBasis } from '@/lib/housing-trigger'

// Regressie voor ADR 0015: downsize in v2 = huis als niet-liquide asset in het
// grootboek + liquidatie-event op de trigger (i.p.v. huis filteren + verkoop als
// inkomen). Borgt de drie bevindingen uit de Fase B-meting:
//  #2 netto vermogen blijft continu (geen sprong); liquiditeit verspringt;
//  #3 de woningwaarde groeit zichtbaar in het grootboek tot de verkoop.

const ASSETS: Asset[] = (
  [
    ['huis', 'Woning', 'eigen_huis', 385000, 385000, 3.5, null],
    ['bel', 'Beleggen', 'investment', 42000, null, 7, null],
    ['cash', 'Spaar', 'cash', 18000, null, 0, null],
    ['auto', 'Auto', 'vehicle', 8000, null, 0, 12],
  ] as const
).map(([id, name, t, v, woz, r, dep]) => ({ id, name, asset_type: t, current_value: v, woz_value: woz, expected_return: r, is_active: true, net_worth_inclusion_pct: 100, depreciation_rate: dep }) as unknown as Asset)

const DEBTS: Debt[] = [
  { id: 'hyp', name: 'Hypotheek', debt_type: 'mortgage', current_balance: 300000, interest_rate: 2.9, monthly_payment: 1100, repayment_type: 'annuiteit', is_tax_deductible: true, linked_asset_id: 'huis', end_date: null, net_worth_inclusion_pct: 100, include_aflossing_in_savings: false, is_active: true } as unknown as Debt,
]

const HOUSING: HousingStrategyConfig = { mode: 'downsize', trigger: 'fixed_age', triggerAge: 67, salePricePct: 1, salesCostsPct: 0.04, newMonthlyHousingCost: null, depletionThresholdYears: 0 } as unknown as HousingStrategyConfig

function build(v2: boolean) {
  return buildHorizonInput({
    horizonInput: { monthlyContributions: 1500, yearlyMustExpenses: 30000, dateOfBirth: '1981-07-08', monthlyIncome: 5000 } as never,
    lifeEvents: [],
    fireStrategy: { strategy: 'deplete', endAge: 90, legacyAmount: 0 },
    grossReturn: 0.07,
    inflation: 0.02,
    assets: ASSETS,
    debts: DEBTS,
    box3Method: 'forfaitair',
    hasPartner: true,
    housingStrategy: HOUSING,
    horizonEngineV2: v2,
  })
}

describe('horizon v2 housing-liquidatie (ADR 0015)', () => {
  it('v2: huis blijft in de input + assetLiquidations op de trigger', () => {
    const built = build(true)!
    expect(built.input.assets.some((a) => a.asset_type === 'eigen_huis')).toBe(true)
    expect(built.input.assetLiquidations?.length).toBe(1)
    expect(built.input.assetLiquidations![0].assetId).toBe('huis')
    expect(built.input.assetLiquidations![0].age).toBe(67)
    expect(built.input.assetLiquidations![0].payoffDebtIds).toContain('hyp')
  })

  it('v1: huis gefilterd, geen assetLiquidations (ongewijzigd model)', () => {
    const built = build(false)!
    expect(built.input.assets.some((a) => a.asset_type === 'eigen_huis')).toBe(false)
    expect(built.input.assetLiquidations).toBeUndefined()
  })

  it('v2: woningwaarde groeit zichtbaar tot de verkoop, dan €0', () => {
    const built = build(true)!
    const r = runHorizonLedger(built.input)
    const huis = (age: number) => r.rows.find((x) => x.leeftijd === age)?.assets.find((a) => a.type === 'eigen_huis')?.eind ?? 0
    expect(huis(60)).toBeGreaterThan(huis(50)) // groeit in de opbouw
    expect(huis(66)).toBeGreaterThan(385000) // geprojecteerd boven startwaarde
    expect(huis(67)).toBeLessThan(1) // verkocht op de trigger
    expect(huis(70)).toBeLessThan(1)
  })

  it('v2: netto vermogen blijft CONTINU bij verkoop (geen sprong), liquide verspringt OMHOOG', () => {
    const built = build(true)!
    const r = runHorizonLedger(built.input)
    const row = (age: number) => r.rows.find((x) => x.leeftijd === age)!
    const pre = row(66)
    const post = row(67)
    // Netto vermogen: hooguit een kleine dip (verkoopkosten + jaar-uitgaven),
    // NIET de oude sprong omhoog van het filter-model. Verschil < 15% van pre.
    const nettoSprong = Math.abs(post.nettoVermogen - pre.nettoVermogen)
    expect(nettoSprong).toBeLessThan(pre.nettoVermogen * 0.15)
    // Liquide verspringt fors omhoog door de netto-opbrengst.
    expect(post.liquideVermogen).toBeGreaterThan(pre.liquideVermogen * 1.3)
  })

  it('v2: verkoopkosten verlagen het netto vermogen (geen waarde uit het niets)', () => {
    const built = build(true)!
    const r = runHorizonLedger(built.input)
    const pre = r.rows.find((x) => x.leeftijd === 66)!
    const post = r.rows.find((x) => x.leeftijd === 67)!
    // Verkoop verhoogt netto vermogen NOOIT (filter-model deed dat wel).
    expect(post.nettoVermogen).toBeLessThanOrEqual(pre.nettoVermogen)
  })
})

// ── M1 / M2 / M4 follow-ups uit de code-review ────────────────────────────

// Afbouw-fixture: 55-jarige, gestopt met werken, woz_value ≠ current_value.
// Liquide raakt op vóór de cap → on_depletion-trigger kruist (crossover).
const DEP_ASSETS: Asset[] = (
  [
    // current_value 420k, woz_value 380k → bewust verschillend voor M4.
    ['huis', 'Woning', 'eigen_huis', 420000, 380000, 3.0, null],
    ['bel', 'Beleggen', 'investment', 120000, null, 5, null],
    ['cash', 'Spaar', 'cash', 20000, null, 0, null],
  ] as const
).map(([id, name, t, v, woz, r, dep]) => ({ id, name, asset_type: t, current_value: v, woz_value: woz, expected_return: r, is_active: true, net_worth_inclusion_pct: 100, depreciation_rate: dep }) as unknown as Asset)

const DEP_DEBTS: Debt[] = [
  { id: 'hyp', name: 'Hypotheek', debt_type: 'mortgage', current_balance: 150000, interest_rate: 3.0, monthly_payment: 900, repayment_type: 'annuiteit', is_tax_deductible: true, linked_asset_id: 'huis', end_date: null, net_worth_inclusion_pct: 100, include_aflossing_in_savings: false, is_active: true } as unknown as Debt,
]

// Cap = 90 (= endAge): met de deplete-annuïteit zakt het liquide pad pas tegen
// het einde van de horizon door de verkoopkosten-buffer → crossover rond 89.
const DOWNSIZE_ON_DEPLETION: DownsizeConfig = {
  mode: 'downsize',
  trigger: 'on_depletion',
  triggerAge: 90,
  salePricePct: 1,
  salesCostsPct: 0.05,
  newMonthlyHousingCost: null,
  depletionThresholdYears: 0,
} as unknown as DownsizeConfig

function depSimBasis(): HousingTriggerSimBasis {
  return {
    assets: DEP_ASSETS,
    debts: DEP_DEBTS,
    currentAge: 55,
    endAge: 90,
    yearlyExpenses: 36000,
    annualSavings: 0,
    monthlyIncome: 0,
    grossReturn: 0.05,
    inflationRate: 0.02,
    box3Method: 'forfaitair',
    cashflows: [],
    strategyConfig: { strategy: 'deplete', endAge: 90, legacyAmount: 0 },
    withdrawalStrategy: WITHDRAWAL_DEFAULTS,
    hasPartner: false,
  }
}

function buildDep(v2: boolean, housing: HousingStrategyConfig) {
  return buildHorizonInput({
    horizonInput: { monthlyContributions: 0, yearlyMustExpenses: 36000, dateOfBirth: '1971-01-01', monthlyIncome: 0 } as never,
    lifeEvents: [],
    fireStrategy: { strategy: 'deplete', endAge: 90, legacyAmount: 0 },
    grossReturn: 0.05,
    inflation: 0.02,
    assets: DEP_ASSETS,
    debts: DEP_DEBTS,
    box3Method: 'forfaitair',
    hasPartner: false,
    housingStrategy: housing,
    horizonEngineV2: v2,
  })
}

describe('M1 — v2-downsize draagt de depletion-uitleg ("Waarom dit moment?")', () => {
  it('on_depletion: het rent-event heeft metadata.depletion + triggerMode (panel-gate)', () => {
    const built = buildDep(true, DOWNSIZE_ON_DEPLETION)!
    const rentEvent = built.effectiveLifeEvents.find(
      (e) => (e.metadata as { source?: string } | null)?.source != null && e.event_type === 'verkoop_eigen_woning',
    )
    expect(rentEvent).toBeDefined()
    const meta = rentEvent!.metadata as Record<string, unknown>
    // De panel-gate in event-pane-view: triggerMode === 'on_depletion' && depletion.
    expect(meta.triggerMode).toBe('on_depletion')
    expect(meta.depletion).toBeDefined()
    const dep = meta.depletion as Record<string, unknown>
    expect(dep.method).toBe('simulation')
    // Alle panel-velden zijn gevuld (DepletionReasoning leest exact deze velden).
    expect(['immediate', 'crossover', 'fallback']).toContain(dep.reason)
    expect(typeof dep.triggerAge).toBe('number')
    expect(typeof dep.liquidAtTrigger).toBe('number')
    expect(typeof dep.bufferAtTrigger).toBe('number')
    expect(typeof dep.marginAtTrigger).toBe('number')
    expect(typeof dep.equityAtTrigger).toBe('number')
    expect(Array.isArray(dep.liquidPath)).toBe(true)
    // crossover-scenario: trigger ligt vóór de cap (90) en de buffer is > 0.
    expect(dep.reason).toBe('crossover')
    expect(dep.triggerAge as number).toBeLessThan(90)
    expect(dep.bufferAtTrigger as number).toBeGreaterThan(0)
  })

  it('fixed_age: géén depletion (panel toont niet — net als v1)', () => {
    const fixed = { ...DOWNSIZE_ON_DEPLETION, trigger: 'fixed_age', triggerAge: 67 } as unknown as HousingStrategyConfig
    const built = buildDep(true, fixed)!
    const rentEvent = built.effectiveLifeEvents.find((e) => e.event_type === 'verkoop_eigen_woning')
    expect(rentEvent).toBeDefined()
    const meta = rentEvent!.metadata as Record<string, unknown>
    expect(meta.triggerMode).toBe('fixed_age')
    expect(meta.depletion).toBeNull()
  })
})

describe('M2 — modal-preview honoreert de v2-vlag (preview == grafiek)', () => {
  it('runHousingScenarioProjectionV2 levert dezelfde FIRE als de v2-grafiek (build-input + v2-engine)', () => {
    const sim = depSimBasis()
    const context = deriveHousingContext(sim.assets, sim.debts)
    const preview = runHousingScenarioProjectionV2(DOWNSIZE_ON_DEPLETION, context, sim)

    // De grafiek-keten: build-input (v2) → runSelectedProjection(.., true).
    const built = buildDep(true, DOWNSIZE_ON_DEPLETION)!
    const graph = runSelectedProjection(built.input, true)

    expect(preview.fireReachable).toBe(graph.fireReachable)
    expect(preview.fireAgeFractional).toBe(graph.fireAgeFractional)
    // De preview draagt óók de depletion-uitleg voor de modal.
    expect(preview.depletion).not.toBeNull()
    expect(preview.depletion!.method).toBe('simulation')
    expect(preview.events).toHaveLength(1)
  })

  it('preview produceert dezelfde assetLiquidations als de grafiek (zelfde verkoopmoment)', () => {
    const sim = depSimBasis()
    const context = deriveHousingContext(sim.assets, sim.debts)
    const preview = runHousingScenarioProjectionV2(DOWNSIZE_ON_DEPLETION, context, sim)
    const built = buildDep(true, DOWNSIZE_ON_DEPLETION)!
    // Verkoopmoment uit de preview-depletion == age in de grafiek-assetLiquidations.
    expect(built.input.assetLiquidations).toHaveLength(1)
    expect(preview.depletion!.triggerAge).toBe(built.input.assetLiquidations![0].age)
  })
})

// Vaste-leeftijd-downsize op een NIET-terminaal moment (67), zodat de
// verkoopopbrengst zichtbaar naar liquide stroomt (op de terminale deplete-
// jaren slokt de annuïteit de opbrengst in hetzelfde jaar op — daar gaat M4
// niet over). woz_value (380k) ≠ current_value (420k) zodat de basis-keuze meetbaar is.
const DOWNSIZE_FIXED_67: DownsizeConfig = {
  mode: 'downsize',
  trigger: 'fixed_age',
  triggerAge: 67,
  salePricePct: 1,
  salesCostsPct: 0.05,
  newMonthlyHousingCost: null,
  depletionThresholdYears: 0,
} as unknown as DownsizeConfig

describe('M4 — verkoopopbrengst en trigger-buffer delen één valuatie-basis', () => {
  it('buffer is gemeten op de engine-asset-waarde (current_value-gegroeid), niet op woz_value', () => {
    const sim = depSimBasis()
    const context = deriveHousingContext(sim.assets, sim.debts)
    const preview = runHousingScenarioProjectionV2(DOWNSIZE_ON_DEPLETION, context, sim)
    const dep = preview.depletion!
    expect(dep.reason).toBe('crossover')

    // De buffer wordt gemeten op de TRIGGER-MEETRUN: het huis in de ledger,
    // ZONDER liquidatie én ZONDER huur-event (precies `baseSimInput` uit
    // resolveDownsizeTriggerV2). Reconstrueer die exact zodat de huiswaarde op het
    // trigger-jaar identiek is aan wat de trigger heeft gezien.
    const baseMeasureInput = {
      assets: sim.assets,
      debts: sim.debts,
      currentAge: sim.currentAge,
      endAge: sim.endAge,
      yearlyExpenses: sim.yearlyExpenses,
      annualSavings: sim.annualSavings,
      monthlySurplus: sim.annualSavings / 12,
      monthlyIncome: sim.monthlyIncome,
      incomeGrowthRate: 0,
      grossReturn: sim.grossReturn,
      inflationRate: sim.inflationRate,
      box3Method: sim.box3Method,
      cashflows: sim.cashflows,
      strategyConfig: sim.strategyConfig,
      withdrawalStrategy: sim.withdrawalStrategy,
      forcedFireAge: sim.forcedFireAge,
      hasPartner: sim.hasPartner,
      bankAccountCash: sim.bankAccountCash,
    }
    const measure = runHorizonLedger(baseMeasureInput)
    const triggerRow = measure.rows.find((r) => r.leeftijd === dep.triggerAge)!
    const engineHouseValue = triggerRow.assets
      .filter((a) => a.type === 'eigen_huis')
      .reduce((s, a) => s + Math.max(0, a.eind), 0)
    expect(engineHouseValue).toBeGreaterThan(0)

    // De buffer MOET de engine-asset-waarde × salePricePct × salesCostsPct zijn.
    const expectedBuffer = engineHouseValue * DOWNSIZE_ON_DEPLETION.salePricePct * DOWNSIZE_ON_DEPLETION.salesCostsPct
    expect(dep.bufferAtTrigger).toBeCloseTo(expectedBuffer, 1)

    // En NIET de woz-basis (woz_value 380k ≠ current_value 420k, en bovendien
    // nominaal gegroeid i.p.v. reëel) → meetbaar verschil.
    const wozGrownNominal = 380000 * Math.pow(1 + 0.03, dep.triggerAge - sim.currentAge)
    const wozBuffer = wozGrownNominal * DOWNSIZE_ON_DEPLETION.salePricePct * DOWNSIZE_ON_DEPLETION.salesCostsPct
    expect(Math.abs(dep.bufferAtTrigger - wozBuffer)).toBeGreaterThan(1)
  })

  it('de engine verkoopt op DEZELFDE engine-asset-waarde als de buffer; opbrengst stroomt liquide', () => {
    const built = buildDep(true, DOWNSIZE_FIXED_67)!
    const ledger = runHorizonLedger(built.input)
    const pre = ledger.rows.find((r) => r.leeftijd === 66)!
    const sale = ledger.rows.find((r) => r.leeftijd === 67)!

    // Het asset verlaat het grootboek tegen volledige engine-asset-waarde
    // (uitstroom-kolom). Dat is de basis waarop de opbrengst wordt berekend.
    const houseRow = sale.assets.find((a) => a.type === 'eigen_huis')!
    const marktwaarde = houseRow.uitstroom
    expect(marktwaarde).toBeGreaterThan(0)
    expect(houseRow.eind).toBeLessThan(1) // verkocht

    // Dezelfde basis als waarop een buffer zou worden gemeten: de huiswaarde in de
    // MEETRUN (zonder liquidatie) op het verkoopjaar. Buffer en opbrengst delen
    // dus één valuatie-basis (M4) — geen woz-vs-current_value-discrepantie meer.
    const measure = runHorizonLedger({ ...built.input, assetLiquidations: undefined })
    const measureHouse67 = measure.rows
      .find((r) => r.leeftijd === 67)!
      .assets.filter((a) => a.type === 'eigen_huis')
      .reduce((s, a) => s + a.eind, 0)
    expect(marktwaarde).toBeCloseTo(measureHouse67, 1)

    // De netto-opbrengst verspringt naar liquide (niet-terminaal jaar).
    expect(sale.liquideVermogen).toBeGreaterThan(pre.liquideVermogen)
  })
})

// ── include_full = woning besteedbaar (ADR 0015 Optie A) ──────────────────
// Regressie: deplete + include_full + groot huis. Zonder de fix bleef de woning
// niet-liquide → deplete dronk alleen de liquide pot, het huis groeide door →
// netto vermogen liep NIET naar 0 en FIRE schoof veel te laat. Met spendableAssetIds
// telt de woning mee in de besteedbare pot (laatst in de volgorde): deplete loopt
// naar ~0 en FIRE valt vroeger (herstelt het v1-gedrag).
describe('include_full = woning besteedbaar (Optie A)', () => {
  const HUIS_ASSETS: Asset[] = (
    [
      ['huis', 'Woning', 'eigen_huis', 1000000, 3.5, null],
      ['cash', 'Betaalrekening', 'cash', 63000, 0, null],
      ['bel', 'Beleggen', 'investment', 25000, 7, null],
    ] as const
  ).map(([id, name, t, v, r, dep]) => ({ id, name, asset_type: t, current_value: v, expected_return: r, is_active: true, net_worth_inclusion_pct: 100, depreciation_rate: dep }) as unknown as Asset)

  const mkInput = (spendable: boolean) => ({
    assets: HUIS_ASSETS, debts: [], currentAge: 40, endAge: 90,
    yearlyExpenses: 36300, annualSavings: 24000, monthlySurplus: 2000, monthlyIncome: 5000, incomeGrowthRate: 0,
    grossReturn: 0.07, inflationRate: 0.02, box3Method: 'forfaitair' as const,
    cashflows: [{ id: 'aow', name: 'AOW', type: 'recurring' as const, direction: 'income' as const, amount: 1600, fromAge: 67, toAge: null, indexed: true }],
    strategyConfig: { strategy: 'deplete' as const, endAge: 90, legacyAmount: 0 },
    withdrawalStrategy: WITHDRAWAL_DEFAULTS, hasPartner: false,
    spendableAssetIds: spendable ? ['huis'] : undefined,
  })

  it('woning niet-besteedbaar (default): deplete laat netto vermogen NIET naar 0 lopen', () => {
    const r = runHorizonLedger(mkInput(false))
    const end = r.rows[r.rows.length - 1]
    // Liquide gaat naar ~0, maar het (niet-verkochte) huis blijft → netto >> 0.
    expect(end.liquideVermogen).toBeLessThan(1000)
    expect(end.nettoVermogen).toBeGreaterThan(500000)
  })

  it('woning besteedbaar (include_full): deplete loopt naar ~0 én FIRE valt vroeger', () => {
    const vast = runHorizonLedger(mkInput(false))
    const besteedbaar = runHorizonLedger(mkInput(true))
    const end = besteedbaar.rows[besteedbaar.rows.length - 1]
    // Het huis wordt nu óók afgebouwd → netto vermogen ~0 op de eindleeftijd.
    expect(end.nettoVermogen).toBeLessThan(5000)
    expect(end.assets.find((a) => a.type === 'eigen_huis')!.eind).toBeLessThan(1)
    // FIRE valt vroeger dan met de vastgezette woning (de hele pot telt mee).
    expect(besteedbaar.fireReachable).toBe(true)
    expect(besteedbaar.fireAge!).toBeLessThan(vast.fireAge!)
  })
})

// ── Issue 1 — on_depletion verkoopmoment scant de VOLLE horizon ───────────────
//
// Accepted semantics (architect): voor een on_depletion-downsize wordt het huis
// verkocht op het EERSTE projectiejaar waarin het liquide (niet-huis) vermogen ≤
// verkoopkosten-buffer (+ veiligheidsmarge) zakt, gescand over de VOLLE horizon
// tot endAge. `config.triggerAge` is UITSLUITEND de fallback-plafond voor het
// never-deplete-geval — het mag de verkoop NIET naar een eerder jaar kappen.
//
// Bug vandaag: `resolveDownsizeTriggerV2` (build-input.ts:178) breekt de scan af
// met `if (row.leeftijd > fallbackAge) break`, waarbij `fallbackAge = config.
// triggerAge`. Daardoor:
//   • depletie ná triggerAge → wordt naar triggerAge gekapt (te vroeg verkocht
//     terwijl er nog ~€1M liquide is);
//   • nooit-depletie → force-sale op triggerAge (`reason:'fallback'`) i.p.v. geen
//     verkoop.
//
// Onderstaande fixture (architect-repro): huis €600k, beleggingen €350k,
// pensioen €250k, cash €60k, AOW 67, deplete tot 95. Met de cap WEG depleteert
// het liquide pad op ~93; bij `triggerAge < 93` mag de verkoop NIET vervroegen.

const I1_ASSETS: Asset[] = (
  [
    ['huis', 'Woning', 'eigen_huis', 600000, 600000, 3.5, null],
    ['bel', 'Beleggen', 'investment', 350000, null, 6, null],
    ['pen', 'Pensioen', 'retirement', 250000, null, 4, null],
    ['cash', 'Spaar', 'cash', 60000, null, 0, null],
  ] as const
).map(([id, name, t, v, woz, r, dep]) => ({ id, name, asset_type: t, current_value: v, woz_value: woz, expected_return: r, is_active: true, net_worth_inclusion_pct: 100, depreciation_rate: dep }) as unknown as Asset)

const I1_DEBTS: Debt[] = [
  { id: 'hyp', name: 'Hypotheek', debt_type: 'mortgage', current_balance: 250000, interest_rate: 2.9, monthly_payment: 1100, repayment_type: 'annuiteit', is_tax_deductible: true, linked_asset_id: 'huis', end_date: null, net_worth_inclusion_pct: 100, include_aflossing_in_savings: false, is_active: true } as unknown as Debt,
]

const I1_AOW = { id: 'aow', event_type: 'aow', name: 'AOW', target_age: 67, monthly_income_change: 1600, is_active: true, sort_order: 0 } as never

function buildI1(triggerAge: number, opts?: { assets?: Asset[]; debts?: Debt[]; strategy?: 'deplete' | 'perpetual'; yearlyExpenses?: number }) {
  const housing: DownsizeConfig = {
    mode: 'downsize',
    trigger: 'on_depletion',
    triggerAge,
    salePricePct: 1,
    salesCostsPct: 0.04,
    newMonthlyHousingCost: null,
    depletionThresholdYears: 0,
  } as unknown as DownsizeConfig
  return buildHorizonInput({
    horizonInput: { monthlyContributions: 0, yearlyMustExpenses: opts?.yearlyExpenses ?? 60000, dateOfBirth: '1959-01-01', monthlyIncome: 0 } as never,
    lifeEvents: [I1_AOW],
    fireStrategy: { strategy: opts?.strategy ?? 'deplete', endAge: 95, legacyAmount: 0 },
    grossReturn: 0.05,
    inflation: 0.02,
    assets: opts?.assets ?? I1_ASSETS,
    debts: opts?.debts ?? I1_DEBTS,
    box3Method: 'forfaitair',
    hasPartner: false,
    housingStrategy: housing as HousingStrategyConfig,
    horizonEngineV2: true,
  })
}

/** Werkelijke depletie-leeftijd op v2's eigen liquide-pad, zonder cap, zonder liquidatie. */
function trueDepletionAgeV2(): number {
  const built = buildI1(95)! // cap = endAge → scant in de praktijk de volle horizon
  const measure = runHorizonLedger({ ...built.input, assetLiquidations: undefined })
  const houseAt = (r: (typeof measure.rows)[number]) =>
    r.assets.filter((a) => a.type === 'eigen_huis').reduce((s, a) => s + Math.max(0, a.eind), 0)
  for (const r of measure.rows) {
    const buffer = houseAt(r) * 1 * 0.04
    if (r.liquideVermogen - buffer <= 1) return r.leeftijd
  }
  throw new Error('liquide depleteert niet binnen de horizon — fixture klopt niet')
}

describe('Issue 1 — on_depletion downsize scant de volle horizon (RED vóór fix)', () => {
  // 1a: depletie ná config.triggerAge → verkoop op de ECHTE depletie-leeftijd,
  // NIET op triggerAge. Vandaag kapt de cap dit af → RED.
  it('1a: depletie ná triggerAge → verkoop op de echte depletie, niet op de cap', () => {
    const trueAge = trueDepletionAgeV2()
    // Sanity: de echte depletie ligt ná de lage cap die we kiezen.
    const lowCap = 75
    expect(trueAge).toBeGreaterThan(lowCap)

    const built = buildI1(lowCap)!
    expect(built.input.assetLiquidations).toHaveLength(1)
    const saleAge = built.input.assetLiquidations![0].age
    // De accepted-semantics: verkoop op de ECHTE depletie (≈93), niet op de
    // config-cap (75). Vandaag geeft de code 75 → deze assertie faalt (RED).
    expect(saleAge).toBe(trueAge)
    expect(saleAge).toBeGreaterThan(lowCap)
    // Verkoop vindt plaats ⇒ huis NIET tot het einde aangehouden.
    expect(built.housingHeldToEnd).toBe(false)
  })

  // 1b: liquide raakt NOOIT de buffer → GEEN verkoop. Vandaag force-sale op de
  // cap met reason:'fallback' + een rent-event → RED.
  it('1b: nooit-depletie → geen verkoop (geen assetLiquidations, geen huur-event)', () => {
    const RICH: Asset[] = (
      [
        ['huis', 'Woning', 'eigen_huis', 600000, 600000, 3.5, null],
        ['bel', 'Beleggen', 'investment', 1500000, null, 6, null],
        ['cash', 'Spaar', 'cash', 100000, null, 0, null],
      ] as const
    ).map(([id, name, t, v, woz, r, dep]) => ({ id, name, asset_type: t, current_value: v, woz_value: woz, expected_return: r, is_active: true, net_worth_inclusion_pct: 100, depreciation_rate: dep }) as unknown as Asset)

    const built = buildI1(80, { assets: RICH, debts: [], strategy: 'perpetual', yearlyExpenses: 30000 })!
    // Verificatie dat dit écht een nooit-depletie-fixture is: het liquide pad
    // blijft over de hele horizon ruim boven nul.
    const measure = runHorizonLedger({ ...built.input, assetLiquidations: undefined })
    const minLiquid = Math.min(...measure.rows.map((r) => r.liquideVermogen))
    expect(minLiquid).toBeGreaterThan(500_000)

    // Accepted-semantics: geen kruising binnen de horizon → GEEN verkoop.
    expect(built.input.assetLiquidations ?? []).toHaveLength(0)
    const rentEvent = built.effectiveLifeEvents.find((e) => e.event_type === 'verkoop_eigen_woning')
    expect(rentEvent).toBeUndefined()
    // Afleiding voor de "huis wordt nooit verkocht"-melding: downsize +
    // on_depletion dat nooit triggert ⇒ housingHeldToEnd = true.
    expect(built.housingHeldToEnd).toBe(true)
  })

  // 1c: GREEN guard — fixed_age verkoopt exact op config.triggerAge. Moet blijven
  // slagen (de fix mag dit niet breken).
  it('1c: fixed_age verkoopt exact op config.triggerAge (regressie-guard, blijft GROEN)', () => {
    const housing: HousingStrategyConfig = {
      mode: 'downsize',
      trigger: 'fixed_age',
      triggerAge: 70,
      salePricePct: 1,
      salesCostsPct: 0.04,
      newMonthlyHousingCost: null,
      depletionThresholdYears: 0,
    } as unknown as HousingStrategyConfig
    const built = buildHorizonInput({
      horizonInput: { monthlyContributions: 0, yearlyMustExpenses: 60000, dateOfBirth: '1959-01-01', monthlyIncome: 0 } as never,
      lifeEvents: [I1_AOW],
      fireStrategy: { strategy: 'deplete', endAge: 95, legacyAmount: 0 },
      grossReturn: 0.05,
      inflation: 0.02,
      assets: I1_ASSETS,
      debts: I1_DEBTS,
      box3Method: 'forfaitair',
      hasPartner: false,
      housingStrategy: housing,
      horizonEngineV2: true,
    })!
    expect(built.input.assetLiquidations).toHaveLength(1)
    expect(built.input.assetLiquidations![0].age).toBe(70)
    // fixed_age verkoopt onvoorwaardelijk ⇒ nooit "tot het einde aangehouden".
    expect(built.housingHeldToEnd).toBe(false)
  })
})
