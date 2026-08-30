import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { CryptoHoldingRow } from '@/lib/crypto-holdings-data'
import { CryptoHoldingsPage } from './crypto-holdings-page'

/**
 * B-012 op controller-niveau — de coin-pane op `?crypto=<id>`.
 *
 * Given de crypto-holdings-tab met een gesloten coin-pane,
 * When de gebruiker een coin opent,
 * Then hoort daar precies ÉÉN history-entry bij (push), zodat de mobiele
 *   terugknop de pane sluit in plaats van de tab-route te verlaten; sluiten
 *   consumeert diezelfde entry (back) en een deeplink valt terug op replace.
 *
 * Deze pagina had bovendien een tweede probleem: openen woonde in
 * `crypto-holdings-grid.tsx` en sluiten hier. Twee componenten = twee
 * helper-instanties = een `close()` die niet weet dat er gepusht is. De
 * open-handler is daarom naar deze host verhuisd en gaat als prop naar de
 * grid; die splitsing bewaakt de eerste test hieronder impliciet (de push komt
 * uit dezelfde instantie die de back doet).
 */

const nav = vi.hoisted(() => {
  const push = vi.fn()
  const replace = vi.fn()
  const back = vi.fn()
  const refresh = vi.fn()
  return {
    push,
    replace,
    back,
    refresh,
    // Stabiele referentie, net als de echte app-router — `paneHistory` hangt
    // aan `useMemo([router])`.
    router: { push, replace, back, refresh },
    params: new URLSearchParams(),
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => nav.router,
  usePathname: () => '/core/assets/crypto',
  useSearchParams: () => nav.params,
}))

// Alle zware presentatie-kinderen buiten beeld: deze suite gaat over
// URL-/history-gedrag, niet over de KPI's, chart of verdeling.
vi.mock('./crypto-kpi-strip', () => ({ CryptoKpiStrip: () => null }))
vi.mock('./crypto-performance-chart', () => ({ CryptoPerformanceChart: () => null }))
vi.mock('./crypto-distribution-panel', () => ({ CryptoDistributionPanel: () => null }))
vi.mock('./crypto-transactions-log', () => ({ CryptoTransactionsLog: () => null }))

// Grid → één knop per coin die de door de host geleverde open-handler roept.
vi.mock('./crypto-holdings-grid', () => ({
  CryptoHoldingsGrid: ({
    holdings,
    onOpenHolding,
  }: {
    holdings: CryptoHoldingRow[]
    onOpenHolding: (h: CryptoHoldingRow) => void
  }) => (
    <div>
      {holdings.map((h) => (
        <button
          key={h.id}
          type="button"
          data-testid={`open-${h.id}`}
          onClick={() => onOpenHolding(h)}
        >
          open {h.id}
        </button>
      ))}
    </div>
  ),
}))

// Pane → alleen "sta ik open" + `onClose`.
vi.mock('./crypto-holding-pane', () => ({
  CryptoHoldingPane: ({
    holding,
    onClose,
  }: {
    holding: { id: string } | null
    onClose: () => void
  }) =>
    holding ? (
      <button type="button" data-testid="pane-close" onClick={onClose}>
        sluit {holding.id}
      </button>
    ) : null,
}))

function row(id: string, symbol: string): CryptoHoldingRow {
  return {
    id,
    assetId: 'a1',
    assetName: 'Crypto',
    symbol,
    name: symbol,
    chain: null,
    units: 1,
    unitsInOrder: 0,
    currentPrice: 100,
    avgPurchasePrice: 80,
    costBasisEur: 80,
    returnEur: 20,
    returnPct: 25,
    valueEur: 100,
    isFiatBalance: false,
    isFavorite: false,
    source: { kind: 'manual', label: 'Handmatig' },
    lastPriceUpdate: null,
    lastSyncedAt: null,
    lastSyncError: null,
  } as unknown as CryptoHoldingRow
}

const HOLDINGS = [row('btc', 'BTC'), row('eth', 'ETH')]

beforeEach(() => {
  nav.push.mockClear()
  nav.replace.mockClear()
  nav.back.mockClear()
  nav.params = new URLSearchParams('tab=crypto-holdings')
})

function renderPage() {
  return render(<CryptoHoldingsPage holdings={HOLDINGS} />)
}

describe('CryptoHoldingsPage — terugknop-gedrag van de ?crypto-pane (B-012)', () => {
  it('open vanaf gesloten = push, met behoud van de tab-param', () => {
    renderPage()
    fireEvent.click(screen.getByTestId('open-btc'))

    expect(nav.push).toHaveBeenCalledWith(
      '/core/assets/crypto?tab=crypto-holdings&crypto=btc',
      { scroll: false },
    )
    expect(nav.replace).not.toHaveBeenCalled()
  })

  it('sluiten na een eigen open consumeert die entry met back', () => {
    const view = renderPage()
    fireEvent.click(screen.getByTestId('open-btc'))

    // De push commit de URL: spiegel dat naar de gemockte searchParams.
    nav.params = new URLSearchParams('tab=crypto-holdings&crypto=btc')
    view.rerender(<CryptoHoldingsPage holdings={HOLDINGS} />)

    fireEvent.click(screen.getByTestId('pane-close'))
    expect(nav.back).toHaveBeenCalledTimes(1)
    expect(nav.replace).not.toHaveBeenCalled()
  })

  it('wisselen van coin binnen een open pane = replace (geen tweede entry)', () => {
    nav.params = new URLSearchParams('tab=crypto-holdings&crypto=btc')
    renderPage()

    fireEvent.click(screen.getByTestId('open-eth'))
    expect(nav.replace).toHaveBeenCalledWith(
      '/core/assets/crypto?tab=crypto-holdings&crypto=eth',
      { scroll: false },
    )
    expect(nav.push).not.toHaveBeenCalled()
  })

  it('deeplink-close valt terug op replace-strip, nooit op back', () => {
    nav.params = new URLSearchParams('tab=crypto-holdings&crypto=btc')
    renderPage()

    fireEvent.click(screen.getByTestId('pane-close'))
    expect(nav.replace).toHaveBeenCalledWith(
      '/core/assets/crypto?tab=crypto-holdings',
      { scroll: false },
    )
    expect(nav.back).not.toHaveBeenCalled()
  })
})
