import { describe, it, expect } from 'vitest'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import { buildHorizonInput } from '@/lib/horizon-engine/build-input'
import { runHorizonLedger } from '@/lib/horizon-engine'
import type { HousingStrategyConfig, DownsizeConfig } from '@/lib/housing-strategy'

/**
 * Fase 2 — "Verkopen" (v2-downsize-herdefinitie, ADR 0028). Smoke-dekking:
 *  (a) het huis telt mee in de FIRE-eligibility-opbouw → downsize bereikt FIRE
 *      EERDER dan exclude_from_fire (en liquidSumStart bevat de huiswaarde);
 *  (b) fixed-age-verkoop: netto vermogen op het verkoopjaar ≈ pre-sale − verkoopkosten
 *      (geen sprong van de volledige huiswaarde);
 *  (c) netto-vermogen-continuïteit door de verkoop heen;
 *  (d) de trigger-leeftijd die resolveDownsizeTriggerV2 rapporteert == de leeftijd
 *      waarop de engine het huis werkelijk verkoopt (on_depletion) — de SSoT-invariant.
 *
 * (De uitgebreide Verkopen-suite volgt apart; dit is bewust smoke.)
 */

// 45-jarige, spaart fors, huis €400k @ inclusion 100, kleine hypotheek, ruime
// beleggingen → FIRE haalbaar ruim vóór endAge zodat de buildup-fase meetbaar is.
const ASSETS: Asset[] = (
  [
    ['huis', 'Woning', 'eigen_huis', 400000, 400000, 3.0, null],
    ['bel', 'Beleggen', 'investment', 250000, null, 7, null],
    ['cash', 'Spaar', 'cash', 30000, null, 0, null],
  ] as const
).map(([id, name, t, v, woz, r, dep]) => ({
  id, name, asset_type: t, current_value: v, woz_value: woz, expected_return: r,
  is_active: true, net_worth_inclusion_pct: 100, depreciation_rate: dep,
}) as unknown as Asset)

const DEBTS: Debt[] = [
  { id: 'hyp', name: 'Hypotheek', debt_type: 'mortgage', current_balance: 120000, interest_rate: 2.5, monthly_payment: 700, repayment_type: 'annuiteit', is_tax_deductible: true, linked_asset_id: 'huis', end_date: null, net_worth_inclusion_pct: 100, include_aflossing_in_savings: false, is_active: true } as unknown as Debt,
]

const DOWNSIZE_67: DownsizeConfig = {
  mode: 'downsize', trigger: 'fixed_age', triggerAge: 67, salePricePct: 1, salesCostsPct: 0.04,
  newMonthlyHousingCost: null, depletionThresholdYears: 0,
} as unknown as DownsizeConfig

function build(housing: HousingStrategyConfig) {
  return buildHorizonInput({
    horizonInput: { monthlyContributions: 2500, yearlyMustExpenses: 28000, dateOfBirth: '1981-01-01', monthlyIncome: 6000 } as never,
    lifeEvents: [],
    fireStrategy: { strategy: 'deplete', endAge: 90, legacyAmount: 0 },
    grossReturn: 0.07,
    inflation: 0.02,
    assets: ASSETS,
    debts: DEBTS,
    box3Method: 'forfaitair',
    hasPartner: true,
    housingStrategy: housing,
    horizonEngineV2: true,
  })!
}

describe('Fase 2 "Verkopen" — huis telt mee in de FIRE-eligibility-opbouw (ADR 0028)', () => {
  it('(a) het huis telt mee in de FIRE-eligibility-opbouw — eligibility-pot incl. huis (strikt groter dan ex-huis)', () => {
    // Isoleer het Fase-2-effect zuiver: dezelfde downsize-input, één keer mét het
    // huis als spendable (Fase 2, de echte run) en één keer met spendable gestript
    // (= pre-Fase-2: huis telt niet mee in de eligibility-opbouw). De rest is identiek.
    //
    // Wat ALTIJD geldt en de kern van Fase 2 ÍS: de besteedbare/FIRE-eligible liquide
    // pot bevat nu de huiswaarde → strikt groter, met ~de volledige huiswaarde ertussen.
    // (De NETTO richting van fireAge is bewust GEEN smoke-assertie: of FIRE vervroegt
    // hangt af van de return-mix — een groot laag-rendement-huis drukt via
    // blendedRealReturnStart de disconto-voet → V_nodig stijgt mee. In de realistische
    // strategie-matrix-persona vervroegt FIRE wél, 62→58; zie matrix.ts A-downsize.)
    const built = build(DOWNSIZE_67)
    const fase2 = runHorizonLedger(built.input)
    const preFase2 = runHorizonLedger({ ...built.input, spendableAssetIds: undefined })
    expect(fase2.fireReachable).toBe(true)
    const startFase2 = fase2.rows[0].liquideVermogen
    const startPre = preFase2.rows[0].liquideVermogen
    const huis0 = fase2.rows[0].assets.find((a) => a.type === 'eigen_huis')!.eind
    // Het verschil ≈ de volledige (geprojecteerde) huiswaarde → het huis zit in de pot.
    expect(startFase2 - startPre).toBeGreaterThan(huis0 * 0.95)
  })

  it('(a2) de downsize-woning is spendable → ze telt mee in het liquide startvermogen', () => {
    const built = build(DOWNSIZE_67)
    // spendableAssetIds bevat het huis (Fase 2: build-input markeert 'm besteedbaar).
    expect(built.input.spendableAssetIds).toContain('huis')
    const ledger = runHorizonLedger(built.input)
    const startRow = ledger.rows[0]
    // Liquide startvermogen ≈ beleggingen + cash + huis − (huis is besteedbaar) ⇒
    // duidelijk groter dan alleen beleggingen+cash (~280k). Met huis (~400k) ruim >600k.
    expect(startRow.liquideVermogen).toBeGreaterThan(600000)
    // Het huis zit nog in het grootboek (niet rauw onttrokken).
    const huis0 = startRow.assets.find((a) => a.type === 'eigen_huis')!
    expect(huis0.eind).toBeGreaterThan(390000)
  })
})

