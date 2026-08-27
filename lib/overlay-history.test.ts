import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  pushOverlayHistory,
  noteOverlayNavigation,
  getOverlayHistoryDepth,
  __resetOverlayHistory,
} from './overlay-history'

/**
 * De vijf valkuilen uit de analyse, elk als test:
 *  1. terug sluit de bovenste overlay en laat de route staan;
 *  2. gestapelde overlays poppen in LIFO;
 *  3. sluiten via X/Escape/swipe/backdrop laat GEEN weesentry achter (anders
 *     moet je twee keer terug drukken);
 *  4. onze eigen `history.back()` mag niet de onderliggende overlay sluiten;
 *  5. sluiten dóór een link-navigatie mag die navigatie niet afbreken — zie de
 *     tweede describe, die daarvoor een complete history-stack nabootst.
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
    pushOverlayHistory(() => { volgorde.push('onder') })
    pushOverlayHistory(() => { volgorde.push('boven') })

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

  it('geeft de entry terug wanneer de overlay weigert te sluiten', () => {
    // Het chatpaneel weigert tijdens een lopende verzending (`meldingBezig`).
    let weiger = true
    const close = vi.fn(() => (weiger ? false : true))
    pushOverlayHistory(close)

    simuleerBrowserBack()

    expect(close).toHaveBeenCalledTimes(1)
    // Nog steeds één aangemelde entry: anders verlaat de volgende terug-druk de
    // pagina met een open overlay.
    expect(getOverlayHistoryDepth()).toBe(1)

    // Zodra de verzending klaar is sluit dezelfde terug-druk wel.
    weiger = false
    simuleerBrowserBack()
    expect(close).toHaveBeenCalledTimes(2)
    expect(getOverlayHistoryDepth()).toBe(0)
  })

  it('kan na een weigering nog steeds netjes via het kruisje sluiten', () => {
    const release = pushOverlayHistory(() => false)
    simuleerBrowserBack()
    expect(getOverlayHistoryDepth()).toBe(1)

    // De teruggeduwde entry draagt hetzelfde id, dus de release herkent 'm nog
    // als de huidige en consumeert 'm — geen weesentry.
    release()
    expect(backSpy).toHaveBeenCalledTimes(1)
    expect(getOverlayHistoryDepth()).toBe(0)
  })

  it('doet niets bij een terug-druk zonder open overlay', () => {
    expect(() => simuleerBrowserBack()).not.toThrow()
    expect(getOverlayHistoryDepth()).toBe(0)
  })
})

/**
 * Sluiten dóór navigatie — de vijfde sluitroute.
 *
 * Een `<Link>` in een overlay sluit de overlay én start een route-wissel. De
 * release vuurde daar een `history.back()` terwijl Next's RSC-navigatie nog
 * onderweg was; die back brak de navigatie af (URL bleef op de oude route).
 *
 * Hier toetsen we niet alleen ÓF er een back() volgt, maar of de navigatie
 * landt en waar de gebruiker ná één terug-druk uitkomt. Daarvoor is een echte
 * stack nodig, dus vervangen we `window.history` door een administratie die
 * entries bijhoudt: pushState legt er één bij, back() zet de index terug en
 * dispatcht popstate. Zelfde observeerbare oppervlak (`state`, `pushState`,
 * `back`) als de browser.
 *
 * De harness modelleert óók het defect zelf: tussen de link-klik en het landen
 * van de RSC-payload is de navigatie PENDING, en een `back()` in dat gat breekt
 * 'm af (in de echte browser: `ERR_ABORTED`, URL blijft staan). Zonder dat
 * model zou een test die alleen de eindstand van de stack bekijkt groen
 * blijven terwijl de navigatie stilletjes sneuvelt.
 */
type FakeHistoryEntry = { state: Record<string, unknown> | null; url: string }

