import { describe, it, expect } from 'vitest'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import type { LifeEvent } from '@/lib/horizon-data'
import { buildHorizonInput } from '@/lib/horizon-engine/build-input'
import { runHorizonLedger } from '@/lib/horizon-engine'
import type { DownsizeConfig, HousingStrategyConfig } from '@/lib/housing-strategy'

/**
 * Bug A + Bug B in de v2-downsize-rekenmotor (ADR 0031).
 *
 * Bug A — de verkoop-trigger viel in de ACCUMULATIEFASE: `resolveDownsizeTriggerV2`
 *   liet de trigger-meetrun zijn EIGEN FIRE-leeftijd berekenen. De spendable woning
 *   bevredigt de FIRE-gate (`liquideVermogen`) al op currentAge, maar de besteedbare
 *   ex-huis pot kan dat niet dragen → de meetrun "pensioneerde" een nog-werkende
 *   gebruiker direct en kruiste de verkoopkosten-buffer al in de opbouw (trigger ~41
 *   terwijl de getoonde run pas op ~59-60 FIRE bereikt). Fix: pin de meetrun op de
 *   HONEST hold-FIRE (woning spendable+rauw-besteedbaar → eerlijke gate) + één
 *   verfijning op de getoonde downsize-FIRE → trigger valt ALTIJD in de onttrekkingsfase
 *   (≥ FIRE) of nooit (no_sale).
 *
 * Bug B — de getoonde `metadata.saleProceeds` was WOZ-nominaal (via
 *   `buildHousingLifeEventsAtAge` → `projectEigenHuisValuesAt`) en week af van de
 *   markt-reële verkoop in de engine. Fix: overschrijf met de ECHTE engine-net-opbrengst
 *   op de trigger-leeftijd.
 *
 * Config — nieuw `saleValuationBasis: 'market' | 'woz'` (default 'market') bepaalt de
 *   ENGINE-basiswaarde van het huis (current_value vs woz_value), één bron via
 *   `applyDownsizeValuationBasis`.
 */

// ── Reproductie-persona (janpaul050486, firsthand uit de DB) ────────────────────
// 40-jarige, werkend, spaart €2.000/mnd; eigen woning markt €1.000.500 / WOZ €650.000
// @ inclusion 50% / rendement 3,5% / GEEN hypotheek; liquide €124.750; legacy(€1) tot 90.
const PERSONA_ASSETS: Asset[] = ([
  ['cash1', 'Betaalrekening', 'cash', 36500, null, 0, 100],
  ['cash2', 'Betaalrekening', 'cash', 14000, null, 0, 100],
  ['crypto', 'Crypto-portfolio', 'crypto', 20096.14, null, 0, 100],
  ['huis', 'Mijn woning', 'eigen_huis', 1000500, 650000, 3.5, 50],
  ['bel', 'Beleggingsrekening', 'investment', 30595.71, null, 7, 100],
] as const).map(([id, name, t, v, woz, r, inc]) => ({
  id, name, asset_type: t, current_value: v, woz_value: woz, expected_return: r,
  is_active: true, net_worth_inclusion_pct: inc, depreciation_rate: null, sale_config: null,
}) as unknown as Asset)

const PERSONA_DEBTS: Debt[] = [
  { id: 'duo', name: 'Studielening DUO', debt_type: 'student_loan', current_balance: 20000, interest_rate: 0, monthly_payment: 111.11, repayment_type: 'lineair', is_tax_deductible: false, linked_asset_id: null, end_date: null, net_worth_inclusion_pct: 100, include_aflossing_in_savings: false, is_active: true } as unknown as Debt,
]

const mkPension = (id: string, age: number, amt: number): LifeEvent => ({
  id, name: id, event_type: 'pension', target_age: age, target_date: null,
  one_time_cost: 0, monthly_cost_change: 0, monthly_income_change: amt, duration_months: 0,
  icon: 'Coins', is_active: true, sort_order: 1, is_indexed: false, metadata: null, linked_asset_id: null,
}) as unknown as LifeEvent

