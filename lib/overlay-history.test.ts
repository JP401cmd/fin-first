import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  pushOverlayHistory,
  getOverlayHistoryDepth,
  __resetOverlayHistory,
} from './overlay-history'

/**
 * De vier valkuilen uit de analyse, elk als test:
 *  1. terug sluit de bovenste overlay en laat de route staan;
 *  2. gestapelde overlays poppen in LIFO;
 *  3. sluiten via X/Escape/swipe laat GEEN weesentry achter (anders moet je
 *     twee keer terug drukken);
 *  4. onze eigen `history.back()` mag niet de onderliggende overlay sluiten.
 *
 * jsdom voert `history.back()` asynchroon uit en vuurt niet altijd popstate;
 * we simuleren de browser daarom expliciet met een `back`-stub die het event
 * synchroon dispatcht — de volgorde en de bookkeeping zijn wat we testen, niet
 * jsdom's history-implementatie.
 */
function simuleerBrowserBack() {
  window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }))
}

describe('overlay-history', () => {
  let backSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    __resetOverlayHistory()
    window.history.replaceState(null, '')
    backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {
      simuleerBrowserBack()
    })
  })

  afterEach(() => {
    backSpy.mockRestore()
    __resetOverlayHistory()
  })

  it('sluit de overlay bij een terug-druk in plaats van de pagina weg te navigeren', () => {
    const close = vi.fn()
    pushOverlayHistory(close)
    expect(getOverlayHistoryDepth()).toBe(1)

    simuleerBrowserBack()

    expect(close).toHaveBeenCalledTimes(1)
    expect(getOverlayHistoryDepth()).toBe(0)
  })

  it('popt gestapelde overlays in LIFO — modal→modal, niet modal→pagina', () => {
    const volgorde: string[] = []
    pushOverlayHistory(() => volgorde.push('onder'))
    pushOverlayHistory(() => volgorde.push('boven'))

    simuleerBrowserBack()
    simuleerBrowserBack()

    expect(volgorde).toEqual(['boven', 'onder'])
  })

  it('laat geen weesentry achter bij sluiten via X/Escape/swipe', () => {
    const close = vi.fn()
    const release = pushOverlayHistory(close)

    release()

    // De eigen entry is met history.back() geconsumeerd …
    expect(backSpy).toHaveBeenCalledTimes(1)
    expect(getOverlayHistoryDepth()).toBe(0)
    // … en die back mag NIET als "sluit de overlay" tellen (dubbel sluiten).
    expect(close).not.toHaveBeenCalled()
  })

  it('onze eigen back sluit niet per ongeluk de overlay eronder', () => {
    const onderClose = vi.fn()
    pushOverlayHistory(onderClose)
    const bovenRelease = pushOverlayHistory(vi.fn())

    bovenRelease()

    expect(onderClose).not.toHaveBeenCalled()
    expect(getOverlayHistoryDepth()).toBe(1)

    // De volgende ECHTE terug-druk hoort de onderliggende wél te sluiten.
    simuleerBrowserBack()
    expect(onderClose).toHaveBeenCalledTimes(1)
  })

  it('raakt de history niet aan wanneer de app intussen doorgenavigeerd is', () => {
    const release = pushOverlayHistory(vi.fn())
    // Next duwt zijn eigen state bovenop bij een route-wissel; onze entry is
    // dan niet meer de huidige. Blind back() zou die navigatie terugdraaien.
    window.history.pushState({ nextRoute: true }, '')

    release()

    expect(backSpy).not.toHaveBeenCalled()
  })

  it('release is idempotent — twee keer aanroepen duwt niet twee keer terug', () => {
    const release = pushOverlayHistory(vi.fn())
    release()
    release()
    expect(backSpy).toHaveBeenCalledTimes(1)
  })

  it('doet niets bij een terug-druk zonder open overlay', () => {
    expect(() => simuleerBrowserBack()).not.toThrow()
    expect(getOverlayHistoryDepth()).toBe(0)
  })
})