function installeerFakeHistory(startUrl = 'https://app.test/overzicht') {
  const entries: FakeHistoryEntry[] = [{ state: null, url: startUrl }]
  let index = 0
  let backAanroepen = 0
  let navigatiePending = false

  const fake = {
    get state() {
      return entries[index].state
    },
    get length() {
      return entries.length
    },
    pushState(state: Record<string, unknown> | null, _title: string, url?: string) {
      entries.splice(index + 1)
      entries.push({ state, url: url ?? entries[index].url })
      index = entries.length - 1
    },
    replaceState(state: Record<string, unknown> | null, _title: string, url?: string) {
      entries[index] = { state, url: url ?? entries[index].url }
    },
    back() {
      backAanroepen += 1
      // Dit IS het defect: een back tijdens een lopende navigatie breekt die af.
      navigatiePending = false
      if (index === 0) return
      index -= 1
      window.dispatchEvent(new PopStateEvent('popstate', { state: entries[index].state }))
    },
  }

  const origineel = Object.getOwnPropertyDescriptor(window, 'history')!
  Object.defineProperty(window, 'history', { configurable: true, value: fake })

  return {
    /** Tik op een `<Link>`: de router start zijn asynchrone route-wissel. */
    klikOpLinkInOverlay(opties?: Parameters<typeof klikOpLink>[0]) {
      navigatiePending = true
      klikOpLink(opties)
    },
    /**
     * De RSC-payload landt en de router duwt zijn entry — tenzij de navigatie
     * intussen is afgebroken. Geeft terug of de navigatie het gehaald heeft.
     */
    navigatieLandt(url: string): boolean {
      if (!navigatiePending) return false
      navigatiePending = false
      fake.pushState({ __next: true }, '', url)
      return true
    },
    /** Route-wissel die al geland is (buiten de link-klik om). */
    routerNavigeert(url: string) {
      fake.pushState({ __next: true }, '', url)
    },
    /** Een echte terug-druk van de gebruiker. */
    gebruikerDruktTerug() {
      fake.back()
    },
    huidigeIndex: () => index,
    huidigeUrl: () => entries[index].url,
    aantalEntries: () => entries.length,
    backAanroepen: () => backAanroepen,
    herstel: () => Object.defineProperty(window, 'history', origineel),
  }
}

/**
 * Klik op een link zoals Next's `<Link>` 'm afhandelt: de default wordt in de
 * bubble-fase voorkomen (de router navigeert zelf). Onze herkenning zit in de
 * capture-fase en moet dus vóór dat `preventDefault()` al geland zijn.
 */
function klikOpLink(opties: { href?: string; target?: string; ctrlKey?: boolean } = {}) {
  const link = document.createElement('a')
  link.setAttribute('href', opties.href ?? '/mijn')
  if (opties.target) link.setAttribute('target', opties.target)
  link.textContent = 'Mijn'
  document.body.appendChild(link)
  const houdJsdomStil = (e: Event) => e.preventDefault()
  document.addEventListener('click', houdJsdomStil)
  link.dispatchEvent(
    new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ctrlKey: opties.ctrlKey }),
  )
  document.removeEventListener('click', houdJsdomStil)
  link.remove()
}

function klikOpKnop() {
  const knop = document.createElement('button')
  knop.textContent = 'Sluiten'
  document.body.appendChild(knop)
  knop.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
  knop.remove()
}

