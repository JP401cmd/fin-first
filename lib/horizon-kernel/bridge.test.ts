/**
 * Horizon-kernel bridge — eigenschaps-tests (FASE 5, stap 1).
 *
 * Bewijst de kernel→`UnifiedProjectionResult`-mapping op twee invoer-bronnen:
 *  - een oracle-fixture (via `buildKernelInput`), en
 *  - een synthetisch adapter-profiel (via `buildKernelInputFromApp`, zoals
 *    `adapter/adapter.test.ts`).
 * Geen Excel-parity hier — dat is de kern zelf; de bridge is een pure vorm-/
 * aggregatie-transformatie. We asserteren rij-continuïteit, som-consistentie met de
 * onderliggende maandcellen, de inflatiefactor, solver-doorvoer + strategie-mapping,
 * en een vorm-rooktest tegen de v2-engine (GEEN waarde-gelijkheid).
 */

import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Asset, AssetType } from '@/lib/asset-data'
import type { Debt, DebtType } from '@/lib/debt-data'
import type { UnifiedProjectionResult } from '@/lib/unified-projection'
import { solveFire, evaluateFireAt } from './solver'
import type { KernelProjection } from './engine'
import { buildKernelInput } from './input-from-fixture'
import { listFixtures, loadFixture } from './oracle/fixture-load'
import { buildKernelInputFromApp } from './adapter'
import {
  buildKernelSlotMeta,
  isKernelReachedNowDisplay,
  kernelToUnifiedResult,
  type KernelBridgeContext,
} from './bridge'

const FIXTURE_DIR = path.resolve(process.cwd(), 'test', 'fixtures', 'horizon-oracle')
const hasFixtures = existsSync(FIXTURE_DIR) && listFixtures(FIXTURE_DIR).length > 0
const EUR = 0.01 // tolerantie
// Bez-categorie-volgorde (identiek aan bridge/engine ASSET_ORDER) — voor de
// onafhankelijke withdrawal-recompute.
const ASSET_ORDER = ['Spaargeld', 'Beleggingen', 'Pensioen', 'Vastgoed', 'Eigen huis', 'Overig'] as const

// ── Synthetische app-data (volledige DB-shape, overschrijfbaar) ──────────────

function makeAsset(p: Partial<Asset> & { id: string; asset_type: AssetType; current_value: number }): Asset {
  return {
    user_id: 'u', name: p.asset_type, purchase_value: 0, purchase_date: null, expected_return: 5,
    monthly_contribution: 0, institution: null, account_number: null, notes: null, is_active: true,
    sort_order: 0, created_at: '2026-01-01', updated_at: '2026-01-01', subtype: null, risk_profile: null,
    tax_benefit: null, is_liquid: null, lock_end_date: null, ticker_symbol: null, rental_income: null,
    woz_value: null, retirement_provider_type: null, depreciation_rate: null, address_postcode: null,
    address_house_number: null, expiry_date: null, beneficiary: null, kvk_number: null,
    ownership_percentage: null, annual_dividend: null, linked_asset_id: null, ownership: 'personal',
    household_id: null, net_worth_inclusion_pct: 100, has_budget_tracking: false, has_holdings_tracking: false,
    has_woonbalans_tracking: false, has_rental_tracking: false, monthly_maintenance_cost: 0, vva_fee: 0,
    vacancy_log: [], ...p,
  }
}

function makeDebt(p: Partial<Debt> & { id: string; debt_type: DebtType; current_balance: number }): Debt {
  return {
    user_id: 'u', name: p.debt_type, original_amount: p.current_balance ?? 0, interest_rate: 3,
    minimum_payment: 0, monthly_payment: 0, start_date: '2020-01-01', end_date: null, creditor: null,
    notes: null, is_active: true, sort_order: 0, created_at: '2026-01-01', updated_at: '2026-01-01',
    subtype: null, is_tax_deductible: null, fixed_rate_end_date: null, nhg: null, linked_asset_id: null,
    credit_limit: null, repayment_type: 'annuiteit', draagkrachtmeting_date: null, tax_year: null,
    has_payment_plan: false, has_written_agreement: false, ownership: 'personal', household_id: null,
    partner_split_pct: null, net_worth_inclusion_pct: 100, include_aflossing_in_savings: false,
    custom_aflossing_amount: null, has_hypotheekplanner_tracking: false, ...p,
  }
}

const SYNTH_ASSETS: Asset[] = [
  makeAsset({ id: 'sav', asset_type: 'savings', current_value: 60_000, monthly_contribution: 300 }),
  makeAsset({ id: 'etf', asset_type: 'investment', current_value: 150_000, expected_return: 7, monthly_contribution: 500 }),
  makeAsset({ id: 'house', asset_type: 'eigen_huis', current_value: 350_000, expected_return: 2 }),
]
const SYNTH_DEBTS: Debt[] = [
  makeDebt({ id: 'mort', debt_type: 'mortgage', current_balance: 200_000, linked_asset_id: 'house', interest_rate: 3.5, monthly_payment: 900, is_tax_deductible: true }),
  makeDebt({ id: 'loan', debt_type: 'personal_loan', current_balance: 8_000, interest_rate: 6, monthly_payment: 200 }),
]
const SYNTH_EIGEN_HUIS = new Set(['house'])

