/**
 * TPR-07 (13 sep 2026) — één grondslag voor de hoofdgrafiek en de huishoud-FIRE-sectie.
 *
 * Tot TPR-07 gaf `buildConvergentieAdapterInput` geen partnerblok mee: in huishoud-
 * perspectief draaide de canonieke run een SOLO-kernel op de gecombineerde potten (Box 3
 * heffingvrij ×1, geen partner-inkomen/-AOW), terwijl `household-router.ts` de PT-laag wél
 * draaide. Deze suite vergrendelt:
 *
 *  1. SOLO BLIJFT BYTE-IDENTIEK — zonder `partner` op de context verschijnt er geen
 *     `partner`-sleutel op de adapter-invoer en rekent de kern met personen = 1 (de
 *     oracle-parity-suites dekken de kern-kant; dit pint de router-kant).
 *  2. MET PARTNERBLOK draait de kern als huishouden (personen = 2, Samenwonend).
 *  3. GELIJKE GRONDSLAG — voor hetzelfde testhuishouden geeft de convergentie-route mét
 *     partnerblok EXACT dezelfde KernelInput én dezelfde FIRE-leeftijd/doelbedrag/rijen als
 *     de gecombineerde run van `computeHouseholdProjection`. Tolerantie: ABSOLUUT 0
 *     (`toBe`/`toEqual`) — het is dezelfde motor op dezelfde invoer, dus elk verschil is
 *     een grondslagverschil en geen afrondingsruis.
 */

import { describe, it, expect } from 'vitest'
import { computePartnerHead } from './tables/pt'
import type { Asset, AssetType } from '@/lib/asset-data'
import type { Debt, DebtType } from '@/lib/debt-data'
import { buildKernelInputFromApp, type KernelAdapterProfile } from '@/lib/horizon-kernel/adapter'
import { buildKernelPartnerBlok } from '@/lib/horizon-kernel/adapter/partner-blok'
import {
  buildConvergentieAdapterInput,
  computeConvergentieProjection,
  type ConvergentieRawContext,
  type ConvergentieRawProfileRow,
} from './convergentie-router'
import { computeHouseholdProjection, type HouseholdKernelRawContext } from './household-router'
import { buildForcedStopSolve, solveWithoutAnchor } from '@/lib/horizon/scenario-presets'

// ── Factories — spiegelen household-router.test.ts (volledige DB-shape) ──────────────

function makeAsset(p: Partial<Asset> & { id: string; asset_type: AssetType; current_value: number }): Asset {
  return {
    user_id: 'hoofd', name: p.asset_type, purchase_value: 0, purchase_date: null, expected_return: 5,
    monthly_contribution: 0, institution: null, account_number: null, notes: null, is_active: true,
    sort_order: 0, created_at: '2026-01-01', updated_at: '2026-01-01', subtype: null, risk_profile: null,
    tax_benefit: null, is_liquid: null, lock_end_date: null, ticker_symbol: null, rental_income: null,
    woz_value: null, retirement_provider_type: null, depreciation_rate: null, address_postcode: null,
    address_house_number: null, expiry_date: null, beneficiary: null, kvk_number: null,
    ownership_percentage: null, annual_dividend: null, linked_asset_id: null, ownership: 'personal',
    household_id: null, net_worth_inclusion_pct: 100, has_budget_tracking: false, has_holdings_tracking: false,
    has_woonbalans_tracking: false, has_rental_tracking: false, monthly_maintenance_cost: 0, vva_fee: 0,
    vacancy_log: [], ...p,
  } as Asset
}

function makeDebt(p: Partial<Debt> & { id: string; debt_type: DebtType; current_balance: number }): Debt {
  return {
    user_id: 'hoofd', name: p.debt_type, original_amount: p.current_balance ?? 0, interest_rate: 3,
    minimum_payment: 0, monthly_payment: 0, start_date: '2020-01-01', end_date: null, creditor: null,
    notes: null, is_active: true, sort_order: 0, created_at: '2026-01-01', updated_at: '2026-01-01',
    subtype: null, is_tax_deductible: null, fixed_rate_end_date: null, nhg: null, linked_asset_id: null,
    credit_limit: null, repayment_type: 'annuiteit', draagkrachtmeting_date: null, tax_year: null,
    has_payment_plan: false, has_written_agreement: false, ownership: 'personal', household_id: null,
    partner_split_pct: null, net_worth_inclusion_pct: 100, include_aflossing_in_savings: false,
    custom_aflossing_amount: null, has_hypotheekplanner_tracking: false, ...p,
  } as Debt
}

const JAAR = new Date().getFullYear()

