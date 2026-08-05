/**
 * Horizon-kernel adapter — eigenschaps-tests (FASE 3, snede 1).
 *
 * Buiten het Excel-parity-domein: geen fixtures. We asserteren de invariante
 * eigenschappen van de app→kern-mapping op synthetische app-data (en één realistisch
 * persona-profiel), plus een rooktest die bewijst dat een gebouwde `KernelInput`
 * daadwerkelijk door `solveFire` loopt.
 */

import { describe, it, expect } from 'vitest'
import type { Asset, AssetType } from '@/lib/asset-data'
import type { Debt, DebtType } from '@/lib/debt-data'
import { buildCompleetHorizonFixture } from '@/lib/regression-tests/horizon-strategie/persona-fixture'
import { solveFire } from '../index'
import { runKernelUnified } from '../run-unified'
import {
  buildKernelInputFromApp,
  buildAssetPotten,
  buildSchuldPotten,
  buildOnttrekkingsprofiel,
  buildWoning,
  mapInSparenNaAflossing,
  type KernelAdapterProfile,
} from './index'
import type { AssetCategorie, DebtCategorie } from '../types'
import { EXCEL_TEKORT_LENING_RENTE } from './defaults'

/**
 * Woningblok voor de pot-tests: 'Meerekenen' (de app-default) — géén opeethypotheek,
 * dus slot 3 blijft leeg. De opeet-tak van `buildSchuldPotten` heeft een eigen suite
 * (`opeethypotheek-pot.test.ts`).
 */
const WONING_MEEREKENEN = buildWoning({ mode: 'include_full' })

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

/** Deterministisch profiel (gepinde dob op 1 jan → vaste startleeftijd). */
function pinnedProfile(over: Partial<KernelAdapterProfile> = {}): KernelAdapterProfile {
  const dob = `${new Date().getFullYear() - 45}-01-01`
  return {
    date_of_birth: dob,
    net_monthly_income: 4000,
    estimated_monthly_expenses: 2500,
    expected_return: 0.07,
    inflation_rate: 0.02,
    box3_method: 'forfaitair',
    fire_end_strategy: 'deplete',
    fire_end_age: 90,
    ...over,
  }
}

const ALL_ASSET_TYPES: AssetType[] = [
  'cash', 'savings', 'investment', 'retirement', 'eigen_huis', 'real_estate', 'crypto',
  'vehicle', 'physical', 'deelneming', 'levensverzekering', 'vordering', 'other',
]
const ALL_DEBT_TYPES: DebtType[] = [
  'mortgage', 'personal_loan', 'student_loan', 'car_loan', 'credit_card', 'revolving_credit',
  'payment_plan', 'belastingschuld', 'familielening', 'dga_schuld', 'other',
]
const ASSET_CATEGORIEEN: AssetCategorie[] = [
  'Spaargeld', 'Beleggingen', 'Pensioen', 'Vastgoed', 'Eigen huis', 'Overig',
]
const DEBT_CATEGORIEEN: DebtCategorie[] = ['Woning', 'Consumptief', 'Studie', 'Zakelijk', 'Overig', 'Tekort']

// ── Totalen behouden (V6) ────────────────────────────────────────────────────────

describe('potten — totalen behouden (V6-schaling)', () => {
  it('Σ asset-startwaarde = Σ (current_value × inclusion_pct)', () => {
    const assets = [
      makeAsset({ id: 'a1', asset_type: 'savings', current_value: 100_000 }),
      makeAsset({ id: 'a2', asset_type: 'investment', current_value: 200_000, net_worth_inclusion_pct: 50 }),
      makeAsset({ id: 'a3', asset_type: 'eigen_huis', current_value: 400_000, net_worth_inclusion_pct: 100 }),
    ]
    const pots = buildAssetPotten(assets)
    const expected = 100_000 + 200_000 * 0.5 + 400_000
    const total = pots.reduce((s, p) => s + p.startwaarde, 0)
    expect(total).toBeCloseTo(expected, 6)
  })

  it('V6-schaling is exact per pot', () => {
    const [pot] = buildAssetPotten([
      makeAsset({ id: 'x', asset_type: 'investment', current_value: 100_000, net_worth_inclusion_pct: 50 }),
    ])
    expect(pot.startwaarde).toBe(50_000)
  })

  it('Σ schuld-startwaarde (ex tekort) = Σ (current_balance × inclusion_pct)', () => {
    const debts = [
      makeDebt({ id: 'd1', debt_type: 'personal_loan', current_balance: 10_000 }),
      makeDebt({ id: 'd2', debt_type: 'student_loan', current_balance: 20_000, net_worth_inclusion_pct: 80 }),
    ]
    const pots = buildSchuldPotten(debts, new Set(), EXCEL_TEKORT_LENING_RENTE, WONING_MEEREKENEN)
    const userDebtTotal = pots.filter((p) => p.rol !== 'tekortLening').reduce((s, p) => s + p.startwaarde, 0)
    expect(userDebtTotal).toBeCloseTo(10_000 + 20_000 * 0.8, 6)
  })
})

