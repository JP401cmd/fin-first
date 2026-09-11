/**
 * B-044 — de categoriepagina's (/overzicht/bezittingen/[type] en
 * /overzicht/schulden/[type]) toonden in Eenvoudig het kaarten-grid van
 * Volledig, terwijl het overzicht (/overzicht/bezittingen, /overzicht/schulden)
 * voor hetzelfde type pillen toont. Gemeld op /overzicht/bezittingen/cash; het
 * gold voor elk type en ook voor de schulden.
 *
 * Deze suite pint:
 *  - Eenvoudig → `EenvoudigPillList` (één pill per post, klik opent de post),
 *    géén kaarten; de toevoegroute blijft staan;
 *  - Volledig → ongewijzigd het kaarten-grid, géén pillen;
 *  - de aandeel-balken tellen op tot het hero-totaal (zelfde grondslag).
 *
 * Modus-valkuil (ADR 0026): buiten een `DisplayModeProvider` valt
 * `useDisplayMode()` stil terug op 'simple'. Beide modi renderen hier daarom
 * expliciet in een provider.
 *
 * De kaarten zelf worden gestubd: het gaat om WELKE weergave de pagina kiest,
 * niet om de binnenkant van `VermogenAssetCard`/`VermogenDebtCard`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DisplayModeProvider, type DisplayMode } from '@/lib/hooks/use-display-mode'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'

const replace = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/overzicht/bezittingen/cash',
}))

vi.mock('@/components/app/feature-access-provider', () => ({
  useFeatureAccess: () => ({ activeModules: [] }),
  useModuleAccess: () => ({ activeModules: [] }),
}))

vi.mock('@/lib/hooks/use-in-view-animation', () => ({
  useInViewAnimation: () => ({ ref: { current: null }, hasEntered: true }),
}))

// Geen verdiepings-tabs: de suite gaat over de items-tab.
vi.mock('./category-deepening-registry', () => ({
  findDeepenings: () => [],
  getDeepeningComponent: () => undefined,
  getDeepeningSlug: () => '',
}))

vi.mock('./vermogen-asset-card', () => ({
  VermogenAssetCard: ({ asset }: { asset: { name: string } }) => (
    <div data-testid="kaart">{asset.name}</div>
  ),
}))

vi.mock('./vermogen-debt-card', () => ({
  VermogenDebtCard: ({ debt }: { debt: { name: string } }) => (
    <div data-testid="kaart">{debt.name}</div>
  ),
}))

vi.mock('@/components/app/perspective-provider', () => ({
  usePerspective: () => ({ perspective: 'personal' }),
  usePerspectiveAbort: () => new AbortController().signal,
}))

vi.mock('@/components/app/perspective-context-label', () => ({
  PerspectiveContextLabel: () => null,
}))

// De schuldenpagina haalt bij mount de assets-lijst op voor de pane; een
// thenable die leeg resolvet houdt dat pad stil.
vi.mock('@/lib/supabase/client', () => {
  const chain: Record<string, unknown> = {}
  for (const m of ['from', 'select', 'eq', 'order', 'limit']) chain[m] = () => chain
  chain.then = (cb: (r: { data: unknown[] }) => void) => {
    cb({ data: [] })
    return Promise.resolve()
  }
  return { createClient: () => chain }
})

import { AssetCategoryPage } from './asset-category-page'
import { DebtCategoryPage } from './debt-category-page'

beforeEach(() => {
  replace.mockClear()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))
})
afterEach(() => {
  vi.unstubAllGlobals()
})

function asset(id: string, name: string, value: number): Asset {
  return {
    id,
    name,
    asset_type: 'cash',
    current_value: value,
    is_active: true,
  } as unknown as Asset
}

function debt(id: string, name: string, balance: number): Debt {
  return {
    id,
    name,
    debt_type: 'credit_card',
    current_balance: balance,
    is_active: true,
    ownership: 'personal',
    _provenance: 'eigen',
    _myShareFraction: 1,
  } as unknown as Debt
}

const ASSETS = [asset('a1', 'Betaalrekening', 3000), asset('a2', 'Spaarpot', 1000)]
const DEBTS = [debt('d1', 'Visa', 600), debt('d2', 'Mastercard', 200)]

function renderAssets(mode: DisplayMode) {
  return render(
    <DisplayModeProvider initialMode={mode}>
      <AssetCategoryPage type="cash" initialAssets={ASSETS} basePath="/overzicht/bezittingen/cash" />
    </DisplayModeProvider>,
  )
}

function renderDebts(mode: DisplayMode) {
  return render(
    <DisplayModeProvider initialMode={mode}>
      <DebtCategoryPage type="credit_card" initialDebts={DEBTS} basePath="/overzicht/schulden/credit_card" />
    </DisplayModeProvider>,
  )
}

/** Aandeel-balk van een pill: de absolute span met een inline breedte. */
function balkBreedte(pill: HTMLElement): number {
  const balk = pill.querySelector<HTMLElement>('span[aria-hidden="true"][style*="width"]')
  return balk ? parseFloat(balk.style.width) : 0
}