function profile(over: Partial<KernelAdapterProfile> = {}): KernelAdapterProfile {
  return {
    date_of_birth: `${JAAR - 45}-01-01`,
    net_monthly_income: 4000, estimated_monthly_expenses: 2500,
    expected_return: 0.07, inflation_rate: 0.02, box3_method: 'forfaitair',
    fire_end_strategy: 'deplete', fire_end_age: 90, ...over,
  }
}

const ASSETS: Asset[] = [
  makeAsset({ id: 'h-sav', asset_type: 'savings', current_value: 60_000, user_id: 'hoofd', ownership: 'personal' }),
  makeAsset({ id: 'p-etf', asset_type: 'investment', current_value: 90_000, user_id: 'partner', ownership: 'personal', expected_return: 7 }),
  makeAsset({ id: 's-house', asset_type: 'eigen_huis', current_value: 400_000, ownership: 'shared', user_id: 'hoofd', expected_return: 2 }),
  makeAsset({ id: 's-sav', asset_type: 'savings', current_value: 20_000, ownership: 'shared', user_id: 'partner' }),
]
const DEBTS: Debt[] = [
  makeDebt({ id: 's-mort', debt_type: 'mortgage', current_balance: 240_000, ownership: 'shared', user_id: 'hoofd', linked_asset_id: 's-house', interest_rate: 3.5, monthly_payment: 950 }),
]

const HEAD = profile()
const PARTNER = profile({ date_of_birth: `${JAAR - 42}-01-01`, net_monthly_income: 3000 })
const COMBINED_YEARLY = 42_000

/** De huishoud-sectie-context (household-router) voor hetzelfde testhuishouden. */
function householdContext(): HouseholdKernelRawContext {
  return {
    head: { userId: 'hoofd', profile: HEAD, lifeEvents: [], yearlyExpenses: 30_000 },
    partner: { userId: 'partner', profile: PARTNER, lifeEvents: [], yearlyExpenses: 24_000 },
    assets: ASSETS,
    debts: DEBTS,
    combinedLifeEvents: [],
    gedeeldAandeelHoofd: 0.6,
    combinedYearlyExpenses: COMBINED_YEARLY,
  }
}

/**
 * De hoofdgrafiek-context (convergentie-router) op DEZELFDE grondslag als de sectie: het
 * head-profiel met de huishoud-brede uitgave via `essential_budgets` (zoals
 * `household-router#withPostRetirementExpense`), de gecombineerde potten en het
 * partnerblok uit dezelfde helper.
 */
function convergentieContext(withPartner: boolean): ConvergentieRawContext {
  const row: ConvergentieRawProfileRow = {
    ...HEAD,
    retirement_expense_custom_amount: HEAD.retirement_custom_amount ?? null,
    retirement_expense_method: 'essential_budgets',
    yearly_essential_expenses: COMBINED_YEARLY,
  }
  const partner = buildKernelPartnerBlok({ profile: PARTNER, lifeEvents: [] })
  return {
    profile: row,
    assets: ASSETS,
    debts: DEBTS,
    lifeEvents: [],
    yearlyExpenses: COMBINED_YEARLY,
    ...(withPartner && partner ? { partner } : {}),
  }
}

/**
 * 20 sep 2026 — de uitgave na pensioen verlaat de kernel-keten als scalar, zodat het
 * `retirement_expense`-doel zich aan het plan-getal kan meten. DE ANTI-DRIFT-EIS: wat de
 * router doorgeeft moet EXACT de waarde zijn die de kernel zelf gebruikte. Zodra iemand
 * hem ergens opnieuw samenstelt (uit budgetten, uit inkomen) valt deze test om.
 */
describe('computeConvergentieProjection — uitgaveNaPensioenPerJaar reist mee (consume, don\'t recompute)', () => {
  it('is byte-identiek aan `KernelInput.inkomenUitgaven.uitgaveNaPensioenPerJaar` van dezelfde invoer', () => {
    const ctx = convergentieContext(false)
    const verwacht = buildKernelInputFromApp(buildConvergentieAdapterInput(ctx)).inkomenUitgaven
      .uitgaveNaPensioenPerJaar

    const outcome = computeConvergentieProjection({ rawContext: ctx })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    // Absolute gelijkheid: dezelfde adapter op dezelfde rij, dus elk verschil is drift.
    expect(outcome.uitgaveNaPensioenPerJaar).toBe(verwacht)
    // En het is een echt bedrag, geen 0-placeholder (deze fixture heeft een grondslag).
    expect(outcome.uitgaveNaPensioenPerJaar).toBeGreaterThan(0)
  })

  it('volgt de grondslagkeuze van het profiel (eigen bedrag wint van de essentiële budgetten)', () => {
    const basis = convergentieContext(false)
    const eigenBedrag: ConvergentieRawContext = {
      ...basis,
      profile: {
        ...basis.profile,
        retirement_expense_method: 'custom_amount',
        retirement_expense_custom_amount: 27_500,
      },
    }
    const outcome = computeConvergentieProjection({ rawContext: eigenBedrag })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.uitgaveNaPensioenPerJaar).toBe(27_500)
  })
})

