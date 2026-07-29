/**
 * Horizon-kernel adapter — huishouden/partner-laag eigenschaps-tests (FASE 3, snede 3, V3).
 *
 * Buiten het Excel-parity-domein: geen fixtures (de `gezin`/`partner-aan`-fixtures dekken
 * de kern-PT-kant al). We asserteren de invariante mapping-eigenschappen van de partner-
 * laag:
 *  - `buildPartnerParams` mapt de profiel-velden op de juiste PT-cellen + notices;
 *  - partner aanwezig → `personen = 2`, `leefsituatie = 'Samenwonend'`, PT-blok gevuld;
 *  - zonder partner is de kern-invoer **byte-identiek** aan snede 2b (inertie-diff-test);
 *  - `buildPerspectiefInputs` splitst potten/inkomens zonder dubbeltelling (som van de
 *    perspectieven = huishouden-som), en huishouden- én beide perspectief-runs draaien
 *    door `solveFire` zonder throw.
 */

import { describe, it, expect } from 'vitest'
import type { Asset, AssetType } from '@/lib/asset-data'
import type { Debt, DebtType } from '@/lib/debt-data'
import type { LifeEvent } from '@/lib/horizon-data'
import { solveFire } from '../index'
import {
  buildKernelInputFromApp,
  buildKernelInputFromAppWithNotices,
  buildPartnerParams,
  buildPerspectiefInputs,
  type KernelAdapterInput,
  type KernelAdapterPartner,
  type KernelAdapterProfile,
} from './index'
import { NEUTRAL_PARTNER } from './params'
import { AOW_SAMENWONEND_PP_PER_MAAND, EXCEL_HEFFINGVRIJ_INKOMEN_PP } from './defaults'

// ── Factories (volledige DB-shape, overschrijfbaar) ──────────────────────────────

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
  }
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
  }
}

function makeEvent(p: Partial<LifeEvent> & { id: string; event_type: string }): LifeEvent {
  return {
    name: p.event_type, target_age: 67, target_date: null, one_time_cost: 0, monthly_cost_change: 0,
    monthly_income_change: 0, duration_months: 0, icon: '', is_active: true, sort_order: 0,
    is_indexed: true, metadata: {}, ...p,
  }
}

/** Deterministisch hoofd-profiel (gepinde dob → vaste startleeftijd, los van "vandaag"). */
function pinnedProfile(over: Partial<KernelAdapterProfile> = {}): KernelAdapterProfile {
  return {
    date_of_birth: `${new Date().getFullYear() - 45}-01-01`,
    net_monthly_income: 4000, estimated_monthly_expenses: 2500,
    expected_return: 0.07, inflation_rate: 0.02, box3_method: 'forfaitair',
    fire_end_strategy: 'deplete', fire_end_age: 90, ...over,
  }
}

/** Partner-profiel: 3 jaar jonger, eigen inkomen. */
function partnerProfile(over: Partial<KernelAdapterProfile> = {}): KernelAdapterProfile {
  return pinnedProfile({
    date_of_birth: `${new Date().getFullYear() - 42}-01-01`,
    net_monthly_income: 3000, estimated_monthly_expenses: 2000, ...over,
  })
}

const PARTNER: KernelAdapterPartner = { profile: partnerProfile() }

// ── buildPartnerParams (PT!B2-B9) ────────────────────────────────────────────────

describe('buildPartnerParams — profiel → PT-cellen', () => {
  it('mapt aanwezig/geboortejaar/inkomen/AOW-leeftijd + samenwonend-AOW p.p.', () => {
    const { partner, notices } = buildPartnerParams(PARTNER, [])
    expect(partner.aanwezig).toBe(true)
    expect(partner.geboortejaar).toBe(new Date().getFullYear() - 42)
    expect(partner.nettoJaarinkomen).toBe(3000 * 12)
    expect(partner.aowLeeftijd).toBe(67) // fallback (geen aow-tabel)
    // PT!B9 — samenwonend-tarief p.p./jaar, consistent met de kern-B21-basis.
    expect(partner.aowBedragPpPerJaar).toBe(AOW_SAMENWONEND_PP_PER_MAAND * 12)
    // Partner-pensioen onbekend → inert 0 + notices.
    expect(partner.pensioenBrutoPerJaar).toBe(0)
    expect(notices.length).toBeGreaterThanOrEqual(1)
    expect(notices.every((n) => n.kind === 'info')).toBe(true)
  })

  it('ontbrekende partner-geboortedatum → duidelijke fout', () => {
    expect(() =>
      buildPartnerParams({ profile: partnerProfile({ date_of_birth: null }) }, []),
    ).toThrow(/date_of_birth/)
  })
})

