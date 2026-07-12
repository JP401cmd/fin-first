import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BottomSheet } from './bottom-sheet'
import { getOverlayCount, __resetOverlayCount } from '@/lib/overlay-signal'

// Modal-standaard: een klik op de gedimde achtergrond (backdrop) sluit een
// modal NIET meer. Dit voorkomt onbedoeld dataverlies wanneer een gebruiker
// naast een invulformulier klikt (bug: onboarding bezitting/schuld sloot direct).
describe('BottomSheet — backdrop-klik (modal-standaard)', () => {
  function renderSheet(props: Partial<React.ComponentProps<typeof BottomSheet>> = {}) {
    const onClose = vi.fn()
    render(
      <BottomSheet open onClose={onClose} title="Test" {...props}>
        <p>inhoud</p>
      </BottomSheet>,
    )
    const dialog = screen.getByRole('dialog')
    const backdrop = dialog.parentElement as HTMLElement
    return { onClose, dialog, backdrop }
  }

  it('sluit standaard NIET bij een klik op de backdrop', () => {
    const { onClose, backdrop } = renderSheet()
    fireEvent.click(backdrop)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('sluit wel via de Escape-toets', () => {
    const { onClose } = renderSheet()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('sluit wel via de X-knop', () => {
    const { onClose } = renderSheet()
    fireEvent.click(screen.getByLabelText('Sluiten'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('sluit wel via de backdrop wanneer closeOnBackdropClick expliciet aan staat', () => {
    const { onClose, backdrop } = renderSheet({ closeOnBackdropClick: true })
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

// Sticky footer-slot: primaire acties leven BUITEN de scroll-content zodat ze
// ook op klein scherm altijd zichtbaar onderin blijven (modal-standaard).
describe('BottomSheet — sticky footer-slot', () => {
  it('rendert de footerSlot-inhoud wanneer meegegeven', () => {
    render(
      <BottomSheet open onClose={() => {}} title="Test" footerSlot={<button>Opslaan</button>}>
        <p>inhoud</p>
      </BottomSheet>,
    )
    expect(screen.getByRole('button', { name: 'Opslaan' })).toBeTruthy()
  })

  it('rendert geen footer-container zonder footerSlot (backwards-compatible)', () => {
    render(
      <BottomSheet open onClose={() => {}} title="Test">
        <p>inhoud</p>
      </BottomSheet>,
    )
    expect(screen.queryByRole('button', { name: 'Opslaan' })).toBeNull()
  })

  it('plaatst de footerSlot buiten de scrollbare content-container', () => {
    render(
      <BottomSheet open onClose={() => {}} title="Test" footerSlot={<button>Opslaan</button>}>
        <p>inhoud</p>
      </BottomSheet>,
    )
    const footerBtn = screen.getByRole('button', { name: 'Opslaan' })
    const scrollContainer = screen.getByText('inhoud').closest('.overflow-y-auto')
    expect(scrollContainer).not.toBeNull()
    // De footer-knop mag NIET binnen de scroll-container hangen — anders scrollt
    // hij mee en verdwijnt hij onderin i.p.v. sticky te blijven.
    expect(scrollContainer!.contains(footerBtn)).toBe(false)
  })
})

// Overlay-signaal: een open BottomSheet meldt zich aan zodat de FloatingNavButton
// zich verbergt — behalve de NavMenuSheet (belowFloatingNav), die de pill als
// toggle houdt. Zie lib/overlay-signal.ts + CLAUDE.md §Modal-conventie.
describe('BottomSheet — overlay-signaal (pill verbergen)', () => {
  beforeEach(() => __resetOverlayCount())
  afterEach(() => __resetOverlayCount())

  it('verhoogt de overlay-teller zolang de sheet open is en zet de teller terug bij sluiten', () => {
    const { rerender } = render(
      <BottomSheet open onClose={() => {}} title="Test">
        <p>inhoud</p>
      </BottomSheet>,
    )
    expect(getOverlayCount()).toBe(1)
    rerender(
      <BottomSheet open={false} onClose={() => {}} title="Test">
        <p>inhoud</p>
      </BottomSheet>,
    )
    // Release hangt aan de `open`-prop (direct bij close-start), niet aan de
    // exit-animatie — de pill komt daardoor soepel terug.
    expect(getOverlayCount()).toBe(0)
  })

  it('geeft het signaal vrij bij unmount', () => {
    const { unmount } = render(
      <BottomSheet open onClose={() => {}} title="Test">
        <p>inhoud</p>
      </BottomSheet>,
    )
    expect(getOverlayCount()).toBe(1)
    unmount()
    expect(getOverlayCount()).toBe(0)
  })

  it('meldt zich NIET aan wanneer belowFloatingNav (NavMenuSheet-uitzondering)', () => {
    render(
      <BottomSheet open onClose={() => {}} title="Navigatie" belowFloatingNav>
        <p>inhoud</p>
      </BottomSheet>,
    )
    expect(getOverlayCount()).toBe(0)
  })
})