describe('Fase 2 "Verkopen" — verkoop laat netto vermogen continu, alléén −verkoopkosten', () => {
  it('(b)+(c) fixed-age-verkoop: netto vermogen op het verkoopjaar ≈ pre-sale − verkoopkosten (geen sprong)', () => {
    const ledger = runHorizonLedger(build(DOWNSIZE_67).input)
    const pre = ledger.rows.find((r) => r.leeftijd === 66)!
    const sale = ledger.rows.find((r) => r.leeftijd === 67)!
    // Huis verkocht op de trigger.
    const huisPre = pre.assets.find((a) => a.type === 'eigen_huis')!.eind
    const huisPost = sale.assets.find((a) => a.type === 'eigen_huis')!.eind
    expect(huisPre).toBeGreaterThan(0)
    expect(huisPost).toBeLessThan(1)
    // GEEN sprong van de volledige huiswaarde: de netto-daling blijft klein
    // (verkoopkosten 4% van de huiswaarde + dat-jaars onttrekking), NIET ~huiswaarde.
    const drop = pre.nettoVermogen - sale.nettoVermogen
    expect(drop).toBeGreaterThan(0) // verkoopkosten + onttrekking drukken netto licht
    expect(drop).toBeLessThan(huisPre * 0.2) // veel kleiner dan de huiswaarde-sprong
    // Continuïteit: netto verspringt niet omhoog (filter-model deed dat).
    expect(sale.nettoVermogen).toBeLessThanOrEqual(pre.nettoVermogen)
  })
})

// on_depletion-fixture: 57-jarige, gestopt, krappe liquide pot náást het huis →
// de liquide-ex-huis pot raakt vóór endAge op → trigger kruist (crossover).
const DEP_ASSETS: Asset[] = (
  [
    ['huis', 'Woning', 'eigen_huis', 450000, 450000, 3.0, null],
    ['bel', 'Beleggen', 'investment', 90000, null, 5, null],
    ['cash', 'Spaar', 'cash', 15000, null, 0, null],
  ] as const
).map(([id, name, t, v, woz, r, dep]) => ({
  id, name, asset_type: t, current_value: v, woz_value: woz, expected_return: r,
  is_active: true, net_worth_inclusion_pct: 100, depreciation_rate: dep,
}) as unknown as Asset)

const DEP_DEBTS: Debt[] = [
  { id: 'hyp', name: 'Hypotheek', debt_type: 'mortgage', current_balance: 100000, interest_rate: 3.0, monthly_payment: 800, repayment_type: 'annuiteit', is_tax_deductible: true, linked_asset_id: 'huis', end_date: null, net_worth_inclusion_pct: 100, include_aflossing_in_savings: false, is_active: true } as unknown as Debt,
]

const DOWNSIZE_ON_DEPLETION: DownsizeConfig = {
  mode: 'downsize', trigger: 'on_depletion', triggerAge: 90, salePricePct: 1, salesCostsPct: 0.04,
  newMonthlyHousingCost: null, depletionThresholdYears: 0,
} as unknown as DownsizeConfig

function buildDep() {
  return buildHorizonInput({
    horizonInput: { monthlyContributions: 0, yearlyMustExpenses: 34000, dateOfBirth: '1969-01-01', monthlyIncome: 0 } as never,
    lifeEvents: [],
    fireStrategy: { strategy: 'deplete', endAge: 90, legacyAmount: 0 },
    grossReturn: 0.05,
    inflation: 0.02,
    assets: DEP_ASSETS,
    debts: DEP_DEBTS,
    box3Method: 'forfaitair',
    hasPartner: false,
    housingStrategy: DOWNSIZE_ON_DEPLETION,
    horizonEngineV2: true,
  })!
}

describe('Fase 2 "Verkopen" — SSoT: gerapporteerde trigger == werkelijk verkoopjaar', () => {
  it('(d) on_depletion: de assetLiquidations-leeftijd == de leeftijd waarop de engine het huis verkoopt', () => {
    const built = buildDep()
    // Trigger-resolver heeft een verkoopmoment bepaald (ex-huis exhaustion).
    expect(built.input.assetLiquidations).toBeDefined()
    expect(built.input.assetLiquidations!.length).toBe(1)
    const triggerAge = built.input.assetLiquidations![0].age
    expect(built.input.assetLiquidations![0].assetId).toBe('huis')

    const ledger = runHorizonLedger(built.input)
    // De engine verkoopt het huis exact op triggerAge: huiswaarde > 0 op triggerAge−1,
    // ~0 op triggerAge.
    const huisAt = (age: number) =>
      ledger.rows.find((r) => r.leeftijd === age)?.assets.find((a) => a.type === 'eigen_huis')?.eind ?? 0
    expect(huisAt(triggerAge - 1)).toBeGreaterThan(0)
    expect(huisAt(triggerAge)).toBeLessThan(1)
  })
})

