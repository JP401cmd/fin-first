import { describe, it, expect } from 'vitest'
import { projectPortfolio, type Asset } from './asset-data'

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