describe('buildConvergentieAdapterInput — partnerblok (TPR-07)', () => {
  it('solo: géén `partner`-sleutel op de adapter-invoer, kern rekent met personen = 1', () => {
    const adapterInput = buildConvergentieAdapterInput(convergentieContext(false))
    expect('partner' in adapterInput).toBe(false)
    const input = buildKernelInputFromApp(adapterInput)
    expect(input.box3.personen).toBe(1)
    expect(input.partner.aanwezig).toBe(false)
  })

  it('mét partnerblok: huishouden-run — personen = 2, Samenwonend, partner-inkomen op de PT-laag', () => {
    const adapterInput = buildConvergentieAdapterInput(convergentieContext(true))
    expect(adapterInput.partner?.profile).toBe(PARTNER)
    const input = buildKernelInputFromApp(adapterInput)
    expect(input.box3.personen).toBe(2)
    expect(input.autoGebeurtenissen.leefsituatie).toBe('Samenwonend')
    expect(input.partner.aanwezig).toBe(true)
    expect(input.partner.nettoJaarinkomen).toBe(3000 * 12)
  })
})

/**
 * SPIEGELFIXTURE (TPR-07 fase 2a): de kijker is de JONGSTE (42) en de partner de oudste (45).
 * Head = de kijker, óók dan — de PT-laag is as-agnostisch (een oudere partner geeft
 * PT!B10 < 0 en een AOW-drempel eerder op de as). Zonder deze fixture was "head = kijker"
 * per constructie onzichtbaar: de hoofdfixture zet de kijker ouder dan de partner.
 */
const HEAD_JONG = profile({ date_of_birth: `${JAAR - 42}-01-01` })
const PARTNER_OUD = profile({ date_of_birth: `${JAAR - 45}-01-01`, net_monthly_income: 3000 })

function householdContextSpiegel(): HouseholdKernelRawContext {
  return {
    ...householdContext(),
    head: { userId: 'hoofd', profile: HEAD_JONG, lifeEvents: [], yearlyExpenses: 30_000 },
    partner: { userId: 'partner', profile: PARTNER_OUD, lifeEvents: [], yearlyExpenses: 24_000 },
  }
}

function convergentieContextSpiegel(): ConvergentieRawContext {
  const row: ConvergentieRawProfileRow = {
    ...HEAD_JONG,
    retirement_expense_custom_amount: HEAD_JONG.retirement_custom_amount ?? null,
    retirement_expense_method: 'essential_budgets',
    yearly_essential_expenses: COMBINED_YEARLY,
  }
  const partner = buildKernelPartnerBlok({ profile: PARTNER_OUD, lifeEvents: [] })
  return { profile: row, assets: ASSETS, debts: DEBTS, lifeEvents: [], yearlyExpenses: COMBINED_YEARLY, ...(partner ? { partner } : {}) }
}

describe('TPR-07 fase 2a — head = de kijker, óók als de kijker de jongste is (spiegelfixture)', () => {
  it('de kern accepteert een oudere partner: PT!B10 > 0 en de partner-AOW-drempel ligt vóór de eigen AOW', () => {
    const input = buildKernelInputFromApp(buildConvergentieAdapterInput(convergentieContextSpiegel()))
    expect(input.startLeeftijd).toBe(42)
    expect(input.partner.aanwezig).toBe(true)
    // Partner is 3 jaar ouder ⇒ PT!B10 = (head-geboortejaar − partner-geboortejaar)·12 = +36
    // (de hoofdfixture, kijker ouder, geeft −36); AOW-drempel = (partnerAOW − 45)·12.
    const head = computePartnerHead(input)
    expect(head.dobVerschilMnd).toBe(36)
    expect(head.aowStartMaand).toBe(Math.round((input.partner.aowLeeftijd - 45) * 12))
    expect(head.aowStartMaand).toBeLessThan(Math.round((input.partner.aowLeeftijd - 42) * 12))
  })

  it('hoofdgrafiek ≡ sectie op de kijker-as (absolute gelijkheid) en de bridge draagt partnerAowAge op die as', () => {
    const sectie = computeHouseholdProjection({ rawContext: householdContextSpiegel() })
    expect(sectie.ok).toBe(true)
    if (!sectie.ok) return
    const grafiek = computeConvergentieProjection({ rawContext: convergentieContextSpiegel() })
    expect(grafiek.ok).toBe(true)
    if (!grafiek.ok) return
    expect(grafiek.result.fireAgeFractional).toBe(sectie.combined.fireAgeFractional)
    expect(grafiek.result.rows).toEqual(sectie.combined.rows)
    // Partner-AOW op de as van de kijker = 42 + PT!B11/12 — en dat is vóór de eigen AOW-leeftijd.
    const input = buildKernelInputFromApp(buildConvergentieAdapterInput(convergentieContextSpiegel()))
    const verwacht = 42 + computePartnerHead(input).aowStartMaand / 12
    expect(grafiek.result.partnerAowAge).toBe(verwacht)
    expect(sectie.combined.partnerAowAge).toBe(verwacht)
    expect(verwacht).toBeLessThan(input.partner.aowLeeftijd)
  })

  it('solo (zonder partnerblok) draagt géén partnerAowAge', () => {
    const grafiek = computeConvergentieProjection({ rawContext: convergentieContext(false) })
    expect(grafiek.ok).toBe(true)
    if (!grafiek.ok) return
    expect(grafiek.result.partnerAowAge).toBeNull()
  })
})