const PERSONA_EVENTS: LifeEvent[] = [
  { id: 'aow', name: 'AOW', event_type: 'aow', target_age: 69, target_date: null, one_time_cost: 0, monthly_cost_change: 0, monthly_income_change: 1744, duration_months: 0, icon: 'Coins', is_active: true, sort_order: 0, is_indexed: true, metadata: null, linked_asset_id: null } as unknown as LifeEvent,
  mkPension('nn1', 65, 71), mkPension('zw1', 67, 12), mkPension('asr1', 68, 269), mkPension('aeg1', 68, 43),
  mkPension('nn2', 65, 71), mkPension('zw2', 67, 12), mkPension('asr2', 68, 269), mkPension('aeg2', 68, 43),
]

function buildPersona(housing: HousingStrategyConfig) {
  return buildHorizonInput({
    horizonInput: { monthlyContributions: 2000, yearlyMustExpenses: 39600, dateOfBirth: '1986-05-01', monthlyIncome: 5000 } as never,
    lifeEvents: PERSONA_EVENTS,
    fireStrategy: { strategy: 'legacy', endAge: 90, legacyAmount: 1 },
    grossReturn: 0.07, inflation: 0.02, assets: PERSONA_ASSETS, debts: PERSONA_DEBTS,
    box3Method: 'forfaitair', hasPartner: false, baseAnnualSavingsFromCashflow: 24000,
    housingStrategy: housing, horizonEngineV2: true,
  })!
}

const DOWNSIZE_OD = (basis: 'market' | 'woz'): DownsizeConfig => ({
  mode: 'downsize', trigger: 'on_depletion', triggerAge: 67, salePricePct: 1, salesCostsPct: 0.04,
  newMonthlyHousingCost: null, depletionThresholdYears: 0, saleValuationBasis: basis,
})

const houseTriggerAge = (built: ReturnType<typeof buildPersona>): number | null =>
  (built.input.assetLiquidations ?? []).find((l) => l.assetId === 'huis')?.age ?? null

describe('Bug A — downsize/on_depletion verkoop-trigger valt NIET in de accumulatiefase', () => {
  it('huis-zware accumulerende persona: trigger == no_sale OF ≥ FIRE-leeftijd (NIET vroeg in de opbouw)', () => {
    const built = buildPersona(DOWNSIZE_OD('market'))
    const fireAge = runHorizonLedger(built.input).fireAge!
    expect(fireAge).toBeGreaterThan(built.input.currentAge) // accumulerende persona: FIRE ligt in de toekomst
    const trigger = houseTriggerAge(built)

    if (trigger === null) {
      // no_sale is een geldige uitkomst (huis nooit nodig).
      expect(built.housingHeldToEnd).toBe(true)
    } else {
      // De verkoop mag NOOIT in de accumulatiefase (vóór FIRE) vallen. Vóór de fix
      // vuurde hij op ~currentAge+1 (bv. 41) terwijl FIRE ~59-60 is → < FIRE → RED.
      expect(trigger).toBeGreaterThanOrEqual(fireAge)
      // En zeker niet vlak ná currentAge (de oude accumulatie-bug).
      expect(trigger).toBeGreaterThan(built.input.currentAge + 5)
    }
  })

  it('de getoonde grafiek verkoopt het huis op EXACT de gerapporteerde trigger-leeftijd (SSoT)', () => {
    const built = buildPersona(DOWNSIZE_OD('market'))
    const trigger = houseTriggerAge(built)
    if (trigger === null) return // no_sale → niets te verkopen
    const ledger = runHorizonLedger(built.input)
    const huisAt = (age: number) =>
      ledger.rows.find((r) => r.leeftijd === age)?.assets.find((a) => a.id === 'huis')?.eind ?? 0
    expect(huisAt(trigger - 1)).toBeGreaterThan(0)
    expect(huisAt(trigger)).toBeLessThan(1)
  })
})

