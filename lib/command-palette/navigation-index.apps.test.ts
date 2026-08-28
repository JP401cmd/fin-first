import { describe, it, expect } from 'vitest'
import { getAllPageItems, filterPagesByModules } from './navigation-index'
import { OVERVIEW_APP_SUBROUTES, globalNav } from '@/lib/nav-config'

/**
 * Bevinding M10 — "het menu verspringt per pagina, dus je kunt niet leren waar
 * iets woont".
 *
 * Besluit van de eigenaar (optie B): de contextuele filtering in de zijbalk en
 * de mobiele nav-sheet blijft zoals hij is — een app-tegel verschijnt alleen op
 * de rij van de actieve module én alleen wanneer een bezit/schuld de
 * tracking-vlag draagt. Dáárnaast moet er één plek zijn waar ALLE apps altijd
 * staan. Dat is het commandopalet.
 *
 * Deze suite bewaakt precies dat contract, want het is met een enkele
 * `requiredModule` weer stilzwijgend kapot te maken:
 *  1. elke app uit de gedeelde bron staat in het palet;
 *  2. geen enkele daarvan is module-gated (anders is hij weg zodra je hem
 *     nog niet hebt — het defect zelf);
 *  3. elke app heeft een eigen sublabel (niet de generieke fallback), zodat
 *     de gebruiker leest wáár de app woont en waarop hij aangezet wordt;
 *  4. het `App · `-voorvoegsel blijft bestaan — dat is de "alle apps"-zoekterm;
 *  5. geen dubbele hrefs, want `getAllPageItems` sleutelt zijn id's daarop.
 */

const appItems = () =>
  getAllPageItems().filter((item) => item.label.startsWith('App · '))

describe('command-palette — alle apps zijn permanent vindbaar (M10)', () => {
  it('bevat elke app uit de gedeelde nav-config-bron', () => {
    const hrefs = appItems().map((item) => item.href)
    expect(OVERVIEW_APP_SUBROUTES.length).toBeGreaterThan(0)
    for (const app of OVERVIEW_APP_SUBROUTES) {
      // Sinds M41 draagt de nav-lijst de kale route in `href` en de
      // `?tab=`-deeplink in `tabHref`; het palet gebruikt de deeplink.
      expect(hrefs, `app "${app.label}" ontbreekt in het commandopalet`).toContain(
        app.tabHref ?? app.href,
      )
    }
    expect(appItems()).toHaveLength(OVERVIEW_APP_SUBROUTES.length)
  })

  /**
   * M41 — de zijbalk/nav-sheet mag NIET rechtstreeks in de verdiepingstab
   * landen (BEZ-4 houdt die in Eenvoudig buiten het standaardpad), terwijl het
   * palet dat juist wél mag. Deze twee asserties houden die splitsing vast:
   * één klik in de nav = kale categoriepagina, één keuze in ⌘K = de app zelf.
   */
  it('houdt de nav-hrefs vrij van een ?tab=-deeplink (M41)', () => {
    for (const app of OVERVIEW_APP_SUBROUTES) {
      expect(app.href, `nav-href van "${app.label}" bevat een tab-deeplink`).not.toContain('?tab=')
    }
  })

  it('houdt de palet-hrefs op de deeplink waar die bestaat (M41)', () => {
    const hrefs = appItems().map((item) => item.href)
    for (const app of OVERVIEW_APP_SUBROUTES) {
      if (!app.tabHref) continue
      expect(app.tabHref).toContain('?tab=')
      expect(hrefs).toContain(app.tabHref)
      expect(hrefs).not.toContain(app.href)
    }
  })

  it('gate geen enkele app achter een module — ook niet-geactiveerde apps blijven vindbaar', () => {
    for (const item of appItems()) {
      expect(
        item.requiredModule,
        `"${item.label}" is module-gated; dan verdwijnt hij juist voor de gebruiker die hem nog moet ontdekken`,
      ).toBeUndefined()
    }

    // Harde variant van dezelfde regel: met NUL actieve modules moeten alle
    // apps de filter overleven.
    const overlevend = filterPagesByModules(appItems(), []).map((i) => i.href)
    expect(overlevend).toHaveLength(OVERVIEW_APP_SUBROUTES.length)
  })

  it('geeft elke app een eigen sublabel, niet de generieke fallback', () => {
    const fallback = 'Verdiepende app op een bezit of schuld'
    for (const item of appItems()) {
      expect(
        item.sublabel,
        `"${item.label}" valt terug op het generieke sublabel — voeg een APP_META-regel toe`,
      ).not.toBe(fallback)
      expect(item.sublabel).toBeTruthy()
    }
  })

  it('houdt "app" als één zoekterm die de hele lijst opent', () => {
    // De ranker matcht op label; het voorvoegsel op positie 0 zorgt dat "app"
    // alle app-tegels bovenaan zet in plaats van toevallige treffers als
    // "Rapportages".
    for (const item of appItems()) {
      expect(item.label.toLowerCase().startsWith('app')).toBe(true)
    }
  })

  it('levert geen dubbele hrefs op (de id-sleutel van het palet)', () => {
    const hrefs = getAllPageItems().map((item) => item.href)
    const doublures = hrefs.filter((href, i) => hrefs.indexOf(href) !== i)
    expect(doublures, `dubbele hrefs in het palet: ${doublures.join(', ')}`).toEqual([])
  })
})

describe('command-palette — naamgeving volgt de canonieke nav-config (M14)', () => {
  it('noemt /nieuws zoals globalNav dat doet', () => {
    const canoniek = globalNav.find((item) => item.href === '/nieuws')
    expect(canoniek).toBeDefined()

    const paletItem = getAllPageItems().find((item) => item.href === '/nieuws')
    expect(paletItem).toBeDefined()
    expect(paletItem!.label).toBe(canoniek!.label)
  })
})