// ── Getypte rollen + slots ───────────────────────────────────────────────────────

describe('potten — getypte rollen bezet op het contract-slot', () => {
  const assets = [
    makeAsset({ id: 'cash', asset_type: 'savings', current_value: 50_000 }),
    makeAsset({ id: 'house', asset_type: 'eigen_huis', current_value: 400_000 }),
    makeAsset({ id: 'etf', asset_type: 'investment', current_value: 80_000 }),
  ]
  const debts = [
    makeDebt({ id: 'mortgage', debt_type: 'mortgage', current_balance: 250_000, linked_asset_id: 'house' }),
    makeDebt({ id: 'loan', debt_type: 'personal_loan', current_balance: 5_000 }),
  ]
  const eigenHuisIds = new Set(['house'])

  it('eigen huis → rol eigenHuis op slot 2', () => {
    const pots = buildAssetPotten(assets)
    const huis = pots.filter((p) => p.rol === 'eigenHuis')
    expect(huis).toHaveLength(1)
    expect(huis[0].slot).toBe(2)
    expect(huis[0].categorie).toBe('Eigen huis')
    expect(huis[0].box3Type).toBe('Geen Box 3')
  })

  it('gekoppelde hypotheek → rol hypotheek op slot 0', () => {
    const pots = buildSchuldPotten(debts, eigenHuisIds, EXCEL_TEKORT_LENING_RENTE, WONING_MEEREKENEN)
    const hyp = pots.filter((p) => p.rol === 'hypotheek')
    expect(hyp).toHaveLength(1)
    expect(hyp[0].slot).toBe(0)
  })

  it('tekort-lening bestaat altijd: rol tekortLening, slot 6, startsaldo 0, V7-rente', () => {
    const pots = buildSchuldPotten(debts, eigenHuisIds, EXCEL_TEKORT_LENING_RENTE, WONING_MEEREKENEN)
    const tekort = pots.filter((p) => p.rol === 'tekortLening')
    expect(tekort).toHaveLength(1)
    expect(tekort[0].slot).toBe(6)
    expect(tekort[0].startwaarde).toBe(0)
    expect(tekort[0].rente).toBe(EXCEL_TEKORT_LENING_RENTE)
    expect(tekort[0].categorie).toBe('Tekort')
  })

  it('reguliere schuld vermijdt de gereserveerde slots 0/3/6', () => {
    const pots = buildSchuldPotten(debts, eigenHuisIds, EXCEL_TEKORT_LENING_RENTE, WONING_MEEREKENEN)
    const loan = pots.find((p) => p.naam === 'personal_loan')
    expect(loan).toBeDefined()
    expect([1, 2, 4, 5]).toContain(loan!.slot)
  })
})

// ── Categorie-mapping totaal-dekkend ─────────────────────────────────────────────

describe('potten — categorie-mapping dekt elk type', () => {
  it('elk asset_type landt op een geldige bezittings-categorie', () => {
    for (const t of ALL_ASSET_TYPES) {
      const [pot] = buildAssetPotten([makeAsset({ id: t, asset_type: t, current_value: 1_000 })])
      expect(ASSET_CATEGORIEEN).toContain(pot.categorie)
    }
  })

  it('investering-vlag = true precies voor Beleggingen/Vastgoed', () => {
    for (const t of ALL_ASSET_TYPES) {
      const [pot] = buildAssetPotten([makeAsset({ id: t, asset_type: t, current_value: 1_000 })])
      const expected = pot.categorie === 'Beleggingen' || pot.categorie === 'Vastgoed'
      expect(pot.investering).toBe(expected)
    }
  })

  it('elk debt_type landt op een geldige schuld-categorie (nooit Tekort)', () => {
    for (const t of ALL_DEBT_TYPES) {
      const pots = buildSchuldPotten(
        [makeDebt({ id: t, debt_type: t, current_balance: 1_000 })],
        new Set(),
        EXCEL_TEKORT_LENING_RENTE,
        WONING_MEEREKENEN,
      )
      const userPot = pots.find((p) => p.rol !== 'tekortLening')!
      expect(DEBT_CATEGORIEEN).toContain(userPot.categorie)
      expect(userPot.categorie).not.toBe('Tekort')
    }
  })
})

