import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ToekomstExitNotice } from './toekomst-exit-notice'

/**
 * Unit-tests voor ToekomstExitNotice — de gecentreerde modal die verschijnt
 * zodra de gebruiker de tips-overlay op /toekomst verlaat.
 *
 * Gedekte takken (zie toekomst-exit-notice.tsx):
 *  A. visible=false → rendert null (geen DOM-elementen)
 *  B. visible=true  → titel + boodschap + beide knoppen in beeld
 *  C. Klik "Sluiten"              → onClose aangeroepen, onDismissForever NIET
 *  D. Klik "Niet meer weergeven"  → onDismissForever aangeroepen, onClose NIET
 *  E. Escape-toets               → onClose (niet-persistent, niet onDismissForever)
 *  F. Klik op de achtergrond-scrim → onClose (niet-persistent)
 *  G. Scroll-lock: body.overflow='hidden' zolang modal open; hersteld na unmount
 *  H. ✕-knop (aria-label "Melding sluiten") → onClose
 *
 * Technische afspraken (zie ook toekomst-welcome.test.tsx):
 *  - createPortal gemockt via vi.mock('react-dom', ...) factory (ESM-safe).
 *  - useFocusTrap gemockt: requestAnimationFrame-timing irrelevant in jsdom.
 *  - Geen fetch-mock nodig: de POST zit in horizon-client.tsx, NIET in de modal.
 *
 * VALKUIL — EditorialHeadline splits de titel:
 *   EditorialHeadline met emphasis="tips" rendert losse <span>/<em>-fragmenten,
 *   zodat getByText('Je tips zijn nu verborgen') mogelijk NIET matcht als geheel.
 *   Gebruik een function-matcher op het heading-element of asserteer op textContent.
 */

// ── Mocks ────────────────────────────────────────────────────────────────────

// Portal → render naar de jsdom-test-container i.p.v. document.body.
vi.mock('react-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom')>()
  return {
    ...actual,
    createPortal: (node: React.ReactNode) => node,
  }
})

