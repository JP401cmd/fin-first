import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import HoldingsPage from './holdings-client'
import { ToastProvider } from '@/components/app/toast-provider'

/**
 * Regressie bij testbug-862824 (/core/assets/investment).
 *
 * De heatmap las de RUWE holdings-state en toonde daardoor alle 111 ooit
 * vastgelegde posities, terwijl de gedeelde toolbar erboven "14/111 actief"
 * meldde en de lijst er 14 toonde. De chip-rij (ALLES / AANDELEN·ETF /
 * GESLOTEN) staat boven zowel de lijst als de heatmap en stuurt dus beide.
 *
 * Deze suite pint het contract: wat de heatmap krijgt is exact de gefilterde +
 * gesorteerde set van de lijst — bij elke chipkeuze.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/core/assets/investment',
  useSearchParams: () => new URLSearchParams(),
}))

// Niet relevant voor dit contract en bouwt bij mount een Supabase-browserclient
// (die in jsdom geen env heeft) — buiten beeld zetten.
vi.mock('./rebalancing-settings-section', () => ({
  RebalancingSettingsSection: () => null,
}))

// Stub voor de heatmap: rendert per ontvangen holding één markeerbaar element,
// zodat de test leest wát de heatmap krijgt in plaats van hoe hij tekent.
vi.mock('@/components/app/holdings-heatmap', () => ({
  __esModule: true,
  default: ({ holdings }: { holdings: Array<{ id: string }> }) => (
    <div data-testid="heatmap-stub">
      {holdings.map((h) => (
        <span key={h.id} data-testid="stub-cell" data-holding-id={h.id} />
      ))}
    </div>
  ),
}))

type Row = {
  id: string
  units: number
  current_price: number | null
  bucket: string
  pnl_is_closed?: boolean
}

const ROWS: Row[] = [
  { id: 'asml', units: 10, current_price: 700, bucket: 'investment' },
  { id: 'vwrl', units: 40, current_price: 110, bucket: 'investment' },
  { id: 'shell', units: 25, current_price: 30, bucket: 'investment' },
  { id: 'btc', units: 0.5, current_price: 60000, bucket: 'crypto' },
  // Gesloten posities — precies de ruis die de melder in de heatmap zag.
  { id: 'aex-optie', units: 0, current_price: 0, bucket: 'investment', pnl_is_closed: true },
  { id: 'oil-optie', units: 0, current_price: 0, bucket: 'investment', pnl_is_closed: true },
]

function apiHoldings() {
  return ROWS.map((r) => ({
    id: r.id,
    user_id: 'u1',
    asset_id: null,
    ticker: r.id.toUpperCase(),
    isin: null,
    name: `Positie ${r.id}`,
    units: r.units,
    avg_purchase_price: 100,
    current_price: r.current_price,
    last_price_update: '2026-08-09T10:00:00.000Z',
    purchase_date: null,
    notes: null,
    is_active: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    asset_class: 'aandeel',
    bucket: r.bucket,
    pnl_is_closed: r.pnl_is_closed ?? false,
  }))
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      const body = url.startsWith('/api/holdings')
        ? { holdings: apiHoldings(), total_value: 12345, total_cost: 10000 }
        : {}
      return {
        ok: true,
        status: 200,
        json: async () => body,
      } as Response
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

/** De ids die de heatmap daadwerkelijk binnenkrijgt. */
function heatmapIds(): string[] {
  return screen
    .queryAllByTestId('stub-cell')
    .map((el) => el.getAttribute('data-holding-id') ?? '')
}

async function renderHeatmapView() {
  render(
    <ToastProvider>
      <HoldingsPage />
    </ToastProvider>,
  )
  // Wachten tot de holdings geladen zijn en de toolbar staat.
  await screen.findByTestId('holdings-view-toggle')
  fireEvent.click(screen.getByTestId('view-toggle-heatmap'))
  await waitFor(() => expect(screen.getByTestId('heatmap-stub')).toBeInTheDocument())
}

describe('HoldingsPage — heatmap volgt de chip-selectie', () => {
  it('toont bij chip ALLES alleen de actieve posities, niet de gesloten', async () => {
    await renderHeatmapView()

    const ids = heatmapIds()
    expect(ids.sort()).toEqual(['asml', 'btc', 'shell', 'vwrl'])
    expect(ids).not.toContain('aex-optie')
    expect(ids).not.toContain('oil-optie')
  })

  it('sluit crypto uit zodra de gebruiker AANDELEN/ETF kiest', async () => {
    await renderHeatmapView()
    fireEvent.click(screen.getByRole('tab', { name: 'Aandelen/ETF' }))

    await waitFor(() => expect(heatmapIds()).not.toContain('btc'))
    // Exact dezelfde set als de lijst: `filterHoldingsByChip` selecteert bij
    // 'investment' op bucket en laat gesloten investment-rijen bewust staan
    // (bestaand lijstgedrag, hier niet gewijzigd). Die krijgen in de heatmap
    // zelf geen oppervlak meer, omdat het gewicht op waarde schaalt.
    expect(heatmapIds().sort()).toEqual([
      'aex-optie',
      'asml',
      'oil-optie',
      'shell',
      'vwrl',
    ])
  })

  it('toont bij chip GESLOTEN precies de gesloten posities', async () => {
    await renderHeatmapView()
    fireEvent.click(screen.getByRole('tab', { name: 'Gesloten' }))

    await waitFor(() => expect(heatmapIds()).toContain('aex-optie'))
    expect(heatmapIds().sort()).toEqual(['aex-optie', 'oil-optie'])
  })

  it('houdt de heatmap gelijk aan de teller van de toolbar', async () => {
    await renderHeatmapView()

    // De toolbar-kicker meldt "x/y actief"; de heatmap moet die x tonen, niet y.
    expect(heatmapIds()).toHaveLength(4)
    expect(ROWS).toHaveLength(6)
  })
})
