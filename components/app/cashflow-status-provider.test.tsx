import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, screen } from '@testing-library/react'
import type { CashflowCardStatuses } from '@/lib/cashflow-cards'

/**
 * CashflowStatusProvider — de bron van de vier sidebar-status-dots onder
 * Cashflow.
 *
 * De winst van T2.3 zit in WIE er fetcht, dus dat is wat hier bewaakt wordt met
 * een fetch-teller (niet: "er kwam een waarde terug"):
 *
 *  1. op de HUB (/overzicht/cashflow) fetcht de provider NUL keer — die pagina
 *     berekent de kaarten server-side en seedt ze;
 *  2. de seed mag LAAT komen (gestreamd blok, mount ná de eerste paint) en
 *     landt dan alsnog, zonder dat er tussendoor een fetch is losgegaan — dat is
 *     precies de volgorde die het PageStatusSeed-patroon níét garandeert;
 *  3. op een SUB-pagina fetcht hij exact één keer per route-bezoek;
 *  4. buiten de cashflow-routes raakt hij het endpoint niet aan.
 */

const { mockUsePathname } = vi.hoisted(() => ({ mockUsePathname: vi.fn() }))

vi.mock('next/navigation', () => ({ usePathname: mockUsePathname }))

import {
  CashflowStatusProvider,
  CashflowStatusSeed,
  useCashflowStatusContext,
} from './cashflow-status-provider'

const SEEDED: CashflowCardStatuses = {
  budget: 'good',
  transacties: 'bad',
  vasteLasten: 'warn',
  forecast: 'good',
}

const FROM_API: CashflowCardStatuses = {
  budget: 'warn',
  transacties: 'good',
  vasteLasten: 'bad',
  forecast: 'neutral',
}

/** Rendert de vier statussen als één scanbare string, bv. "good/bad/warn/good". */
function StatusProbe() {
  const s = useCashflowStatusContext()
  return (
    <span data-testid="probe">
      {[s.budget, s.transacties, s.vasteLasten, s.forecast].join('/')}
    </span>
  )
}

function probe(): string {
  return screen.getByTestId('probe').textContent ?? ''
}

const NEUTRAL = 'neutral/neutral/neutral/neutral'

let fetchSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchSpy = vi.fn(async () => ({ ok: true, json: async () => FROM_API }) as Response)
  global.fetch = fetchSpy as unknown as typeof fetch
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('CashflowStatusProvider — de hub fetcht niet', () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue('/overzicht/cashflow')
  })

  it('doet nul fetches en toont de geseede statussen', async () => {
    render(
      <CashflowStatusProvider>
        <CashflowStatusSeed statuses={SEEDED} />
        <StatusProbe />
      </CashflowStatusProvider>,
    )
    await act(async () => {})

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(probe()).toBe('good/bad/warn/good')
  })

  it('blijft neutraal zonder seed, en fetcht ook dan niet', async () => {
    render(
      <CashflowStatusProvider>
        <StatusProbe />
      </CashflowStatusProvider>,
    )
    await act(async () => {})

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(probe()).toBe(NEUTRAL)
  })

  it('neemt een LAAT binnenkomende seed alsnog over (gestreamd blok)', async () => {
    // Eerste commit = het gestreamde blok is er nog niet (Suspense-fallback):
    // de provider heeft zijn effect al gedraaid.
    const { rerender } = render(
      <CashflowStatusProvider>
        <StatusProbe />
      </CashflowStatusProvider>,
    )
    await act(async () => {})
    expect(probe()).toBe(NEUTRAL)
    expect(fetchSpy).not.toHaveBeenCalled()

    // Het blok arriveert en hydrateert: de seed mount ná het provider-effect.
    rerender(
      <CashflowStatusProvider>
        <CashflowStatusSeed statuses={SEEDED} />
        <StatusProbe />
      </CashflowStatusProvider>,
    )
    await act(async () => {})

    expect(probe()).toBe('good/bad/warn/good')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('een trailing slash telt nog steeds als de hub', async () => {
    mockUsePathname.mockReturnValue('/overzicht/cashflow/')
    render(
      <CashflowStatusProvider>
        <CashflowStatusSeed statuses={SEEDED} />
        <StatusProbe />
      </CashflowStatusProvider>,
    )
    await act(async () => {})

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(probe()).toBe('good/bad/warn/good')
  })
})

describe('CashflowStatusProvider — sub-pagina en daarbuiten', () => {
  it.each([
    '/overzicht/cashflow/budget',
    '/overzicht/cashflow/transacties',
    '/overzicht/cashflow/vaste-lasten',
    '/overzicht/cashflow/forecast',
  ])('fetcht op %s exact één keer en toont het antwoord', async (pathname) => {
    mockUsePathname.mockReturnValue(pathname)
    render(
      <CashflowStatusProvider>
        <StatusProbe />
      </CashflowStatusProvider>,
    )
    await act(async () => {})

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy).toHaveBeenCalledWith('/api/overzicht/cashflow-status')
    expect(probe()).toBe('warn/good/bad/neutral')
  })

  it('raakt het endpoint niet aan buiten de cashflow-routes', async () => {
    mockUsePathname.mockReturnValue('/overzicht')
    render(
      <CashflowStatusProvider>
        <StatusProbe />
      </CashflowStatusProvider>,
    )
    await act(async () => {})

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(probe()).toBe(NEUTRAL)
  })

  it('blijft neutraal bij een niet-ok antwoord (progressive enhancement)', async () => {
    mockUsePathname.mockReturnValue('/overzicht/cashflow/budget')
    fetchSpy.mockResolvedValue({ ok: false, json: async () => ({}) } as Response)
    render(
      <CashflowStatusProvider>
        <StatusProbe />
      </CashflowStatusProvider>,
    )
    await act(async () => {})

    expect(probe()).toBe(NEUTRAL)
  })
})

describe('useCashflowStatusContext buiten de provider', () => {
  it('valt terug op neutrale statussen i.p.v. te crashen', async () => {
    mockUsePathname.mockReturnValue('/overzicht/cashflow')
    render(<StatusProbe />)
    await act(async () => {})

    expect(probe()).toBe(NEUTRAL)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
