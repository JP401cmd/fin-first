/**
 * Regressietest voor WelcomeGuideBanner.
 *
 * Kernpunt: in dev draait React onder <StrictMode> elk effect TWEE keer
 * (mount → cleanup → mount). Een eerdere bug combineerde een `fetchedRef`-guard
 * met een `cancelled`-cleanup-flag, waardoor de tweede mount niet opnieuw
 * fetchte én de eerste fetch als "cancelled" werd weggegooid → `setData` werd
 * nooit aangeroepen → de banner verscheen nooit. Deze test mount de banner
 * expliciet onder <StrictMode> en borgt dat scherm 1 wél verschijnt.
 */
import { StrictMode } from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react'
import { WelcomeGuideBanner } from './welcome-guide-banner'
import { WelcomeGuideProvider } from './welcome-guide-provider'
import { WelcomeGuideDot } from './welcome-guide-dot'
import {
  DEFAULT_WELCOME_GUIDE,
  DEFAULT_WELCOME_GUIDE_STATE,
  type WelcomeGuideState,
} from '@/lib/welcome-guide'
import { DisplayModeProvider, type DisplayMode } from '@/lib/hooks/use-display-mode'

function mockGuideFetch(payload?: {
  configEnabled?: boolean
  status?: 'active' | 'dismissed'
  /** Basisstaat waarop de PUT-echo de actie toepast (default = de app-default). */
  state?: WelcomeGuideState
}) {
  const config = { ...DEFAULT_WELCOME_GUIDE, enabled: payload?.configEnabled ?? true }
  const state = {
    ...DEFAULT_WELCOME_GUIDE_STATE,
    ...(payload?.state ?? {}),
    status: payload?.status ?? payload?.state?.status ?? 'active',
  }
  // De PUT-echo past de actie toe op de staat, net als de echte route. Zonder
  // dat zou de server-echo de optimistische minimize/restore meteen terugdraaien
  // — en dan test je het tegenovergestelde van wat je bedoelt.
  const fn = vi.fn((_url: string, opts?: { method?: string; body?: string }) => {
    if (opts?.method === 'PUT') {
      const action = opts.body ? (JSON.parse(opts.body).action as string) : ''
      const next = {
        ...state,
        minimized: action === 'minimize' ? true : action === 'restore' ? false : state.minimized,
        status: action === 'dismiss' ? ('dismissed' as const) : state.status,
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ state: next }) })
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ config, state }) })
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