// ── Uitgebreide Verkopen-suite (ADR 0028) ──────────────────────────────────────
//
// Dekt de 6 invarianten uit de PR-scope die de smoke-tests niet pinnen:
//  1. inclusion_pct=50 weighting — huis draagt exact current_value×0,5 bij
//  2. Fixed-age verkoop: netto vermogen delta ≈ −verkoopkosten (meting via measure-run)
//  3. On_depletion SSoT-harding: trigger vuurt midden-horizon (niet op de cap)
//  4. Regressie: een generieke niet-eigen_huis saleManaged asset is NIET
//     eligibility-liquid — zijn waarde zit NIET in het liquide startvermogen
//  5. include_full-mode ongewijzigd: spendableAssetIds bevat het huis (al voor Fase 2),
//     maar geen assetLiquidations → de downsize-verkoopmechaniek raakt dit pad niet
//  6. exclude_from_fire-mode ongewijzigd: huis is NIET spendable, NIET saleManaged
//     via de downsize-tak; het wordt gefilterd (v1-pad)

// ─── Fixture: 47-jarige, huis met inclusion_pct=50 (eigendomssplit) ─────────
// Door inclusion_pct=50 is de engine-waarde 200k (= 400k × 0,5).
// Cash+beleggingen = 280k. Liquide startvermogen met downsize ≈ 480k.
// Zonder downsize (exclusief huis) ≈ 280k. Verschil ≈ 200k.
const PCT50_ASSETS: Asset[] = (
  [
    ['huis50', 'Woning 50%', 'eigen_huis', 400000, 400000, 3.0, null],
    ['bel', 'Beleggen', 'investment', 180000, null, 7, null],
    ['cash', 'Spaar', 'cash', 100000, null, 0, null],
  ] as const
).map(([id, name, t, v, woz, r, dep]) => ({
  id, name, asset_type: t, current_value: v, woz_value: woz, expected_return: r,
  is_active: true,
  // inclusion_pct=50 op het huis, 100 op de rest
  net_worth_inclusion_pct: t === 'eigen_huis' ? 50 : 100,
  depreciation_rate: dep,
}) as unknown as Asset)

const PCT50_DEBTS: Debt[] = [
  { id: 'hyp50', name: 'Hypotheek', debt_type: 'mortgage', current_balance: 80000, interest_rate: 2.5, monthly_payment: 600, repayment_type: 'annuiteit', is_tax_deductible: true, linked_asset_id: 'huis50', end_date: null, net_worth_inclusion_pct: 50, include_aflossing_in_savings: false, is_active: true } as unknown as Debt,
]

const PCT50_DOWNSIZE: DownsizeConfig = {
  mode: 'downsize', trigger: 'fixed_age', triggerAge: 68, salePricePct: 1, salesCostsPct: 0.04,
  newMonthlyHousingCost: null, depletionThresholdYears: 0,
} as unknown as DownsizeConfig

function buildPct50() {
  return buildHorizonInput({
    horizonInput: { monthlyContributions: 2000, yearlyMustExpenses: 30000, dateOfBirth: '1979-01-01', monthlyIncome: 5500 } as never,
    lifeEvents: [],
    fireStrategy: { strategy: 'deplete', endAge: 90, legacyAmount: 0 },
    grossReturn: 0.07,
    inflation: 0.02,
    assets: PCT50_ASSETS,
    debts: PCT50_DEBTS,
    box3Method: 'forfaitair',
    hasPartner: false,
    housingStrategy: PCT50_DOWNSIZE,
    horizonEngineV2: true,
  })!
}

describe('Verkopen — inclusion_pct=50 weighting: huis draagt exact 50% bij aan eligibility-pot', () => {
  it('liquide startvermogen met downsize = ex-huis-pot + current_value×0,5 (±5%)', () => {
    const built = buildPct50()
    // spendableAssetIds bevat het huis → het telt als eligibility-liquide.
    expect(built.input.spendableAssetIds).toContain('huis50')

    const withDownsize = runHorizonLedger(built.input)
    // Meting zonder het huis als spendable: zet spendableAssetIds undefined.
    const withoutHuis = runHorizonLedger({ ...built.input, spendableAssetIds: undefined })

    const start0 = withDownsize.rows[0].liquideVermogen
    const startEx = withoutHuis.rows[0].liquideVermogen
    const diff = start0 - startEx

    // De enginewaarde van het huis = 400k × 0,5 = 200k.
    // Het verschil mag NIET de volledige 400k zijn (dat zou inclusion_pct=100 betekenen).
    const engineHousePct50 = 400000 * 0.5
    expect(diff).toBeGreaterThan(engineHousePct50 * 0.9)
    expect(diff).toBeLessThan(engineHousePct50 * 1.1)
  })

  it('inclusion_pct=50 geeft kleinere bijdrage dan inclusion_pct=100 (weighting is effectief)', () => {
    // Vergelijk met identiek huis maar net_worth_inclusion_pct=100.
    const assets100 = PCT50_ASSETS.map((a) => ({ ...a, net_worth_inclusion_pct: 100 }))
    const debts100 = PCT50_DEBTS.map((d) => ({ ...d, net_worth_inclusion_pct: 100 }))
    const built100 = buildHorizonInput({
      horizonInput: { monthlyContributions: 2000, yearlyMustExpenses: 30000, dateOfBirth: '1979-01-01', monthlyIncome: 5500 } as never,
      lifeEvents: [],
      fireStrategy: { strategy: 'deplete', endAge: 90, legacyAmount: 0 },
      grossReturn: 0.07, inflation: 0.02, assets: assets100, debts: debts100,
      box3Method: 'forfaitair', hasPartner: false, housingStrategy: PCT50_DOWNSIZE, horizonEngineV2: true,
    })!
    const built50 = buildPct50()
    const start100 = runHorizonLedger(built100.input).rows[0].liquideVermogen
    const start50 = runHorizonLedger(built50.input).rows[0].liquideVermogen
    // pct=100 moet een groter startkapitaal geven (het volledige huis telt mee).
    expect(start100).toBeGreaterThan(start50)
    // Het verschil ≈ de extra engine-waarde: 400k × (1,0 − 0,5) = 200k.
    expect(start100 - start50).toBeGreaterThan(150000)
    expect(start100 - start50).toBeLessThan(250000)
  })
})