describe('één grondslag: hoofdgrafiek (convergentie) ≡ huishoud-sectie (household-router)', () => {
  it('dezelfde KernelInput als de gecombineerde run van de sectie (absoluut gelijk)', () => {
    const viaConvergentie = buildKernelInputFromApp(buildConvergentieAdapterInput(convergentieContext(true)))
    // De sectie-invoer: exact wat household-router aan runKernelUnified geeft.
    const sectieProfile: KernelAdapterProfile = {
      ...HEAD,
      retirement_expense_method: 'essential_budgets',
      yearly_essential_expenses: COMBINED_YEARLY,
    }
    const viaSectie = buildKernelInputFromApp({
      profile: sectieProfile,
      assets: ASSETS,
      debts: DEBTS,
      lifeEvents: [],
      partner: buildKernelPartnerBlok({ profile: PARTNER, lifeEvents: [] })!,
    })
    expect(viaConvergentie).toEqual(viaSectie)
  })

  it('dezelfde FIRE-leeftijd, hetzelfde doelbedrag en dezelfde rijen voor het testhuishouden', () => {
    const sectie = computeHouseholdProjection({ rawContext: householdContext() })
    expect(sectie.ok).toBe(true)
    if (!sectie.ok) return

    const grafiek = computeConvergentieProjection({ rawContext: convergentieContext(true) })
    expect(grafiek.ok).toBe(true)
    if (!grafiek.ok) return

    // Absolute gelijkheid: zelfde motor, zelfde invoer ⇒ geen tolerantie te motiveren.
    expect(grafiek.result.fireAgeFractional).toBe(sectie.combined.fireAgeFractional)
    expect(grafiek.result.requiredFirePortfolio).toBe(sectie.combined.requiredFirePortfolio)
    expect(grafiek.result.rows).toEqual(sectie.combined.rows)
    expect(grafiek.kernelStatus).toBe(sectie.combined.kernelStatus)
  })

  it('de runway-kop en "vrij vanaf" erven het partnerblok van dezelfde context (één laag lager geen tweede grondslag)', () => {
    const ctx = convergentieContext(true)
    const forced = buildForcedStopSolve({
      profile: ctx.profile, assets: ctx.assets, debts: ctx.debts, lifeEvents: ctx.lifeEvents,
      aowRows: ctx.aowRows, partner: ctx.partner, yearlyExpenses: ctx.yearlyExpenses,
      stopAge: 'nu', endStrategy: 'inherit',
    })
    expect(forced.kernelInput.box3.personen).toBe(2)
    expect(forced.kernelInput.partner.aanwezig).toBe(true)

    const solo = buildForcedStopSolve({
      profile: ctx.profile, assets: ctx.assets, debts: ctx.debts, lifeEvents: ctx.lifeEvents,
      aowRows: ctx.aowRows, yearlyExpenses: ctx.yearlyExpenses, stopAge: 'nu', endStrategy: 'inherit',
    })
    expect(solo.kernelInput.box3.personen).toBe(1)

    // solveWithoutAnchor bouwt dezelfde adapter-invoer; zonder vast anker levert hij null
    // (dan ís de hoofdrun de opgeloste run) — de toets hier is dat het blok geen throw geeft.
    expect(solveWithoutAnchor({ ...ctx, partner: ctx.partner })).toBeNull()
  })

  it('zónder partnerblok wijkt de hoofdgrafiek van de sectie af — het defect dat TPR-07 sluit', () => {
    const sectie = computeHouseholdProjection({ rawContext: householdContext() })
    const solo = computeConvergentieProjection({ rawContext: convergentieContext(false) })
    expect(sectie.ok && solo.ok).toBe(true)
    if (!sectie.ok || !solo.ok) return
    // Zonder PT-laag ontbreekt het partner-inkomen (en de fiscale verdubbeling): een
    // andere kasstroom, dus een ander pad. Byte-gelijkheid zou hier juist een bug zijn.
    expect(solo.result.rows).not.toEqual(sectie.combined.rows)
  })
})