// ── Huishouden-run: koppelingen (personen=2, leefsituatie, PT-blok) ───────────────

describe('buildKernelInputFromApp — partner-koppelingen', () => {
  const base = {
    profile: pinnedProfile(),
    assets: [makeAsset({ id: 'sav', asset_type: 'savings', current_value: 80_000 })],
    debts: [] as Debt[],
  }

  it('partner aanwezig → personen=2, leefsituatie Samenwonend, PT-blok gevuld', () => {
    const input = buildKernelInputFromApp({ ...base, partner: PARTNER })
    expect(input.box3.personen).toBe(2)
    // heffingvrij inkomen (P!B92) verdubbelt; vermogen/schuldendrempel schaalt de kern zelf.
    expect(input.box3.heffingvrijInkomenTotaal).toBe(EXCEL_HEFFINGVRIJ_INKOMEN_PP * 2)
    expect(input.autoGebeurtenissen.leefsituatie).toBe('Samenwonend')
    expect(input.partner.aanwezig).toBe(true)
    expect(input.partner.nettoJaarinkomen).toBe(3000 * 12)
  })

  it('partner-aanwezigheid overrulet een AOW-event dat "alleenstaand" zegt', () => {
    const aow = makeEvent({ id: 'aow', event_type: 'aow', target_age: 67, metadata: { leefsituatie: 'alleenstaand' } })
    const input = buildKernelInputFromApp({ ...base, lifeEvents: [aow], partner: PARTNER })
    expect(input.autoGebeurtenissen.leefsituatie).toBe('Samenwonend')
  })

  it('partner-notices vloeien mee in het resultaat', () => {
    const { notices } = buildKernelInputFromAppWithNotices({ ...base, partner: PARTNER })
    expect(notices.some((n) => /pensioen/i.test(n.message))).toBe(true)
  })
})

// ── Byte-inertie: zonder partner identiek aan snede 2b ────────────────────────────

describe('buildKernelInputFromApp — zonder partner byte-identiek (inertie-diff-test)', () => {
  const base = {
    profile: pinnedProfile(),
    assets: [
      makeAsset({ id: 'sav', asset_type: 'savings', current_value: 60_000 }),
      makeAsset({ id: 'etf', asset_type: 'investment', current_value: 120_000, expected_return: 7 }),
    ],
    debts: [makeDebt({ id: 'loan', debt_type: 'personal_loan', current_balance: 8_000 })],
  }

  it('geen partner → partner = NEUTRAL_PARTNER, personen=1', () => {
    const input = buildKernelInputFromApp(base)
    expect(input.partner).toStrictEqual(NEUTRAL_PARTNER)
    expect(input.box3.personen).toBe(1)
    expect(input.box3.heffingvrijInkomenTotaal).toBe(EXCEL_HEFFINGVRIJ_INKOMEN_PP)
  })

  it('partner: undefined == partner weggelaten (strict-equal)', () => {
    expect(buildKernelInputFromApp({ ...base, partner: undefined })).toStrictEqual(
      buildKernelInputFromApp(base),
    )
  })

  it('de partner-run wijkt UITSLUITEND af in box3/autoGebeurtenissen/partner', () => {
    const solo = buildKernelInputFromApp(base)
    const huis = buildKernelInputFromApp({ ...base, partner: PARTNER })
    // Vervang de drie partner-gekoppelde velden door de solo-versie: als de rest van de
    // KernelInput dan byte-identiek is, raakt de partner-laag niets anders aan.
    expect({
      ...huis,
      box3: solo.box3,
      autoGebeurtenissen: solo.autoGebeurtenissen,
      partner: solo.partner,
    }).toStrictEqual(solo)
  })
})

// ── buildPerspectiefInputs: splitsing zonder dubbeltelling ────────────────────────

