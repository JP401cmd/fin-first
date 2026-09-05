import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { FinHome, type FinHomeProps } from './fin-home'
import { FinSlotProvider } from '@/lib/shell/fin-slot'
import type { CoachDataGaps, GuideSuggestionInput } from '@/lib/coach-suggestions'
import type { GuideNextStep } from '@/lib/welcome-guide'
import { __resetInflight } from '@/lib/inflight'
import { acquireOverlay, __resetOverlayCount } from '@/lib/overlay-signal'
import { setRondleidingActive, __resetRondleidingSignal } from '@/lib/rondleiding/signal'
import { EMPTY_COACH_STATE, type CoachState } from '@/lib/coach-state'

const open = vi.fn()
const toggle = vi.fn()
const openWithMessage = vi.fn()
const openGids = vi.fn()
let isOpenValue = false

vi.mock('@/components/app/chat/chat-provider', () => ({
  useChatContext: () => ({
    isOpen: isOpenValue, open, toggle, openWithMessage, openGids, close: vi.fn(),
  }),
}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/overzicht',
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

// FinHome leest het nav-pill-slot via context; zonder provider gooit de hook.
// Er is hier geen FloatingNavButton, dus het slot blijft leeg → alleen de
// zwevende instantie rendert (precies wat deze tests asserten).
// `coachState` is verplicht (server-seed uit de app-layout). De helper vult de
// lege staat in zodat elke bestaande case leest als vroeger; cases die de seed
// zélf toetsen geven 'm expliciet mee.
const renderFin = (props: Omit<FinHomeProps, 'coachState'> & { coachState?: CoachState }) =>
  render(
    <FinSlotProvider>
      <FinHome coachState={EMPTY_COACH_STATE} {...props} />
    </FinSlotProvider>,
  )

/** Alle bodies die naar /api/coach-state gingen. */
let coachStatePuts: Record<string, unknown>[] = []

const gaps = (over: Partial<CoachDataGaps> = {}): CoachDataGaps => ({
  hasBank: true, hasAssets: true, hasBudgets: true, hasGoals: true, hasDebts: true,
  hasTransactions: true, hasHoldings: true, hasHoldingsWithIsin: true, hasFireParams: true,
  hasLifeEvents: true, ...over,
})

beforeEach(() => {
  vi.useFakeTimers(); localStorage.clear(); isOpenValue = false
  open.mockReset(); toggle.mockReset(); openWithMessage.mockReset(); openGids.mockReset()
  coachStatePuts = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/coach-state' && init?.body) {
      coachStatePuts.push(JSON.parse(init.body as string) as Record<string, unknown>)
    }
    return { ok: true, json: async () => ({ count: 0 }) }
  }))
})
afterEach(() => {
  vi.useRealTimers(); vi.restoreAllMocks(); __resetInflight()
  __resetOverlayCount(); __resetRondleidingSignal()
})

