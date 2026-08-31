import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { FinHome, type FinHomeProps } from './fin-home'
import { FinSlotProvider } from '@/lib/shell/fin-slot'
import type { CoachDataGaps } from '@/lib/coach-suggestions'
import { __resetInflight } from '@/lib/inflight'
import { acquireOverlay, __resetOverlayCount } from '@/lib/overlay-signal'

const open = vi.fn()
const toggle = vi.fn()
const openWithMessage = vi.fn()
let isOpenValue = false

vi.mock('@/components/app/chat/chat-provider', () => ({
  useChatContext: () => ({ isOpen: isOpenValue, open, toggle, openWithMessage, close: vi.fn() }),
}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/overzicht',
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

// FinHome leest het nav-pill-slot via context; zonder provider gooit de hook.
// Er is hier geen FloatingNavButton, dus het slot blijft leeg → alleen de
// zwevende instantie rendert (precies wat deze tests asserten).
const renderFin = (props: FinHomeProps) =>
  render(<FinSlotProvider><FinHome {...props} /></FinSlotProvider>)

const gaps = (over: Partial<CoachDataGaps> = {}): CoachDataGaps => ({
  hasBank: true, hasAssets: true, hasBudgets: true, hasGoals: true, hasDebts: true,
  hasTransactions: true, hasHoldings: true, hasHoldingsWithIsin: true, hasFireParams: true,
  hasLifeEvents: true, ...over,
})

beforeEach(() => {
  vi.useFakeTimers(); localStorage.clear(); isOpenValue = false
  open.mockReset(); toggle.mockReset(); openWithMessage.mockReset()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ count: 0 }) }))
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); __resetInflight(); __resetOverlayCount() })

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
    act(() => { release() })
    expect(screen.getByText(/Koppel je bank/i)).toBeInTheDocument()
  })
})
