/**
 * Regressietest voor de GIDSWEERGAVE IN FIN (ADR 0130).
 *
 * De welkomstgids verhuisde van een banner op /overzicht naar een vierde icoon
 * in de chat-kop. Wat hier vastligt is precies wat bij die verhuizing kon
 * sneuvelen:
 *  - schermnavigatie en afvinken blijven via dezelfde PUT-acties lopen;
 *  - een stap-link sluit de chat (want die zou anders de pagina afdekken) —
 *    behalve wanneer het paneel gepind is, want dan is het een zijbalk;
 *  - "Ik ben klaar met de gids" is geen eenrichtingsuitgang meer: de lege staat
 *    biedt "Gids opnieuw tonen" (PUT `reactivate`);
 *  - de APP-2-zin over de weergavekeuze verhuisde mee (dit is de enige plek
 *    waar de app die keuze zelf noemt);
 *  - bij openen wordt één verse GET gedaan, want de seed is zo oud als de
 *    laatste harde shell-render.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, act, fireEvent, waitFor } from '@testing-library/react'
import { GidsView } from './gids-view'
import { WelcomeGuideProvider } from './welcome-guide-provider'
import {
  DEFAULT_WELCOME_GUIDE,
  DEFAULT_WELCOME_GUIDE_STATE,
  type WelcomeGuideState,
} from '@/lib/welcome-guide'
import { DisplayModeProvider, type DisplayMode } from '@/lib/hooks/use-display-mode'
import {
  useRondleidingRequested,
  __resetRondleidingSignal,
} from '@/lib/rondleiding/signal'

// De chatcontext is per test in te stellen (gepind ja/nee + spy op close).
let chatCtx: { close: ReturnType<typeof vi.fn>; isPinned: boolean } = {
  close: vi.fn(),
  isPinned: false,
}
vi.mock('../chat-provider', () => ({
  useChatContext: () => chatCtx,
}))

// De gidsweergave draagt sinds ADR 0130 fase 3b de ingang naar de rondleiding,
// en die kiest tussen "signaal" (al op /overzicht) en "navigeren" (elders).
const routerPush = vi.fn()
let pathname = '/overzicht/bezittingen'
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(),
}))

/**
 * Stubt /api/welcome-guide. De PUT-echo past de actie toe op de staat, net als
 * de echte route — zonder dat draait de server-echo de optimistische mutatie
 * meteen terug en test je het tegenovergestelde van wat je bedoelt.
 */
function mockGuideFetch(state: WelcomeGuideState = DEFAULT_WELCOME_GUIDE_STATE) {
  let current = state
  const fn = vi.fn((_url: string, opts?: { method?: string; body?: string }) => {
    if (opts?.method === 'PUT') {
      const action = opts.body ? (JSON.parse(opts.body).action as string) : ''
      const next: WelcomeGuideState = {
        ...current,
        currentScreen:
          action === 'nextScreen'
            ? current.currentScreen + 1
            : action === 'prevScreen'
              ? Math.max(0, current.currentScreen - 1)
              : current.currentScreen,
        status:
          action === 'dismiss'
            ? ('dismissed' as const)
            : action === 'reactivate'
              ? ('active' as const)
              : current.status,
      }
      current = next
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ state: next }) })
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ config: DEFAULT_WELCOME_GUIDE, state: current }),
    })
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

/** Alle PUT-acties die naar /api/welcome-guide gingen. */
const putActions = (fn: ReturnType<typeof mockGuideFetch>): string[] =>
  fn.mock.calls
    .filter(([, opts]) => (opts as { method?: string } | undefined)?.method === 'PUT')
    .map(([, opts]) => JSON.parse((opts as { body: string }).body).action as string)

/** Alle GET-aanroepen (geen `method` = GET). */
const getCalls = (fn: ReturnType<typeof mockGuideFetch>): number =>
  fn.mock.calls.filter(([, opts]) => !(opts as { method?: string } | undefined)?.method).length