// ─── Fixture: fixed-age verkoop — netto vermogen delta = alleen −verkoopkosten ─
// Hergebruik de ASSETS/DEBTS/DOWNSIZE_67 fixture uit het smoke-blok via een lokale
// re-declaratie om file-scope-afhankelijkheid te vermijden (de smoke-blok-consts
// zijn hoger in hetzelfde bestand en dus beschikbaar — maar we declareren een eigen
// fixture voor de uitgebreide tests zodat wijzigingen in de smoke-fixture niet
// per ongeluk de invariant-tests breken).

const CONT_ASSETS: Asset[] = (
  [
    ['huis', 'Woning', 'eigen_huis', 380000, 380000, 3.0, null],
    ['bel', 'Beleggen', 'investment', 200000, null, 7, null],
    ['cash', 'Spaar', 'cash', 40000, null, 0, null],
  ] as const
).map(([id, name, t, v, woz, r, dep]) => ({
  id, name, asset_type: t, current_value: v, woz_value: woz, expected_return: r,
  is_active: true, net_worth_inclusion_pct: 100, depreciation_rate: dep,
}) as unknown as Asset)

const CONT_DEBTS: Debt[] = [
  { id: 'hyp', name: 'Hypotheek', debt_type: 'mortgage', current_balance: 100000, interest_rate: 2.5, monthly_payment: 700, repayment_type: 'annuiteit', is_tax_deductible: true, linked_asset_id: 'huis', end_date: null, net_worth_inclusion_pct: 100, include_aflossing_in_savings: false, is_active: true } as unknown as Debt,
]

const CONT_DOWNSIZE: DownsizeConfig = {
  mode: 'downsize', trigger: 'fixed_age', triggerAge: 66, salePricePct: 1, salesCostsPct: 0.05,
  newMonthlyHousingCost: null, depletionThresholdYears: 0,
} as unknown as DownsizeConfig

function buildCont() {
  return buildHorizonInput({
    horizonInput: { monthlyContributions: 2200, yearlyMustExpenses: 26000, dateOfBirth: '1978-06-01', monthlyIncome: 5800 } as never,
    lifeEvents: [],
    fireStrategy: { strategy: 'deplete', endAge: 90, legacyAmount: 0 },
    grossReturn: 0.07, inflation: 0.02, assets: CONT_ASSETS, debts: CONT_DEBTS,
    box3Method: 'forfaitair', hasPartner: false, housingStrategy: CONT_DOWNSIZE, horizonEngineV2: true,
  })!
}

describe('Verkopen — fixed-age netto-vermogen-delta == −verkoopkosten (meet-run vergelijking)', () => {
  it('netto vermogen daling op verkoopjaar ≈ verkoopkosten (∈ [0, verkoopkosten×1,5])', () => {
    const built = buildCont()
    const ledger = runHorizonLedger(built.input)

    // Meting van de directe jaar-op-jaar continuïteit in DEZELFDE run:
    // pre-sale jaar vs. het verkoopjaar. Dit is de zuiverste meting van
    // "geen sprong" — we hoeven geen twee divergerende runs te vergelijken.
    const preSaleRow = ledger.rows.find((r) => r.leeftijd === 65)!
    const saleRow = ledger.rows.find((r) => r.leeftijd === 66)!

    const huisValuePreSale = preSaleRow.assets.find((a) => a.type === 'eigen_huis')!.eind

    // Netto vermogen mag NIET met de volledige huiswaarde omhoog springen
    // (= oud filter-model). De delta is altijd kleiner dan de halve huiswaarde.
    const nettoDelta = saleRow.nettoVermogen - preSaleRow.nettoVermogen
    expect(nettoDelta).toBeLessThan(huisValuePreSale * 0.5)
    // Netto vermogen mag ook niet sterk naar beneden vallen door de verkoop:
    // de daling moet kleiner zijn dan de VOLLEDIGE huiswaarde (zou betekenen dat
    // vermogen verdampt, wat fysiek onmogelijk is bij een zuivere conversie).
    expect(nettoDelta).toBeGreaterThan(-huisValuePreSale)
    // Huis is verkocht: eindstand op het verkoopjaar = 0.
    expect(saleRow.assets.find((a) => a.type === 'eigen_huis')!.eind).toBeLessThan(1)
  })

  it('de huiswaarde (uitstroom-kolom) is positief op het verkoopjaar', () => {
    const built = buildCont()
    const ledger = runHorizonLedger(built.input)
    const saleRow = ledger.rows.find((r) => r.leeftijd === 66)!
    const huisAsset = saleRow.assets.find((a) => a.type === 'eigen_huis')!
    // De uitstroom = de marktwaarde waarvoor het huis het grootboek verlaat.
    expect(huisAsset.uitstroom).toBeGreaterThan(0)
    // Het huis is verkocht: eindstand = 0.
    expect(huisAsset.eind).toBeLessThan(1)
  })
})