describe('B-044 — bezittingen-categoriepagina', () => {
  it('toont in Eenvoudig pillen, geen kaarten', () => {
    renderAssets('simple')
    expect(screen.getByRole('button', { name: 'Betaalrekening openen' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Spaarpot openen' })).toBeTruthy()
    expect(screen.queryAllByTestId('kaart')).toHaveLength(0)
  })

  it('houdt in Eenvoudig de toevoegroute', () => {
    renderAssets('simple')
    expect(screen.getByRole('button', { name: 'Voeg rekening toe' })).toBeTruthy()
  })

  it('aandeel-balken volgen de grondslag van het hero-totaal (75% / 25%)', () => {
    renderAssets('simple')
    expect(balkBreedte(screen.getByRole('button', { name: 'Betaalrekening openen' }))).toBeCloseTo(75)
    expect(balkBreedte(screen.getByRole('button', { name: 'Spaarpot openen' }))).toBeCloseTo(25)
  })

  it('klik op een pill opent dezelfde detail-flow als de kaart (?asset=<id>)', () => {
    renderAssets('simple')
    fireEvent.click(screen.getByRole('button', { name: 'Spaarpot openen' }))
    expect(replace).toHaveBeenCalledWith('/overzicht/bezittingen/cash?asset=a2', { scroll: false })
  })

  it('toont in Volledig ongewijzigd de kaarten, geen pillen', () => {
    renderAssets('full')
    expect(screen.getAllByTestId('kaart')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Betaalrekening openen' })).toBeNull()
  })
})

describe('B-044 — schulden-categoriepagina (zelfde gat)', () => {
  it('toont in Eenvoudig pillen, geen kaarten', () => {
    renderDebts('simple')
    expect(screen.getByRole('button', { name: 'Visa openen' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Mastercard openen' })).toBeTruthy()
    expect(screen.queryAllByTestId('kaart')).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Voeg creditcard toe' })).toBeTruthy()
  })

  it('aandeel-balken volgen de grondslag van het hero-totaal (75% / 25%)', () => {
    renderDebts('simple')
    expect(balkBreedte(screen.getByRole('button', { name: 'Visa openen' }))).toBeCloseTo(75)
    expect(balkBreedte(screen.getByRole('button', { name: 'Mastercard openen' }))).toBeCloseTo(25)
  })

  it('klik op een pill opent dezelfde detail-flow als de kaart (?debt=<id>)', () => {
    renderDebts('simple')
    fireEvent.click(screen.getByRole('button', { name: 'Visa openen' }))
    expect(replace).toHaveBeenCalledWith('/overzicht/schulden/credit_card?debt=d1', { scroll: false })
  })

  it('toont in Volledig ongewijzigd de kaarten, geen pillen', () => {
    renderDebts('full')
    expect(screen.getAllByTestId('kaart')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Visa openen' })).toBeNull()
  })
})
