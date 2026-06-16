import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ToekomstWelcome } from './toekomst-welcome'

/**
 * Unit-tests voor ToekomstWelcome — de full-page portal-overlay die bij het
 * eerste bezoek aan /toekomst verschijnt.
 *
 * Gedekte takken (zie toekomst-welcome.tsx):
 *  A. freedomAge = geldig getal, isPensioen = false  → "rond je 65e"
 *  B. freedomAge = geldig getal, isPensioen = true   → "65e (AOW-leeftijd)"
 *  C. freedomAge = null / ≤0 / niet-eindig           → fallback-zin (geen getal)
 *  D. CTA "Bekijk je grafiek" aanwezig + vuurt onViewChart (niet onDismiss)
 *  E. Escape vuurt onDismiss (niet onViewChart)
 *  F. Klik op de achtergrond vuurt onDismiss
 *  G. visible=false rendert niets
 *
 * Technische afspraken:
 *  - createPortal gemockt via vi.mock('react-dom', ...) factory (ESM-safe;
 *    vi.spyOn werkt niet op ESM namespace-exports).
 *  - MaskedAmount gemockt: de privacy-hook leest context die in jsdom ontbreekt;
 *    simpele pass-through volstaat voor de waarden-tests.
 *  - useFocusTrap gemockt: requestAnimationFrame-timing interacties irrelevant.
 *  - fetch gemockt om de feature-visit POST stil te houden.
 *
 * VALKUIL — EditorialHeadline splits de titel:
 *   EditorialHeadline met emphasis="toekomst" rendert losse <span>/<em> fragmenten,
 *   zodat getByText('Welkom op je toekomst pagina') NIET matcht als geheel.
 *   Gebruik een function-matcher op de wrapper-heading of asserteer op de kicker-text.
 */

// ── Mocks ────────────────────────────────────────────────────────────────────

// Portal → render naar de jsdom-test-container ipv document.body.
// vi.spyOn werkt niet op ESM namespace-exports; gebruik de factory-vorm.
vi.mock('react-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom')>()
  return {
    ...actual,
    createPortal: (node: React.ReactNode) => node,
  }
})

// MaskedAmount: geef de value gewoon als tekst terug (privacy-context ontbreekt).
vi.mock('@/components/app/masked-amount', () => ({
  MaskedAmount: ({ value }: { value: number }) => <span>{value}</span>,
}))

// useFocusTrap: no-op — jsdom heeft geen echte focus-API; side-effects storen tests.
vi.mock('@/lib/hooks/use-focus-trap', () => ({
  useFocusTrap: () => {},
}))