// useFocusTrap: no-op — jsdom heeft geen echte focus-API.
vi.mock('@/lib/hooks/use-focus-trap', () => ({
  useFocusTrap: () => {},
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

const base = {
  visible: true,
  onClose: vi.fn(),
  onDismissForever: vi.fn(),
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ToekomstExitNotice', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    // Herstel body.overflow zodat de scroll-lock-effect de volgende test niet vuilt.
    document.body.style.overflow = ''
  })

  // ── A. visible=false → rendert niets ─────────────────────────────────────

  it('rendert null als visible=false', () => {
    render(<ToekomstExitNotice {...base} visible={false} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  // ── B. visible=true → titel + boodschap + knoppen aanwezig ───────────────

  it('rendert de modal-dialog met titel en boodschap als visible=true', () => {
    render(<ToekomstExitNotice {...base} />)

    // Dialog-rol aanwezig
    expect(screen.getByRole('dialog')).toBeTruthy()

    // Titel via heading level 2
    const heading = screen.getByRole('heading', { level: 2 })
    expect(heading.textContent).toContain('Je tips zijn nu verborgen')

    // Boodschap bevat kernwoord "Toekomst"
    const body = document.querySelector('[role="dialog"] p')
    expect(body?.textContent).toContain('Toekomst')
  })

  it('rendert beide knoppen ("Sluiten" en "Niet meer weergeven")', () => {
    render(<ToekomstExitNotice {...base} />)

    // Er zijn twee knoppen die "sluiten" in hun naam hebben: de tekst-"Sluiten"-knop
    // en de ✕ "Melding sluiten"-knop. Gebruik getAllBy om beide te tellen, en
    // asserteer op de specifieke tekst-knop via exact=true om de ✕-knop te scheiden.
    const allSluiten = screen.getAllByRole('button', { name: /Sluiten/i })
    expect(allSluiten.length).toBeGreaterThanOrEqual(2) // tekst-knop + ✕

    // De primaire "Sluiten"-knop (tekst) heeft géén aria-label en WEL zichtbare tekst.
    const tekstSluitBtn = allSluiten.find(
      (btn) => btn.textContent?.trim() === 'Sluiten' && !btn.getAttribute('aria-label')
    )
    expect(tekstSluitBtn).toBeTruthy()

    expect(screen.getByRole('button', { name: /Niet meer weergeven/i })).toBeTruthy()
  })

  // ── C. "Sluiten"-knop → onClose only ────────────────────────────────────

  it('klik "Sluiten" roept onClose aan en NIET onDismissForever', () => {
    const onClose = vi.fn()
    const onDismissForever = vi.fn()
    render(<ToekomstExitNotice visible onClose={onClose} onDismissForever={onDismissForever} />)

    // Er kunnen meerdere "Sluiten"-knoppen zijn (✕ + tekst-knop), pak de primaire via tekst.
    const sluitBtn = screen.getByRole('button', { name: /^Sluiten$/i })
    fireEvent.click(sluitBtn)

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onDismissForever).not.toHaveBeenCalled()
  })

  // ── D. "Niet meer weergeven"-knop → onDismissForever only ────────────────

  it('klik "Niet meer weergeven" roept onDismissForever aan en NIET onClose', () => {
    const onClose = vi.fn()
    const onDismissForever = vi.fn()
    render(<ToekomstExitNotice visible onClose={onClose} onDismissForever={onDismissForever} />)

    const dismissBtn = screen.getByRole('button', { name: /Niet meer weergeven/i })
    fireEvent.click(dismissBtn)

    expect(onDismissForever).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
  })

  // ── E. Escape-toets → onClose (niet-persistent) ───────────────────────────

  it('Escape-toets roept onClose aan (niet-persistent, niet onDismissForever)', () => {
    const onClose = vi.fn()
    const onDismissForever = vi.fn()
    render(<ToekomstExitNotice visible onClose={onClose} onDismissForever={onDismissForever} />)

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onDismissForever).not.toHaveBeenCalled()
  })

  // ── F. Klik op de achtergrond-scrim → onClose (niet-persistent) ──────────

  it('klik op de achtergrond-scrim roept onClose aan (niet onDismissForever)', () => {
    const onClose = vi.fn()
    const onDismissForever = vi.fn()
    render(<ToekomstExitNotice visible onClose={onClose} onDismissForever={onDismissForever} />)

    // De scrim is het element met aria-hidden en de backdrop-blur klasse.
    const scrim = document.querySelector('[aria-hidden="true"]')
    expect(scrim).toBeTruthy()
    fireEvent.click(scrim!)

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onDismissForever).not.toHaveBeenCalled()
  })

  // ── G. Scroll-lock ────────────────────────────────────────────────────────

  it('vergrendelt body-scroll zolang de modal open is en herstelt na unmount', () => {
    const { unmount } = render(<ToekomstExitNotice {...base} />)
    expect(document.body.style.overflow).toBe('hidden')
    unmount()
    expect(document.body.style.overflow).not.toBe('hidden')
  })

  // ── H. ✕-sluit-knop (aria-label "Melding sluiten") → onClose ─────────────

  it('klik op de ✕-sluit-knop (aria-label "Melding sluiten") roept onClose aan', () => {
    const onClose = vi.fn()
    const onDismissForever = vi.fn()
    render(<ToekomstExitNotice visible onClose={onClose} onDismissForever={onDismissForever} />)

    const closeBtn = screen.getByRole('button', { name: /Melding sluiten/i })
    fireEvent.click(closeBtn)

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onDismissForever).not.toHaveBeenCalled()
  })

  // ── I. Kicker-tekst "Tips verborgen" aanwezig ────────────────────────────

  it('toont de kicker-tekst "Tips verborgen"', () => {
    render(<ToekomstExitNotice {...base} />)
    // De kicker-div heeft class "font-mono" en bevat de tekst-node "Tips verborgen"
    // naast het Lightbulb-icoon. We zoeken via query-selector om de precieze div te pakken.
    const kickerDiv = document.querySelector('[class*="font-mono"][class*="uppercase"]')
    expect(kickerDiv).toBeTruthy()
    expect(kickerDiv!.textContent).toContain('Tips verborgen')
  })
})
