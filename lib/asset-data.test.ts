import { describe, it, expect } from 'vitest'
import { projectPortfolio, computeExpectedAnnualAppreciation, type Asset } from './asset-data'

describe('computeExpectedAnnualAppreciation', () => {
  it('behandelt expected_return als PERCENTAGE (/100), niet als fractie', () => {
    // €100.000 × 7% = €7.000 — NIET €700.000 (de 100×-bug die de caller-bedrading had).
    const r = computeExpectedAnnualAppreciation([
      { id: 'a', name: 'etf', current_value: 100_000, expected_return: 7,
        asset_type: 'etf', is_active: true } as unknown as Asset,
    ])
    expect(r).toBeCloseTo(7000, 6)
  })

  it('depreciërende assets tellen als 0', () => {
    const r = computeExpectedAnnualAppreciation([
      { id: 'v', name: 'auto', current_value: 20_000, expected_return: -10,
        asset_type: 'vehicle', is_active: true } as unknown as Asset,
    ])
    expect(r).toBe(0)
  })

  it('weegt met net_worth_inclusion_pct', () => {
    const r = computeExpectedAnnualAppreciation([
      { id: 'a', name: 'etf', current_value: 100_000, expected_return: 8,
        asset_type: 'aandelen', is_active: true, net_worth_inclusion_pct: 50 } as unknown as Asset,
    ])
    expect(r).toBeCloseTo(4000, 6) // 100k × 8% × 50%
  })

  it('lege lijst → 0', () => {
    expect(computeExpectedAnnualAppreciation([])).toBe(0)
  })
})

describe('projectPortfolio — column-sparse aggregated partner row', () => {
  // Mirrors the row produced by the `household_partner_items` RPC when a
  // partner's asset privacy is set to 'totals': it carries current_value /
  // ownership / is_active but intentionally OMITS expected_return,
  // monthly_contribution, depreciation_rate and asset_type. In household /
  // partner perspective this row flows straight into projectPortfolio.
  const aggregatedPartnerRow = {
    id: 'aggregated_partner_assets',
    name: 'Partner vermogen (totaal)',
    current_value: 250_000,
    ownership: 'personal',
    user_id: 'partner-uuid',
    is_active: true,
    _aggregated: true,
    _aggregatedCount: 4,
  } as unknown as Asset

  it('produces finite totals even when return/contribution fields are missing', () => {
    const rows = projectPortfolio([aggregatedPartnerRow], 120)
    expect(rows).toHaveLength(120)
    for (const r of rows) {
      expect(Number.isFinite(r.total)).toBe(true)
    }
  })

  it('treats a missing expected_return as 0% growth (value stays flat)', () => {
    const rows = projectPortfolio([aggregatedPartnerRow], 120)
    expect(rows[rows.length - 1].total).toBe(250_000)
  })

  it('still projects normal itemized assets correctly alongside the sparse row', () => {
    const normal = {
      id: 'a1',
      asset_type: 'investment',
      current_value: 10_000,
      expected_return: 7,
      monthly_contribution: 0,
      is_active: true,
    } as unknown as Asset
    const rows = projectPortfolio([normal, aggregatedPartnerRow], 12)
    // Combined total = flat 250k partner + grown 10k investment, all finite.
    for (const r of rows) expect(Number.isFinite(r.total)).toBe(true)
    expect(rows[rows.length - 1].total).toBeGreaterThan(260_000)
  })
})