function synthProfile(over: Record<string, unknown> = {}) {
  const dob = `${new Date().getFullYear() - 45}-01-01`
  return {
    date_of_birth: dob, net_monthly_income: 4500, estimated_monthly_expenses: 2600,
    expected_return: 0.06, inflation_rate: 0.02, box3_method: 'forfaitair' as const,
    fire_end_strategy: 'deplete', fire_end_age: 90, ...over,
  }
}

function synthContext(over: Record<string, unknown> = {}): { ctx: KernelBridgeContext; solve: ReturnType<typeof solveFire> } {
  const input = buildKernelInputFromApp({ profile: synthProfile(over), assets: SYNTH_ASSETS, debts: SYNTH_DEBTS })
  const { assetSlotMeta, debtSlotMeta } = buildKernelSlotMeta(SYNTH_ASSETS, SYNTH_DEBTS, SYNTH_EIGEN_HUIS)
  const ctx: KernelBridgeContext = { input, yearlyExpenses: 2600 * 12, assetSlotMeta, debtSlotMeta }
  return { ctx, solve: solveFire(input) }
}

// ── Recompute-helpers (onafhankelijk van de bridge-implementatie) ────────────

function inHorizonMonth(proj: KernelProjection, m: number): boolean {
  const row = proj.bez[m]
  return row !== undefined && !row.beyondHorizon
}

function blockMonths(proj: KernelProjection, k: number, lastInHorizon: number): number[] {
  const out: number[] = []
  for (let m = 12 * k; m <= Math.min(12 * k + 11, lastInHorizon); m++) if (inHorizonMonth(proj, m)) out.push(m)
  return out
}

function expectedSavings(proj: KernelProjection, months: number[]): number {
  return months.reduce((s, m) => { const r = proj.bez[m]; return s + (r && !r.beyondHorizon ? r.totaalInleg : 0) }, 0)
}
function expectedGrowth(proj: KernelProjection, months: number[]): number {
  return months.reduce((s, m) => { const r = proj.bez[m]; return s + (r && !r.beyondHorizon ? r.totaalRendement : 0) }, 0)
}
function expectedBox3(proj: KernelProjection, months: number[]): number {
  return months.reduce((s, m) => { const r = proj.bel[m]; return s + (r && !r.beyondHorizon ? r.canoniek : 0) }, 0)
}
function expectedWithdrawal(proj: KernelProjection, months: number[]): number {
  return months.reduce((s, m) => {
    const v = proj.verdeling[m]
    if (v === undefined) return s
    return s + ASSET_ORDER.reduce((acc, _c, i) => acc + Math.max(0, v.onttrekking.eind[i] ?? 0), 0)
  }, 0)
}

/**
 * Onafhankelijke recompute van de onttrekkings-behoefte-decompositie (Veld 1). Voor de
 * post-FIRE in-horizon maanden van het blok: de RAUWE Ont!D-termen + twee onafhankelijke
 * totaal-varianten — `ontDirect` (canonieke Σ proj.ont[m].onttrekking) en `formuleMax`
 * (Σ MAX(0, uitgaveTerm + BA − BB + CF!K − PT!K), de formule-reconstructie). De bridge
 * mag zich hier niet in mengen: alle waarden komen uit de kernel-tabellen.
 */
function expectedWithdrawalNeed(
  proj: KernelProjection,
  input: KernelBridgeContext['input'],
  months: number[],
  fireMonth: number,
): {
  uitgaveTerm: number
  huur: number
  hyplast: number
  box3: number
  partner: number
  ontDirect: number
  formuleMax: number
} {
  let uitgaveTerm = 0
  let huur = 0
  let hyplast = 0
  let box3 = 0
  let partner = 0
  let ontDirect = 0
  let formuleMax = 0
  for (const m of months) {
    if (m < fireMonth) continue
    const ont = proj.ont[m]
    if (ont === undefined || ont.beyondHorizon) continue
    const bez = proj.bez[m]
    if (bez === undefined || bez.beyondHorizon) continue
    const cf = proj.cf[m]
    const idx = Math.pow(1 + input.inflatie, m / 12)
    const ut = (input.inkomenUitgaven.uitgaveNaPensioenPerJaar / 12) * idx * ont.actieveFactor
    const ba = bez.woning.huurPerMaand
    const bb = bez.woning.vervallenHypotheeklast
    const k = cf !== undefined && !cf.beyondHorizon ? cf.box3VorigeMaand : 0
    const pt = proj.pt[m]?.totaal ?? 0
    uitgaveTerm += ut
    huur += ba
    hyplast += bb
    box3 += k
    partner += pt
    ontDirect += ont.onttrekking
    formuleMax += Math.max(0, ut + ba - bb + k - pt)
  }
  return { uitgaveTerm, huur, hyplast, box3, partner, ontDirect, formuleMax }
}

// ── Shared assertion-set over één bridge-resultaat ───────────────────────────

