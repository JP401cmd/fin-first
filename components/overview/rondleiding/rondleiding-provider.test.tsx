/**
 * Tests voor de MOTOR van de rondleiding (ADR 0130, fase 3b).
 *
 * De provider beslist drie dingen die je pas in productie zou merken als ze
 * verkeerd staan, en die geen enkele typecheck vangt:
 *
 *  1. WANNEER hij vanzelf start. Te ruim en de rondleiding valt bestaande
 *     gebruikers uit het niets over het scherm; te krap en een vers account
 *     ziet 'm nooit. De voorwaarde is dus hard vastgelegd: `pending && !seen`.
 *  2. DAT hij het signaal zet. Fin leest `useRondleidingActive()` om te zwijgen
 *     tijdens de tour; blijft dat signaal uit, dan typt zijn melding dwars door
 *     de spotlight heen (precies de M15-klasse).
 *  3. HOE hij eindigt. Elke uitgang schrijft één `PUT /api/coachmark` met de
 *     juiste `outcome` — die uitkomst labelt later de knop in de gidsweergave,
 *     dus "overgeslagen" vs. "onderbroken" is geen detail.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, act, fireEvent, waitFor } from '@testing-library/react'
import {
  isRondleidingActive,
  requestRondleiding,
  __resetRondleidingSignal,
} from '@/lib/rondleiding/signal'
import type { RondleidingData } from '@/lib/rondleiding/steps'
import { RondleidingProvider } from './rondleiding-provider'

// ── Stubs ───────────────────────────────────────────────────────────────────

const replace = vi.fn()
const push = vi.fn()
let searchParams = new URLSearchParams()
let pathname = '/overzicht'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push, refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => pathname,
  useSearchParams: () => searchParams,
}))

const openGids = vi.fn()
vi.mock('@/components/app/chat/chat-provider', () => ({
  useChatContext: () => ({ openGids, close: vi.fn(), isPinned: false }),
}))

const DATA: Omit<RondleidingData, 'vrijheid'> = {
  userName: 'Bas',
  totals: { bezittingen: 368270, schulden: 221400, cashflow: 38, belasting: 1240 },
  housingSplit: null,
  leverStatus: { bezittingen: 'good', schulden: 'warn', cashflow: 'good', belasting: 'warn' },
  assetTypeCount: 4,
  largestAssetTypeShare: 0.42,
  health: { total: 72, label: 'Sterk' },
  currentNetWorth: 146870,
  woning: null,
  dailyExpenseRate: 92.4,
  isPensioen: false,
}

/** Het eerste doelwit moet bestaan voordat de autostart afvuurt. */
function plaatsEersteTarget() {
  const el = document.createElement('div')
  el.setAttribute('data-tour', 'hefboom-bezittingen')
  el.getClientRects = (() => [{ x: 0, y: 0, width: 300, height: 120 }]) as unknown as Element['getClientRects']
  el.getBoundingClientRect = (() =>
    ({ top: 200, left: 100, width: 300, height: 120, bottom: 320, right: 400, x: 100, y: 200, toJSON: () => ({}) })) as unknown as Element['getBoundingClientRect']
  document.body.appendChild(el)
}

function renderProvider(seed: { pending: boolean; seen: boolean }) {
  return render(
    <RondleidingProvider seed={seed} data={DATA}>
      <div>pagina</div>
    </RondleidingProvider>,
  )
}

/** Alle PUT-bodies naar /api/coachmark. */
function coachmarkPuts(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls
    .filter(([url, opts]) => String(url).includes('/api/coachmark') && (opts as { method?: string })?.method === 'PUT')
    .map(([, opts]) => JSON.parse((opts as { body: string }).body) as { id: string; outcome?: string })
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  __resetRondleidingSignal()
  replace.mockClear()
  push.mockClear()
  openGids.mockClear()
  searchParams = new URLSearchParams()
  pathname = '/overzicht'
  Element.prototype.scrollIntoView = vi.fn()
  fetchMock = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) }))
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  __resetRondleidingSignal()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

/** Wacht tot de kaart zichtbaar is (autostart heeft ~400 ms nodig). */
const wachtOpKaart = () => screen.findByTestId('rondleiding-kaart')

describe('RondleidingProvider — autostart', () => {
  it('start vanzelf bij een vers account (pending && !seen)', async () => {
    plaatsEersteTarget()
    renderProvider({ pending: true, seen: false })

    expect(await wachtOpKaart()).toBeInTheDocument()
    // Het welkom opent met een eigen getal, niet met een reclamezin.
    expect(screen.getByText(/146\.870/)).toBeInTheDocument()
  })

  it('start NIET wanneer de rondleiding al eens liep', async () => {
    plaatsEersteTarget()
    renderProvider({ pending: true, seen: true })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 900))
    })
    expect(screen.queryByTestId('rondleiding-kaart')).not.toBeInTheDocument()
  })

  it('start NIET bij een bestaande gebruiker zonder tegoed', async () => {
    plaatsEersteTarget()
    renderProvider({ pending: false, seen: false })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 900))
    })
    expect(screen.queryByTestId('rondleiding-kaart')).not.toBeInTheDocument()
  })

  it('wacht tot het eerste doelwit in de DOM staat', async () => {
    // Geen target bij mount: de eerste poging vindt niets en probeert opnieuw.
    renderProvider({ pending: true, seen: false })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 500))
    })
    expect(screen.queryByTestId('rondleiding-kaart')).not.toBeInTheDocument()

    plaatsEersteTarget()
    expect(await wachtOpKaart()).toBeInTheDocument()
  })
})

