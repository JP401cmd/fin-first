import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import HoldingsPage from './holdings-client'
import { ToastProvider } from '@/components/app/toast-provider'

/**
 * B-012 op controller-niveau — `/core/assets/investment?holding=<id>`.
 *
 * Given de investment-holdings-pagina met een gesloten detail-pane,
 * When de gebruiker een positie opent,
 * Then hoort daar precies ÉÉN history-entry bij (push), zodat de mobiele
 *   terugknop de pane sluit in plaats van de hele route te verlaten. Sluiten
 *   via de pane consumeert diezelfde entry (back); wisselen van positie
 *   binnen een open pane stapelt niet (replace); en een deeplink — waar deze
 *   pagina zélf niets pushte — valt bij sluiten terug op replace.
 *
 * De helper-semantiek zelf staat in `lib/pane-url-history.test.ts`; deze suite
 * pint de BEDRADING: dat de controller de helper gebruikt op álle open- en
 * sluitpaden, met de juiste `alreadyOpen`-vlag en een pathname-behoudende URL.
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
    // STABIELE referentie, net als de echte app-router: `paneHistory` hangt aan
    // `useMemo([router])`, dus een verse objectliteral per render zou de
    // helper-instantie (en daarmee de "ik heb gepusht"-vlag) elke render
    // weggooien — precies het gedrag dat we hier willen kunnen meten.
    router: { push, replace, back, refresh },
    params: new URLSearchParams(),
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => nav.router,
  usePathname: () => '/core/assets/investment',
  useSearchParams: () => nav.params,
}))

// Bouwt bij mount een Supabase-browserclient (die in jsdom geen env heeft) —
// buiten beeld zetten, net als in `holdings-client.heatmap.test.tsx`.
vi.mock('./rebalancing-settings-section', () => ({
  RebalancingSettingsSection: () => null,
}))

// De echte pane is een ShellOverlay met portal + focus-trap; hier telt alleen
// WANNEER hij open is en WAT `onClose` doet.
vi.mock('./holdings/investment-holding-pane', () => ({
  InvestmentHoldingPane: ({
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

const ROWS = [
  { id: 'asml', ticker: 'ASML', units: 10, current_price: 700 },
  { id: 'vwrl', ticker: 'VWRL', units: 40, current_price: 110 },
]

function apiHoldings() {
  return ROWS.map((r) => ({
    id: r.id,
    user_id: 'u1',
    asset_id: null,
    ticker: r.ticker,
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
    bucket: 'investment',
    pnl_is_closed: false,
  }))
}

beforeEach(() => {
  nav.push.mockClear()
  nav.replace.mockClear()
  nav.back.mockClear()
  nav.refresh.mockClear()
  nav.params = new URLSearchParams()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      const body = url.startsWith('/api/holdings')
        ? { holdings: apiHoldings(), total_value: 11400, total_cost: 5000 }
        : {}
      return { ok: true, status: 200, json: async () => body } as Response
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

function renderPage() {
  return render(
    <ToastProvider>
      <HoldingsPage />
    </ToastProvider>,
  )
}

/** Wacht tot de lijst geladen is en geef de rij-link van `id` terug. */
async function rowLink(id: string) {
  return screen.findByTestId(`holding-link-${id}`)
}

describe('HoldingsPage — terugknop-gedrag van de ?holding-pane (B-012)', () => {
  it('open vanaf gesloten = push (één entry), niet replace', async () => {
    renderPage()
    fireEvent.click(await rowLink('asml'))

    expect(nav.push).toHaveBeenCalledWith(
      '/core/assets/investment?holding=asml',
      { scroll: false },
    )
    expect(nav.replace).not.toHaveBeenCalled()
  })

  it('sluiten na een eigen open consumeert die entry met back', async () => {
    const view = renderPage()
    fireEvent.click(await rowLink('asml'))

    // De push commit de URL: spiegel dat naar de gemockte searchParams en
    // rerender, zodat de pane daadwerkelijk open staat.
    nav.params = new URLSearchParams('holding=asml')
    view.rerender(
      <ToastProvider>
        <HoldingsPage />
      </ToastProvider>,
    )

    fireEvent.click(await screen.findByTestId('pane-close'))
    expect(nav.back).toHaveBeenCalledTimes(1)
    expect(nav.replace).not.toHaveBeenCalled()
  })

  it('wisselen van positie binnen een open pane = replace (geen tweede entry)', async () => {
    nav.params = new URLSearchParams('holding=asml')
    renderPage()

    fireEvent.click(await rowLink('vwrl'))
    expect(nav.replace).toHaveBeenCalledWith(
      '/core/assets/investment?holding=vwrl',
      { scroll: false },
    )
    expect(nav.push).not.toHaveBeenCalled()
  })

  it('deeplink-close valt terug op replace-strip, nooit op back', async () => {
    nav.params = new URLSearchParams('holding=asml')
    renderPage()

    fireEvent.click(await screen.findByTestId('pane-close'))
    expect(nav.replace).toHaveBeenCalledWith('/core/assets/investment', {
      scroll: false,
    })
    expect(nav.back).not.toHaveBeenCalled()
  })

  it('behoudt overige query-state (?tab=…) bij openen én sluiten', async () => {
    // Bewust `tab` en niet `asset`: `?asset=` is op deze pagina het
    // holdings-FILTER — dat zou de rijen wegfilteren i.p.v. de URL testen.
    nav.params = new URLSearchParams('tab=holdings')
    const view = renderPage()

    fireEvent.click(await rowLink('asml'))
    expect(nav.push).toHaveBeenCalledWith(
      '/core/assets/investment?tab=holdings&holding=asml',
      { scroll: false },
    )

    nav.params = new URLSearchParams('tab=holdings&holding=asml')
    view.rerender(
      <ToastProvider>
        <HoldingsPage />
      </ToastProvider>,
    )
    fireEvent.click(await screen.findByTestId('pane-close'))
    expect(nav.back).toHaveBeenCalledTimes(1)
  })
})