function assertRowContinuityAndSums(solve: ReturnType<typeof solveFire>, ctx: KernelBridgeContext): void {
  const proj = solve.projection
  const last = proj.summary.lastInHorizonMonth
  const result = kernelToUnifiedResult(solve, ctx)
  expect(result.rows.length).toBeGreaterThan(0)

  // 1. Rij-continuïteit + strikt +1 leeftijden.
  for (let i = 1; i < result.rows.length; i++) {
    expect(result.rows[i].startNetWorth).toBeCloseTo(result.rows[i - 1].netWorth, 2)
    expect(result.rows[i].age).toBe(result.rows[i - 1].age + 1)
    expect(result.rows[i].year).toBe(result.rows[i - 1].year + 1)
  }

  // 2. Som-consistentie per rij + withdrawalByType + cumulatief.
  let runningCum = 0
  let totalBox3Sum = 0
  for (const row of result.rows) {
    const months = blockMonths(proj, row.year, last)
    expect(row.savings).toBeCloseTo(expectedSavings(proj, months), 2)
    expect(row.totalGrowth).toBeCloseTo(expectedGrowth(proj, months), 2)
    expect(row.totalBox3).toBeCloseTo(expectedBox3(proj, months), 2)
    expect(row.withdrawal).toBeCloseTo(expectedWithdrawal(proj, months), 2)

    const byTypeSum = Object.values(row.withdrawalByType).reduce((s, v) => s + (v ?? 0), 0)
    expect(byTypeSum).toBeCloseTo(row.withdrawal, 2)

    // cumulatief monotoon niet-dalend (totalBox3 ≥ 0) + lopende som.
    expect(row.cumulativeBox3).toBeGreaterThanOrEqual(runningCum - EUR)
    runningCum = row.cumulativeBox3
    totalBox3Sum += row.totalBox3

    // ── Veld 1: onttrekkings-behoefte-decompositie (recompute-asserties) ────────
    const fireMonth = proj.summary.fireMonth
    const en = expectedWithdrawalNeed(proj, ctx.input, months, fireMonth)
    if (en.ontDirect > 0) {
      const wn = row.withdrawalNeed
      expect(wn).toBeDefined()
      if (wn) {
        // (a) totaalNeed === onafhankelijk herberekende Σ Ont!D (canoniek), en de
        //     formule-reconstructie MAX(0,·) sluit op diezelfde Σ (kern-identiteit).
        expect(wn.totaalNeed).toBeCloseTo(en.ontDirect, 2)
        expect(en.formuleMax).toBeCloseTo(en.ontDirect, 2)
        // componenten = de rauwe jaar-sommen.
        expect(wn.uitgaveTerm).toBeCloseTo(en.uitgaveTerm, 2)
        expect(wn.huurNaVerkoop).toBeCloseTo(en.huur, 2)
        expect(wn.vervallenHypotheeklast).toBeCloseTo(en.hyplast, 2)
        expect(wn.box3).toBeCloseTo(en.box3, 2)
        expect(wn.partnerBijdrage).toBeCloseTo(en.partner, 2)
        // (b) reconciliatie float-exact: termen (met Ont!D-tekens) + restMaandClamp.
        expect(
          wn.uitgaveTerm +
            wn.huurNaVerkoop -
            wn.vervallenHypotheeklast +
            wn.box3 -
            wn.partnerBijdrage +
            wn.restMaandClamp,
        ).toBeCloseTo(wn.totaalNeed, 6)
        expect(wn.restMaandClamp).toBeGreaterThanOrEqual(-EUR) // opwaartse clamp ≥ 0
        // (c) nietGedekt === max(0, totaalNeed − withdrawal).
        expect(wn.nietGedekt).toBeCloseTo(Math.max(0, wn.totaalNeed - row.withdrawal), 2)
        // (e) geen NaN/undefined in de load-bearing velden.
        for (const v of [
          wn.uitgaveTerm,
          wn.huurNaVerkoop,
          wn.vervallenHypotheeklast,
          wn.box3,
          wn.partnerBijdrage,
          wn.totaalNeed,
          wn.restMaandClamp,
          wn.nietGedekt,
        ]) {
          expect(Number.isFinite(v)).toBe(true)
        }
      }
    } else {
      // (f) aanwezigheids-gating: geen behoefte-jaar → veld afwezig.
      expect(row.withdrawalNeed).toBeUndefined()
    }

    // ── Veld 2: bruto-inkomen-splitsing (recompute-asserties) ───────────────────
    // Mirror de bridge-post-FIRE-salaris-gate: vanaf de FIRE-maand valt het user-
    // basissalaris (= `cf.basissalaris`, de single-source D-subterm; phantom ná FIRE)
    // weg uit de salaris-bron; partnerbijdrage PT!K + werk-delta blijven in
    // `cf.inkomen` behouden. Bewust GEEN eigen herberekening van de subterm: de
    // mirror leest hetzelfde `cf.basissalaris` als de bridge, zodat een toekomstige
    // cf-indexeringswijziging deze test rood maakt bij bridge-drift (i.p.v. dat twee
    // parallelle recomputes elkaar bevestigen).
    let salaris = 0
    let gebBaten = 0
    for (const m of months) {
      const cf = proj.cf[m]
      if (cf !== undefined && !cf.beyondHorizon) {
        salaris += cf.inkomen - (m >= fireMonth ? cf.basissalaris : 0)
        gebBaten += cf.gebeurtenisBaten
      }
    }
    if (salaris !== 0 || gebBaten !== 0) {
      const gs = row.grossIncomeBySource
      expect(gs).toBeDefined()
      if (gs) {
        expect(gs.salaris).toBeCloseTo(salaris, 2)
        expect(gs.gebeurtenisBaten).toBeCloseTo(gebBaten, 2)
        // (d) exact: salaris + gebeurtenisBaten === row.grossIncome.
        expect(gs.salaris + gs.gebeurtenisBaten).toBe(row.grossIncome)
        expect(Number.isFinite(gs.salaris)).toBe(true)
        expect(Number.isFinite(gs.gebeurtenisBaten)).toBe(true)
      }
    } else {
      expect(row.grossIncomeBySource).toBeUndefined()
    }
  }
  const lastRow = result.rows[result.rows.length - 1]
  expect(lastRow.cumulativeBox3).toBeCloseTo(totalBox3Sum, 2)

  // 3. Inflatiefactor.
  const infl = ctx.input.inflatie
  expect(result.rows[0].inflationFactor).toBeCloseTo(1, 6)
  for (const row of result.rows) {
    expect(row.inflationFactor).toBeCloseTo(Math.pow(1 + infl, row.year), 6)
  }
  if (infl > 0) {
    for (let i = 1; i < result.rows.length; i++) {
      expect(result.rows[i].inflationFactor).toBeGreaterThan(result.rows[i - 1].inflationFactor)
    }
  }
}

