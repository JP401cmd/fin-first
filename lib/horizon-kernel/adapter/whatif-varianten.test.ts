import { describe, it, expect } from 'vitest'
import type { Asset } from '@/lib/asset-data'
import type { LifeEvent } from '@/lib/horizon-data'
import {
  applyReturnDeltasToAssets,
  buildWhatifKernelAdapterInput,
  deriveEigenHuisIds,
  type WhatifRawProfileRow,
} from './whatif-varianten'

/**
 * FASE 5, stap 2a — variant-mapping-unit-tests. Eén case per rij van de
 * variant→rauwe-mutatie-tabel + de profiel-veld-mapping (incl. de kolom-hernoeming).
 */

function makeAsset(over: Partial<Asset>): Asset {
  return {
    id: 'a1',
    name: 'Asset',
    asset_type: 'investment',
    current_value: 100_000,
    expected_return: 7,
    is_active: true,
    net_worth_inclusion_pct: 100,
    ...over,
  } as unknown as Asset
}

describe('applyReturnDeltasToAssets', () => {
  it('rendement-slider per type: alleen het matchende type verschuift (+delta×100 pp)', () => {
    const assets = [
      makeAsset({ id: 'inv', asset_type: 'investment', expected_return: 7 }),
      makeAsset({ id: 'cash', asset_type: 'cash', expected_return: 0.5 }),
    ]
    const out = applyReturnDeltasToAssets(assets, { investment: 0.02 })
    expect(out.find((a) => a.id === 'inv')!.expected_return).toBeCloseTo(9, 10) // 7 + 2 pp
    expect(out.find((a) => a.id === 'cash')!.expected_return).toBeCloseTo(0.5, 10) // ongewijzigd
  })

  it('uniforme delta: alle bezittingen verschuiven', () => {
    const assets = [
      makeAsset({ id: 'inv', asset_type: 'investment', expected_return: 7 }),
      makeAsset({ id: 'cash', asset_type: 'cash', expected_return: 0.5 }),
    ]
    const out = applyReturnDeltasToAssets(assets, undefined, 0.01)
    expect(out.find((a) => a.id === 'inv')!.expected_return).toBeCloseTo(8, 10)
    expect(out.find((a) => a.id === 'cash')!.expected_return).toBeCloseTo(1.5, 10)
  })

  it('per-type wint van de uniforme delta', () => {
    const assets = [
      makeAsset({ id: 'inv', asset_type: 'investment', expected_return: 7 }),
      makeAsset({ id: 'cash', asset_type: 'cash', expected_return: 0.5 }),
    ]
    const out = applyReturnDeltasToAssets(assets, { investment: 0.03 }, 0.01)
    expect(out.find((a) => a.id === 'inv')!.expected_return).toBeCloseTo(10, 10) // 7 + 3 pp (per-type)
    expect(out.find((a) => a.id === 'cash')!.expected_return).toBeCloseTo(1.5, 10) // 0.5 + 1 pp (uniform)
  })

  it('geen delta → ongewijzigd én non-muterend (zelfde referentie)', () => {
    const assets = [makeAsset({ id: 'inv', expected_return: 7 })]
    const out = applyReturnDeltasToAssets(assets, {}, 0)
    expect(out[0]).toBe(assets[0]) // referentie behouden
    expect(out[0].expected_return).toBe(7)
  })

  it('nul-rendement-asset: kern-basis 0 (GEEN grossReturn-backfill) → 0 + delta×100', () => {
    const assets = [makeAsset({ id: 'btc', asset_type: 'crypto', expected_return: 0 })]
    const out = applyReturnDeltasToAssets(assets, { crypto: 0.02 })
    expect(out[0].expected_return).toBeCloseTo(2, 10) // 0 + 2 pp, niet grossReturn + 2 pp
  })

  it('muteert de originele array niet', () => {
    const assets = [makeAsset({ id: 'inv', expected_return: 7 })]
    applyReturnDeltasToAssets(assets, { investment: 0.02 })
    expect(assets[0].expected_return).toBe(7)
  })
})

describe('buildWhatifKernelAdapterInput', () => {
  const profile: WhatifRawProfileRow = {
    date_of_birth: '1986-01-01',
    net_monthly_income: 4000,
    estimated_monthly_expenses: 2500,
    expected_return: 6,
    inflation_rate: 2,
    box3_method: 'forfaitair',
    fire_end_strategy: 'perpetual',
    fire_end_age: 90,
    fire_legacy_amount: 0,
    withdrawal_strategy: 'static',
    housing_strategy_config: { mode: 'include_full' },
    pot_rules: { surplusGroup: 'beleggingen' },
    retirement_expense_method: 'custom',
    retirement_expense_custom_amount: 30_000,
  }

  const events = [
    { id: 'e1', event_type: 'income_change', name: 'Loonsverhoging', target_age: 45, is_active: true },
  ] as unknown as LifeEvent[]

  const assets = [makeAsset({ id: 'inv' })]

  it('mapt de kolom-hernoeming retirement_expense_custom_amount → retirement_custom_amount', () => {
    const out = buildWhatifKernelAdapterInput({ profile, assets, debts: [], lifeEvents: [] })
    expect(out.profile.retirement_custom_amount).toBe(30_000)
    expect(out.profile.retirement_expense_method).toBe('custom')
  })

  it('geeft de event-set ONgewijzigd door als lifeEvents', () => {
    const out = buildWhatifKernelAdapterInput({ profile, assets, debts: [], lifeEvents: events })
    expect(out.lifeEvents).toBe(events)
  })

  it('geeft de (gemuteerde) assets/debts door en mapt de kernvelden', () => {
    const out = buildWhatifKernelAdapterInput({
      profile,
      assets,
      debts: [],
      lifeEvents: [],
      taxYear: 2026,
    })
    expect(out.assets).toBe(assets)
    expect(out.profile.date_of_birth).toBe('1986-01-01')
    expect(out.profile.net_monthly_income).toBe(4000)
    expect(out.profile.box3_method).toBe('forfaitair')
    expect(out.taxYear).toBe(2026)
  })

  it('laat bedradingsgat-velden undefined (adapter-defaults)', () => {
    const out = buildWhatifKernelAdapterInput({ profile, assets, debts: [], lifeEvents: [] })
    expect(out.profile.yearly_essential_expenses).toBeUndefined()
    expect(out.profile.marginaal_tarief).toBeUndefined()
    expect(out.profile.deficit_loan_rate).toBeUndefined()
    expect(out.profile.withdrawal_profile_config).toBeUndefined()
  })
})

describe('deriveEigenHuisIds', () => {
  it('bevat alleen actieve eigen_huis-bezittingen', () => {
    const assets = [
      makeAsset({ id: 'huis', asset_type: 'eigen_huis', is_active: true }),
      makeAsset({ id: 'oud-huis', asset_type: 'eigen_huis', is_active: false }),
      makeAsset({ id: 'inv', asset_type: 'investment', is_active: true }),
    ]
    const ids = deriveEigenHuisIds(assets)
    expect(ids.has('huis')).toBe(true)
    expect(ids.has('oud-huis')).toBe(false)
    expect(ids.has('inv')).toBe(false)
    expect(ids.size).toBe(1)
  })
})
