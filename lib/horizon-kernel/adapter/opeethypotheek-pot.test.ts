/**
 * Horizon-kernel adapter — **opeethypotheek-schuldpot op het APP-pad** (slot 3).
 *
 * Regressie-vangnet voor de bug waarbij de opeethypotheek-OPNAME wél als kasstroom
 * binnenkwam (`bridge.ts`: `cashflowNet += bez.woning.opeetOpname`) maar de bijbehorende
 * SCHULD nooit werd geboekt: `buildSchuldPotten` maakte geen pot met rol
 * `'opeethypotheek'` op slot 3, dus `tables/s.ts` (`pot?.rol === 'opeethypotheek' &&
 * opeetMode`) evolueerde die slot nooit en S!P bleef 0. Gevolg: gratis geld — het
 * vermogen steeg met de opnames, de leen-cap (`bez.ts` BE:
 * `MIN(gewenst, MAX(0, BD/(1+rente/12) − S!P(m−1)))`) knelde nooit, en de schulden-reeks
 * was identiek aan een run zónder opeethypotheek.
 *
 * Het FIXTURE-pad deed dit al goed (`input-from-fixture.ts#debtRol` → slot 3 =
 * 'opeethypotheek'); de kernmachinerie was dus bewezen — alleen de ADAPTER voedde 'm niet.
 * Deze tests bewaken de app-zijde en de harde eis dat NIET-reverse-strategieën
 * ongewijzigd blijven.
 */

import { describe, it, expect } from 'vitest'
import type { Asset, AssetType } from '@/lib/asset-data'
import type { Debt, DebtType } from '@/lib/debt-data'
import type { HousingStrategyConfig } from '@/lib/housing-strategy'
import { solveFire } from '../solver'
import { runKernelUnified } from '../run-unified'
import { buildKernelInputFromApp, type KernelAdapterProfile } from './index'

// ── Factories (volledige DB-shape, overschrijfbaar) ──────────────────────────────

function makeAsset(p: Partial<Asset> & { id: string; asset_type: AssetType; current_value: number }): Asset {
  return {
    user_id: 'u',
    name: p.asset_type,
    purchase_value: 0,
    purchase_date: null,
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
    is_liquid: null,
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
    has_holdings_tracking: false,
    has_woonbalans_tracking: false,
    has_rental_tracking: false,
    monthly_maintenance_cost: 0,
    vva_fee: 0,
    vacancy_log: [],
    ...p,
  }
}

function makeDebt(p: Partial<Debt> & { id: string; debt_type: DebtType; current_balance: number }): Debt {
  return {
    user_id: 'u',
    name: p.debt_type,
    original_amount: p.current_balance ?? 0,
    interest_rate: 3,
    minimum_payment: 0,
    monthly_payment: 0,
    start_date: '2020-01-01',
    end_date: null,
    creditor: null,
    notes: null,
    is_active: true,
    sort_order: 0,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    subtype: null,
    is_tax_deductible: null,
    fixed_rate_end_date: null,
    nhg: null,
    linked_asset_id: null,
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
    include_aflossing_in_savings: false,
    custom_aflossing_amount: null,
    has_hypotheekplanner_tracking: false,
    ...p,
  }
}

// ── Vaste, reproduceerbare invoer (F6: gepinde asOf) ─────────────────────────────

const AS_OF = new Date(2026, 0, 1)
const DOB = '1980-06-15' // → startleeftijd 45 op AS_OF
const OPEET_START_AGE = 67
const OPEET_RENTE = 0.055
const MAX_LOAN_PCT = 0.5

const ASSETS: Asset[] = [
  makeAsset({ id: 'sav', asset_type: 'savings', current_value: 60_000, expected_return: 2 }),
  makeAsset({ id: 'etf', asset_type: 'investment', current_value: 150_000, expected_return: 7 }),
  makeAsset({ id: 'house', asset_type: 'eigen_huis', current_value: 500_000, expected_return: 2 }),
]
const DEBTS: Debt[] = [
  makeDebt({
    id: 'mort',
    debt_type: 'mortgage',
    current_balance: 200_000,
    linked_asset_id: 'house',
    interest_rate: 3.5,
    monthly_payment: 900,
    is_tax_deductible: true,
  }),
]

const REVERSE_CONFIG: HousingStrategyConfig = {
  mode: 'reverse_mortgage',
  trigger: 'fixed_age',
  triggerAge: OPEET_START_AGE,
  depletionThresholdYears: 0,
  maxLoanPct: MAX_LOAN_PCT,
  interestRate: OPEET_RENTE,
  monthlyPayout: null,
}