// ── 1–3: synthetisch profiel ─────────────────────────────────────────────────

describe('bridge — synthetisch profiel: continuïteit, sommen, inflatie', () => {
  it('rij-continuïteit + som-consistentie + inflatiefactor', () => {
    const { ctx, solve } = synthContext()
    assertRowContinuityAndSums(solve, ctx)
  })
})

// ── 4: vorm-integriteit — verplichte velden + geen NaN/undefined ─────────────
//
// FASE 6 stap 5A: de vroegere v2-engine-vergelijking (`buildHorizonInput` +
// `runSelectedProjection` uit `lib/horizon-engine`) is vervallen — die module is
// fysiek verwijderd. De "zelfde velden aanwezig in kernel én v2"-helft van deze
// test had per constructie geen betekenis meer zonder een tweede motor; de
// "geen NaN/undefined in load-bearing rij-velden"-helft blijft waardevol (ving
// eerder al reële bridge-regressies af) en draait hier verder — nu kernel-only.

const UNIFIED_FIELDS: (keyof UnifiedProjectionResult)[] = [
  'rows', 'fireAge', 'fireAgeFractional', 'fireReachable', 'firePortfolioAtFire',
  'requiredFirePortfolio', 'requiredFireNetWorth', 'implicitWithdrawalRate', 'strategy', 'targetEndPortfolio', 'displayEndAge',
]

describe('bridge — vorm-integriteit (kernel-only, alleen velden/typen)', () => {
  it('alle verplichte velden aanwezig, geen NaN/undefined in load-bearing rij-velden', () => {
    const { ctx, solve } = synthContext()
    const kernel = kernelToUnifiedResult(solve, ctx)

    // Alle verplichte top-level velden aanwezig.
    for (const f of UNIFIED_FIELDS) {
      expect(kernel[f]).not.toBeUndefined()
    }
    // Kernel-extra doorvoer.
    expect(typeof kernel.kernelStatus).toBe('string')
    expect(Number.isFinite(kernel.kernelMaandHint)).toBe(true)

    // fireAgeFractional/fireAge: number of null.
    expect(kernel.fireAgeFractional === null || typeof kernel.fireAgeFractional === 'number').toBe(true)
    expect(kernel.fireAge === null || typeof kernel.fireAge === 'number').toBe(true)

    // Rows niet leeg + geen NaN/undefined in load-bearing velden.
    expect(kernel.rows.length).toBeGreaterThan(0)
    for (const row of kernel.rows) {
      for (const v of [row.netWorth, row.totalAssets, row.totalDebts, row.startNetWorth,
        row.savings, row.withdrawal, row.totalGrowth, row.totalBox3, row.grossIncome,
        row.cashflowNet, row.oneTimeNet, row.cumulativeBox3, row.inflationFactor]) {
        expect(Number.isFinite(v)).toBe(true)
      }
      for (const b of Object.values(row.assetBuckets)) {
        if (!b) continue
        for (const v of [b.startValue, b.growth, b.contributions, b.box3Drag, b.endValue]) {
          expect(Number.isFinite(v)).toBe(true)
        }
      }
    }
  })
})

// ── 5: solver-doorvoer + requiredFirePortfolio-bron + strategie-mapping ──────