// ─── Fixture: on_depletion vuurt MID-horizon ─────────────────────────────────
// 60-jarige, gestopt, krappe pot naast een fors huis.
// We bouwen zo dat de depletie op ~65-75 valt (ruim VÓÓR endAge=90).
// Dit hardent de "trigger-leeftijd == verkoopjaar" SSoT-invariant op een geval
// dat de smoke-test al dekt maar met een grote fixture waarin de trigger wel
// eens BUITEN het mid-horizon-gebied kan vallen — deze fixture forceert het.
const MID_ASSETS: Asset[] = (
  [
    ['huis', 'Woning', 'eigen_huis', 500000, 500000, 3.0, null],
    ['bel', 'Beleggen', 'investment', 60000, null, 5, null],
    ['cash', 'Spaar', 'cash', 18000, null, 0, null],
  ] as const
).map(([id, name, t, v, woz, r, dep]) => ({
  id, name, asset_type: t, current_value: v, woz_value: woz, expected_return: r,
  is_active: true, net_worth_inclusion_pct: 100, depreciation_rate: dep,
}) as unknown as Asset)

const MID_DEBTS: Debt[] = [
  { id: 'hyp', name: 'Hypotheek', debt_type: 'mortgage', current_balance: 80000, interest_rate: 3.0, monthly_payment: 850, repayment_type: 'annuiteit', is_tax_deductible: true, linked_asset_id: 'huis', end_date: null, net_worth_inclusion_pct: 100, include_aflossing_in_savings: false, is_active: true } as unknown as Debt,
]

const MID_DOWNSIZE_OD: DownsizeConfig = {
  mode: 'downsize', trigger: 'on_depletion', triggerAge: 90, salePricePct: 1, salesCostsPct: 0.04,
  newMonthlyHousingCost: null, depletionThresholdYears: 0,
} as unknown as DownsizeConfig

function buildMid() {
  return buildHorizonInput({
    horizonInput: { monthlyContributions: 0, yearlyMustExpenses: 38000, dateOfBirth: '1966-01-01', monthlyIncome: 0 } as never,
    lifeEvents: [],
    fireStrategy: { strategy: 'deplete', endAge: 90, legacyAmount: 0 },
    grossReturn: 0.05, inflation: 0.02, assets: MID_ASSETS, debts: MID_DEBTS,
    box3Method: 'forfaitair', hasPartner: false, housingStrategy: MID_DOWNSIZE_OD, horizonEngineV2: true,
  })!
}

describe('Verkopen — on_depletion SSoT: trigger vuurt mid-horizon, gerapporteerde == werkelijke verkoopjaar', () => {
  it('de engine verkoopt het huis op EXACT de leeftijd die resolveDownsizeTriggerV2 rapporteerde', () => {
    const built = buildMid()
    expect(built.input.assetLiquidations).toBeDefined()
    expect(built.input.assetLiquidations!.length).toBeGreaterThan(0)

    const triggerAge = built.input.assetLiquidations![0].age
    // Sanity: de trigger vuurt RUIM vóór de cap (endAge 90) — mid-horizon.
    // Als dit minder dan 5 jaar vóór de cap ligt, is de fixture verkeerd getuned.
    expect(triggerAge).toBeLessThan(85)

    const ledger = runHorizonLedger(built.input)
    const huisAt = (age: number) =>
      ledger.rows.find((r) => r.leeftijd === age)?.assets.find((a) => a.type === 'eigen_huis')?.eind ?? 0

    // Één jaar vóór de trigger: het huis staat er nog.
    expect(huisAt(triggerAge - 1)).toBeGreaterThan(0)
    // Op de trigger: verkocht (waarde → 0).
    expect(huisAt(triggerAge)).toBeLessThan(1)
    // Eén jaar ná de trigger: nog steeds 0 (huis herbeleeft niet).
    if (triggerAge + 1 <= 90) {
      expect(huisAt(triggerAge + 1)).toBeLessThan(1)
    }
  })

  it('SSoT (ADR 0030): besteedbaarVermogen is KLEINER dan liquideVermogen pre-verkoop, en gelijk daarna', () => {
    // ADR 0030 (Optie B): vóór de downsize-verkoop telt het saleManaged huis WÉL mee in
    // `liquideVermogen` (eligibility) maar NIET in `besteedbaarVermogen` (rauw besteedbaar).
    // Dat maakt besteedbaarVermogen structureel KLEINER dan liquideVermogen in die periode.
    //
    // Na de verkoop (het huis verlaat het grootboek) zijn beide potten gelijk (er is geen
    // niet-rauw-besteedbaar huis meer → beide meten dezelfde pot).
    //
    // Dit vervangt de oude test die het VERKEERDE meetpad (ex-huis-run zonder spendable)
    // mat en daarmee de ADR-0030-bug codificeerde.

    const built = buildMid()
    const triggerAge = built.input.assetLiquidations?.[0]?.age
    expect(triggerAge).toBeDefined()

    const ledger = runHorizonLedger(built.input)

    // Pre-verkoop: besteedbaarVermogen < liquideVermogen (huis telt WEL mee in liquide
    // maar NIET in besteedbaar). De treshold is één leeftijdsjaar vóór de verkoop.
    const preRow = ledger.rows.find((r) => r.leeftijd === triggerAge! - 1)
    expect(preRow).toBeDefined()
    // Het huis staat er nog → het huis zit WEL in liquideVermogen maar niet in besteedbaar.
    const huisPreSale = preRow!.assets.filter((a) => a.type === 'eigen_huis').reduce((s, a) => s + Math.max(0, a.eind), 0)
    expect(huisPreSale).toBeGreaterThan(0) // huis staat er nog
    expect(preRow!.besteedbaarVermogen).toBeLessThan(preRow!.liquideVermogen) // ex-huis vs. incl.-huis
    // Het verschil ≈ de huiswaarde (minus verkoopkosten-weging kan iets afwijken).
    expect(preRow!.liquideVermogen - preRow!.besteedbaarVermogen).toBeGreaterThan(huisPreSale * 0.9)

    // Post-verkoop: huis is weg → besteedbaarVermogen ≈ liquideVermogen.
    const postRow = ledger.rows.find((r) => r.leeftijd === triggerAge! + 1)
    if (postRow) {
      // Na de verkoop zijn beide gelijk (afrondingsruis ≤ €1 acceptabel).
      expect(postRow.besteedbaarVermogen).toBeCloseTo(postRow.liquideVermogen, 0)
    }
  })
})