describe('overlay-history — sluiten door navigatie', () => {
  let history: ReturnType<typeof installeerFakeHistory>

  beforeEach(() => {
    __resetOverlayHistory()
    history = installeerFakeHistory()
  })

  afterEach(() => {
    history.herstel()
    __resetOverlayHistory()
    vi.restoreAllMocks()
  })

  it('breekt een lopende link-navigatie niet af met een eigen back()', () => {
    const release = pushOverlayHistory(vi.fn())
    expect(history.huidigeIndex()).toBe(1)

    // De link-klik sluit de sheet; de effect-cleanup volgt vrijwel direct,
    // ruim vóór de router zijn eigen entry heeft geduwd.
    history.klikOpLinkInOverlay()
    release()

    expect(history.backAanroepen()).toBe(0)
    expect(getOverlayHistoryDepth()).toBe(0)
    // De navigatie haalt het en landt op de nieuwe route.
    expect(history.navigatieLandt('https://app.test/mijn')).toBe(true)
    expect(history.huidigeUrl()).toBe('https://app.test/mijn')
  })

  it('brengt één terug-druk vanaf de nieuwe route terug op de vorige pagina, niet op een dode tussenstap', () => {
    const release = pushOverlayHistory(vi.fn())
    history.klikOpLinkInOverlay()
    release()
    expect(history.navigatieLandt('https://app.test/mijn')).toBe(true)

    history.gebruikerDruktTerug()

    // Landt op de achtergebleven overlay-entry en slaat die zelf over.
    expect(history.huidigeIndex()).toBe(0)
    expect(history.huidigeUrl()).toBe('https://app.test/overzicht')
  })

  it('sluit de overlay niet opnieuw wanneer de achtergebleven entry wordt overgeslagen', () => {
    const close = vi.fn()
    const release = pushOverlayHistory(close)
    history.klikOpLinkInOverlay()
    release()
    history.navigatieLandt('https://app.test/mijn')

    history.gebruikerDruktTerug()

    expect(close).not.toHaveBeenCalled()
  })

  it('behandelt een gemelde programmatische navigatie als een link-klik', () => {
    // Command-palette: `noteOverlayNavigation()` → `onClose()` → `router.push()`.
    // Geen link om aan te herkennen (vaak zelfs Enter i.p.v. een klik).
    const release = pushOverlayHistory(vi.fn())
    noteOverlayNavigation()
    release()

    expect(history.backAanroepen()).toBe(0)
    history.routerNavigeert('https://app.test/mijn')
    history.gebruikerDruktTerug()
    expect(history.huidigeIndex()).toBe(0)
  })

  it('armeert niet op een link die de history niet verandert (mailto/tel/javascript)', () => {
    for (const href of ['mailto:hallo@trifinity.nl', 'tel:+31201234567', 'javascript:void(0)']) {
      __resetOverlayHistory()
      const release = pushOverlayHistory(vi.fn())
      const backVoor = history.backAanroepen()
      history.klikOpLinkInOverlay({ href })

      release()

      // Zo'n klik opent een mailclient of doet niets — de pagina blijft staan en
      // er komt geen entry bij. De onze hoort dus gewoon geconsumeerd te worden.
      expect(history.backAanroepen(), `href=${href}`).toBe(backVoor + 1)
    }
  })

  it('armeert niet op een link naar exact de huidige URL', () => {
    const release = pushOverlayHistory(vi.fn())
    history.klikOpLinkInOverlay({ href: window.location.href })

    release()

    expect(history.backAanroepen()).toBe(1)
  })

  it('armeert niet op een link-klik zonder open overlay', () => {
    // Klik eerst (geen overlay open), open daarna pas een overlay en sluit 'm
    // binnen de marge: dat signaal mag niet blijven hangen.
    klikOpLink()
    const release = pushOverlayHistory(vi.fn())

    release()

    expect(history.backAanroepen()).toBe(1)
  })

  it('consumeert de entry wél bij een klik die niet navigeert (X-knop)', () => {
    const release = pushOverlayHistory(vi.fn())
    klikOpKnop()

    release()

    expect(history.backAanroepen()).toBe(1)
    expect(history.huidigeIndex()).toBe(0)
  })

  it('telt een klik in een nieuw tabblad niet als navigatie van deze pagina', () => {
    const release = pushOverlayHistory(vi.fn())
    klikOpLink({ ctrlKey: true })
    release()
    expect(history.backAanroepen()).toBe(1)

    const tweede = pushOverlayHistory(vi.fn())
    klikOpLink({ target: '_blank' })
    tweede()
    expect(history.backAanroepen()).toBe(2)
  })

  it('consumeert alsnog wanneer de sluiting ruim ná de link-klik komt', () => {
    const release = pushOverlayHistory(vi.fn())
    history.klikOpLinkInOverlay()
    // Buiten de marge: dit is geen sluiting-door-die-navigatie meer.
    const nu = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(nu + 5_000)

    release()

    expect(history.backAanroepen()).toBe(1)
    expect(history.huidigeIndex()).toBe(0)
  })

  it('laat een entry die al ondergesneeuwd is met rust en slaat die later over', () => {
    const release = pushOverlayHistory(vi.fn())
    // Geen link-klik: de app navigeerde op een andere manier al door.
    history.routerNavigeert('https://app.test/mijn')

    release()

    expect(history.backAanroepen()).toBe(0)
    history.gebruikerDruktTerug()
    expect(history.huidigeIndex()).toBe(0)
  })
})