describe('bridge — solver-doorvoer + requiredFirePortfolio-bron', () => {
  it('kernelStatus/kernelMaandHint = solver-uitvoer; requiredFirePortfolio = firePortfolioAtFire = J@FIRE-bron', () => {
    const { ctx, solve } = synthContext()
    const result = kernelToUnifiedResult(solve, ctx)
    expect(result.kernelStatus).toBe(solve.status)
    expect(result.kernelMaandHint).toBe(solve.maandHint)
    expect(result.targetEndPortfolio).toBe(solve.doelbedrag)
    expect(result.displayEndAge).toBe(solve.eindleeftijd)

    const summary = solve.projection.summary
    const expected = summary.nettoLiquideBijFire ?? summary.eindNettoLiquide
    expect(result.requiredFirePortfolio).toBe(expected)
    expect(result.firePortfolioAtFire).toBe(expected)

    // requiredFireNetWorth = Prognose!I@FIRE (TOTAAL netto vermogen incl. woning),
    // puur doorgeleid summary-veld (spiegel van J@FIRE hierboven). Zelfde null-fallback.
    const expectedNetWorth = summary.nettoVermogenBijFire ?? summary.eindNettoVermogen
    expect(result.requiredFireNetWorth).toBe(expectedNetWorth)
    // Identiteit: I = J + (niet-liquide bezit − niet-liquide schuld). Bij een eigen woning
    // met overwaarde ≥ 0 (SYNTH: huis 350k − hypotheek 200k) geldt I ≥ J.
    expect(result.requiredFireNetWorth!).toBeGreaterThanOrEqual(result.requiredFirePortfolio - EUR)

    // fireReachable-relatie + fireAge = ceil(fireAgeFractional).
    expect(result.fireReachable).toBe(solve.status !== 'unreachable_within_horizon')
    if (result.fireAgeFractional !== null) {
      expect(result.fireAge).toBe(Math.ceil(result.fireAgeFractional))
    } else {
      expect(result.fireAge).toBeNull()
    }
  })

  it('strategy-mapping per eindstrategie (deplete/legacy/perpetual/pensioen)', () => {
    const cases: Array<[string, string, Record<string, unknown>]> = [
      ['deplete', 'deplete', {}],
      ['legacy', 'legacy', { fire_legacy_amount: 150_000 }],
      ['perpetual', 'perpetual', {}],
      ['pensioen', 'pensioen', {}],
    ]
    for (const [strategy, expected, extra] of cases) {
      const { ctx, solve } = synthContext({ fire_end_strategy: strategy, ...extra })
      const result = kernelToUnifiedResult(solve, ctx)
      expect(result.strategy).toBe(expected)
      // targetEndPortfolio = B36 (deplete/perpetual→0 op eindleeftijd bij deze bron; legacy > 0).
      if (strategy === 'legacy') expect(result.targetEndPortfolio).toBeGreaterThan(0)
    }
  })
})

// ── isKernelReachedNowDisplay — WEERGAVE-regel voor de B93-doel=0-quirk ──────

describe('isKernelReachedNowDisplay — weergave-regel bij deplete-doel=0', () => {
  const START = 45

  it('fireAge == startleeftijd → true (echt nu al bereikt)', () => {
    expect(isKernelReachedNowDisplay(START, START)).toBe(true)
  })

  it('fireAge == startleeftijd + één maand → true (binnen de epsilon-band)', () => {
    expect(isKernelReachedNowDisplay(START + 1 / 12, START)).toBe(true)
  })

  it('fireAge == startleeftijd + 0,2 jaar → false (echte latere FIRE-maand)', () => {
    expect(isKernelReachedNowDisplay(START + 0.2, START)).toBe(false)
  })

  it('een duidelijk latere FIRE-leeftijd (deplete-quirk, bv. 89,25) → false', () => {
    expect(isKernelReachedNowDisplay(89.25, START)).toBe(false)
  })

  it('null / undefined / niet-eindig → false (val terug op reached_at)', () => {
    expect(isKernelReachedNowDisplay(null, START)).toBe(false)
    expect(isKernelReachedNowDisplay(START, null)).toBe(false)
    expect(isKernelReachedNowDisplay(undefined, START)).toBe(false)
    expect(isKernelReachedNowDisplay(START, undefined)).toBe(false)
    expect(isKernelReachedNowDisplay(Number.NaN, START)).toBe(false)
    expect(isKernelReachedNowDisplay(Number.POSITIVE_INFINITY, START)).toBe(false)
  })
})

// ── kernelHousingSale — verkoopmoment eigen woning (marker-contract) ─────────