function renderSeeded(
  state: WelcomeGuideState = DEFAULT_WELCOME_GUIDE_STATE,
  { mode = 'full' as DisplayMode, dismissed = false } = {},
) {
  return render(
    <DisplayModeProvider initialMode={mode}>
      <WelcomeGuideProvider
        seed={dismissed ? null : { config: DEFAULT_WELCOME_GUIDE, state }}
        dismissed={dismissed}
      >
        <GidsView />
      </WelcomeGuideProvider>
    </DisplayModeProvider>,
  )
}

const flush = async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  chatCtx = { close: vi.fn(), isPinned: false }
  routerPush.mockClear()
  pathname = '/overzicht/bezittingen'
  __resetRondleidingSignal()
})

describe('GidsView — schermen doorlopen', () => {
  it('toont scherm 1 en haalt bij openen één verse payload op', async () => {
    const fn = mockGuideFetch()
    renderSeeded()

    // 'Welkom bij TriFinity' is de kicker (config-breed); scherm 1 herken je
    // aan zijn eerste stap.
    expect(await screen.findByText('Welkom bij TriFinity')).toBeInTheDocument()
    expect(screen.getByText('Zijn al je bezittingen geregistreerd?')).toBeInTheDocument()
    // De seed vulde het scherm al; de GET is de versheidscorrectie (M1-vinkjes
    // die net elders zijn afgerond).
    await waitFor(() => expect(getCalls(fn)).toBeGreaterThanOrEqual(1))
  })

  it('navigeert naar het volgende scherm via PUT nextScreen', async () => {
    const fn = mockGuideFetch()
    renderSeeded()
    await screen.findByText('Welkom bij TriFinity')

    fireEvent.click(screen.getByRole('button', { name: /Volgend scherm/ }))
    await flush()

    expect(putActions(fn)).toContain('nextScreen')
    // Scherm 2 staat er; scherm 1 niet meer. (De kicker is configbreed en
    // wisselt dus niet mee — daarom toetsen we op een stap.)
    expect(screen.getByText('Heb je je voorkeuren al aangegeven?')).toBeInTheDocument()
    expect(
      screen.queryByText('Zijn al je bezittingen geregistreerd?'),
    ).not.toBeInTheDocument()
  })

  it('"Vorige" is onzichtbaar op scherm 1 en stuurt daarna PUT prevScreen', async () => {
    const fn = mockGuideFetch({ ...DEFAULT_WELCOME_GUIDE_STATE, currentScreen: 1 })
    renderSeeded({ ...DEFAULT_WELCOME_GUIDE_STATE, currentScreen: 1 })
    await flush()

    fireEvent.click(screen.getByRole('button', { name: /Vorige/ }))
    await flush()

    expect(putActions(fn)).toContain('prevScreen')
  })

  it('een stap afvinken stuurt PUT toggleStep', async () => {
    const fn = mockGuideFetch()
    renderSeeded()
    await screen.findByText('Welkom bij TriFinity')

    fireEvent.click(
      screen.getByRole('button', { name: /Markeer "Zijn al je bezittingen geregistreerd\?"/ }),
    )
    await flush()

    expect(putActions(fn)).toContain('toggleStep')
  })

  it('toont geen "Scherm N van M"-teller — de stippen dragen de positie', async () => {
    mockGuideFetch()
    renderSeeded()
    await screen.findByText('Welkom bij TriFinity')

    expect(screen.queryByText(/Scherm 1 van/)).not.toBeInTheDocument()
  })
})

describe('GidsView — navigeren sluit de chat, tenzij gepind', () => {
  it('een stap-link sluit het paneel', async () => {
    mockGuideFetch()
    renderSeeded()
    await screen.findByText('Welkom bij TriFinity')

    // In de compacte weergave is de stap-link een pijl zonder tekst; pak de
    // eerste link die naar een stap-href wijst.
    const links = screen.getAllByRole('link')
    const stepLink = links.find((l) => l.getAttribute('href') !== '/mijn/uiterlijk')
    expect(stepLink).toBeDefined()
    fireEvent.click(stepLink!)

    expect(chatCtx.close).toHaveBeenCalledTimes(1)
  })

  it('laat het paneel staan wanneer het gepind is (dan is het een zijbalk)', async () => {
    chatCtx = { close: vi.fn(), isPinned: true }
    mockGuideFetch()
    renderSeeded()
    await screen.findByText('Welkom bij TriFinity')

    const links = screen.getAllByRole('link')
    const stepLink = links.find((l) => l.getAttribute('href') !== '/mijn/uiterlijk')
    fireEvent.click(stepLink!)

    expect(chatCtx.close).not.toHaveBeenCalled()
  })
})

