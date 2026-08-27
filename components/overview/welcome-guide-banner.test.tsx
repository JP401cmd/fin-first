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
import { render, screen, cleanup, act } from '@testing-library/react'
import { WelcomeGuideBanner } from './welcome-guide-banner'
import { DEFAULT_WELCOME_GUIDE, DEFAULT_WELCOME_GUIDE_STATE } from '@/lib/welcome-guide'
import { DisplayModeProvider, type DisplayMode } from '@/lib/hooks/use-display-mode'

const SESSION_CLOSED_KEY = 'welcome_guide_closed'

function mockGuideFetch(payload?: { configEnabled?: boolean; status?: 'active' | 'dismissed' }) {
  const config = { ...DEFAULT_WELCOME_GUIDE, enabled: payload?.configEnabled ?? true }
  const state = { ...DEFAULT_WELCOME_GUIDE_STATE, status: payload?.status ?? 'active' }
  const fn = vi.fn((_url: string, opts?: { method?: string }) => {
    if (opts?.method === 'PUT') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ state }) })
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
        <WelcomeGuideBanner />
      </StrictMode>,
    )
    // De async fetch landt na de (dubbele) mount → scherm 1 (kop-loze process-
    // kaarten) moet verschijnen; we toetsen op de kicker + de eerste stap.
    expect(await screen.findByText('Zijn al je bezittingen geregistreerd?')).toBeInTheDocument()
    expect(screen.getByText('Welkom bij TriFinity')).toBeInTheDocument()
  })

  it('rendert niets wanneer de gids voor alle gebruikers uit staat', async () => {
    mockGuideFetch({ configEnabled: false })
    render(<WelcomeGuideBanner />)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(screen.queryByText('Welkom bij TriFinity')).not.toBeInTheDocument()
  })

  it('rendert niets wanneer de gebruiker de gids voorgoed heeft gesloten', async () => {
    mockGuideFetch({ status: 'dismissed' })
    render(<WelcomeGuideBanner />)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(screen.queryByText('Welkom bij TriFinity')).not.toBeInTheDocument()
  })

  it('rendert niets (en fetcht niet) wanneer de sessie-sluitvlag gezet is', async () => {
    sessionStorage.setItem(SESSION_CLOSED_KEY, '1')
    const fn = mockGuideFetch()
    render(<WelcomeGuideBanner />)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(screen.queryByText('Welkom bij TriFinity')).not.toBeInTheDocument()
    expect(fn).not.toHaveBeenCalled()
  })

  it('seed aanwezig → toont scherm 1 ZONDER fetch', async () => {
    const fn = vi.fn()
    vi.stubGlobal('fetch', fn)
    render(
      <WelcomeGuideBanner
        seed={{ config: DEFAULT_WELCOME_GUIDE, state: DEFAULT_WELCOME_GUIDE_STATE }}
      />,
    )
    expect(await screen.findByText('Zijn al je bezittingen geregistreerd?')).toBeInTheDocument()
    expect(fn).not.toHaveBeenCalled()
  })

  it('seed met uitgeschakelde config → niets, geen fetch', async () => {
    const fn = vi.fn()
    vi.stubGlobal('fetch', fn)
    render(
      <WelcomeGuideBanner
        seed={{
          config: { ...DEFAULT_WELCOME_GUIDE, enabled: false },
          state: DEFAULT_WELCOME_GUIDE_STATE,
        }}
      />,
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
        <WelcomeGuideBanner
          seed={{ config: DEFAULT_WELCOME_GUIDE, state: DEFAULT_WELCOME_GUIDE_STATE, derived }}
        />
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
        <WelcomeGuideBanner
          seed={{ config: DEFAULT_WELCOME_GUIDE, state: DEFAULT_WELCOME_GUIDE_STATE }}
        />
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