describe('Bug B — getoonde saleProceeds == de ECHTE engine-verkoopopbrengst (geen WOZ-desync)', () => {
  // Fixed_age zonder hypotheek: de engine-net-opbrengst = uitstroom × salePricePct ×
  // (1 − salesCostsPct). woz_value (350k) ≠ current_value (500k) → vóór de fix toonde
  // de preview de WOZ-nominale waarde (≠ de markt-reële engine-verkoop) → RED.
  const SELL_ASSETS: Asset[] = ([
    ['huis', 'Woning', 'eigen_huis', 500000, 350000, 3.0, 100],
    ['bel', 'Beleggen', 'investment', 200000, null, 7, 100],
    ['cash', 'Spaar', 'cash', 40000, null, 0, 100],
  ] as const).map(([id, name, t, v, woz, r, inc]) => ({
    id, name, asset_type: t, current_value: v, woz_value: woz, expected_return: r,
    is_active: true, net_worth_inclusion_pct: inc, depreciation_rate: null, sale_config: null,
  }) as unknown as Asset)

  const SELL_DOWNSIZE: DownsizeConfig = {
    mode: 'downsize', trigger: 'fixed_age', triggerAge: 67, salePricePct: 1, salesCostsPct: 0.05,
    newMonthlyHousingCost: null, depletionThresholdYears: 0, saleValuationBasis: 'market',
  }

  function buildSell(housing: DownsizeConfig) {
    return buildHorizonInput({
      horizonInput: { monthlyContributions: 1500, yearlyMustExpenses: 30000, dateOfBirth: '1979-01-01', monthlyIncome: 4500 } as never,
      lifeEvents: [], fireStrategy: { strategy: 'deplete', endAge: 90, legacyAmount: 0 },
      grossReturn: 0.07, inflation: 0.02, assets: SELL_ASSETS, debts: [],
      box3Method: 'forfaitair', hasPartner: false, housingStrategy: housing, horizonEngineV2: true,
    })!
  }

  function engineNetInjection(built: ReturnType<typeof buildSell>, housing: DownsizeConfig): { previewSaleProceeds: number; engineNet: number; triggerAge: number } {
    const ledger = runHorizonLedger(built.input)
    const trigger = (built.input.assetLiquidations ?? []).find((l) => l.assetId === 'huis')!.age
    const saleRow = ledger.rows.find((r) => r.leeftijd === Math.round(trigger))!
    const houseRow = saleRow.assets.find((a) => a.id === 'huis')!
    const gross = Math.max(0, houseRow.uitstroom) // marktwaarde waarvoor de engine verkoopt
    const engineNet = gross * housing.salePricePct * (1 - housing.salesCostsPct) // geen hypotheek
    const ev = built.effectiveLifeEvents.find((e) => e.event_type === 'verkoop_eigen_woning')!
    const previewSaleProceeds = Number((ev.metadata as Record<string, unknown>).saleProceeds)
    return { previewSaleProceeds, engineNet, triggerAge: Math.round(trigger) }
  }

  it("market: preview saleProceeds == engine-net-injectie (binnen €1), NIET de WOZ-nominale waarde", () => {
    const built = buildSell(SELL_DOWNSIZE)
    const { previewSaleProceeds, engineNet } = engineNetInjection(built, SELL_DOWNSIZE)
    expect(previewSaleProceeds).toBeCloseTo(engineNet, 0) // exacte match (≤ €0,5 afronding)
    // En het is NIET de oude WOZ-nominale waarde (350k nominaal gegroeid × 0,95).
    const wozNominal = 350000 * Math.pow(1.03, built.input.assetLiquidations![0].age - built.input.currentAge) * 0.95
    expect(Math.abs(previewSaleProceeds - wozNominal)).toBeGreaterThan(1)
  })

  it('woz-basis: preview saleProceeds == engine-net-injectie (binnen €1) op de WOZ-grondslag', () => {
    const wozCfg: DownsizeConfig = { ...SELL_DOWNSIZE, saleValuationBasis: 'woz' }
    const built = buildSell(wozCfg)
    const { previewSaleProceeds, engineNet } = engineNetInjection(built, wozCfg)
    expect(previewSaleProceeds).toBeCloseTo(engineNet, 0)
  })
})

