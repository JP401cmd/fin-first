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
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import { EuroViewBadge, __resetCoachmarkCache } from './euro-view-badge'
import { claimAttention, __resetAttentionSignal } from '@/lib/attention-signal'
import type { EuroView } from '@/lib/euro-display'

const toggle = vi.fn()
let currentView: EuroView = 'nominal'
let currentPath = '/overzicht'
let chatOpen = false

vi.mock('@/lib/hooks/use-euro-view', () => ({
  useEuroView: () => ({ view: currentView, setView: vi.fn(), toggle }),
}))
// `useAttentionQuiet` (ADR 0134) leest het pad en de chat.
vi.mock('next/navigation', () => ({ usePathname: () => currentPath }))
vi.mock('@/components/app/chat/chat-provider', () => ({
  useChatContextOptional: () => ({ isOpen: chatOpen }),
}))

/**
 * De coachmark verschijnt pas na een startvertraging (UR3-10) - zonder die
 * pauze wint hij de race van de rondleiding die op ~400 ms begint. In de tests
 * duwen we de klok dus expliciet vooruit; `advanceTimersByTimeAsync` spoelt ook
 * de microtasks van de fetch door.
 */
const COACHMARK_DELAY_MS = 1500
async function laatDeUitlegVerschijnen() {
  // Twee stappen: eerst de fetch laten landen (dán pas plant het component zijn
  // startvertraging), daarna die vertraging uitzitten.
  await act(async () => { await vi.advanceTimersByTimeAsync(0) })
  await act(async () => { await vi.advanceTimersByTimeAsync(COACHMARK_DELAY_MS + 50) })
}

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
  vi.useFakeTimers()
  currentView = 'nominal'
  currentPath = '/overzicht'
  chatOpen = false
  toggle.mockClear()
  __resetCoachmarkCache()
  __resetAttentionSignal()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  __resetAttentionSignal()
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

    await laatDeUitlegVerschijnen()
    expect(screen.getByRole('note', { name: 'Uitleg bij de euro-weergave' })).toBeTruthy()
  })

  it('toont hem NIET wanneer hij al is weggeklikt', async () => {
    const fetchMock = mockCoachmarkApi(true)
    render(<EuroViewBadge showCoachmark />)

    await laatDeUitlegVerschijnen()
    expect(fetchMock).toHaveBeenCalled()
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

    await laatDeUitlegVerschijnen()
    const knop = screen.getByRole('button', { name: 'Duidelijk' })
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

    await laatDeUitlegVerschijnen()
    const gets = fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method !== 'PUT')
    expect(gets).toHaveLength(1)
  })
})

// -- UR3-10 - een ding tegelijk in de eerste minuut -------------------------
//
// De uitleg stond bij Bas op alle 55 desktoproutes open, dekte het
// Overzicht-submenu in de zijbalk af en verdween niet nadat hij de knop had
// gebruikt. Drie regels lossen dat op: zwijgen zolang een ander spreekt,
// sluiten op gebruik, en sluiten op de eerste routewissel.
describe('EuroViewBadge - coachmark wijkt en sluit (UR3-10)', () => {
  it('verschijnt niet - en fetcht niet - zolang een andere laag de aandacht claimt', async () => {
    const fetchMock = mockCoachmarkApi(false)
    claimAttention('rondleiding')
    render(<EuroViewBadge showCoachmark />)

    await laatDeUitlegVerschijnen()
    expect(screen.queryByRole('note')).toBeNull()
    // Geen stempel en geen netwerkverkeer zonder zichtbaarheid (M15).
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('verschijnt alsnog zodra die andere laag klaar is', async () => {
    let release: (() => void) | null = null
    act(() => { release = claimAttention('rondleiding') })
    mockCoachmarkApi(false)
    render(<EuroViewBadge showCoachmark />)
    await laatDeUitlegVerschijnen()
    expect(screen.queryByRole('note')).toBeNull()

    act(() => { release?.() })
    await laatDeUitlegVerschijnen()
    expect(screen.getByRole('note', { name: 'Uitleg bij de euro-weergave' })).toBeTruthy()
  })

  it('sluit wanneer de gebruiker de knop zelf gebruikt (AC 2)', async () => {
    const fetchMock = mockCoachmarkApi(false)
    render(<EuroViewBadge showCoachmark />)
    await laatDeUitlegVerschijnen()
    expect(screen.getByRole('note')).toBeTruthy()

    fireEvent.click(screen.getByTestId('sidebar-euro-view-badge'))

    expect(screen.queryByRole('note')).toBeNull()
    // De schakelaar doet nog steeds gewoon zijn werk.
    expect(toggle).toHaveBeenCalledTimes(1)
    const put = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'PUT')
    expect(put, 'gebruik van de knop hoort de uitleg weg te schrijven').toBeTruthy()
  })

  it('stuurt geen PUT wanneer er helemaal geen uitleg openstaat', async () => {
    const fetchMock = mockCoachmarkApi(true)
    render(<EuroViewBadge showCoachmark />)
    await laatDeUitlegVerschijnen()

    fireEvent.click(screen.getByTestId('sidebar-euro-view-badge'))

    const puts = fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'PUT')
    expect(puts).toHaveLength(0)
  })

  it('sluit op de eerste routewissel na het verschijnen (AC 2)', async () => {
    const fetchMock = mockCoachmarkApi(false)
    const { rerender } = render(<EuroViewBadge showCoachmark />)
    await laatDeUitlegVerschijnen()
    expect(screen.getByRole('note')).toBeTruthy()

    currentPath = '/toekomst'
    await act(async () => { rerender(<EuroViewBadge showCoachmark />) })

    expect(screen.queryByRole('note')).toBeNull()
    const put = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'PUT')
    expect(put, 'een pagina verder hoort de uitleg weg te schrijven').toBeTruthy()
  })

  it('verliest de uitleg NIET wanneer je wegnavigeert voordat hij te zien was (M15)', async () => {
    const fetchMock = mockCoachmarkApi(false)
    claimAttention('rondleiding') // stil: de rondleiding loopt
    const { rerender } = render(<EuroViewBadge showCoachmark />)
    await laatDeUitlegVerschijnen()

    currentPath = '/toekomst'
    await act(async () => { rerender(<EuroViewBadge showCoachmark />) })

    const puts = fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'PUT')
    expect(puts, 'een nooit getoonde uitleg mag niet als gezien worden weggeschreven').toHaveLength(0)
  })
})