// fetch: stil houden (fire-and-forget POST naar /api/feature-visits).
global.fetch = vi.fn().mockResolvedValue({ ok: true }) as typeof fetch

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Standaard minimale props — elke test overschrijft wat relevant is. */
const base = {
  visible: true,
  netWorth: 500_000,
  dailyExpenseRate: 75,
  freedomAge: null as number | null,
  isPensioen: false,
  masked: false,
  onDismiss: vi.fn(),
  onViewChart: vi.fn(),
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ToekomstWelcome', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    // Herstel body.overflow zodat de scroll-lock-effect de volgende test niet vuilt.
    document.body.style.overflow = ''
  })

  // ── A. Geldige vrijheidsleeftijd, geen pensioen ───────────────────────────

  it('toont de vrijheidsleeftijd-zin met afgerond getal bij een geldige freedomAge', () => {
    render(<ToekomstWelcome {...base} freedomAge={65} />)

    // De belofte-zin zit in een <p>-element. We zoeken het via de tekstinhoud
    // van het blad-element (de <p> zelf bevat de tekst, maar is geen exact match
    // omdat er ook kinderen in zitten). Gebruik getAllByText met een filter op
    // nodeName zodat we niet in ancestor-elementen matchen.
    const matchingPs = screen
      .getAllByText((_, el) =>
        el?.nodeName === 'P' &&
        (el?.textContent ?? '').includes('Werken wordt voor jou een keuze rond je'),
      )
    expect(matchingPs.length).toBeGreaterThanOrEqual(1)
    // Het leeftijdsgetal staat in een eigen <span>
    expect(screen.getByText('65e')).toBeTruthy()
  })

  it('rondt een decimale freedomAge naar het dichtstbijzijnde geheel', () => {
    render(<ToekomstWelcome {...base} freedomAge={64.6} />)
    expect(screen.getByText('65e')).toBeTruthy()
  })

  // ── B. Pensioen-variant ───────────────────────────────────────────────────

  it('toont de pensioen-variant als isPensioen=true', () => {
    render(<ToekomstWelcome {...base} freedomAge={65} isPensioen={true} />)

    // De span toont de leeftijd voorop met AOW-framing: "65e (AOW-leeftijd)".
    expect(screen.getByText('65e (AOW-leeftijd)')).toBeTruthy()
    // De bovenliggende <p> bevat de intro-zin
    const matchingPs = screen.getAllByText((_, el) =>
      el?.nodeName === 'P' &&
      (el?.textContent ?? '').includes('Werken wordt voor jou een keuze rond je'),
    )
    expect(matchingPs.length).toBeGreaterThanOrEqual(1)
  })

  // ── C. Fallback-zin (geen geldige leeftijd) ──────────────────────────────

  it('toont de fallback-zin als freedomAge null is', () => {
    render(<ToekomstWelcome {...base} freedomAge={null} />)

    expect(
      screen.getByText('Werken wordt steeds meer een keuze naarmate je vrijheid opbouwt.'),
    ).toBeTruthy()
    // Er mag GEEN leeftijdsgetal in de DOM zijn
    expect(screen.queryByText(/\d+e/)).toBeNull()
  })

  it('toont de fallback-zin als freedomAge ≤0 is', () => {
    render(<ToekomstWelcome {...base} freedomAge={0} />)

    expect(
      screen.getByText('Werken wordt steeds meer een keuze naarmate je vrijheid opbouwt.'),
    ).toBeTruthy()
  })

  it('toont de fallback-zin als freedomAge Infinity is', () => {
    render(<ToekomstWelcome {...base} freedomAge={Infinity} />)

    expect(
      screen.getByText('Werken wordt steeds meer een keuze naarmate je vrijheid opbouwt.'),
    ).toBeTruthy()
  })

  // ── D. CTA aanwezigheid + onDismiss ──────────────────────────────────────

  it('rendert de "Bekijk je grafiek"-CTA en vuurt onViewChart (niet onDismiss) bij klik', () => {
    // De primaire CTA opent de uitgelichte grafiek → onViewChart. Stil sluiten
    // (✕/Escape/achtergrond) blijft op onDismiss; die twee paden zijn gesplitst.
    const onDismiss = vi.fn()
    const onViewChart = vi.fn()
    render(<ToekomstWelcome {...base} onDismiss={onDismiss} onViewChart={onViewChart} />)

    const cta = screen.getByRole('button', { name: /Bekijk je grafiek/i })
    expect(cta).toBeTruthy()
    fireEvent.click(cta)
    expect(onViewChart).toHaveBeenCalledTimes(1)
    expect(onDismiss).not.toHaveBeenCalled()
  })

  // ── E. Escape-toets ───────────────────────────────────────────────────────

  it('vuurt onDismiss (stil sluiten, niet onViewChart) bij Escape-toets', () => {
    const onDismiss = vi.fn()
    const onViewChart = vi.fn()
    render(<ToekomstWelcome {...base} onDismiss={onDismiss} onViewChart={onViewChart} />)

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onDismiss).toHaveBeenCalledTimes(1)
    // Escape opent de grafiek-overlay NIET.
    expect(onViewChart).not.toHaveBeenCalled()
  })

  // ── F. Klik op de achtergrond ─────────────────────────────────────────────

  it('vuurt onDismiss bij klik op de achtergrond-overlay', () => {
    const onDismiss = vi.fn()
    render(<ToekomstWelcome {...base} onDismiss={onDismiss} />)

    // De achtergrond heeft aria-hidden en een onClick-handler.
    // We zoeken hem via het backdrop-blur class-fragment.
    const backdrop = document
      .querySelector('[aria-hidden="true"]')
    expect(backdrop).toBeTruthy()
    fireEvent.click(backdrop!)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  // ── G. Niet zichtbaar — rendert niets ─────────────────────────────────────

  it('rendert niets als visible=false', () => {
    render(<ToekomstWelcome {...base} visible={false} />)

    // Geen dialog, geen knoppen
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  // ── H. Sluit-knop (✕) ─────────────────────────────────────────────────────

  it('vuurt onDismiss bij klik op de ✕-sluit-knop', () => {
    const onDismiss = vi.fn()
    render(<ToekomstWelcome {...base} onDismiss={onDismiss} />)

    const closeBtn = screen.getByRole('button', { name: /Welkomsttekst sluiten/i })
    expect(closeBtn).toBeTruthy()
    fireEvent.click(closeBtn)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  // ── I. Kicker-tekst ──────────────────────────────────────────────────────

  it('toont de kicker-tekst "Welkom op je toekomst"', () => {
    render(<ToekomstWelcome {...base} />)

    // De kicker-div bevat een SVG-icon + de tekst als text-node. Gebruik een
    // matcher die checkt of de textContent de verwachte string BEVAT en of het
    // element een DIV is (niet de H2 of een ancestor). De title-wrapper-div
    // (id="welcome-dialog-title") bevat dezelfde substring + "pagina"; daarom
    // sluiten we "pagina" en de card-wrapper ("Bekijk je grafiek") expliciet uit.
    const kickerEl = screen.getByText((_, el) =>
      el?.nodeName === 'DIV' &&
      (el?.textContent ?? '').includes('Welkom op je toekomst') &&
      !(el?.textContent ?? '').includes('pagina') && // sluit title-wrapper uit
      !(el?.textContent ?? '').includes('Bekijk je grafiek'), // sluit card-wrapper uit
    )
    expect(kickerEl).toBeTruthy()
  })

  // ── J. EditorialHeadline-valkuil: titel als losse fragmenten ─────────────

  it('rendert de titel-tekst (gesplitst door EditorialHeadline emphasis)', () => {
    render(<ToekomstWelcome {...base} />)

    // EditorialHeadline splitst "Welkom op je toekomst pagina" op "toekomst":
    //   <span>"Welkom op je "</span><em>toekomst</em><span>" pagina"</span>
    // Heading is level 2 (modal-titel; de pagina heeft al een h1) en is via
    // aria-labelledby aan de dialog gekoppeld.
    const heading = screen.getByRole('heading', { level: 2 })
    expect(heading.textContent).toContain('Welkom op je toekomst pagina')
  })

  // ── K. Scroll-lock ────────────────────────────────────────────────────────

  it('vergrendelt body-scroll zolang de overlay open is', () => {
    const { unmount } = render(<ToekomstWelcome {...base} />)
    expect(document.body.style.overflow).toBe('hidden')
    unmount()
    // Na unmount wordt de overflow hersteld.
    expect(document.body.style.overflow).not.toBe('hidden')
  })
})
