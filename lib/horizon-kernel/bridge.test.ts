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
import type { FinancialInput } from '@/lib/core-metrics'
import { buildHorizonInput } from '@/lib/horizon-engine/build-input'
import { runSelectedProjection } from '@/lib/horizon-engine/select'
import type { UnifiedProjectionResult } from '@/lib/unified-projection'
import { solveFire } from './solver'
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

// ── 4: vorm-rooktest kernel-bridge vs v2 (GEEN waarde-gelijkheid) ────────────

const UNIFIED_FIELDS: (keyof UnifiedProjectionResult)[] = [
  'rows', 'fireAge', 'fireAgeFractional', 'fireReachable', 'firePortfolioAtFire',
  'requiredFirePortfolio', 'implicitWithdrawalRate', 'strategy', 'targetEndPortfolio', 'displayEndAge',
]

describe('bridge — vorm-pariteit met de v2-engine (alleen velden/typen)', () => {
  it('zelfde velden aanwezig, geen NaN/undefined in load-bearing rij-velden', () => {
    // Kernel-bridge.
    const { ctx, solve } = synthContext()
    const kernel = kernelToUnifiedResult(solve, ctx)

    // v2-engine op dezelfde app-data.
    const horizonInput: FinancialInput = {
      totalAssets: 560_000, totalDebts: 208_000, monthlyIncome: 4500, monthlyExpenses: 2600,
      yearlyMustExpenses: 2600 * 12, monthlyContributions: 800, dateOfBirth: synthProfile().date_of_birth,
    }
    const built = buildHorizonInput({
      horizonInput, lifeEvents: [], assets: SYNTH_ASSETS, debts: SYNTH_DEBTS,
      grossReturn: 0.06, inflation: 0.02, box3Method: 'forfaitair',
    })
    expect(built).not.toBeNull()
    const v2 = runSelectedProjection(built!.input, true)

    // Zelfde top-level velden aanwezig in beide.
    for (const f of UNIFIED_FIELDS) {
      expect(kernel[f]).not.toBeUndefined()
      expect(v2[f]).not.toBeUndefined()
    }
    // Kernel-extra doorvoer.
    expect(typeof kernel.kernelStatus).toBe('string')
    expect(Number.isFinite(kernel.kernelMaandHint)).toBe(true)

    // fireAgeFractional typen: number of null in beide.
    for (const r of [kernel, v2]) {
      expect(r.fireAgeFractional === null || typeof r.fireAgeFractional === 'number').toBe(true)
      expect(r.fireAge === null || typeof r.fireAge === 'number').toBe(true)
    }

    // Rows niet leeg + geen NaN/undefined in load-bearing velden.
    for (const result of [kernel as UnifiedProjectionResult, v2]) {
      expect(result.rows.length).toBeGreaterThan(0)
      for (const row of result.rows) {
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