describe('bridge — kernelHousingSale (verkoopmoment eigen woning)', () => {
  const HOUSE_ASSETS: Asset[] = [
    makeAsset({ id: 'sav', asset_type: 'savings', current_value: 30_000, monthly_contribution: 200 }),
    makeAsset({ id: 'house', asset_type: 'eigen_huis', current_value: 400_000, expected_return: 2 }),
  ]
  const HOUSE_DEBTS: Debt[] = [
    makeDebt({ id: 'mort', debt_type: 'mortgage', current_balance: 150_000, linked_asset_id: 'house', interest_rate: 3, monthly_payment: 700, is_tax_deductible: true }),
  ]
  const NO_HOUSE_ASSETS: Asset[] = [
    makeAsset({ id: 'sav', asset_type: 'savings', current_value: 30_000 }),
    makeAsset({ id: 'etf', asset_type: 'investment', current_value: 120_000, expected_return: 6 }),
  ]

  it('verkoop → month/age/proceeds ingevuld (age = afgeronde startleeftijd + month/12)', () => {
    const input = buildKernelInputFromApp({
      profile: synthProfile({
        housing_strategy_config: {
          mode: 'downsize', trigger: 'on_depletion', triggerAge: 67,
          salePricePct: 1, salesCostsPct: 0.04, newMonthlyHousingCost: null, depletionThresholdYears: 0,
        },
      }),
      assets: HOUSE_ASSETS, debts: HOUSE_DEBTS,
    })
    const { assetSlotMeta, debtSlotMeta } = buildKernelSlotMeta(HOUSE_ASSETS, HOUSE_DEBTS, new Set(['house']))
    const result = kernelToUnifiedResult(solveFire(input), {
      input, yearlyExpenses: 2600 * 12, assetSlotMeta, debtSlotMeta,
    })
    expect(result.kernelHousingSale).not.toBeNull()
    const sale = result.kernelHousingSale!
    expect(sale.month).toBeGreaterThan(0)
    expect(sale.proceeds).toBeGreaterThan(0)
    // Leeftijd op dezelfde as als de rijen: afgeronde startleeftijd + m/12.
    expect(sale.age).toBeCloseTo(Math.round(input.startLeeftijd) + sale.month / 12, 6)
  })

  it('geen eigen woning → kernelHousingSale null', () => {
    const input = buildKernelInputFromApp({ profile: synthProfile(), assets: NO_HOUSE_ASSETS, debts: [] })
    const { assetSlotMeta, debtSlotMeta } = buildKernelSlotMeta(NO_HOUSE_ASSETS, [], new Set())
    const result = kernelToUnifiedResult(solveFire(input), {
      input, yearlyExpenses: 2600 * 12, assetSlotMeta, debtSlotMeta,
    })
    expect(result.kernelHousingSale).toBeNull()
  })
})

// ── Geforceerde stop via evaluateFireAt BUITEN runForcedStopPath ─────────────
//
// Variantenmatrix-item (bug-fix stap 6): `horizon-client.tsx`'s AOW-stop-sim inlinet
// exact hetzelfde geforceerde-stop-recept (deplete-override + `evaluateFireAt` + bridge)
// als `runForcedStopPath` (lib/horizon/scenario-presets.ts), maar roept die gedeelde
// helper NIET aan — dit dekt dat de salaris-gate-fix ook op déze losstaande call-site
// (rechtstreeks via de solver, geen bisectie) correct toepast.

describe('bridge — geforceerde stop via evaluateFireAt buiten runForcedStopPath (AOW-stop-sim-recept)', () => {
  it('user-basissalaris = 0 in rijen ruim ná de geforceerde stopmaand', () => {
    const STOP_AGE = 55 // ruim binnen de horizon, en ruim voor leeftijd 100
    const input = buildKernelInputFromApp({
      profile: synthProfile({ fire_end_strategy: 'deplete', fire_end_age: 90 }),
      assets: SYNTH_ASSETS,
      debts: SYNTH_DEBTS,
    })
    const solve = evaluateFireAt(input, STOP_AGE)
    const { assetSlotMeta, debtSlotMeta } = buildKernelSlotMeta(SYNTH_ASSETS, SYNTH_DEBTS, SYNTH_EIGEN_HUIS)
    const ctx: KernelBridgeContext = { input, yearlyExpenses: 2600 * 12, assetSlotMeta, debtSlotMeta }
    const result = kernelToUnifiedResult(solve, ctx)

    const fireMonth = solve.projection.summary.fireMonth
    expect(fireMonth).toBeGreaterThan(0)

    // Rijen een vol jaar ná de geforceerde stopmaand horen geen user-basissalaris meer te
    // dragen — zelfde recept als runForcedStopPath, hier via een directe evaluateFireAt-
    // aanroep zoals horizon-client.tsx's AOW-stop-sim 'm gebruikt (buiten de gedeelde helper).
    const postStopRows = result.rows.filter((r) => r.age >= Math.ceil(STOP_AGE) + 1)
    expect(postStopRows.length).toBeGreaterThan(0)
    for (const row of postStopRows) {
      expect(row.grossIncomeBySource?.salaris ?? 0).toBeCloseTo(0, 0)
    }
  })
})

// ── Partner-behoud ná FIRE (oracle-fixture "partner-aan"/"gezin") ────────────
//
// Variantenmatrix-item: de post-FIRE-salaris-gate mag ALLEEN het user-basissalaris
// wegnemen; partnerbijdrage (PT!K, `proj.pt[m].totaal`) blijft behouden via
// `cf.inkomen − userBasissalaris`. De synthetische SYNTH-fixture hierboven heeft geen
// partner-blok; dit bewijst de kritische ontwerpconstraint expliciet op een ECHTE
// partner-fixture (oracle, geen white-box-mirror-only dekking).