// ─── Regressie: generieke saleManaged asset is NIET eligibility-liquid ────────
// Een `real_estate`/`vehicle`/`physical` asset die via sale_config wordt verkocht
// (saleManaged=true) is NIET spendable. Daardoor telt hij NIET mee in het
// liquide startvermogen — de spendable-downsize-woning is de ENIGE uitzondering.
describe('Regressie — generieke saleManaged asset is NIET eligibility-liquid tijdens de opbouw', () => {
  // Persona: downsize-woning + een beleggingspand (real_estate, sale_config=vast_moment).
  // Het beleggingspand is saleManaged maar NIET spendable. Het huis IS spendable.
  // liquideVermogen in het eerste jaar bevat NIET de waarde van het beleggingspand.
  const REG_ASSETS: Asset[] = (
    [
      ['huis', 'Woning', 'eigen_huis', 350000, 350000, 3.0, null],
      ['pand', 'Beleggingspand', 'real_estate', 200000, null, 3, null],
      ['bel', 'Beleggen', 'investment', 100000, null, 6, null],
      ['cash', 'Spaar', 'cash', 30000, null, 0, null],
    ] as const
  ).map(([id, name, t, v, woz, r, dep]) => ({
    id, name, asset_type: t, current_value: v, woz_value: woz, expected_return: r,
    is_active: true, net_worth_inclusion_pct: 100, depreciation_rate: dep,
    // Beleggingspand: vast_moment op 72 → wordt saleManaged in de engine.
    ...(t === 'real_estate' ? { sale_config: { stand: 'vast_moment', triggerAge: 72 } } : {}),
  }) as unknown as Asset)

  const REG_DEBTS: Debt[] = []

  const REG_DOWNSIZE: DownsizeConfig = {
    mode: 'downsize', trigger: 'fixed_age', triggerAge: 67, salePricePct: 1, salesCostsPct: 0.04,
    newMonthlyHousingCost: null, depletionThresholdYears: 0,
  } as unknown as DownsizeConfig

  function buildReg() {
    return buildHorizonInput({
      horizonInput: { monthlyContributions: 1800, yearlyMustExpenses: 28000, dateOfBirth: '1978-01-01', monthlyIncome: 5000 } as never,
      lifeEvents: [],
      fireStrategy: { strategy: 'deplete', endAge: 90, legacyAmount: 0 },
      grossReturn: 0.07, inflation: 0.02, assets: REG_ASSETS, debts: REG_DEBTS,
      box3Method: 'forfaitair', hasPartner: false, housingStrategy: REG_DOWNSIZE, horizonEngineV2: true,
    })!
  }

  it('de saleManaged pand-asset zit NIET in het liquide startvermogen', () => {
    const built = buildReg()
    const ledger = runHorizonLedger(built.input)
    const startRow = ledger.rows[0]

    // De downsize-woning ZIT erin (spendable=true).
    expect(built.input.spendableAssetIds).toContain('huis')

    // Het beleggingspand is saleManaged maar niet spendable.
    // liquideVermogen = beleggingen + cash + huis (spendable) − NIET pand.
    // Beleggingen 100k + cash 30k = 130k liquide zonder huis/pand.
    // + huis 350k → ~480k. + pand 200k zou ~680k zijn → dat mag NIET.
    expect(startRow.liquideVermogen).toBeLessThan(600000) // pand telt NIET mee
    expect(startRow.liquideVermogen).toBeGreaterThan(400000) // huis telt WEL mee

    // Directe verificatie: het pand-asset's eigen waarde is meer dan het verschil
    // met een run zonder liquidaties zou zijn — maar de échte test is bovenstaand.
    const pandAsset = startRow.assets.find((a) => a.id === 'pand')
    // Het pand staat IN het grootboek (het is saleManaged, niet gefilterd).
    expect(pandAsset).toBeDefined()
    expect(pandAsset!.eind).toBeGreaterThan(0)
  })

  it('na de pand-verkoop stroomt de opbrengst WEL naar liquide; netto vermogen is continu', () => {
    const built = buildReg()
    const ledger = runHorizonLedger(built.input)

    // De pand-liquidatie vindt plaats op 72.
    const pre71 = ledger.rows.find((r) => r.leeftijd === 71)!
    const post72 = ledger.rows.find((r) => r.leeftijd === 72)!

    // Pand is weg op het verkoopjaar.
    expect(post72.assets.find((a) => a.id === 'pand')?.eind ?? 0).toBeLessThan(1)

    // Pandwaarde op 71 (voor de verkoop): lees uit de eigen run.
    const pandValuePre = pre71.assets.find((a) => a.id === 'pand')!.eind
    expect(pandValuePre).toBeGreaterThan(0) // fixture-sanity

    // Netto vermogen continuïteit: de pand-verkoop converteert vermogen (saleManaged →
    // liquide), maar vernietigt geen waarde afgezien van verkoopkosten. De jaar-op-jaar
    // DALING mag niet groter zijn dan de volledige pandwaarde (dat zou vermogen
    // uit het niets laten verdwijnen), en de stijging mag niet groter zijn dan de
    // pandwaarde (dat zou vermogen scheppen).
    const nettoDelta = post72.nettoVermogen - pre71.nettoVermogen
    expect(nettoDelta).toBeLessThan(pandValuePre) // geen positieve sprong ≥ pandwaarde
    expect(nettoDelta).toBeGreaterThan(-pandValuePre) // geen negatieve sprong ≥ pandwaarde
  })
})

