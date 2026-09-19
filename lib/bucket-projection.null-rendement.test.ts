// lib/bucket-projection.null-rendement.test.ts
// ---------------------------------------------------------------------------
// ADR 0166 — `assets.expected_return = null` betekent "geen eigen aanname" en
// valt terug op het profielrendement; een ingevulde 0 is een bewuste 0%.
//
// `computeBucketProjection` las de kolom via `Number(a.expected_return)` en
// `Number(null) === 0`, dus zo'n bezitting groeide hier stil 0% terwijl de
// kernel het profielrendement rekent. Keuze (a): optionele `terugvalRendementPct`
// (PERCENT) op de invoer; weggelaten → oude nul-basis (byte-identiek).
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest'
import { computeBucketProjection, type BucketProjectionInput } from './bucket-projection'
import type { Asset } from './asset-data'

function investment(expected_return: number | null): Asset {
  return {
    id: 'a-1',
    user_id: 'u-1',
    name: 'Wereldindex',
    asset_type: 'investment',
    current_value: 100_000,
    purchase_value: 80_000,
    purchase_date: null,
    expected_return,
    monthly_contribution: 0,
    institution: null,
    notes: null,
    is_active: true,
    sort_order: 0,
    created_at: '',
    updated_at: '',
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
    net_worth_inclusion_pct: 100,
  } as unknown as Asset
}

function input(asset: Asset, terugvalRendementPct?: number): BucketProjectionInput {
  return {
    assets: [asset],
    debts: [],
    hasPartner: false,
    inflationRate: 0,
    box3Method: 'forfaitair',
    months: 12,
    monthlySurplus: 0,
    ...(terugvalRendementPct === undefined ? {} : { terugvalRendementPct }),
  }
}

describe('computeBucketProjection — expected_return null vs bewuste 0 (ADR 0166)', () => {
  it('null mét terugval groeit op het profielrendement, en de bucket meldt dat effectieve rendement', () => {
    const res = computeBucketProjection(input(investment(null), 7))
    const bucket = res.bucketSummaries.find((b) => b.assetType === 'investment')!
    expect(bucket.assets[0].expectedReturn).toBe(7)
    expect(bucket.weightedReturn).toBeCloseTo(0.07, 10)
    // Bruto (vóór Box 3-drag) staat het bezit na 12 maanden ≈ 7% hoger.
    expect(bucket.assets[0].projected1y).toBeGreaterThan(106_000)
  })

  it('null zónder terugval blijft de oude nul-basis (bestaande callers byte-identiek)', () => {
    const res = computeBucketProjection(input(investment(null)))
    const bucket = res.bucketSummaries.find((b) => b.assetType === 'investment')!
    expect(bucket.assets[0].expectedReturn).toBe(0)
    expect(bucket.weightedReturn).toBe(0)
  })

  it('een ingevulde 0 blijft 0%, ook mét terugval', () => {
    const res = computeBucketProjection(input(investment(0), 7))
    const bucket = res.bucketSummaries.find((b) => b.assetType === 'investment')!
    expect(bucket.assets[0].expectedReturn).toBe(0)
    expect(bucket.weightedReturn).toBe(0)
  })
})