function profileWith(housing: HousingStrategyConfig): KernelAdapterProfile {
  return {
    date_of_birth: DOB,
    net_monthly_income: 5_000,
    estimated_monthly_expenses: 3_000,
    expected_return: 7,
    inflation_rate: 2,
    box3_method: 'forfaitair',
    fire_end_strategy: 'deplete',
    fire_end_age: 90,
    housing_strategy_config: housing,
  }
}

function inputFor(housing: HousingStrategyConfig) {
  return buildKernelInputFromApp({
    profile: profileWith(housing),
    assets: ASSETS,
    debts: DEBTS,
    asOf: AS_OF,
  })
}

/** S!P(m) — saldo van de fysieke opeet-slot 3 ("" / ontbrekend → 0). */
function opeetSaldo(proj: ReturnType<typeof solveFire>['projection'], m: number): number {
  const cell = proj.s[m]?.slots[3]?.saldo ?? 0
  return typeof cell === 'number' ? cell : 0
}

// ── 1. Adapter-vorm: de pot bestaat en spiegelt het fixture-pad ──────────────────

describe('opeethypotheek — adapter bouwt de schuldpot op slot 3 (reverse_mortgage)', () => {
  it('levert exact één pot met rol opeethypotheek, op slot 3, met de geconfigureerde opeetrente', () => {
    const input = inputFor(REVERSE_CONFIG)
    const opeet = input.schuldPotten.filter((p) => p.rol === 'opeethypotheek')
    expect(opeet).toHaveLength(1)
    expect(opeet[0].slot).toBe(3)
    expect(opeet[0].rente).toBe(OPEET_RENTE)
  })

  it('spiegelt de fixture-vorm van bens rij 20 (box3/categorie/startwaarde/aflossing/liquide/sparen)', () => {
    const input = inputFor(REVERSE_CONFIG)
    const opeet = input.schuldPotten.find((p) => p.rol === 'opeethypotheek')!
    // Excel-oracle `huis-opeethypotheek`, bens rij 20:
    // [naam, 0, 0, 0, 0.055, 'Geen Box 3 schuld', 'nee', 'Nee', 'Woning']
    expect(opeet.box3Type).toBe('Geen Box 3 schuld')
    expect(opeet.categorie).toBe('Woning')
    expect(opeet.startwaarde).toBe(0)
    expect(opeet.aflossingPct).toBe(0)
    expect(opeet.aflossingEur).toBe(0)
    expect(opeet.liquide).toBe(false)
    expect(opeet.inSparenNaAflossing).toBe(false)
  })

  it('de gereserveerde slots blijven uniek bezet (0 hypotheek, 3 opeet, 6 tekort)', () => {
    const input = inputFor(REVERSE_CONFIG)
    const bySlot = new Map(input.schuldPotten.map((p) => [p.slot, p]))
    expect(bySlot.get(0)?.rol).toBe('hypotheek')
    expect(bySlot.get(3)?.rol).toBe('opeethypotheek')
    expect(bySlot.get(6)?.rol).toBe('tekortLening')
    expect(input.schuldPotten).toHaveLength(3)
  })
})

// ── 2. Projectie: de schuld groeit écht, en de opname wordt door de cap begrensd ──