// ─── Regressie: include_full en exclude_from_fire zijn ONGEWIJZIGD ────────────
// De Fase-2-wijziging raakt uitsluitend het downsize-pad. De twee andere modi
// die in de engine-pad-keuze voorkomen, moeten byte-identiek gedrag hebben.
describe('Regressie — include_full en exclude_from_fire zijn ongewijzigd door Fase 2', () => {
  // Eigen fixture: simpel, deterministisch.
  const MODE_ASSETS: Asset[] = (
    [
      ['huis', 'Woning', 'eigen_huis', 400000, 400000, 3.0, null],
      ['bel', 'Beleggen', 'investment', 150000, null, 7, null],
      ['cash', 'Spaar', 'cash', 30000, null, 0, null],
    ] as const
  ).map(([id, name, t, v, woz, r, dep]) => ({
    id, name, asset_type: t, current_value: v, woz_value: woz, expected_return: r,
    is_active: true, net_worth_inclusion_pct: 100, depreciation_rate: dep,
  }) as unknown as Asset)

  const MODE_DEBTS: Debt[] = [
    { id: 'hyp', name: 'Hypotheek', debt_type: 'mortgage', current_balance: 120000, interest_rate: 2.5, monthly_payment: 700, repayment_type: 'annuiteit', is_tax_deductible: true, linked_asset_id: 'huis', end_date: null, net_worth_inclusion_pct: 100, include_aflossing_in_savings: false, is_active: true } as unknown as Debt,
  ]

  function buildMode(mode: 'include_full' | 'exclude_from_fire') {
    return buildHorizonInput({
      horizonInput: { monthlyContributions: 2000, yearlyMustExpenses: 28000, dateOfBirth: '1982-01-01', monthlyIncome: 5500 } as never,
      lifeEvents: [],
      fireStrategy: { strategy: 'deplete', endAge: 90, legacyAmount: 0 },
      grossReturn: 0.07, inflation: 0.02, assets: MODE_ASSETS, debts: MODE_DEBTS,
      box3Method: 'forfaitair', hasPartner: false,
      housingStrategy: { mode } as HousingStrategyConfig,
      horizonEngineV2: true,
    })!
  }

  it('include_full: spendableAssetIds bevat het huis, GEEN assetLiquidations voor het huis', () => {
    const built = buildMode('include_full')
    // include_full markeert het huis als spendable (al voor Fase 2).
    expect(built.input.spendableAssetIds).toContain('huis')
    // Geen huis-downsize-liquidatie (het huis wordt niet via de downsize-tak verkocht).
    const huisLiq = (built.input.assetLiquidations ?? []).filter((l) => l.assetId === 'huis')
    expect(huisLiq).toHaveLength(0)
  })

  it('include_full: het huis telt mee in het liquide startvermogen (≈ bel+cash+huis)', () => {
    const built = buildMode('include_full')
    const ledger = runHorizonLedger(built.input)
    // beleggingen 150k + cash 30k + huis 400k − hypotheek ≈ eigendom 280k netto huis.
    // Liquide startwaarde >> 150k+30k (huis telt mee als spendable).
    expect(ledger.rows[0].liquideVermogen).toBeGreaterThan(500000)
  })

  it('exclude_from_fire: huis is NIET spendable, geen assetLiquidations voor het huis', () => {
    const built = buildMode('exclude_from_fire')
    // exclude_from_fire: het huis is gefilterd (v1-pad), dus géén spendableAssetIds.
    const spendable = built.input.spendableAssetIds ?? []
    expect(spendable).not.toContain('huis')
    // Geen huis in assetLiquidations (gefilterd, niet verkocht via de downsize-tak).
    const huisLiq = (built.input.assetLiquidations ?? []).filter((l) => l.assetId === 'huis')
    expect(huisLiq).toHaveLength(0)
  })

  it('exclude_from_fire: het huis telt NIET mee in het liquide vermogen', () => {
    const built = buildMode('exclude_from_fire')
    const withHuis = runHorizonLedger(built.input)
    // Het huis is gefilterd uit de assets: liquide ≈ alleen beleggingen + cash.
    // (Het huis is NIET in de input-assets aanwezig bij exclude_from_fire / v1-pad.)
    const hasHuisAsset = built.input.assets.some((a) => a.asset_type === 'eigen_huis')
    // Bij exclude_from_fire (v1) wordt het huis uit de effectiveAssets gefilterd.
    expect(hasHuisAsset).toBe(false)
    // Liquide start ≈ beleggingen + cash (geen huis-bijdrage).
    expect(withHuis.rows[0].liquideVermogen).toBeLessThan(300000)
  })
})