if (hasFixtures) {
  describe('bridge — partner-behoud ná FIRE (oracle-fixture partner-aan/gezin)', () => {
    it('grossIncomeBySource.salaris blijft > 0 ná FIRE dankzij de partnerbijdrage', () => {
      const files = listFixtures(FIXTURE_DIR)
      const fx = files.map(loadFixture).find((f) => f.meta.scenario === 'partner-aan' || f.meta.scenario === 'gezin')
      expect(fx).toBeDefined()
      if (fx === undefined) return

      const input = buildKernelInput(fx)
      const solve = solveFire(input)
      const ctx: KernelBridgeContext = { input, yearlyExpenses: input.inkomenUitgaven.uitgaveNaPensioenPerJaar }
      const result = kernelToUnifiedResult(solve, ctx)

      const fireMonth = solve.projection.summary.fireMonth
      expect(fireMonth).toBeGreaterThan(0)

      // Rijen ruim (≥2 jaar) ná FIRE, zodat de user-basissalaris-gate voor de hele rij
      // actief is: de partnerbijdrage moet de salaris-bron nog altijd > 0 houden, en die
      // wordt door coveragePctForRow (coverage-strip.ts) meegeteld als vaste dekking.
      const postFireAge = Math.round(input.startLeeftijd) + fireMonth / 12 + 2
      const postFireRows = result.rows.filter((r) => r.age >= postFireAge)
      expect(postFireRows.length).toBeGreaterThan(0)
      for (const row of postFireRows) {
        expect(row.grossIncomeBySource?.salaris ?? 0).toBeGreaterThan(0)
      }
    })
  })
}

// ── Fixture-route (skip tot de extractor fixtures schreef) ────────────────────

if (!hasFixtures) {
  describe.skip('bridge — fixture-route (fixtures nog niet geëxtraheerd)', () => {
    it('wordt overgeslagen tot de extractor fixtures heeft geschreven', () => {
      expect(hasFixtures).toBe(false)
    })
  })
} else {
  describe('bridge — oracle-fixture-route', () => {
    it('basis-fixture: continuïteit + sommen + inflatie (categorie-rep-type, geen slot-meta)', () => {
      const files = listFixtures(FIXTURE_DIR)
      const basis = files.map(loadFixture).find((f) => f.meta.scenario === 'basis')
      expect(basis).toBeDefined()
      if (basis === undefined) return
      const input = buildKernelInput(basis)
      const ctx: KernelBridgeContext = { input, yearlyExpenses: input.inkomenUitgaven.uitgaveNaPensioenPerJaar }
      const solve = solveFire(input)
      assertRowContinuityAndSums(solve, ctx)
    })

    // 19 fixtures × solveFire (bisectie = meerdere engine-runs van 1200 maanden):
    // ~3 s solo, maar ruim boven de 5 s-default onder parallelle suite-belasting.
    it('draait over alle fixtures zonder throw + rows/velden gevuld', () => {
      const files = listFixtures(FIXTURE_DIR)
      for (const fx of files.map(loadFixture)) {
        const input = buildKernelInput(fx)
        const solve = solveFire(input)
        const result = kernelToUnifiedResult(solve, { input })
        expect(result.rows.length).toBeGreaterThan(0)
        expect(['reached_now', 'reached_at', 'unreachable_within_horizon', 'pension_shortfall']).toContain(result.kernelStatus)
      }
    }, 60_000)
  })
}

// ── totalGrowthLiquide — rendement exclusief niet-liquide bezit (defect A) ───────
//
// `bridge.ts#buildRow` sommeert `totalGrowth` over ALLE bezit-slots, inclusief een
// niet-liquide eigen huis (bv. bij `exclude_from_fire`, TS!nietLiquide). Consumenten
// die dat tonen als besteedbaar "Rendement" (`income-expense-breakdown.ts`) mogen
// die woning-waardestijging niet als instroom meetellen — ze is niet onttrekbaar.
// Elke jaar-rij draagt daarom ook `totalGrowthLiquide` = totalGrowth minus het
// rendement van de nietLiquide bezit-categorieën (bij `exclude_from_fire`: het
// eigen huis; bij `include_full` is niets nietLiquide → liquide === totaal).
describe('bridge — totalGrowthLiquide (defect A: rendement exclusief niet-liquide bezit)', () => {
  it('exclude_from_fire: totalGrowthLiquide < totalGrowth, verschil ≈ huis-rendement', () => {
    const { ctx, solve } = synthContext({ housing_strategy_config: { mode: 'exclude_from_fire' } })
    const result = kernelToUnifiedResult(solve, ctx)
    const row = result.rows[0]

    expect(typeof row.totalGrowthLiquide).toBe('number')
    expect(row.totalGrowthLiquide as number).toBeLessThan(row.totalGrowth)

    const huisGrowth = row.assetBuckets.eigen_huis?.growth ?? 0
    expect(huisGrowth).toBeGreaterThan(0) // sanity: het huis maakt dit jaar echt rendement
    expect(row.totalGrowth - (row.totalGrowthLiquide as number)).toBeCloseTo(huisGrowth, 2)
  })

  it('include_full: totalGrowthLiquide === totalGrowth (niets is niet-liquide)', () => {
    const { ctx, solve } = synthContext({ housing_strategy_config: { mode: 'include_full' } })
    const result = kernelToUnifiedResult(solve, ctx)
    const row = result.rows[0]

    expect(row.totalGrowthLiquide).toBeCloseTo(row.totalGrowth, 6)
  })
})

