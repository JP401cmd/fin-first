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

/**
 * WF-BUDGET-10 — de sluit-poort (`onRequestClose`).
 *
 * Repro: in het bewerk-paneel met onopgeslagen wijzigingen toonde een klik op X
 * wél de "Onopgeslagen wijzigingen"-bevestiging, maar `handleProgrammaticClose`
 * startte `animateExit()` ONVOORWAARDELIJK náást `onClose()` — de sheet (en dus
 * de zojuist getoonde waarschuwing) was binnen ~300ms weg. De gebruiker kreeg
 * zijn keuze nooit te zien.
 *
 * Deze suite pint beide helften: een poort die weigert houdt de sheet op alle
 * drie de programmatische routes staan, en zónder poort verandert er niets.
 */
describe('BottomSheet — sluit-poort onRequestClose', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    __resetOverlayHistory()
  })

  function renderSheet(onRequestClose?: () => boolean | Promise<boolean>) {
    const onClose = vi.fn()
    render(
      <BottomSheet open onClose={onClose} onRequestClose={onRequestClose} title="Bewerken" closeOnBackdropClick>
        <p>formulier</p>
      </BottomSheet>,
    )
    const dialog = screen.getByRole('dialog')
    return { onClose, dialog, backdrop: dialog.parentElement as HTMLElement }
  }

  it('houdt de sheet staan bij een X-klik wanneer de poort weigert', async () => {
    const { onClose } = renderSheet(() => false)
    fireEvent.click(screen.getByLabelText('Sluiten'))

    expect(onClose).not.toHaveBeenCalled()
    // Ruim voorbij de 300ms-fallback van de exit-animatie: de sheet mag ook
    // dán niet alsnog verdwijnen — precies het defect.
    await new Promise((r) => setTimeout(r, 350))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('formulier')).toBeInTheDocument()
  })

  it('houdt de sheet staan bij Escape wanneer de poort weigert', () => {
    const { onClose } = renderSheet(() => false)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('houdt de sheet staan bij een backdrop-klik wanneer de poort weigert', () => {
    const { onClose, backdrop } = renderSheet(() => false)
    fireEvent.click(backdrop)
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('sluit gewoon wanneer de poort toestemming geeft', () => {
    const { onClose } = renderSheet(() => true)
    fireEvent.click(screen.getByLabelText('Sluiten'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('wacht op een asynchrone poort en sluit pas bij een positief antwoord', async () => {
    const { onClose } = renderSheet(() => Promise.resolve(true))
    fireEvent.click(screen.getByLabelText('Sluiten'))
    // Nog niets: het antwoord is er pas in een volgende microtask.
    expect(onClose).not.toHaveBeenCalled()
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('sluit niet bij een asynchrone poort die weigert', async () => {
    const { onClose } = renderSheet(() => Promise.resolve(false))
    fireEvent.click(screen.getByLabelText('Sluiten'))
    await new Promise((r) => setTimeout(r, 350))
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('laat het swipe-gebaar ongemoeid — dat is een expliciete dismiss', async () => {
    const poort = vi.fn(() => false)
    const { dialog, onClose } = renderSheet(poort)
    fireEvent.touchStart(dialog, { touches: [{ clientX: 0, clientY: 0 }] })
    fireEvent.touchMove(document, { touches: [{ clientX: 0, clientY: 160 }] })
    fireEvent.touchEnd(document)

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(poort).not.toHaveBeenCalled()
  })

  it('sluit ongewijzigd meteen zonder poort (harde eis: bestaande callers)', () => {
    const { onClose } = renderSheet(undefined)
    fireEvent.click(screen.getByLabelText('Sluiten'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('geeft de history-entry terug wanneer de poort de terug-knop weigert', () => {
    __resetOverlayHistory()
    window.history.replaceState(null, '')
    const pushSpy = vi.spyOn(window.history, 'pushState')
    vi.spyOn(window.history, 'back').mockImplementation(() => {})

    const { onClose } = renderSheet(() => false)
    expect(pushSpy).toHaveBeenCalledTimes(1)

    window.dispatchEvent(new PopStateEvent('popstate'))

    // De sheet blijft open, dus hij hoort ook zijn entry terug te krijgen —
    // anders verlaat de VOLGENDE terug-druk de pagina met het paneel nog open.
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(pushSpy).toHaveBeenCalledTimes(2)
    expect(getOverlayHistoryDepth()).toBe(1)
  })
})

// ── Geneste overlay: de ouder mag het gebaar niet afpakken ───────────
//
// React-events propageren door de REACT-boom, niet door de DOM-boom. Een
// geneste BottomSheet leeft als React-kind ín zijn ouder, maar portalt zijn DOM
// naar `document.body` — dus een `touchstart` in de KIND-sheet bereikt alsnog de
// `onTouchStart` van de OUDER-sheet. Die zag het doelwit niet in zijn eigen
// scroll-content zitten en concludeerde "greep" → drag meteen actief → elke
// `touchmove` kreeg `preventDefault()`.
//
// Gevolg op het scherm: de geneste sheet ("Gevonden patronen" boven de
// rekeningdetail) liet zich niet scrollen — de browser mocht het gebaar nooit
// als scroll uitvoeren. Given een sheet ín een sheet, When de gebruiker in de
// kind-sheet veegt, Then houdt de ouder zich stil en blijft het gebaar native.
describe('BottomSheet — geneste sheet houdt zijn eigen gebaar', () => {
  it('start GEEN ouder-drag bij een touch die in een geneste sheet begint', () => {
    const ouderSluit = vi.fn()
    render(
      <BottomSheet open onClose={ouderSluit} title="Ouder">
        <p>ouder-inhoud</p>
        <BottomSheet open onClose={() => {}} title="Kind">
          <p>kind-inhoud</p>
        </BottomSheet>
      </BottomSheet>,
    )

    // De scroll-content van de KIND-sheet: precies waar een gebruiker veegt om
    // door de lijst te scrollen.
    const kindContent = screen.getByText('kind-inhoud').parentElement as HTMLElement
    expect(kindContent.className).toContain('overflow-y-auto')

    // Omhoog vegen = onmiskenbaar scrollen, nooit een dismiss. De kind-sheet
    // beslist dat zelf ('scroll') en laat het gebaar met rust.
    fireEvent.touchStart(kindContent, { touches: [{ clientX: 0, clientY: 400 }] })
    const beweging = new TouchEvent('touchmove', {
      bubbles: true,
      cancelable: true,
      // @ts-expect-error — jsdom TouchEvent accepteert plain objects als touches.
      touches: [{ clientX: 0, clientY: 300 }],
    })
    document.dispatchEvent(beweging)

    // De ouder mag het gebaar niet claimen: bleef het event annuleerbaar, dan
    // heeft niemand `preventDefault()` gedaan en kan de browser gewoon scrollen.
    expect(beweging.defaultPrevented).toBe(false)
    fireEvent.touchEnd(document)
    expect(ouderSluit).not.toHaveBeenCalled()
  })
})