// ── Dubbeltelling-guard: bens!H = !include_aflossing_in_savings (ADR 0020) ────────

describe('potten — inSparenNaAflossing is de INVERSE van include_aflossing_in_savings', () => {
  it('aflossing al in sparen (true) → geen payoff-vrijval (false)', () => {
    const d = makeDebt({ id: 'd', debt_type: 'mortgage', current_balance: 1000, include_aflossing_in_savings: true })
    expect(mapInSparenNaAflossing(d)).toBe(false)
    const [pot] = buildSchuldPotten([d], new Set(), EXCEL_TEKORT_LENING_RENTE, WONING_MEEREKENEN)
    expect(pot.inSparenNaAflossing).toBe(false)
  })

  it('aflossing als kost (false) → payoff-vrijval (true)', () => {
    const d = makeDebt({ id: 'd', debt_type: 'mortgage', current_balance: 1000, include_aflossing_in_savings: false })
    expect(mapInSparenNaAflossing(d)).toBe(true)
    const [pot] = buildSchuldPotten([d], new Set(), EXCEL_TEKORT_LENING_RENTE, WONING_MEEREKENEN)
    expect(pot.inSparenNaAflossing).toBe(true)
  })
})

// ── Onttrekkingsprofiel-mapping per withdrawal_strategy (V4) ──────────────────────

describe('params — onttrekkingsprofiel per withdrawal_strategy (V4)', () => {
  const cases: Array<[string, string]> = [
    ['static', 'Vast'],
    ['guardrails', 'Guardrails'],
    ['vpw', 'Vast'],
    ['bucket', 'Vast'],
  ]
  for (const [strategy, expected] of cases) {
    it(`${strategy} → ${expected}`, () => {
      const prof = pinnedProfile({ withdrawal_strategy: strategy })
      expect(buildOnttrekkingsprofiel(prof).profiel).toBe(expected)
    })
  }
})

// ── Determinisme + rooktest via solveFire ────────────────────────────────────────