describe('Config — saleValuationBasis bepaalt de engine-basiswaarde van het huis', () => {
  it("'woz' gebruikt woz_value × inclusion als engine-startwaarde; 'market' (default) gebruikt current_value × inclusion", () => {
    const market = buildPersona(DOWNSIZE_OD('market'))
    const woz = buildPersona(DOWNSIZE_OD('woz'))
    const startHouse = (built: ReturnType<typeof buildPersona>) =>
      runHorizonLedger(built.input).rows[0].assets.find((a) => a.id === 'huis')!.eind

    // markt: current_value 1.000.500 × 50% = 500.250 (± klein eerste-jaar-rendement).
    expect(startHouse(market)).toBeGreaterThan(500000)
    // woz: woz_value 650.000 × 50% = 325.000 → duidelijk kleiner.
    expect(startHouse(woz)).toBeGreaterThan(320000)
    expect(startHouse(woz)).toBeLessThan(345000)
    expect(startHouse(woz)).toBeLessThan(startHouse(market) - 150000)
  })

  it("default (geen veld) == 'market' — continuïteit, woz wijzigt niets aan de huidige berekening", () => {
    const withoutField: DownsizeConfig = { mode: 'downsize', trigger: 'on_depletion', triggerAge: 67, salePricePct: 1, salesCostsPct: 0.04, newMonthlyHousingCost: null, depletionThresholdYears: 0 } as DownsizeConfig
    const market = buildPersona(DOWNSIZE_OD('market'))
    const noField = buildPersona(withoutField)
    const startHouse = (built: ReturnType<typeof buildPersona>) =>
      runHorizonLedger(built.input).rows[0].assets.find((a) => a.id === 'huis')!.eind
    expect(startHouse(noField)).toBeCloseTo(startHouse(market), 0)
  })
})

describe('Regressie — fixed_age downsize ongewijzigd (verkoopt op de gekozen leeftijd)', () => {
  it('accumulerende persona + fixed_age 67: verkoopt EXACT op 67 (geen depletie-trigger-interferentie)', () => {
    const fixedCfg: DownsizeConfig = { mode: 'downsize', trigger: 'fixed_age', triggerAge: 67, salePricePct: 1, salesCostsPct: 0.04, newMonthlyHousingCost: null, depletionThresholdYears: 0, saleValuationBasis: 'market' }
    const built = buildPersona(fixedCfg)
    expect(built.input.assetLiquidations).toBeDefined()
    const huisLiq = built.input.assetLiquidations!.filter((l) => l.assetId === 'huis')
    expect(huisLiq).toHaveLength(1)
    expect(huisLiq[0].age).toBe(67)
    expect(built.housingHeldToEnd).toBe(false)
  })
})