describe('GidsView — APP-2: de gids noemt de weergavekeuze', () => {
  it('noemt de tegenovergestelde stand en linkt naar /mijn/uiterlijk, in beide modi', async () => {
    for (const [mode, zin] of [
      ['simple', /Je kijkt in de eenvoudige weergave/],
      ['full', /Je kijkt in de volledige weergave/],
    ] as const) {
      mockGuideFetch()
      const { unmount } = renderSeeded(DEFAULT_WELCOME_GUIDE_STATE, { mode })
      await screen.findByText('Welkom bij TriFinity')

      expect(screen.getByText(zin, { exact: false })).toBeInTheDocument()
      const link = screen.getByRole('link', { name: 'Mijn → Uiterlijk' })
      expect(link.getAttribute('href')).toBe('/mijn/uiterlijk')

      unmount()
      vi.unstubAllGlobals()
    }
  })

  it('die link sluit de chat óók (je navigeert weg van het paneel)', async () => {
    mockGuideFetch()
    renderSeeded()
    await screen.findByText('Welkom bij TriFinity')

    fireEvent.click(screen.getByRole('link', { name: 'Mijn → Uiterlijk' }))

    expect(chatCtx.close).toHaveBeenCalledTimes(1)
  })
})

describe('GidsView — afsluiten en weer aanzetten', () => {
  it('"Ik ben klaar met de gids" stuurt PUT dismiss en toont de lege staat', async () => {
    const fn = mockGuideFetch()
    renderSeeded()
    await screen.findByText('Welkom bij TriFinity')

    fireEvent.click(screen.getByRole('button', { name: 'Ik ben klaar met de gids' }))
    await flush()

    expect(putActions(fn)).toContain('dismiss')
    expect(screen.getByText('Je hebt de gids afgesloten.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Gids opnieuw tonen' })).toBeInTheDocument()
  })

  it('een afgesloten gids toont de lege staat zonder provider-fetch', async () => {
    const fn = mockGuideFetch({ ...DEFAULT_WELCOME_GUIDE_STATE, status: 'dismissed' })
    renderSeeded(DEFAULT_WELCOME_GUIDE_STATE, { dismissed: true })

    // METEEN zichtbaar, zonder await: de lege staat heeft geen config nodig, dus
    // de provider hoeft voor een afgesloten gids niets te laden. Dat is precies
    // het verkeer dat ADR 0130 wilde besparen.
    expect(screen.getByText('Je hebt de gids afgesloten.')).toBeInTheDocument()

    await flush()
    expect(screen.getByText('Je hebt de gids afgesloten.')).toBeInTheDocument()
    expect(putActions(fn)).toEqual([])
  })

  it('"Gids opnieuw tonen" stuurt PUT reactivate en brengt de schermen terug', async () => {
    const fn = mockGuideFetch({ ...DEFAULT_WELCOME_GUIDE_STATE, status: 'dismissed' })
    renderSeeded(DEFAULT_WELCOME_GUIDE_STATE, { dismissed: true })
    await flush()

    fireEvent.click(screen.getByRole('button', { name: 'Gids opnieuw tonen' }))
    await flush()

    expect(putActions(fn)).toContain('reactivate')
    expect(await screen.findByText('Welkom bij TriFinity')).toBeInTheDocument()
  })
})

/**
 * De rondleiding-ingang (ADR 0130, fase 3b). De gids en de rondleiding
 * beantwoorden dezelfde vraag in twee vormen — checklist en wandeling — dus ze
 * horen in hetzelfde huis. Twee dingen kunnen hier stil breken:
 *
 *  - het LABEL, dat de afloop van de vorige poging volgt ("afmaken" is een
 *    andere belofte dan "opnieuw"); en
 *  - de NAVIGATIE: sta je al op /overzicht, dan volstaat het module-signaal;
 *    sta je elders, dan is de query-param nodig omdat een module-signaal de
 *    route-wissel niet overleeft.
 */