// ── startNettoLiquide — de J-spiegel van startNetWorth (spoor B, route 1) ────────
//
// De Toekomst-grafiek laat haar primaire lijn per woonstrategie van grondslag wisselen
// (Prognose!I bij "woning meetellen", Prognose!J bij "uitsluiten"). Daarvoor heeft ze
// naast de EINDstand (`nettoLiquide`) ook de BEGINstand op J nodig — anders zou het
// eerste punt van een J-lijn nog op de I-grondslag liggen. `buildRow` vult die uit
// dezelfde blokrand als `startNetWorth`: J(12k−1), en op k = 0 het J(0)-anker uit de
// potten (`jaarrand.ts#startNettoLiquide`, gefilterd op TS!H — geen tweede afleiding).
//
// TOLERANTIE — bewuste keuze per assertie:
//  · reeks-aansluiting rows[k].startNettoLiquide ↔ rows[k−1].nettoLiquide: EXACT
//    (`toBe`). Geen herberekening, maar tweemaal DEZELFDE prognose-cel (maand 12k−1)
//    lezen; élke tolerantie zou een echte afwijking in de bemonsteringsregel juist
//    verbergen.
//  · include_full J(0) ↔ I(0): ook EXACT. Zonder niet-liquide categorie reduceren
//    beide functies over dezelfde arrays in dezelfde volgorde met dezelfde
//    optel-/aftrek-stappen — bit-identiek, dus "ongeveer gelijk" zou hier zwakker
//    zijn dan de waarheid.
//  · exclude_from_fire J(0) = I(0) − huis + hypotheek: ABSOLUTE cent-tolerantie
//    (`toBeCloseTo(·, 2)` ⇒ |Δ| < €0,005). Hier herschikt de assertie zelf de
//    optelvolgorde; een relatieve tolerantie past niet, want J(0) mag legitiem dicht
//    bij nul liggen (huis + hypotheek zijn van dezelfde orde als het hele vermogen)
//    en zou daar een willekeurig kleine absolute drempel worden.
describe('bridge — startNettoLiquide (J-spiegel van startNetWorth)', () => {
  it('rij 0 draagt startNettoLiquide; bij include_full is het exact startNetWorth', () => {
    const { ctx, solve } = synthContext({ housing_strategy_config: { mode: 'include_full' } })
    const rows = kernelToUnifiedResult(solve, ctx).rows

    expect(typeof rows[0].startNettoLiquide).toBe('number')
    expect(Number.isFinite(rows[0].startNettoLiquide as number)).toBe(true)
    // Niets is niet-liquide ⇒ L = M = 0 ⇒ J(0) ≡ I(0).
    expect(rows[0].startNettoLiquide).toBe(rows[0].startNetWorth)
  })

  it('exclude_from_fire: rij 0 ligt op J(0), dus ONDER startNetWorth (huis eruit, hypotheek erbij)', () => {
    const { ctx, solve } = synthContext({ housing_strategy_config: { mode: 'exclude_from_fire' } })
    const rows = kernelToUnifiedResult(solve, ctx).rows

    // SYNTH: huis 350k niet-liquide, hypotheek 200k niet-liquide ⇒ J(0) = I(0) − 350k + 200k.
    expect(rows[0].startNettoLiquide as number).toBeCloseTo(rows[0].startNetWorth - 350_000 + 200_000, 2)
    expect(rows[0].startNettoLiquide as number).toBeLessThan(rows[0].startNetWorth)
  })

  it('reeks sluit aan: rows[k].startNettoLiquide === rows[k−1].nettoLiquide (dezelfde blokrand)', () => {
    for (const mode of ['include_full', 'exclude_from_fire'] as const) {
      const { ctx, solve } = synthContext({ housing_strategy_config: { mode } })
      const rows = kernelToUnifiedResult(solve, ctx).rows
      const last = solve.projection.summary.lastInHorizonMonth

      expect(rows.length).toBeGreaterThan(1)
      for (let k = 1; k < rows.length; k++) {
        // Alleen zolang blok k−1 niet door de horizon is afgekapt: dan is zijn
        // eindmaand 12k−1 en leest de startstand van blok k dezelfde cel.
        if (12 * k - 1 > last) break
        expect(rows[k].startNettoLiquide).toBe(rows[k - 1].nettoLiquide)
        expect(Number.isFinite(rows[k].startNettoLiquide as number)).toBe(true)
      }
    }
  })

  it('elke rij draagt het veld en is eindig (geen undefined-gaten in de reeks)', () => {
    const { ctx, solve } = synthContext({ housing_strategy_config: { mode: 'exclude_from_fire' } })
    for (const row of kernelToUnifiedResult(solve, ctx).rows) {
      expect(row.startNettoLiquide).not.toBeUndefined()
      expect(Number.isFinite(row.startNettoLiquide as number)).toBe(true)
    }
  })
})
