/**
 * Regressietest voor UAT-bug WF-SCHULD-05-bug1 (live-run 2-9-2026).
 *
 * Repro: een autolening die tijdens onboarding automatisch aan een
 * `vehicle`-bezit gekoppeld wordt (zie app/api/onboarding/save-own-data, gedekt
 * door link-mortgages.test.ts) toonde in de schuld-detailpane het hardcoded
 * label "Gekoppelde woning: Auto (elektrisch)". Oorzaak: een binaire ternary op
 * `debt_type` — alles behalve `dga_schuld` viel terug op "Gekoppelde woning".
 *
 * Het label komt nu uit het WERKELIJKE bezittype (`linkedAssetLabel`), en het
 * bewerkformulier leidt zowel zijn veldlabel als zijn opties af uit
 * `LINKED_DEBT_SUGGESTIONS` — één bron, zodat een toekomstig koppelpaar niet
 * opnieuw als losse ternary hoeft te worden onderhouden.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  linkedAssetLabel,
  linkedAssetFieldLabel,
  linkableAssetTypesForDebt,
  LINKED_DEBT_SUGGESTIONS,
  type Asset,
} from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import { DebtDetailModal } from './debt-detail-modal'

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    from: vi.fn(),
  }),
}))

function makeDebt(overrides: Partial<Debt>): Debt {
  return {
    id: 'debt-1',
    user_id: 'user-1',
    name: 'Autolening (restant)',
    debt_type: 'car_loan',
    original_amount: 20000,
    current_balance: 8000,
    interest_rate: 5,
    minimum_payment: 0,
    monthly_payment: 250,
    start_date: '2024-01-01',
    end_date: '2028-01-01',
    is_active: true,
    ownership: 'personal',
    net_worth_inclusion_pct: 100,
    ...overrides,
  } as unknown as Debt
}

function makeAsset(overrides: Partial<Asset>): Asset {
  return {
    id: 'asset-1',
    user_id: 'user-1',
    name: 'Auto (elektrisch)',
    asset_type: 'vehicle',
    current_value: 24000,
    is_active: true,
    ...overrides,
  } as unknown as Asset
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })))
})

describe('linkedAssetLabel — label volgt het bezittype', () => {
  it('dekt elk officieel ondersteund koppelpaar uit LINKED_DEBT_SUGGESTIONS', () => {
    expect(linkedAssetLabel('eigen_huis')).toBe('Gekoppelde woning')
    expect(linkedAssetLabel('real_estate')).toBe('Gekoppelde woning')
    expect(linkedAssetLabel('vehicle')).toBe('Gekoppeld voertuig')
    expect(linkedAssetLabel('deelneming')).toBe('Gekoppelde deelneming')
  })

  it('valt generiek terug op een bezittype zonder eigen label', () => {
    expect(linkedAssetLabel('other')).toBe('Gekoppeld bezit')
    expect(linkedAssetLabel(null)).toBe('Gekoppeld bezit')
    expect(linkedAssetLabel(undefined)).toBe('Gekoppeld bezit')
  })

  it('geeft elk koppelbaar bezittype een eigen (niet-generiek) label', () => {
    for (const assetType of Object.keys(LINKED_DEBT_SUGGESTIONS) as (keyof typeof LINKED_DEBT_SUGGESTIONS)[]) {
      expect(linkedAssetLabel(assetType)).not.toBe('Gekoppeld bezit')
    }
  })
})

describe('linkableAssetTypesForDebt / linkedAssetFieldLabel — formulierveld', () => {
  it('leidt de koppelbare bezittypes af uit LINKED_DEBT_SUGGESTIONS', () => {
    expect(linkableAssetTypesForDebt('mortgage').sort()).toEqual(['eigen_huis', 'real_estate'])
    expect(linkableAssetTypesForDebt('dga_schuld')).toEqual(['deelneming'])
    expect(linkableAssetTypesForDebt('car_loan')).toEqual(['vehicle'])
    expect(linkableAssetTypesForDebt('credit_card')).toEqual([])
  })

  it('kiest het gedeelde label als alle koppelbare types hetzelfde dragen', () => {
    // mortgage kan aan eigen_huis én real_estate hangen — beide "woning".
    expect(linkedAssetFieldLabel('mortgage')).toBe('Gekoppelde woning')
    expect(linkedAssetFieldLabel('dga_schuld')).toBe('Gekoppelde deelneming')
    expect(linkedAssetFieldLabel('car_loan')).toBe('Gekoppeld voertuig')
    // Geen koppelpaar → generiek, nooit een stellig verkeerde term.
    expect(linkedAssetFieldLabel('credit_card')).toBe('Gekoppeld bezit')
  })
})

describe('DebtDetailModal — gekoppeld-bezit-regel', () => {
  function renderPane(debt: Debt, assets: Asset[]) {
    return render(
      <DebtDetailModal
        debt={debt}
        valuations={[]}
        userAssets={assets}
        dailyExpenses={50}
        onClose={() => {}}
        onEdit={() => {}}
        onRevalue={() => {}}
        onDelete={() => {}}
        embedded
      />,
    )
  }

  it('toont "Gekoppeld voertuig" bij een autolening met vehicle-bezit (de repro)', () => {
    renderPane(
      makeDebt({ linked_asset_id: 'asset-1' }),
      [makeAsset({})],
    )

    expect(screen.getByText('Gekoppeld voertuig')).toBeInTheDocument()
    expect(screen.queryByText('Gekoppelde woning')).toBeNull()
    expect(screen.getByText('Auto (elektrisch)')).toBeInTheDocument()
  })

  it('houdt "Gekoppelde woning" voor een hypotheek op een eigen_huis', () => {
    renderPane(
      makeDebt({ debt_type: 'mortgage', name: 'Hypotheek', linked_asset_id: 'asset-2' }),
      [makeAsset({ id: 'asset-2', name: 'Ons huis', asset_type: 'eigen_huis' })],
    )

    expect(screen.getByText('Gekoppelde woning')).toBeInTheDocument()
  })

  it('houdt "Gekoppelde deelneming" voor een DGA-schuld', () => {
    renderPane(
      makeDebt({ debt_type: 'dga_schuld', name: 'Rekening-courant', linked_asset_id: 'asset-3' }),
      [makeAsset({ id: 'asset-3', name: 'Eigen BV', asset_type: 'deelneming' })],
    )

    expect(screen.getByText('Gekoppelde deelneming')).toBeInTheDocument()
  })
})
