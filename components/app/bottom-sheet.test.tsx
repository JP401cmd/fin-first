import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BottomSheet } from './bottom-sheet'
import { getOverlayCount, __resetOverlayCount } from '@/lib/overlay-signal'
import { getOverlayHistoryDepth, __resetOverlayHistory } from '@/lib/overlay-history'

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

/**
 * Eén history-entry per open sheet — en elke sluitroute ruimt die op de juiste
 * manier op. X, Escape, backdrop en swipe consumeren de eigen entry met een
 * `history.back()` (anders blijft er een weesentry staan). Sluiten dóór een
 * link in de sheet is de uitzondering: daar is Next's navigatie al onderweg en
 * zou diezelfde back() die navigatie afbreken — de sheet blijft dan dicht maar
 * de URL springt terug (het defect uit e2e/nav-menu-sheet-navigation.spec.ts).
 *
 * De rerender naar `open={false}` staat voor de bovenliggende component die op
 * `onClose` reageert; daar hangt de effect-cleanup (de release) aan.
 */
describe('BottomSheet — history-entry per sluitroute', () => {
  let pushSpy: ReturnType<typeof vi.spyOn>
  let backSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    __resetOverlayHistory()
    window.history.replaceState(null, '')
    pushSpy = vi.spyOn(window.history, 'pushState')
    backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    __resetOverlayHistory()
  })

  function renderSheet(kinderen?: React.ReactNode) {
    const onClose = vi.fn()
    const { rerender } = render(
      <BottomSheet open onClose={onClose} title="Test" closeOnBackdropClick>
        {kinderen ?? <p>inhoud</p>}
      </BottomSheet>,
    )
    const dialog = screen.getByRole('dialog')
    return {
      onClose,
      dialog,
      backdrop: dialog.parentElement as HTMLElement,
      /** De ouder reageert op onClose en zet `open` uit. */
      ouderSluit: () =>
        rerender(
          <BottomSheet open={false} onClose={onClose} title="Test" closeOnBackdropClick>
            {kinderen ?? <p>inhoud</p>}
          </BottomSheet>,
        ),
    }
  }

  it('duwt precies één entry bij openen', () => {
    renderSheet()
    expect(pushSpy).toHaveBeenCalledTimes(1)
    expect(getOverlayHistoryDepth()).toBe(1)
  })

  it('consumeert de entry bij sluiten via de X-knop', () => {
    const { onClose, ouderSluit } = renderSheet()
    fireEvent.click(screen.getByLabelText('Sluiten'))
    expect(onClose).toHaveBeenCalledTimes(1)
    ouderSluit()
    expect(backSpy).toHaveBeenCalledTimes(1)
    expect(getOverlayHistoryDepth()).toBe(0)
  })

  it('consumeert de entry bij sluiten via Escape', () => {
    const { ouderSluit } = renderSheet()
    fireEvent.keyDown(document, { key: 'Escape' })
    ouderSluit()
    expect(backSpy).toHaveBeenCalledTimes(1)
    expect(getOverlayHistoryDepth()).toBe(0)
  })

  it('consumeert de entry bij sluiten via de backdrop', () => {
    const { backdrop, ouderSluit } = renderSheet()
    fireEvent.click(backdrop)
    ouderSluit()
    expect(backSpy).toHaveBeenCalledTimes(1)
    expect(getOverlayHistoryDepth()).toBe(0)
  })

  it('consumeert de entry bij weg-swipen', async () => {
    const { dialog, onClose, ouderSluit } = renderSheet()
    fireEvent.touchStart(dialog, { touches: [{ clientX: 0, clientY: 0 }] })
    fireEvent.touchMove(document, { touches: [{ clientX: 0, clientY: 160 }] })
    fireEvent.touchEnd(document)
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    ouderSluit()
    expect(backSpy).toHaveBeenCalledTimes(1)
    expect(getOverlayHistoryDepth()).toBe(0)
  })

  it('laat de history met rust wanneer een link in de sheet de sluiting veroorzaakt', () => {
    const { ouderSluit } = renderSheet(<a href="/mijn">Mijn</a>)
    // Next's <Link> voorkomt de default en navigeert zelf; die navigatie is bij
    // het sluiten nog onderweg.
    const houdJsdomStil = (e: Event) => e.preventDefault()
    document.addEventListener('click', houdJsdomStil)
    fireEvent.click(screen.getByText('Mijn'))
    document.removeEventListener('click', houdJsdomStil)

    ouderSluit()

    expect(backSpy).not.toHaveBeenCalled()
    expect(getOverlayHistoryDepth()).toBe(0)
  })
})