// ── H1 (review): FIRE-onbereikbaar → trigger NIET in de accumulatiefase ──────────
// Bij onbereikbare FIRE (onderwater-hypotheek / zeer hoge uitgaven) is er geen hold-FIRE-
// anker (null). De fix pint de meetrun dan op `undefined` (zelf-zoekend → werkt tot AOW),
// NIET op currentAge — anders "stopt" de meetrun nu terwijl de getoonde run doorwerkt en
// valt de trigger weer op currentAge (Bug A-variant). RED vóór de fix: trigger == currentAge.
describe('H1 — FIRE-onbereikbaar: downsize-trigger valt niet in de accumulatiefase', () => {
  // Werkend, 40, €200k/jr pensioenuitgaven (onhoudbaar) + krappe overwaarde → FIRE
  // onbereikbaar, óók include_full (de woning kan €200k/jr niet dragen) → hold-FIRE = null.
  const U_ASSETS: Asset[] = ([
    ['huis', 'Woning', 'eigen_huis', 500000, 500000, 3.0, 100],
    ['cash', 'Spaar', 'cash', 20000, null, 0, 100],
  ] as const).map(([id, name, t, v, woz, r, inc]) => ({
    id, name, asset_type: t, current_value: v, woz_value: woz, expected_return: r,
    is_active: true, net_worth_inclusion_pct: inc, depreciation_rate: null, sale_config: null,
  }) as unknown as Asset)
  const U_DEBTS: Debt[] = [
    { id: 'hyp', name: 'Hypotheek', debt_type: 'mortgage', current_balance: 450000, interest_rate: 3.0, monthly_payment: 1900, repayment_type: 'annuiteit', is_tax_deductible: true, linked_asset_id: 'huis', end_date: null, net_worth_inclusion_pct: 100, include_aflossing_in_savings: false, is_active: true } as unknown as Debt,
  ]
  const buildU = (housing: HousingStrategyConfig) =>
    buildHorizonInput({
      horizonInput: { monthlyContributions: 100, yearlyMustExpenses: 200000, dateOfBirth: '1986-05-01', monthlyIncome: 3000 } as never,
      lifeEvents: [], fireStrategy: { strategy: 'deplete', endAge: 90, legacyAmount: 0 },
      grossReturn: 0.05, inflation: 0.02, assets: U_ASSETS, debts: U_DEBTS,
      box3Method: 'forfaitair', hasPartner: false, baseAnnualSavingsFromCashflow: 1200,
      housingStrategy: housing, horizonEngineV2: true,
    })!

  it('hold-FIRE is onbereikbaar (include_full FIRE == null) → de null-tak wordt geraakt', () => {
    const incl = runHorizonLedger(buildU({ mode: 'include_full' } as HousingStrategyConfig).input)
    expect(incl.fireReachable).toBe(false)
    expect(incl.fireAge).toBeNull()
  })

  it('trigger == no_sale OF ruim ná currentAge — NOOIT op/bij currentAge (de H1-bug)', () => {
    const built = buildU(DOWNSIZE_OD('market'))
    const ca = built.input.currentAge
    const trigger = (built.input.assetLiquidations ?? []).find((l) => l.assetId === 'huis')?.age ?? null
    if (trigger === null) {
      expect(built.housingHeldToEnd).toBe(true)
    } else {
      // Vóór de fix vuurde hij op currentAge (40). De meetrun volgt nu de zelf-zoekende
      // getoonde run (werkt tot AOW) → trigger ruim ná currentAge.
      expect(trigger).toBeGreaterThan(ca + 5)
    }
  })
})

// ── L1 (review): no-salary brugfase — leg de bewuste verfijnings-skip vast ──────
// monthlyIncome == 0 maar hold-FIRE > currentAge (net niet genoeg om NU te stoppen).
// De verfijning wordt bewust overgeslagen (geen salaris → doorwerken voegt niets toe);
// de ruwe hold-FIRE-trigger is dan al juist. Lock zodat 'm niet stilletjes verschuift.
describe('L1 — no-salary brugfase: ruwe hold-FIRE-trigger, geen verfijning', () => {
  const B_ASSETS: Asset[] = ([
    ['huis', 'Woning', 'eigen_huis', 450000, 450000, 3.0, 100],
    ['bel', 'Beleggen', 'investment', 120000, null, 5, 100],
    ['cash', 'Spaar', 'cash', 20000, null, 0, 100],
  ] as const).map(([id, name, t, v, woz, r, inc]) => ({
    id, name, asset_type: t, current_value: v, woz_value: woz, expected_return: r,
    is_active: true, net_worth_inclusion_pct: inc, depreciation_rate: null, sale_config: null,
  }) as unknown as Asset)
  const buildB = (housing: HousingStrategyConfig) =>
    buildHorizonInput({
      horizonInput: { monthlyContributions: 0, yearlyMustExpenses: 36000, dateOfBirth: '1964-01-01', monthlyIncome: 0 } as never,
      lifeEvents: [{ id: 'aow', name: 'AOW', event_type: 'aow', target_age: 67, target_date: null, one_time_cost: 0, monthly_cost_change: 0, monthly_income_change: 1500, duration_months: 0, icon: 'C', is_active: true, sort_order: 0, is_indexed: true, metadata: null, linked_asset_id: null } as unknown as LifeEvent],
      fireStrategy: { strategy: 'deplete', endAge: 90, legacyAmount: 0 },
      grossReturn: 0.05, inflation: 0.02, assets: B_ASSETS, debts: [],
      box3Method: 'forfaitair', hasPartner: false, baseAnnualSavingsFromCashflow: 0,
      housingStrategy: housing, horizonEngineV2: true,
    })!

  it('verkoopt in de onttrekkingsfase (≥ hold-FIRE) en NIET kunstmatig vertraagd tot ~endAge', () => {
    const built = buildB(DOWNSIZE_OD('market'))
    const holdFire = runHorizonLedger(buildB({ mode: 'include_full' } as HousingStrategyConfig).input).fireAge
    const trigger = (built.input.assetLiquidations ?? []).find((l) => l.assetId === 'huis')?.age ?? null
    if (trigger !== null) {
      if (holdFire != null) expect(trigger).toBeGreaterThanOrEqual(holdFire - 1)
      // Niet kunstmatig naar de cap geschoven (de verfijnings-skip voorkomt over-delay).
      expect(trigger).toBeLessThan(88)
    } else {
      expect(built.housingHeldToEnd).toBe(true)
    }
  })
})