describe('opeethypotheek — de schuld wordt geboekt en de opname wordt begrensd', () => {
  it('ná de opeet-startleeftijd is het opeetsaldo > 0 en groeit het maand op maand', () => {
    const input = inputFor(REVERSE_CONFIG)
    const proj = solveFire(input).projection
    const startM = Math.round((OPEET_START_AGE - input.startLeeftijd) * 12)

    // Vóór de startleeftijd: geen schuld.
    expect(opeetSaldo(proj, startM - 1)).toBe(0)
    // Direct ná de start: schuld ontstaat en stapelt op.
    expect(opeetSaldo(proj, startM + 1)).toBeGreaterThan(0)
    expect(opeetSaldo(proj, startM + 24)).toBeGreaterThan(opeetSaldo(proj, startM + 12))
    expect(opeetSaldo(proj, startM + 120)).toBeGreaterThan(opeetSaldo(proj, startM + 24))
  })

  it('het opeetsaldo drukt het netto vermogen: totalDebts stijgt ná de opeet-start', () => {
    const { result } = runKernelUnified({
      adapterInput: { profile: profileWith(REVERSE_CONFIG), assets: ASSETS, debts: DEBTS, asOf: AS_OF },
      yearlyExpenses: 36_000,
    })
    const at = (age: number) => result.rows.find((r) => r.age === age)!
    // De hypotheek is op 67 allang afgelost (900/mnd op 200k) — elke schuld die er dan
    // nog bijkomt is de opeethypotheek.
    expect(at(OPEET_START_AGE + 10).totalDebts).toBeGreaterThan(at(OPEET_START_AGE).totalDebts)
    expect(at(OPEET_START_AGE + 10).totalDebts).toBeGreaterThan(0)
  })

  // TOLERANTIE-KEUZE (bewust ABSOLUUT, €1e-6): beide vergelijkingen toetsen een
  // STRUCTURELE ongelijkheid (saldo ≤ cap volgt uit de MIN() in `opeetSlot`; Σopname ≤
  // maxCap volgt daaruit), geen numerieke reproductie van een oracle-waarde. De epsilon
  // dekt uitsluitend float-ruis: de jaarsom loopt over ~400 optellingen rond €750k, wat
  // ≈7e-8 absolute drift geeft — ruim binnen 1e-6. Een RELATIEVE tolerantie zou hier juist
  // fout zijn: hij zou meeschalen met het bedrag en daarmee een echte cap-overschrijding
  // van tientallen euro's op een miljoenensaldo verbergen (precies de bugklasse die deze
  // test moet vangen — zónder de fix is de overschrijding 275×, dus de keuze is niet
  // grensbepalend, maar wel expliciet gemaakt).
  it('opname-cap knelt: het saldo blijft ≤ Bez!BD en de opnames stoppen bij een vaste maandopname', () => {
    const vasteOpname: HousingStrategyConfig = { ...REVERSE_CONFIG, monthlyPayout: 3_000 }
    const input = inputFor(vasteOpname)
    const proj = solveFire(input).projection

    let cumOpname = 0
    let maxCap = 0
    let laatsteOpname = 0
    for (let m = 0; m < proj.bez.length; m++) {
      const bez = proj.bez[m]
      if (bez === undefined || bez.beyondHorizon) continue
      cumOpname += bez.woning.opeetOpname
      maxCap = Math.max(maxCap, bez.woning.opeetCap)
      laatsteOpname = bez.woning.opeetOpname
      // Het saldo mag de leen-cap nooit passeren (S!P = MIN(BD, …)).
      expect(opeetSaldo(proj, m)).toBeLessThanOrEqual(bez.woning.opeetCap + 1e-6)
    }
    // Zonder geboekte schuld is `capRestant` altijd de volle cap → €3.000/mnd stroomt
    // 33 jaar lang ongehinderd door en de som overschrijdt de leenruimte veelvoudig.
    expect(cumOpname).toBeLessThanOrEqual(maxCap + 1e-6)
    // Bij een vaste opname loopt de leenruimte vol → de opname valt terug naar 0.
    expect(laatsteOpname).toBe(0)
  })
})

// ── 3. Anti-regressie: niets verandert buiten reverse_mortgage ───────────────────

describe('opeethypotheek — geen gedragswijziging buiten reverse_mortgage', () => {
  const nietReverse: Array<[string, HousingStrategyConfig]> = [
    ['include_full', { mode: 'include_full' }],
    ['exclude_from_fire', { mode: 'exclude_from_fire' }],
    [
      'downsize',
      {
        mode: 'downsize',
        trigger: 'fixed_age',
        triggerAge: 67,
        depletionThresholdYears: 0,
        salePricePct: 1,
        salesCostsPct: 0.04,
        newMonthlyHousingCost: null,
        saleValuationBasis: 'market',
      },
    ],
  ]

  for (const [naam, cfg] of nietReverse) {
    it(`${naam}: geen opeetpot, slot 3 blijft leeg`, () => {
      const input = inputFor(cfg)
      expect(input.schuldPotten.some((p) => p.rol === 'opeethypotheek')).toBe(false)
      expect(input.schuldPotten.some((p) => p.slot === 3)).toBe(false)
      // Exact de gebruikersschuld + de altijd-aanwezige tekort-lening.
      expect(input.schuldPotten.map((p) => p.slot)).toEqual([0, 6])
    })
  }

  it('de schuldpotten zijn identiek voor alle niet-reverse strategieën', () => {
    const potten = nietReverse.map(([, cfg]) => inputFor(cfg).schuldPotten)
    expect(potten[1]).toStrictEqual(potten[0])
    expect(potten[2]).toStrictEqual(potten[0])
  })
})