describe('RondleidingProvider — handmatige start', () => {
  it('start op verzoek van het module-signaal (gids in Fin, pagina-`i`)', async () => {
    plaatsEersteTarget()
    renderProvider({ pending: false, seen: true })

    act(() => {
      requestRondleiding()
    })
    expect(await wachtOpKaart()).toBeInTheDocument()
  })

  it('start op ?rondleiding=start en stript de parameter uit de adresbalk', async () => {
    plaatsEersteTarget()
    searchParams = new URLSearchParams('rondleiding=start&x=1')
    renderProvider({ pending: false, seen: true })

    expect(await wachtOpKaart()).toBeInTheDocument()
    await waitFor(() => expect(replace).toHaveBeenCalled())
    expect(replace.mock.calls[0][0]).toBe('/overzicht?x=1')
    expect(replace.mock.calls[0][1]).toMatchObject({ scroll: false })
  })
})

describe('RondleidingProvider — het signaal naar Fin', () => {
  it('zet het actief-signaal aan tijdens de tour en uit bij afloop', async () => {
    plaatsEersteTarget()
    renderProvider({ pending: true, seen: false })
    await wachtOpKaart()

    expect(isRondleidingActive()).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Sla over' }))
    await waitFor(() => expect(isRondleidingActive()).toBe(false))
  })

  it('staat uit zolang de rondleiding niet loopt', async () => {
    plaatsEersteTarget()
    renderProvider({ pending: false, seen: true })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 600))
    })
    expect(isRondleidingActive()).toBe(false)
  })
})

describe('RondleidingProvider — uitkomsten', () => {
  it('overslaan meldt `overgeslagen`, precies één keer', async () => {
    plaatsEersteTarget()
    renderProvider({ pending: true, seen: false })
    await wachtOpKaart()

    fireEvent.click(screen.getByRole('button', { name: 'Sla over' }))

    await waitFor(() => expect(coachmarkPuts(fetchMock)).toHaveLength(1))
    expect(coachmarkPuts(fetchMock)[0]).toMatchObject({
      id: 'overzicht-rondleiding',
      outcome: 'overgeslagen',
    })
    expect(
      (fetchMock.mock.calls[0][1] as { keepalive?: boolean }).keepalive,
      'keepalive is nodig: bij een klik die navigeert vertrekt het verzoek anders niet',
    ).toBe(true)
  })

  it('een route-wissel weg van /overzicht meldt `onderbroken`', async () => {
    plaatsEersteTarget()
    const view = renderProvider({ pending: true, seen: false })
    await wachtOpKaart()

    pathname = '/overzicht/bezittingen'
    view.rerender(
      <RondleidingProvider seed={{ pending: true, seen: false }} data={DATA}>
        <div>pagina</div>
      </RondleidingProvider>,
    )

    await waitFor(() => expect(coachmarkPuts(fetchMock)).toHaveLength(1))
    expect(coachmarkPuts(fetchMock)[0].outcome).toBe('onderbroken')
  })

  it('"Begin met je eerste stap" meldt `voltooid` en opent de gids in Fin', async () => {
    plaatsEersteTarget()
    renderProvider({ pending: true, seen: false })
    await wachtOpKaart()

    // Doorstappen naar de laatste kaart. De hero-doelwitten ontbreken, dus de
    // spotlight slaat ze na de deadline over; sneller is doorklikken.
    for (let i = 0; i < 8; i++) {
      const knop =
        screen.queryByRole('button', { name: 'Volgende' }) ??
        screen.queryByRole('button', { name: 'Laat maar zien' })
      if (!knop) break
      fireEvent.click(knop)
    }

    const afronden = await screen.findByRole('button', { name: 'Begin met je eerste stap' })
    fireEvent.click(afronden)

    await waitFor(() => expect(coachmarkPuts(fetchMock)).toHaveLength(1))
    expect(coachmarkPuts(fetchMock)[0].outcome).toBe('voltooid')
    await waitFor(() => expect(openGids).toHaveBeenCalledTimes(1))
  })

  it('"Zelf rondkijken" meldt `voltooid` zonder de gids te openen', async () => {
    plaatsEersteTarget()
    renderProvider({ pending: true, seen: false })
    await wachtOpKaart()

    for (let i = 0; i < 8; i++) {
      const knop =
        screen.queryByRole('button', { name: 'Volgende' }) ??
        screen.queryByRole('button', { name: 'Laat maar zien' })
      if (!knop) break
      fireEvent.click(knop)
    }

    fireEvent.click(await screen.findByRole('button', { name: 'Zelf rondkijken' }))

    await waitFor(() => expect(coachmarkPuts(fetchMock)).toHaveLength(1))
    expect(coachmarkPuts(fetchMock)[0].outcome).toBe('voltooid')
    expect(openGids).not.toHaveBeenCalled()
  })
})
