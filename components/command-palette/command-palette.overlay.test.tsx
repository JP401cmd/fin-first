import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CommandPalette } from './command-palette'
import { getOverlayHistoryDepth, __resetOverlayHistory } from '@/lib/overlay-history'

/**
 * De ZOEK-overlay (⌘K) draait op dezelfde standaard-modalwerking als elke
 * andere modal: de terug-knop sluit hem (lib/overlay-history.ts) en swipe-down
 * sluit hem (lib/hooks/use-swipe-to-dismiss.ts) — beide de gedeelde
 * implementatie die BottomSheet en het chatpaneel ook gebruiken.
 *
 * Deze tests pinnen de bedrading, niet de drempelwaarden van het gebaar zelf
 * (die staan in lib/hooks/use-swipe-to-dismiss.test.tsx):
 *  1. open = precies één history-entry;
 *  2. een echte terug-druk sluit de palette en laat de route staan;
 *  3. sluiten via het kruisje laat geen weesentry achter, heropenen meldt weer aan;
 *  4. een voldoende grote neerwaartse sleep sluit;
 *  5. een korte sleep veert terug (geen sluiting) — een geannuleerd gebaar
 *     raakt de getypte zoekterm niet;
 *  6. een gescrolde resultatenlijst blijft native scroll.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))

vi.mock('@/components/app/chat/chat-provider', () => ({
  useChatContext: () => ({ open: vi.fn(), openWithMessage: vi.fn() }),
}))

vi.mock('@/components/sync/global-sync-provider', () => ({
  useGlobalSync: () => ({ triggerGlobalSync: vi.fn() }),
}))

vi.mock('@/components/app/feature-access-provider', () => ({
  useModuleAccess: () => ({
    activeModules: ['inzicht_acties'],
    subscriptions: [],
    isModuleActive: () => true,
    refreshModules: vi.fn(),
  }),
}))

beforeEach(() => {
  // jsdom implementeert scrollIntoView niet; het auto-scroll-effect voor de
  // geselecteerde rij roept het aan bij mount.
  Element.prototype.scrollIntoView = vi.fn()
})

function simuleerBrowserBack() {
  window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }))
}

function paneel(): HTMLElement {
  return document.querySelector('[data-cmdk-panel]') as HTMLElement
}

function lijst(): HTMLElement {
  return paneel().querySelector('.overflow-y-auto') as HTMLElement
}

describe('CommandPalette — terug-knop sluit de palette', () => {
  let backSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    __resetOverlayHistory()
    window.history.replaceState(null, '')
    // jsdom voert `history.back()` asynchroon uit en vuurt niet altijd popstate;
    // we simuleren de browser expliciet (zelfde aanpak als overlay-history.test.ts).
    backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {
      simuleerBrowserBack()
    })
  })

  afterEach(() => {
    backSpy.mockRestore()
    __resetOverlayHistory()
  })

  it('meldt één history-entry aan zolang de palette open staat', () => {
    render(<CommandPalette open onClose={vi.fn()} userId="u1" />)
    expect(getOverlayHistoryDepth()).toBe(1)
  })

  it('meldt niets aan zolang de palette dicht is', () => {
    render(<CommandPalette open={false} onClose={vi.fn()} userId="u1" />)
    expect(getOverlayHistoryDepth()).toBe(0)
  })

  it('sluit de palette bij een terug-druk in plaats van de pagina weg te navigeren', () => {
    const onClose = vi.fn()
    render(<CommandPalette open onClose={onClose} userId="u1" />)

    simuleerBrowserBack()

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(getOverlayHistoryDepth()).toBe(0)
  })

  it('laat geen weesentry achter bij sluiten via het kruisje, en meldt opnieuw aan bij heropenen', async () => {
    const onClose = vi.fn()
    const { rerender } = render(<CommandPalette open onClose={onClose} userId="u1" />)
    expect(getOverlayHistoryDepth()).toBe(1)

    fireEvent.click(screen.getByRole('button', { name: 'Sluiten' }))
    expect(onClose).toHaveBeenCalledTimes(1)

    // De consument zet `open` op false — de cleanup consumeert de eigen entry,
    // anders zou de eerste terug-druk daarna niets doen.
    rerender(<CommandPalette open={false} onClose={onClose} userId="u1" />)
    await waitFor(() => expect(getOverlayHistoryDepth()).toBe(0))
    expect(backSpy).toHaveBeenCalledTimes(1)
    // Onze eigen back mag `onClose` niet nóg eens aanroepen.
    expect(onClose).toHaveBeenCalledTimes(1)

    rerender(<CommandPalette open onClose={onClose} userId="u1" />)
    expect(getOverlayHistoryDepth()).toBe(1)
  })

  it('laat de history met rust wanneer de palette zelf naar een pagina navigeert', async () => {
    const onClose = vi.fn()
    const { rerender } = render(<CommandPalette open onClose={onClose} userId="u1" />)
    fireEvent.change(screen.getByLabelText('Zoekopdracht'), { target: { value: 'overzicht' } })

    // Enter op het geselecteerde resultaat: de palette sluit zichzelf en doet
    // dan `router.push()`. Die route-wissel is nog onderweg wanneer de cleanup
    // loopt — een eigen `history.back()` zou 'm afbreken (zelfde defect als de
    // link in de NavMenuSheet, alleen zonder link om aan te herkennen).
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(onClose).toHaveBeenCalledTimes(1)

    rerender(<CommandPalette open={false} onClose={onClose} userId="u1" />)
    await waitFor(() => expect(getOverlayHistoryDepth()).toBe(0))
    expect(backSpy).not.toHaveBeenCalled()
  })
})

describe('CommandPalette — swipe-down-to-dismiss', () => {
  const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')

  beforeEach(() => {
    __resetOverlayHistory()
    // jsdom geeft elk element hoogte 0, terwijl de dismiss-drempel 30% van de
    // paneelhoogte is — die hoogte pinnen we dus expliciet.
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      value: 800,
    })
  })

  afterEach(() => {
    if (originalOffsetHeight) {
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originalOffsetHeight)
    } else {
      delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetHeight
    }
    __resetOverlayHistory()
  })

  it('sluit de palette na een neerwaartse sleep aan de zoekbalk', async () => {
    const onClose = vi.fn()
    render(<CommandPalette open onClose={onClose} userId="u1" />)

    const zoekbalk = screen.getByLabelText('Zoekopdracht')
    fireEvent.touchStart(zoekbalk, { touches: [{ clientY: 100 }] })
    fireEvent.touchMove(zoekbalk, { touches: [{ clientY: 500 }] })
    fireEvent.touchEnd(zoekbalk)

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('sluit NIET bij een korte sleep — de palette veert terug en de zoekterm blijft staan', async () => {
    const onClose = vi.fn()
    render(<CommandPalette open onClose={onClose} userId="u1" />)

    const zoekbalk = screen.getByLabelText('Zoekopdracht') as HTMLInputElement
    fireEvent.change(zoekbalk, { target: { value: 'boodschappen' } })

    // Zonder gecontroleerde tijd meet de snelheids-tracker 0ms tussen twee
    // synchrone fireEvent-aanroepen en dus een willekeurig hoge px/s. 80px in
    // 200ms (400px/s) is een realistische trage sleep, ruim onder zowel de
    // snelheids- (800px/s) als de percentage-drempel (30% van 800px).
    const dateNowSpy = vi.spyOn(Date, 'now')
    dateNowSpy.mockReturnValueOnce(1_000).mockReturnValueOnce(1_200)
    fireEvent.touchStart(zoekbalk, { touches: [{ clientY: 100 }] })
    fireEvent.touchMove(zoekbalk, { touches: [{ clientY: 180 }] })
    dateNowSpy.mockRestore()
    fireEvent.touchEnd(zoekbalk)

    // Ruim langer dan de langste dismiss-animatie (350ms + marge).
    await new Promise((r) => setTimeout(r, 450))
    expect(onClose).not.toHaveBeenCalled()
    expect((screen.getByLabelText('Zoekopdracht') as HTMLInputElement).value).toBe('boodschappen')
  })

  it('sluit vanuit de resultatenlijst wanneer die bovenaan staat', async () => {
    const onClose = vi.fn()
    render(<CommandPalette open onClose={onClose} userId="u1" />)

    const body = lijst()
    fireEvent.touchStart(body, { touches: [{ clientY: 100 }] })
    // Eerste beweging beslist scroll-vs-drag (bovenaan + omlaag = drag).
    fireEvent.touchMove(body, { touches: [{ clientY: 150 }] })
    fireEvent.touchMove(body, { touches: [{ clientY: 550 }] })
    fireEvent.touchEnd(body)

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('sluit NIET wanneer de resultatenlijst gescrold is — dat blijft native scroll', async () => {
    const onClose = vi.fn()
    render(<CommandPalette open onClose={onClose} userId="u1" />)

    const body = lijst()
    // `writable`: de scroll-lock zet bij cleanup `scrollTop` terug op de
    // container — een read-only property laat die unmount klappen.
    Object.defineProperty(body, 'scrollTop', { configurable: true, writable: true, value: 120 })
    fireEvent.touchStart(body, { touches: [{ clientY: 100 }] })
    fireEvent.touchMove(body, { touches: [{ clientY: 150 }] })
    fireEvent.touchMove(body, { touches: [{ clientY: 550 }] })
    fireEvent.touchEnd(body)

    await new Promise((r) => setTimeout(r, 450))
    expect(onClose).not.toHaveBeenCalled()
  })
})