describe('buildKernelInputFromApp — integraal', () => {
  const smallInput = {
    profile: pinnedProfile(),
    assets: [
      makeAsset({ id: 'sav', asset_type: 'savings', current_value: 60_000 }),
      makeAsset({ id: 'etf', asset_type: 'investment', current_value: 150_000, expected_return: 7 }),
      makeAsset({ id: 'house', asset_type: 'eigen_huis', current_value: 350_000, expected_return: 2 }),
    ],
    debts: [
      makeDebt({
        id: 'mort',
        debt_type: 'mortgage',
        current_balance: 200_000,
        linked_asset_id: 'house',
        interest_rate: 3.5,
        monthly_payment: 900,
        is_tax_deductible: true,
      }),
    ],
  }

  it('ontbrekende geboortedatum → duidelijke fout', () => {
    expect(() =>
      buildKernelInputFromApp({ ...smallInput, profile: { ...smallInput.profile, date_of_birth: null } }),
    ).toThrow(/date_of_birth/)
  })

  it('is deterministisch (zelfde invoer → zelfde KernelInput)', () => {
    const a = buildKernelInputFromApp(smallInput)
    const b = buildKernelInputFromApp(smallInput)
    expect(a).toStrictEqual(b)
  })

  it('produceert een tekort-lening-pot en een eigen-huis-pot', () => {
    const input = buildKernelInputFromApp(smallInput)
    expect(input.schuldPotten.some((p) => p.rol === 'tekortLening')).toBe(true)
    expect(input.assetPotten.some((p) => p.rol === 'eigenHuis')).toBe(true)
    // Σ asset-startwaarde behouden.
    const totalAssets = input.assetPotten.reduce((s, p) => s + p.startwaarde, 0)
    expect(totalAssets).toBeCloseTo(60_000 + 150_000 + 350_000, 6)
  })

  it('een gebouwde KernelInput loopt door solveFire zonder throw (rooktest)', () => {
    const input = buildKernelInputFromApp(smallInput)
    const result = solveFire(input)
    expect(result).toBeDefined()
    expect(Number.isFinite(result.fireAge)).toBe(true)
    expect(typeof result.status).toBe('string')
  })

  // ── F6 — reproduceerbare runs: expliciete asOf pint de peildatum ────────────────
  //
  // Bewijst dat een gepinde `asOf` de run byte-identiek maakt (reproduceerbaar), dat de
  // peildatum écht doorwerkt op de tijdas (andere asOf → andere startleeftijd) en dat
  // `asOf` weglaten het oude, impliciete `new Date()`-gedrag behoudt (geen regressie).
  describe('asOf — reproduceerbaarheid (Arch F6)', () => {
    // Vaste dob (NIET gepind op "nu"), zodat de asOf de startleeftijd bepaalt.
    const fixedDob = '1980-06-15'
    const asOfInput = { ...smallInput, profile: { ...smallInput.profile, date_of_birth: fixedDob } }
    // Lokale-tijd-constructie (jaar, maandindex, dag) → geen TZ-drift op de datumgrens.
    const asOf2026 = new Date(2026, 0, 1)
    const asOf2030 = new Date(2030, 0, 1)

    it('twee runs met dezelfde vaste asOf → byte-identieke KernelInput', () => {
      const a = buildKernelInputFromApp({ ...asOfInput, asOf: asOf2026 })
      const b = buildKernelInputFromApp({ ...asOfInput, asOf: asOf2026 })
      expect(a).toStrictEqual(b)
    })

    it('twee runs met dezelfde vaste asOf → byte-identiek kernel-resultaat', () => {
      const params = { adapterInput: { ...asOfInput, asOf: asOf2026 }, yearlyExpenses: 30_000 }
      const a = runKernelUnified(params)
      const b = runKernelUnified(params)
      expect(a.result).toStrictEqual(b.result)
    })

    it('asOf werkt écht door de tijdas: 4 jaar later → startLeeftijd +4', () => {
      const a = buildKernelInputFromApp({ ...asOfInput, asOf: asOf2026 })
      const b = buildKernelInputFromApp({ ...asOfInput, asOf: asOf2030 })
      expect(b.startLeeftijd).toBe(a.startLeeftijd + 4)
      // startjaar schuift exact mee (startjaar = geboortejaar + startLeeftijd).
      expect(b.persoon.startjaar).toBe(a.persoon.startjaar + 4)
    })

    it('asOf weglaten = expliciete nu (geen regressie t.o.v. impliciete new Date())', () => {
      const now = new Date()
      const withDefault = buildKernelInputFromApp(asOfInput)
      const withExplicitNow = buildKernelInputFromApp({ ...asOfInput, asOf: now })
      expect(withDefault.startLeeftijd).toBe(withExplicitNow.startLeeftijd)
      expect(withDefault.persoon).toStrictEqual(withExplicitNow.persoon)
    })
  })

  it('rooktest met een realistisch persona-profiel loopt door solveFire', () => {
    const fx = buildCompleetHorizonFixture()
    // Persona kan meer schulden dan de 7 fysieke schuldslots hebben (bekende cap,
    // open punt); we beperken de rooktest tot binnen de capaciteit zodat solveFire
    // een schone run doet. De totalen-eigenschap hieronder geldt op de pot-array zelf.
    const debts = fx.debts.slice(0, 4)
    const input = buildKernelInputFromApp({
      profile: {
        date_of_birth: fx.financialInput.dateOfBirth,
        net_monthly_income: fx.financialInput.monthlyIncome,
        estimated_monthly_expenses: fx.financialInput.monthlyExpenses,
        expected_return: fx.grossReturn,
        inflation_rate: fx.inflation,
        box3_method: fx.box3Method,
      },
      assets: fx.assets,
      debts,
    })
    // Totalen behouden op de pot-array (slot-cap-onafhankelijk).
    const totalAssets = input.assetPotten.reduce((s, p) => s + p.startwaarde, 0)
    const expectedAssets = fx.assets
      .filter((a) => a.is_active !== false)
      .reduce((s, a) => s + a.current_value * (Number(a.net_worth_inclusion_pct ?? 100) / 100), 0)
    expect(totalAssets).toBeCloseTo(expectedAssets, 4)

    const result = solveFire(input)
    expect(Number.isFinite(result.fireAge)).toBe(true)
  })
})