describe('WelcomeGuideBanner', () => {
  beforeEach(() => {
    try {
      sessionStorage.clear()
    } catch {
      /* no-op */
    }
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('toont scherm 1 ondanks de dubbele StrictMode-mount', async () => {
    mockGuideFetch()
    render(
      <StrictMode>
        <WelcomeGuideProvider>
          <WelcomeGuideBanner />
        </WelcomeGuideProvider>
      </StrictMode>,
    )
    // De async fetch landt na de (dubbele) mount → scherm 1 (kop-loze process-
    // kaarten) moet verschijnen; we toetsen op de kicker + de eerste stap.
    expect(await screen.findByText('Zijn al je bezittingen geregistreerd?')).toBeInTheDocument()
    expect(screen.getByText('Welkom bij TriFinity')).toBeInTheDocument()
  })

  it('rendert niets wanneer de gids voor alle gebruikers uit staat', async () => {
    mockGuideFetch({ configEnabled: false })
    render(
      <WelcomeGuideProvider>
        <WelcomeGuideBanner />
      </WelcomeGuideProvider>,
    )
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(screen.queryByText('Welkom bij TriFinity')).not.toBeInTheDocument()
  })

  it('rendert niets wanneer de gebruiker de gids voorgoed heeft gesloten', async () => {
    mockGuideFetch({ status: 'dismissed' })
    render(
      <WelcomeGuideProvider>
        <WelcomeGuideBanner />
      </WelcomeGuideProvider>,
    )
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(screen.queryByText('Welkom bij TriFinity')).not.toBeInTheDocument()
  })

  it('geminimaliseerde staat uit de seed → geen gids, wél het punt', async () => {
    vi.stubGlobal('fetch', vi.fn())
    render(
      <WelcomeGuideProvider
        seed={{
          config: DEFAULT_WELCOME_GUIDE,
          state: { ...DEFAULT_WELCOME_GUIDE_STATE, minimized: true },
        }}
      >
        <WelcomeGuideBanner />
        <WelcomeGuideDot />
      </WelcomeGuideProvider>,
    )
    expect(
      await screen.findByRole('button', { name: 'Welkomstgids weer tonen' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Welkom bij TriFinity')).not.toBeInTheDocument()
  })

  it('seed aanwezig → toont scherm 1 ZONDER fetch', async () => {
    const fn = vi.fn()
    vi.stubGlobal('fetch', fn)
    render(
      <WelcomeGuideProvider seed={{ config: DEFAULT_WELCOME_GUIDE, state: DEFAULT_WELCOME_GUIDE_STATE }}>
        <WelcomeGuideBanner />
      </WelcomeGuideProvider>,
    )
    expect(await screen.findByText('Zijn al je bezittingen geregistreerd?')).toBeInTheDocument()
    expect(fn).not.toHaveBeenCalled()
  })

  it('seed met uitgeschakelde config → niets, geen fetch', async () => {
    const fn = vi.fn()
    vi.stubGlobal('fetch', fn)
    render(
      <WelcomeGuideProvider
        seed={{
          config: { ...DEFAULT_WELCOME_GUIDE, enabled: false },
          state: DEFAULT_WELCOME_GUIDE_STATE,
        }}
      >
        <WelcomeGuideBanner />
      </WelcomeGuideProvider>,
    )
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(screen.queryByText('Welkom bij TriFinity')).not.toBeInTheDocument()
    expect(fn).not.toHaveBeenCalled()
  })
})

/**
 * M1 — de gids weet wat de app al weet. De banner krijgt naast `state` een
 * `derived`-map met de server-afgeleide stap-toestand; die moet in de teller
 * meetellen en zichtbaar anders zijn dan een zelf gezet vinkje.
 */
describe('WelcomeGuideBanner — afgeleide voortgang', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  const S1 = ['s1-bezittingen', 's1-schulden', 's1-budget', 's1-rekening']

  function renderWithDerived(derived: Record<string, 'done' | 'open' | 'nvt'>) {
    vi.stubGlobal('fetch', vi.fn())
    return render(
      <DisplayModeProvider initialMode="full">
        <WelcomeGuideProvider
          seed={{ config: DEFAULT_WELCOME_GUIDE, state: DEFAULT_WELCOME_GUIDE_STATE, derived }}
        >
          <WelcomeGuideBanner />
        </WelcomeGuideProvider>
      </DisplayModeProvider>,
    )
  }

  it('gevuld account: teller staat op 4/4 zonder één handmatig vinkje', async () => {
    renderWithDerived(Object.fromEntries(S1.map((id) => [id, 'done' as const])))
    expect(await screen.findByText('Zijn al je bezittingen geregistreerd?')).toBeInTheDocument()
    expect(screen.getByText(/4\/4 afgevinkt/)).toBeInTheDocument()
  })

  it('zonder afleiding blijft het 0/4 — het gedrag van vóór M1', async () => {
    renderWithDerived({})
    expect(await screen.findByText('Zijn al je bezittingen geregistreerd?')).toBeInTheDocument()
    expect(screen.getByText(/0\/4 afgevinkt/)).toBeInTheDocument()
  })

  it('afgeleid vinkje is niet klikbaar en meldt zich als automatisch', async () => {
    renderWithDerived({ 's1-bezittingen': 'done' })
    expect(await screen.findByText('Zijn al je bezittingen geregistreerd?')).toBeInTheDocument()
    // Geen knop meer voor deze stap — een afgeleid vinkje uitzetten kan niet.
    expect(
      screen.queryByRole('button', { name: /Markeer "Zijn al je bezittingen geregistreerd\?"/ }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByLabelText(/automatisch afgevinkt op basis van je gegevens/),
    ).toBeInTheDocument()
    // Een stap zonder afleiding blijft gewoon handmatig afvinkbaar.
    expect(
      screen.getByRole('button', { name: /Markeer "Zijn al je schulden geregistreerd\?"/ }),
    ).toBeInTheDocument()
  })

  it("'n.v.t.' valt buiten de teller en is niet groen", async () => {
    renderWithDerived({
      's1-bezittingen': 'done',
      's1-schulden': 'nvt',
      's1-budget': 'done',
      's1-rekening': 'done',
    })
    expect(await screen.findByText('Zijn al je bezittingen geregistreerd?')).toBeInTheDocument()
    expect(screen.getByText(/3\/3 afgevinkt/)).toBeInTheDocument()
    expect(screen.getByText(/1 n\.v\.t\./)).toBeInTheDocument()
    expect(screen.getByLabelText(/niet van toepassing/)).toBeInTheDocument()
  })
})

/**
 * APP-6 (gids comprimeren in Eenvoudig) + APP-2 (de gids noemt de weergave-
 * keuze). De seed-route wordt gebruikt zodat er geen fetch aan te pas komt.
 */
describe('WelcomeGuideBanner — weergavemodus', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  function renderSeeded(mode: DisplayMode) {
    vi.stubGlobal('fetch', vi.fn())
    return render(
      <DisplayModeProvider initialMode={mode}>
        <WelcomeGuideProvider
          seed={{ config: DEFAULT_WELCOME_GUIDE, state: DEFAULT_WELCOME_GUIDE_STATE }}
        >
          <WelcomeGuideBanner />
        </WelcomeGuideProvider>
      </DisplayModeProvider>,
    )
  }

  it('Eenvoudig: geen "Scherm N van M"-teller en geen stapomschrijvingen', async () => {
    renderSeeded('simple')
    expect(await screen.findByText('Zijn al je bezittingen geregistreerd?')).toBeInTheDocument()
    expect(screen.queryByText(/Scherm 1 van/)).not.toBeInTheDocument()
    expect(
      screen.queryByText('Zoals eigen huis, cash rekeningen en aandelen.'),
    ).not.toBeInTheDocument()
  })

  it('Volledig: teller én stapomschrijvingen blijven staan', async () => {
    renderSeeded('full')
    expect(await screen.findByText('Zijn al je bezittingen geregistreerd?')).toBeInTheDocument()
    expect(screen.getByText(/Scherm 1 van/)).toBeInTheDocument()
    expect(screen.getByText('Zoals eigen huis, cash rekeningen en aandelen.')).toBeInTheDocument()
  })

  it('noemt de weergavekeuze en linkt naar /mijn/uiterlijk — in beide modi', async () => {
    for (const [mode, zin] of [
      ['simple', /Je kijkt in de eenvoudige weergave/],
      ['full', /Je kijkt in de volledige weergave/],
    ] as const) {
      const { unmount } = renderSeeded(mode)
      expect(await screen.findByText('Zijn al je bezittingen geregistreerd?')).toBeInTheDocument()
      expect(screen.getByText(zin, { exact: false })).toBeInTheDocument()
      const link = screen.getByRole('link', { name: 'Mijn → Uiterlijk' })
      expect(link.getAttribute('href')).toBe('/mijn/uiterlijk')
      unmount()
    }
  })
})

/**
 * L11 + S13 — één uitgang, en die gooit niets weg.
 *
 * L11 haalde de blokkerende twee-keuze-dialoog ("Welkomstgids sluiten?") weg:
 * één kruisje was drie keuzes geworden. S13 maakt van die ene uitgang de
 * canonieke MELDINGEN-CONVENTIE: de gids klapt in tot het punt naast de
 * pagina-'i' — server-side onthouden (cross-device) i.p.v. een sessie-vlag — en
 * is daar altijd weer te openen. "Voorgoed verbergen" blijft de aparte,
 * secundaire link.
 *
 * Wat hier vastligt: welke knop leidt tot welk gedrag, en dat inklappen één
 * PUT `minimize` stuurt (geen `dismiss`).
 */
describe('WelcomeGuideBanner — inklappen tot het punt (L11 + S13)', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  /** Alle PUT-bodies die de banner naar /api/welcome-guide stuurde. */
  const putActions = (fn: ReturnType<typeof mockGuideFetch>): string[] =>
    fn.mock.calls
      .filter(([, opts]) => (opts as { method?: string } | undefined)?.method === 'PUT')
      .map(([, opts]) => JSON.parse((opts as { body: string }).body).action as string)

  const renderSeeded = (state: WelcomeGuideState = DEFAULT_WELCOME_GUIDE_STATE) => {
    const fn = mockGuideFetch({ state })
    render(
      <WelcomeGuideProvider seed={{ config: DEFAULT_WELCOME_GUIDE, state }}>
        <WelcomeGuideBanner />
        <WelcomeGuideDot />
      </WelcomeGuideProvider>,
    )
    return fn
  }

  it('het kruisje klapt meteen in, zonder tussenvraag, en laat het punt achter', async () => {
    const fn = renderSeeded()
    await screen.findByText('Zijn al je bezittingen geregistreerd?')

    fireEvent.click(screen.getByRole('button', { name: 'Welkomstgids minimaliseren' }))

    // Geen tussenvraag, gids weg, punt erín de plaats — dat is het verschil met
    // de oude sessie-sluitvlag, die niets achterliet.
    expect(screen.queryByText('Welkomstgids sluiten?')).not.toBeInTheDocument()
    expect(screen.queryByText('Zijn al je bezittingen geregistreerd?')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Welkomstgids weer tonen' })).toBeInTheDocument()
    // Cross-device onthouden: één `minimize`, en zeker geen `dismiss`.
    expect(putActions(fn)).toEqual(['minimize'])
  })

  it('klikken op het punt zet de gids terug op hetzelfde scherm', async () => {
    const fn = renderSeeded({ ...DEFAULT_WELCOME_GUIDE_STATE, minimized: true })
    const punt = await screen.findByRole('button', { name: 'Welkomstgids weer tonen' })

    fireEvent.click(punt)

    expect(await screen.findByText('Zijn al je bezittingen geregistreerd?')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Welkomstgids weer tonen' })).not.toBeInTheDocument()
    expect(putActions(fn)).toEqual(['restore'])
  })

  // Het laatste scherm wordt geseed i.p.v. er doorheen geklikt: navigeren loopt
  // via de optimistische PUT-mutatie en dat maakt de test traag én afhankelijk
  // van het aantal schermen. Wat hier telt is uitsluitend het sluitgedrag.
  const lastScreenSeed = (canReveal: boolean) => {
    const enabled = DEFAULT_WELCOME_GUIDE.screens.filter((sc) => sc.enabled)
    const required = enabled.filter((sc) => sc.required).length
    // canReveal=false → alles ontgrendeld ("Gids inklappen");
    // canReveal=true  → alleen de verplichte schermen ("Nee, klap in").
    const revealedScreens = canReveal ? required : enabled.length
    return {
      ...DEFAULT_WELCOME_GUIDE_STATE,
      revealedScreens,
      currentScreen: revealedScreens - 1,
    }
  }

  it('"Gids inklappen" op het laatste scherm klapt even direct in', async () => {
    const fn = renderSeeded(lastScreenSeed(false))
    const knop = await screen.findByRole('button', { name: 'Gids inklappen' })

    fireEvent.click(knop)

    expect(screen.queryByText('Welkomstgids sluiten?')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Welkomstgids weer tonen' })).toBeInTheDocument()
    expect(putActions(fn)).toEqual(['minimize'])
  })

  it('"Nee, klap in" naast het "toon meer"-aanbod klapt ook direct in', async () => {
    const fn = renderSeeded(lastScreenSeed(true))
    const knop = await screen.findByRole('button', { name: 'Nee, klap in' })

    fireEvent.click(knop)

    expect(screen.getByRole('button', { name: 'Welkomstgids weer tonen' })).toBeInTheDocument()
    expect(putActions(fn)).toEqual(['minimize'])
  })

  it('"voorgoed verbergen" haalt óók het punt weg en muteert de server-state', async () => {
    const fn = renderSeeded()
    await screen.findByText('Zijn al je bezittingen geregistreerd?')

    fireEvent.click(screen.getByRole('button', { name: 'Verberg de gids voorgoed' }))
    await act(async () => { await new Promise((r) => setTimeout(r, 0)) })

    expect(screen.queryByText('Zijn al je bezittingen geregistreerd?')).not.toBeInTheDocument()
    // Geen heringang meer — dat is precies het verschil met inklappen.
    expect(screen.queryByRole('button', { name: 'Welkomstgids weer tonen' })).not.toBeInTheDocument()
    expect(putActions(fn)).toEqual(['dismiss'])
  })
})
