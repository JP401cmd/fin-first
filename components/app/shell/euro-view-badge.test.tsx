/**
 * Bevinding M13 — de weergave-schakelaar verklaarde zichzelf niet en zijn
 * stand was niet af te lezen.
 *
 * Drie deelpunten, alle drie hier vastgelegd:
 *  (a) de pilltekst draagt een ZICHTBAAR "Weergave:"-voorvoegsel. Het stond
 *      alleen in het `title`-attribuut, en dat is hover-only — onzichtbaar op
 *      touch, waar de meeste sessies plaatsvinden.
 *  (b) een eenmalige uitleg (coachmark) die server-persisted is: hij verdwijnt
 *      na wegklikken en komt op geen enkel apparaat terug.
 *  (c) de badge bestaat óók compact, voor de ingeklapte zijbalk en de mobiele
 *      TopBar — die laatste had helemaal geen euro-weergave.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import { EuroViewBadge, __resetCoachmarkCache } from './euro-view-badge'
import type { EuroView } from '@/lib/euro-display'

const toggle = vi.fn()
let currentView: EuroView = 'nominal'

vi.mock('@/lib/hooks/use-euro-view', () => ({
  useEuroView: () => ({ view: currentView, setView: vi.fn(), toggle }),
}))

/** Stub /api/coachmark; `dismissed=false` betekent: uitleg nog niet gezien. */
function mockCoachmarkApi(dismissed: boolean) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) } as Response)
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ dismissed: { 'euro-view': dismissed } }),
    } as Response)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  currentView = 'nominal'
  toggle.mockClear()
  __resetCoachmarkCache()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('EuroViewBadge — zichtbaar label (M13a)', () => {
  it('toont "Weergave:" ín de pill, niet alleen in het title-attribuut', () => {
    mockCoachmarkApi(true)
    render(<EuroViewBadge />)

    const knop = screen.getByTestId('sidebar-euro-view-badge')
    // Dit is de kern van de bevinding: de tekst moet in de zichtbare inhoud
    // staan, niet uitsluitend in een hover-only attribuut.
    expect(knop.textContent).toContain('Weergave:')
    expect(knop.textContent).toContain("Toekomstige euro's")
  })

  it('noemt de andere stand zodra de weergave omgaat', () => {
    mockCoachmarkApi(true)
    currentView = 'real'
    render(<EuroViewBadge />)

    const knop = screen.getByTestId('sidebar-euro-view-badge')
    expect(knop.textContent).toContain('Weergave:')
    expect(knop.textContent).toContain("Huidige euro's")
    expect(knop.getAttribute('aria-pressed')).toBe('true')
  })

  it('herhaalt "Weergave" niet voor schermlezers', () => {
    mockCoachmarkApi(true)
    render(<EuroViewBadge />)

    const knop = screen.getByTestId('sidebar-euro-view-badge')
    // Het aria-label zegt het al; het zichtbare voorvoegsel is aria-hidden.
    expect(knop.getAttribute('aria-label')).toContain('Weergave:')
    const prefix = knop.querySelector('[aria-hidden]:not(svg)')
    expect(prefix?.textContent).toContain('Weergave:')
  })

  it('blijft klikbaar als schakelaar', () => {
    mockCoachmarkApi(true)
    render(<EuroViewBadge />)
    fireEvent.click(screen.getByTestId('sidebar-euro-view-badge'))
    expect(toggle).toHaveBeenCalledTimes(1)
  })
})

describe('EuroViewBadge — compacte variant (M13c)', () => {
  it('toont icoon-only maar houdt de tekst in het aria-label', () => {
    mockCoachmarkApi(true)
    render(<EuroViewBadge variant="compact" />)

    const knop = screen.getByTestId('sidebar-euro-view-badge')
    expect(knop.textContent).not.toContain("Toekomstige euro's")
    expect(knop.getAttribute('aria-label')).toContain("Weergave: Toekomstige euro's")
  })
})

describe('EuroViewBadge — eenmalige uitleg (M13b)', () => {
  it('toont de uitleg wanneer de gebruiker hem nog niet heeft weggeklikt', async () => {
    mockCoachmarkApi(false)
    render(<EuroViewBadge showCoachmark />)

    await waitFor(() => {
      expect(screen.getByRole('note', { name: 'Uitleg bij de euro-weergave' })).toBeTruthy()
    })
  })

  it('toont hem NIET wanneer hij al is weggeklikt', async () => {
    const fetchMock = mockCoachmarkApi(true)
    render(<EuroViewBadge showCoachmark />)

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(screen.queryByRole('note')).toBeNull()
  })

  it('vraagt de uitleg helemaal niet op zonder showCoachmark', () => {
    const fetchMock = mockCoachmarkApi(false)
    render(<EuroViewBadge />)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByRole('note')).toBeNull()
  })

  it('schrijft het wegklikken naar de server (cross-device), niet naar localStorage', async () => {
    const fetchMock = mockCoachmarkApi(false)
    render(<EuroViewBadge showCoachmark />)

    const knop = await screen.findByRole('button', { name: 'Duidelijk' })
    fireEvent.click(knop)

    expect(screen.queryByRole('note')).toBeNull()

    const put = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'PUT')
    expect(put, 'wegklikken hoort een PUT naar /api/coachmark te sturen').toBeTruthy()
    expect(put![0]).toBe('/api/coachmark')
    expect(JSON.parse((put![1] as RequestInit).body as string)).toEqual({ id: 'euro-view' })
  })

  it('haalt de staat één keer op, ook met meerdere badges op de pagina', async () => {
    const fetchMock = mockCoachmarkApi(true)
    // Zijbalk en TopBar staan allebei in de DOM; het breakpoint verbergt er één.
    render(
      <>
        <EuroViewBadge showCoachmark />
        <EuroViewBadge variant="compact" showCoachmark coachmarkAlign="right" />
      </>,
    )

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const gets = fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method !== 'PUT')
    expect(gets).toHaveLength(1)
  })
})