function RondleidingProbe() {
  const verzocht = useRondleidingRequested()
  return <span data-testid="verzocht">{verzocht ? 'ja' : 'nee'}</span>
}

/** Stubt zowel /api/welcome-guide als /api/coachmark. */
function mockGuideEnCoachmark(coachmark: {
  dismissed?: Record<string, boolean>
  outcome?: Record<string, string | null>
}) {
  const guideFn = mockGuideFetch()
  const fn = vi.fn((url: string, opts?: { method?: string; body?: string }) => {
    if (String(url).includes('/api/coachmark')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(coachmark) })
    }
    return guideFn(url, opts)
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

describe('GidsView — ingang naar de rondleiding', () => {
  it('zegt "Start de rondleiding" wanneer hij nog nooit liep', async () => {
    mockGuideEnCoachmark({ dismissed: { 'overzicht-rondleiding': false }, outcome: {} })
    renderSeeded()
    await screen.findByText('Welkom bij TriFinity')

    expect(
      await screen.findByRole('button', { name: /Start de rondleiding/ }),
    ).toBeInTheDocument()
  })

  it('zegt "Rondleiding afmaken" na een onderbreking', async () => {
    mockGuideEnCoachmark({
      dismissed: { 'overzicht-rondleiding': true },
      outcome: { 'overzicht-rondleiding': 'onderbroken' },
    })
    renderSeeded()
    await screen.findByText('Welkom bij TriFinity')

    expect(await screen.findByRole('button', { name: /Rondleiding afmaken/ })).toBeInTheDocument()
  })

  it('zegt "Rondleiding opnieuw" na een voltooide of overgeslagen ronde', async () => {
    mockGuideEnCoachmark({
      dismissed: { 'overzicht-rondleiding': true },
      outcome: { 'overzicht-rondleiding': 'voltooid' },
    })
    renderSeeded()
    await screen.findByText('Welkom bij TriFinity')

    expect(await screen.findByRole('button', { name: /Rondleiding opnieuw/ })).toBeInTheDocument()
  })

  it('navigeert vanaf een andere route naar /overzicht?rondleiding=start', async () => {
    pathname = '/overzicht/bezittingen'
    mockGuideEnCoachmark({ dismissed: {}, outcome: {} })
    render(
      <DisplayModeProvider initialMode="full">
        <WelcomeGuideProvider
          seed={{ config: DEFAULT_WELCOME_GUIDE, state: DEFAULT_WELCOME_GUIDE_STATE }}
          dismissed={false}
        >
          <GidsView />
          <RondleidingProbe />
        </WelcomeGuideProvider>
      </DisplayModeProvider>,
    )
    await screen.findByText('Welkom bij TriFinity')

    fireEvent.click(await screen.findByRole('button', { name: /rondleiding/i }))

    expect(routerPush).toHaveBeenCalledWith('/overzicht?rondleiding=start')
    expect(screen.getByTestId('verzocht')).toHaveTextContent('nee')
    expect(chatCtx.close).toHaveBeenCalledTimes(1)
  })

  it('gebruikt het module-signaal wanneer je al op /overzicht staat', async () => {
    pathname = '/overzicht'
    mockGuideEnCoachmark({ dismissed: {}, outcome: {} })
    render(
      <DisplayModeProvider initialMode="full">
        <WelcomeGuideProvider
          seed={{ config: DEFAULT_WELCOME_GUIDE, state: DEFAULT_WELCOME_GUIDE_STATE }}
          dismissed={false}
        >
          <GidsView />
          <RondleidingProbe />
        </WelcomeGuideProvider>
      </DisplayModeProvider>,
    )
    await screen.findByText('Welkom bij TriFinity')

    fireEvent.click(await screen.findByRole('button', { name: /rondleiding/i }))

    expect(routerPush).not.toHaveBeenCalled()
    expect(screen.getByTestId('verzocht')).toHaveTextContent('ja')
    expect(chatCtx.close).toHaveBeenCalledTimes(1)
  })
})