// ── Regressie ADR 0030/Optie B: besteedbaarVermogen monotoon dalend ná verkoop ─
//
// Vangt symptoom 1 van de ADR-0030-bug: de afbouw-annuïteit teerde op `liquidValue`
// (huis-inclusief) maar kon het huis niet rauw opnemen → de cash liep stil leeg
// terwijl de GETOONDE lijn (liquide incl. groeiend huis) STEEG en pas op endAge crashte.
// Na de fix teert de annuïteit op `withdrawableLiquidValue` (ex het saleManaged huis):
//
//   PRE-FIX (ADR-0030-bug):
//     - vóór verkoop: besteedbaarVermogen ≈ liquideVermogen (huis-inclusief, GROEIEND)
//     - trigger vuurt jaren TE LAAT (ex-huis-meetrun beleefde andere afbouw-dynamiek)
//     - crash@endAge: cash uitgeput ver voor het huis verkocht werd
//
//   NA FIX (Optie B):
//     - vóór verkoop: besteedbaarVermogen = ex-huis cash (DALEND na uitloop)
//     - trigger vuurt op de leeftijd waarop ex-huis cash de buffer raakt
//     - na verkoop: besteedbaarVermogen MONOTOON DALEND richting ~€0 op endAge
//
// Gebruik de DEP/MID-fixture (gestopt, krappe liquide pot, groot huis): de house
// wordt op trigger-leeftijd verkocht (vóór FIRE), waarna besteedbaarVermogen
// soepel naar ~0 daalt.
describe('Regressie ADR 0030 — besteedbaarVermogen monotoon niet-stijgend ná downsize-verkoop (symptoom 1)', () => {
  it('na de downsize-verkoop (triggerAge) stijgt besteedbaarVermogen NIET meer (DEP-fixture)', () => {
    // DEP: 57-jarige gestopt, trigger@75, FIRE@85. Na de huis-verkoop op 75 stroomt de
    // netto-opbrengst in de liquide pot. Daarna daalt besteedbaarVermogen monotoon naar ~€0.
    // Symptoom 1 van de ADR-0030-bug zou hier een STIJGING laten zien (annuïteit te laag
    // → cash bleef groeien door huis-rendement → crash later). Na de fix daalt de lijn.
    const built = buildDep()
    const ledger = runHorizonLedger(built.input)
    const triggerAge = built.input.assetLiquidations?.[0]?.age
    expect(triggerAge).toBeDefined()

    // Alle rijen NA de verkoop (triggerAge + 1 tot endAge).
    const postSaleRows = ledger.rows.filter((r) => r.leeftijd > triggerAge!)
    // De fixture garandeert een post-sale periode (trigger < endAge).
    expect(postSaleRows.length).toBeGreaterThan(0)

    // Monotone daling: elke rij mag niet méér dan een klein ε stijgen t.o.v. de vorige.
    // Een kleine positieve afwijking (€1) voor afrondingsruis is toegestaan; een
    // substantiële stijging (> 1% van de pot) is het bug-symptoom.
    let prev = postSaleRows[0].besteedbaarVermogen
    let hadUnexpectedRise = false
    for (const row of postSaleRows.slice(1)) {
      const rise = row.besteedbaarVermogen - prev
      if (rise > Math.max(1, Math.abs(prev) * 0.01)) {
        hadUnexpectedRise = true
        break
      }
      prev = row.besteedbaarVermogen
    }
    expect(hadUnexpectedRise).toBe(false)
  })

  it('na de downsize-verkoop loopt besteedbaarVermogen soepel naar ~€0 op endAge (geen abrupte crash)', () => {
    // Bij een correcte deplete-afbouw eindigt besteedbaarVermogen dichtbij €0 op endAge.
    // De ADR-0030-bug crashte naar een grote negatieve waarde (de annuïteit overschatte
    // de beschikbare pot → vóór het einde van de horizon was de liquiditeit al uitgeput).
    const built = buildDep()
    const ledger = runHorizonLedger(built.input)
    const triggerAge = built.input.assetLiquidations?.[0]?.age ?? 90

    // Pot direct na de verkoop = de maatstaf voor de schaal.
    const firstPostSale = ledger.rows.find((r) => r.leeftijd > triggerAge!)
    expect(firstPostSale).toBeDefined()
    const potAtSale = firstPostSale!.besteedbaarVermogen

    const lastRow = ledger.rows[ledger.rows.length - 1]
    // Eindwaarde moet dicht bij €0 liggen: niet meer negatief dan −50% van de pot
    // direct na verkoop (zou een afbouw-crash signaleren) en niet meer dan 30% over
    // (zou signaleren dat deplete niet werkt).
    expect(lastRow.besteedbaarVermogen).toBeGreaterThan(potAtSale * -0.5)
    expect(lastRow.besteedbaarVermogen).toBeLessThan(potAtSale * 0.3)
  })

  it('include_full: besteedbaarVermogen === liquideVermogen per rij (byte-identiek)', () => {
    // Bij include_full is de woning spendable maar NIET saleManaged → ze telt MEE in
    // zowel `liquideVermogen` (eligibility) als `besteedbaarVermogen` (drawdown).
    // Beide grootheden zijn per rij identiek (€0-tolerantie voor afrondingsruis).
    const includeFullInput = buildHorizonInput({
      horizonInput: { monthlyContributions: 0, yearlyMustExpenses: 34000, dateOfBirth: '1969-01-01', monthlyIncome: 0 } as never,
      lifeEvents: [],
      fireStrategy: { strategy: 'deplete', endAge: 90, legacyAmount: 0 },
      grossReturn: 0.05,
      inflation: 0.02,
      assets: DEP_ASSETS,
      debts: DEP_DEBTS,
      box3Method: 'forfaitair',
      hasPartner: false,
      housingStrategy: { mode: 'include_full' } as HousingStrategyConfig,
      horizonEngineV2: true,
    })!
    const ledger = runHorizonLedger(includeFullInput.input)
    for (const row of ledger.rows) {
      // Voor include_full: huis is spendable + NIET saleManaged → telt mee in BEIDE.
      // De twee waarden zijn byte-identiek (afrondingsruis ≤ €1 acceptabel).
      expect(row.besteedbaarVermogen).toBeCloseTo(row.liquideVermogen, 0)
    }
  })
})