describe('buildPerspectiefInputs — potten/inkomens naar eigenaar', () => {
  // Huishouden-potten: hoofd-persoonlijk + partner-persoonlijk + gedeeld (huis + spaar).
  const assets: Asset[] = [
    makeAsset({ id: 'h-sav', asset_type: 'savings', current_value: 50_000, user_id: 'hoofd', ownership: 'personal' }),
    makeAsset({ id: 'p-etf', asset_type: 'investment', current_value: 90_000, user_id: 'partner', ownership: 'personal', expected_return: 7 }),
    makeAsset({ id: 's-house', asset_type: 'eigen_huis', current_value: 400_000, ownership: 'shared', user_id: 'hoofd', expected_return: 2 }),
    makeAsset({ id: 's-sav', asset_type: 'savings', current_value: 20_000, ownership: 'shared', user_id: 'partner' }),
  ]
  const debts: Debt[] = [
    makeDebt({ id: 'h-loan', debt_type: 'personal_loan', current_balance: 6_000, user_id: 'hoofd', ownership: 'personal' }),
    makeDebt({ id: 's-mort', debt_type: 'mortgage', current_balance: 240_000, ownership: 'shared', user_id: 'hoofd', linked_asset_id: 's-house', interest_rate: 3.5, monthly_payment: 950 }),
  ]

  const household: KernelAdapterInput = {
    profile: pinnedProfile(), assets, debts, partner: PARTNER,
  }
  const split = { hoofdUserId: 'hoofd', partnerUserId: 'partner', gedeeldAandeelHoofd: 0.6 }

  it('persoonlijke potten landen bij precies één perspectief', () => {
    const { hoofd, partner } = buildPerspectiefInputs(household, split)
    // hoofd houdt z'n eigen persoonlijke + géén partner-persoonlijke.
    expect(hoofd.assets.map((a) => a.id).sort()).toStrictEqual(['h-sav', 's-house', 's-sav'])
    expect(partner.assets.map((a) => a.id).sort()).toStrictEqual(['p-etf', 's-house', 's-sav'])
    expect(hoofd.debts.map((d) => d.id).sort()).toStrictEqual(['h-loan', 's-mort'])
    expect(partner.debts.map((d) => d.id).sort()).toStrictEqual(['s-mort'])
  })

  it('gedeelde potten splitsen naar aandeel; som = huishouden-som (geen dubbeltelling)', () => {
    const { hoofd, partner, gecombineerd } = buildPerspectiefInputs(household, split)
    const potSom = (inp: KernelAdapterInput) =>
      buildKernelInputFromApp(inp).assetPotten.reduce((s, p) => s + p.startwaarde, 0)
    const huishoudenSom = potSom(gecombineerd)
    expect(potSom(hoofd) + potSom(partner)).toBeCloseTo(huishoudenSom, 4)
    // Concreet: het gedeelde huis splitst 60/40.
    const huisH = buildKernelInputFromApp(hoofd).assetPotten.find((p) => p.rol === 'eigenHuis')!
    const huisP = buildKernelInputFromApp(partner).assetPotten.find((p) => p.rol === 'eigenHuis')!
    expect(huisH.startwaarde).toBeCloseTo(400_000 * 0.6, 6)
    expect(huisP.startwaarde).toBeCloseTo(400_000 * 0.4, 6)
  })

  it('gedeelde schuld-som over beide perspectieven = volledige gedeelde schuld', () => {
    const { hoofd, partner } = buildPerspectiefInputs(household, split)
    const debtSom = (inp: KernelAdapterInput) =>
      buildKernelInputFromApp(inp).schuldPotten
        .filter((p) => p.rol !== 'tekortLening')
        .reduce((s, p) => s + p.startwaarde, 0)
    // hoofd: eigen 6.000 + 60% van 240.000 hypotheek; partner: 40% van 240.000.
    expect(debtSom(hoofd) + debtSom(partner)).toBeCloseTo(6_000 + 240_000, 4)
  })

  it('perspectief-runs zijn solo (geen partner-blok, personen=1)', () => {
    const { hoofd, partner } = buildPerspectiefInputs(household, split)
    expect(hoofd.partner).toBeUndefined()
    expect(partner.partner).toBeUndefined()
    expect(buildKernelInputFromApp(hoofd).box3.personen).toBe(1)
    expect(buildKernelInputFromApp(partner).box3.personen).toBe(1)
  })

  it('default-aandeel = 50/50 wanneer niet opgegeven', () => {
    const { hoofd } = buildPerspectiefInputs(household, { hoofdUserId: 'hoofd', partnerUserId: 'partner' })
    const huisH = buildKernelInputFromApp(hoofd).assetPotten.find((p) => p.rol === 'eigenHuis')!
    expect(huisH.startwaarde).toBeCloseTo(400_000 * 0.5, 6)
  })

  it('geen partner-blok → duidelijke fout', () => {
    expect(() =>
      buildPerspectiefInputs({ profile: pinnedProfile(), assets: [], debts: [] }, split),
    ).toThrow(/partner-blok/)
  })

  it('rooktest: huishouden-run én beide perspectief-runs lopen door solveFire', () => {
    const { hoofd, partner, gecombineerd } = buildPerspectiefInputs(household, split)
    for (const inp of [gecombineerd, hoofd, partner]) {
      const result = solveFire(buildKernelInputFromApp(inp))
      expect(Number.isFinite(result.fireAge)).toBe(true)
      expect(typeof result.status).toBe('string')
    }
  })
})