describe('FinHome', () => {
  it('toont de bubbel-launcher en opent de chat bij klik', () => {
    renderFin({ dataGaps: gaps(), delayMs: 1000 })
    const launcher = screen.getByRole('button', { name: /Open chat met Fin/i })
    fireEvent.click(launcher)
    expect(toggle).toHaveBeenCalled()
  })

  it('toont de melding na delayMs met reduced-motion-tekst', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as unknown as MediaQueryList)
    renderFin({ dataGaps: gaps({ hasBank: false }), delayMs: 1000, autoDismissMs: 999999 })
    act(() => { vi.advanceTimersByTime(1000 + 400) })
    expect(screen.getByText(/Koppel je bank/i)).toBeInTheDocument()
  })

  it('× sluit de melding zonder de chat te openen', async () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as unknown as MediaQueryList)
    renderFin({ dataGaps: gaps({ hasBank: false }), delayMs: 0, autoDismissMs: 999999 })
    await act(async () => {})
    act(() => { vi.advanceTimersByTime(400) })
    fireEvent.click(screen.getByRole('button', { name: /Sluiten/i }))
    expect(open).not.toHaveBeenCalled()
    expect(screen.queryByText(/Koppel je bank/i)).not.toBeInTheDocument()
  })

  it('auto-dismiss telt pas vanaf het uittypen, niet vanaf verschijnen (H17)', () => {
    // Geen reduced-motion → de typemachine loopt echt.
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as unknown as MediaQueryList)
    renderFin({ dataGaps: gaps({ hasBank: false }), delayMs: 0, autoDismissMs: 1000 })
    act(() => { vi.advanceTimersByTime(400) })
    // Nog midden in het typen: de volledige auto-dismiss-termijn is verstreken
    // maar de melding moet blijven staan tot de boodschap áf is.
    act(() => { vi.advanceTimersByTime(1000) })
    expect(screen.getByRole('button', { name: /Sluiten/i })).toBeInTheDocument()
    // Typen afmaken (de auto-dismiss-timer wordt pas ná die commit gezet),
    // dán pas de termijn laten lopen.
    act(() => { vi.advanceTimersByTime(20_000) })
    expect(screen.getByRole('button', { name: /Sluiten/i })).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(1000) })
    expect(screen.queryByRole('button', { name: /Sluiten/i })).not.toBeInTheDocument()
  })

  it('sluit met reduced-motion (geen typemachine) alsnog na de termijn (H17)', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as unknown as MediaQueryList)
    renderFin({ dataGaps: gaps({ hasBank: false }), delayMs: 0, autoDismissMs: 1000 })
    act(() => { vi.advanceTimersByTime(400) })
    expect(screen.getByRole('button', { name: /Sluiten/i })).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(1000) })
    expect(screen.queryByRole('button', { name: /Sluiten/i })).not.toBeInTheDocument()
  })

  it('rendert niets wanneer de chat open is (één Fin)', () => {
    isOpenValue = true
    const { container } = renderFin({ dataGaps: gaps(), delayMs: 0 })
    expect(container).toBeEmptyDOMElement()
  })

  // M15: één hulplaag tegelijk. De coach-melding moet ook wijken voor een
  // overlay die zich alléén via lib/overlay-signal.ts meldt en géén scroll-lock
  // claimt — zoals de tips-tour op /toekomst, die pagina-inhoud blijft. Keek
  // FinHome alleen naar de scroll-lock-teller, dan typte de melding dwars door
  // de tourtekst heen.
  it('wijkt voor een overlay die alleen het overlay-signaal claimt (M15)', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as unknown as MediaQueryList)
    const release = acquireOverlay()
    try {
      renderFin({ dataGaps: gaps({ hasBank: false }), delayMs: 0, autoDismissMs: 999999 })
      act(() => { vi.advanceTimersByTime(400) })
      expect(screen.queryByText(/Koppel je bank/i)).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Open chat met Fin/i })).not.toBeInTheDocument()
    } finally {
      release()
    }
  })

  // UR2-08: op mobiel dokt de melding als strook onderin. Ze mag daar geen
  // pagina-inhoud afdekken, dus eist ze haar eigen band op: FinHome publiceert
  // de gemeten hoogte als `--fin-melding-height`, globals.css telt de
  // nav-pill-clearance erbij op en de mobiele `<main>` wordt net zoveel korter.
  // Zonder deze publicatie is die band 0 en ligt de strook weer bovenop een link.
  describe('bandreservering onderin (UR2-08)', () => {
    const MELDING_HEIGHT = 132
    let restoreOffsetHeight: PropertyDescriptor | undefined

    beforeEach(() => {
      // jsdom rekent geen layout; offsetHeight is er altijd 0.
      restoreOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
        configurable: true,
        get: () => MELDING_HEIGHT,
      })
      document.documentElement.style.removeProperty('--fin-melding-height')
    })
    afterEach(() => {
      if (restoreOffsetHeight) {
        Object.defineProperty(HTMLElement.prototype, 'offsetHeight', restoreOffsetHeight)
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (HTMLElement.prototype as any).offsetHeight
      }
      document.documentElement.style.removeProperty('--fin-melding-height')
    })

    const height = () =>
      document.documentElement.style.getPropertyValue('--fin-melding-height')

    it('publiceert de hoogte van de strook zolang ze staat', () => {
      vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as unknown as MediaQueryList)
      renderFin({ dataGaps: gaps({ hasBank: false }), delayMs: 0, autoDismissMs: 999999 })
      act(() => { vi.advanceTimersByTime(400) })
      expect(height()).toBe(`${MELDING_HEIGHT}px`)
    })

    it('geeft de band terug zodra de melding weg is', () => {
      vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as unknown as MediaQueryList)
      renderFin({ dataGaps: gaps({ hasBank: false }), delayMs: 0, autoDismissMs: 999999 })
      act(() => { vi.advanceTimersByTime(400) })
      act(() => { fireEvent.click(screen.getByRole('button', { name: /Sluiten/i })) })
      expect(height()).toBe('0px')
    })

    it('claimt geen band zolang er alleen een bubbel staat', () => {
      renderFin({ dataGaps: gaps(), delayMs: 1000 })
      expect(height()).toBe('')
    })
  })

  it('toont de melding weer zodra dat signaal is vrijgegeven (M15)', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as unknown as MediaQueryList)
    const release = acquireOverlay()
    renderFin({ dataGaps: gaps({ hasBank: false }), delayMs: 0, autoDismissMs: 999999 })
    act(() => { vi.advanceTimersByTime(400) })
    expect(screen.queryByText(/Koppel je bank/i)).not.toBeInTheDocument()
    // Sinds ADR 0130 kiest de hook pas ná het vrijgeven — de melding is dus niet
    // stilletjes achter de overlay al "gebeurd". Vandaar de vertraging opnieuw.
    act(() => { release() })
    act(() => { vi.advanceTimersByTime(400) })
    expect(screen.getByText(/Koppel je bank/i)).toBeInTheDocument()
  })

  // ── Server-seed + pauze (ADR 0130) ───────────────────────────────────────
  it('toont een melding niet meer die volgens de server-seed al is weggeklikt', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as unknown as MediaQueryList)
    renderFin({
      coachState: { ...EMPTY_COACH_STATE, dismissed: ['gap_bank'] },
      dataGaps: gaps({ hasBank: false }),
      delayMs: 0,
      autoDismissMs: 999999,
    })
    act(() => { vi.advanceTimersByTime(400) })
    expect(screen.queryByText(/Koppel je bank/i)).not.toBeInTheDocument()
  })

  it('stempelt geen enkele melding zolang er een overlay openstaat (M15)', () => {
    // De latente fout die ADR 0130 dicht: achter een open overlay liep de
    // auto-dismiss gewoon door en werd de tip als "gezien" weggeschreven,
    // terwijl niemand hem ooit te zien kreeg.
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as unknown as MediaQueryList)
    const release = acquireOverlay()
    try {
      renderFin({ dataGaps: gaps({ hasBank: false }), delayMs: 0, autoDismissMs: 1000 })
      act(() => { vi.advanceTimersByTime(60_000) })
      expect(coachStatePuts).toHaveLength(0)
    } finally {
      release()
    }
  })

  it('verbergt zijn mond tijdens de rondleiding, maar blijft zélf zichtbaar', () => {
    // De rondleiding licht in haar laatste stap Fins eigen knop uit — die moet
    // dus staan blijven. Alleen de proactieve melding zwijgt.
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as unknown as MediaQueryList)
    act(() => { setRondleidingActive(true) })
    renderFin({ dataGaps: gaps({ hasBank: false }), delayMs: 0, autoDismissMs: 999999 })
    act(() => { vi.advanceTimersByTime(60_000) })
    expect(screen.queryByText(/Koppel je bank/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Open chat met Fin/i })).toBeInTheDocument()
    expect(coachStatePuts).toHaveLength(0)
  })

  it('sluit een al openstaande melding tijdens de rondleiding en toont hem daarna weer', () => {
    // Een herstart van de rondleiding (bestaande gebruiker) kan een melding
    // aantreffen die al openstaat. Die hoort niet bevroren onder de scrim te
    // blijven hangen — en al helemaal niet als "gezien" te worden weggeschreven.
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as unknown as MediaQueryList)
    renderFin({ dataGaps: gaps({ hasBank: false }), delayMs: 0, autoDismissMs: 999999 })
    act(() => { vi.advanceTimersByTime(400) })
    expect(screen.getByText(/Koppel je bank/i)).toBeInTheDocument()

    act(() => { setRondleidingActive(true) })
    expect(screen.queryByText(/Koppel je bank/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Open chat met Fin/i })).toBeInTheDocument()

    act(() => { setRondleidingActive(false) })
    act(() => { vi.advanceTimersByTime(400) })
    expect(screen.getByText(/Koppel je bank/i)).toBeInTheDocument()
    expect(coachStatePuts).toHaveLength(0)
  })

  it('stempelt niets zolang de chat openstaat — ook gepind, zonder overlay-signaal', () => {
    // Met de chat open rendert FinHome `null`. Een gepinde chat claimt bewust
    // geen overlay-signaal, dus zonder `isOpen` in `paused` koos de hook een
    // tip, typte 'm uit en schreef 'm na de auto-dismiss als gezien weg — voor
    // een scherm dat niemand zag.
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as unknown as MediaQueryList)
    isOpenValue = true
    renderFin({ dataGaps: gaps({ hasBank: false }), delayMs: 0, autoDismissMs: 1000 })
    act(() => { vi.advanceTimersByTime(60_000) })
    expect(coachStatePuts).toHaveLength(0)
  })

  // ── Gids-bubbel (ADR 0130, fase 2) ───────────────────────────────────────
  //
  // De route-mock staat op /overzicht; de gidsstappen hieronder wijzen daarheen.
  describe('gids-bubbel', () => {
    const guideStap = (over: Partial<GuideNextStep> = {}): GuideNextStep => ({
      id: 's1-bezittingen',
      title: 'Zijn al je bezittingen geregistreerd?',
      href: '/overzicht',
      ...over,
    })
    const guide = (over: Partial<GuideNextStep> = {}): GuideSuggestionInput => ({
      status: 'active',
      steps: [guideStap(over)],
    })

    it('toont de gidsstap in plaats van de data-gap-tip', () => {
      vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as unknown as MediaQueryList)
      renderFin({ dataGaps: gaps({ hasBank: false }), delayMs: 0, autoDismissMs: 999999, guide: guide() })
      act(() => { vi.advanceTimersByTime(400) })
      expect(screen.getByText(/Zijn al je bezittingen geregistreerd/i)).toBeInTheDocument()
      expect(screen.queryByText(/Koppel je bank/i)).not.toBeInTheDocument()
    })

    it('de CTA zonder bestemming opent de gidsweergave in Fin', () => {
      vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as unknown as MediaQueryList)
      renderFin({ dataGaps: gaps({ hasBank: false }), delayMs: 0, autoDismissMs: 999999, guide: guide() })
      act(() => { vi.advanceTimersByTime(400) })
      act(() => { fireEvent.click(screen.getByRole('button', { name: /Bekijk in de gids/i })) })
      expect(openGids).toHaveBeenCalledTimes(1)
      // De chat zelf gaat niet in gespreksmodus open — alleen de gidsweergave.
      expect(open).not.toHaveBeenCalled()
      expect(screen.queryByText(/Zijn al je bezittingen geregistreerd/i)).not.toBeInTheDocument()
    })

    it('een deeplink-stap houdt zijn link en opent de gids NIET', () => {
      vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as unknown as MediaQueryList)
      renderFin({
        dataGaps: gaps({ hasBank: false }), delayMs: 0, autoDismissMs: 999999,
        guide: guide({ id: 's1-budget', href: '/overzicht?uitgaven=open' }),
      })
      act(() => { vi.advanceTimersByTime(400) })
      const link = screen.getByRole('link', { name: /Bekijk in de gids/i })
      expect(link).toHaveAttribute('href', '/overzicht?uitgaven=open')
      act(() => { fireEvent.click(link) })
      expect(openGids).not.toHaveBeenCalled()
    })
  })

  it('schrijft het kruisje weg naar de server (cross-device)', async () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as unknown as MediaQueryList)
    renderFin({ dataGaps: gaps({ hasBank: false }), delayMs: 0, autoDismissMs: 999999 })
    await act(async () => {})
    act(() => { vi.advanceTimersByTime(400) })
    act(() => { fireEvent.click(screen.getByRole('button', { name: /Sluiten/i })) })
    expect(coachStatePuts).toEqual([{ action: 'dismiss', key: 'gap_bank' }])
  })
})