// ── H2 (review): metadata-grondslag telt op naar saleProceeds (consume-don't-recompute) ─
describe('H2 — engine-grondslag in metadata: breakdown telt op naar saleProceeds', () => {
  const SELL_ASSETS: Asset[] = ([
    ['huis', 'Woning', 'eigen_huis', 500000, 350000, 3.0, 100],
    ['bel', 'Beleggen', 'investment', 200000, null, 7, 100],
    ['cash', 'Spaar', 'cash', 40000, null, 0, 100],
  ] as const).map(([id, name, t, v, woz, r, inc]) => ({
    id, name, asset_type: t, current_value: v, woz_value: woz, expected_return: r,
    is_active: true, net_worth_inclusion_pct: inc, depreciation_rate: null, sale_config: null,
  }) as unknown as Asset)
  const buildSell = (basis: 'market' | 'woz') => buildHorizonInput({
    horizonInput: { monthlyContributions: 1500, yearlyMustExpenses: 30000, dateOfBirth: '1979-01-01', monthlyIncome: 4500 } as never,
    lifeEvents: [], fireStrategy: { strategy: 'deplete', endAge: 90, legacyAmount: 0 },
    grossReturn: 0.07, inflation: 0.02, assets: SELL_ASSETS, debts: [], box3Method: 'forfaitair', hasPartner: false,
    housingStrategy: { mode: 'downsize', trigger: 'fixed_age', triggerAge: 67, salePricePct: 1, salesCostsPct: 0.05, newMonthlyHousingCost: null, depletionThresholdYears: 0, saleValuationBasis: basis } as DownsizeConfig,
    horizonEngineV2: true,
  })!

  it.each(['market', 'woz'] as const)('%s: grondslag × salePct × (1−costs) − payoff == saleProceeds (binnen €1)', (basis) => {
    const built = buildSell(basis)
    const ev = built.effectiveLifeEvents.find((e) => e.event_type === 'verkoop_eigen_woning')!
    const m = ev.metadata as Record<string, unknown>
    expect(m.saleValuationBasis).toBe(basis)
    const grondslag = Number(m.grondslagValueAtTrigger)
    const payoff = Number(m.mortgagePayoffAtTrigger)
    const saleProceeds = Number(m.saleProceeds)
    const salePct = Number(m.salePricePct)
    const costs = Number(m.salesCostsPct)
    expect(Number.isFinite(grondslag)).toBe(true)
    expect(Number.isFinite(payoff)).toBe(true)
    expect(grondslag * salePct * (1 - costs) - payoff).toBeCloseTo(saleProceeds, 0)
    if (basis === 'woz') {
      const marketGrondslag = Number((buildSell('market').effectiveLifeEvents.find((e) => e.event_type === 'verkoop_eigen_woning')!.metadata as Record<string, unknown>).grondslagValueAtTrigger)
      expect(grondslag).toBeLessThan(marketGrondslag)
    }
  })
})
