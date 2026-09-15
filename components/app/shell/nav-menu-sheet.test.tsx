import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, within, fireEvent } from '@testing-library/react'
import { NavMenuSheet } from './nav-menu-sheet'
import { ActiveAppKeysContext } from './shell-contexts'
import { DisplayModeProvider, type DisplayMode } from '@/lib/hooks/use-display-mode'

// NavMenuSheet leunt op next/navigation (usePathname) en de responsive-shell
// context-hooks (useLeverScores/useActiveAppKeys). Beide context-hooks hebben
// veilige defaults buiten een provider, dus we hoeven alleen next/navigation te
// mocken. Geen echte router nodig.
vi.mock('next/navigation', () => ({
  usePathname: () => '/toekomst',
  // De sheet draagt de toetsenbord-tegenhanger van pull-to-refresh
  // ("Ververs pagina") en leest daarvoor de router.
  useRouter: () => ({ refresh: vi.fn() }),
}))

function renderSheet(mode: DisplayMode, activeAppKeys: string[] = []) {
  return render(
    <ActiveAppKeysContext.Provider value={activeAppKeys}>
      <DisplayModeProvider initialMode={mode}>
        <NavMenuSheet open onClose={() => {}} />
      </DisplayModeProvider>
    </ActiveAppKeysContext.Provider>,
  )
}

describe('NavMenuSheet — Eenvoudig-weergave verbergt Rekenhulp', () => {
  afterEach(cleanup)

  it("toont in 'full' wél Rekenhulp", () => {
    renderSheet('full')
    expect(screen.getByText('Rekenhulp')).toBeInTheDocument()
  })

  it("verbergt in 'simple' Rekenhulp (overige toekomst-ingangen blijven)", () => {
    renderSheet('simple')
    expect(screen.queryByText('Rekenhulp')).not.toBeInTheDocument()
    // Overige Toekomst-subroutes blijven zichtbaar — alleen de aangewezen
    // ingang wordt verborgen.
    expect(screen.getByText('Doelen')).toBeInTheDocument()
    expect(screen.getByText('Gebeurtenissen')).toBeInTheDocument()
  })
})

/**
 * NAV-2 — in Eenvoudig klapt alleen de ACTIEVE hoofdpagina zijn sub-items uit;
 * de andere hoofdpagina's blijven één regel. In Volledig blijft de hele boom in
 * beeld. Actieve route in deze suite: /toekomst.
 */
describe('NavMenuSheet — NAV-2: alleen de actieve tak klapt uit', () => {
  afterEach(cleanup)

  it("toont in 'full' óók de sub-items van niet-actieve hoofdpagina's", () => {
    renderSheet('full')
    expect(screen.getByText('Transacties')).toBeInTheDocument()
    expect(screen.getByText('Box 1 · Werk + woning')).toBeInTheDocument()
  })

  it("verbergt in 'simple' de sub-items van niet-actieve hoofdpagina's", () => {
    renderSheet('simple')
    expect(screen.queryByText('Transacties')).not.toBeInTheDocument()
    expect(screen.queryByText('Box 1 · Werk + woning')).not.toBeInTheDocument()
    // De hoofdpagina's zelf blijven één regel — bereikbaar, niet uitgeklapt.
    expect(screen.getByText('Budget')).toBeInTheDocument()
    expect(screen.getByText('Belasting')).toBeInTheDocument()
    // De actieve tak (/toekomst) houdt zijn sub-items.
    expect(screen.getByText('Doelen')).toBeInTheDocument()
  })
})

/**
 * Plat menu (15 sep 2026) — Home, de vier hefbomen en De toekomst op één
 * niveau; hun onderdelen zijn gewone subpagina's, geen derde niveau meer.
 * "Tijdas" is weg: die wees naar /toekomst, dezelfde plek als de hoofdpagina.
 */
describe('NavMenuSheet — plat menu', () => {
  afterEach(cleanup)

  it('toont de hoofdpagina’s als eigen takken, met Mijn eronder', () => {
    renderSheet('simple')
    for (const label of ['Home', 'Bezittingen', 'Schulden', 'Budget', 'Belasting', 'De toekomst', 'Mijn']) {
      expect(screen.getByRole('link', { name: new RegExp('^' + label) })).toBeInTheDocument()
    }
    expect(screen.queryByText('Overzicht')).not.toBeInTheDocument()
  })

  it('heeft geen Tijdas-ingang meer', () => {
    renderSheet('full')
    expect(screen.queryByText('Tijdas')).not.toBeInTheDocument()
  })
})

/**
 * B-048 (testgebruiker, 12-09-2026) — NAV-2 maakte van een niet-actieve tak een
 * doodlopend eind: je zag niet wat eronder hing en kon er niet heen zonder eerst
 * de hoofdpagina te openen. Elke tak heeft nu een chevron die hem openklapt
 * ZONDER te navigeren. De begintoestand blijft die van NAV-2 (hierboven
 * getoetst); deze suite bewaakt de uitgang die erbij kwam.
 */
describe('NavMenuSheet — B-048: elke tak is zelf uitklapbaar', () => {
  afterEach(cleanup)

  it("klapt in 'simple' een niet-actieve tak open zonder te navigeren", () => {
    renderSheet('simple')
    // Uitgangspunt = NAV-2: de niet-actieve tak is dicht.
    expect(screen.queryByText('Transacties')).not.toBeInTheDocument()

    const toggle = screen.getByRole('button', { name: /Toon de onderdelen van Budget/i })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)

    // De sub-items staan er nu — en de sheet is niet gesloten/genavigeerd:
    // de chevron is een knop, geen link.
    expect(screen.getByText('Transacties')).toBeInTheDocument()
    expect(screen.getByText('Vaste lasten')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Verberg de onderdelen van Budget/i }),
    ).toHaveAttribute('aria-expanded', 'true')
  })

  it("klapt in 'full' een tak juist dicht — de chevron werkt beide kanten op", () => {
    renderSheet('full')
    expect(screen.getByText('Transacties')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Verberg de onderdelen van Budget/i }))

    expect(screen.queryByText('Transacties')).not.toBeInTheDocument()
    // De actieve tak blijft ongemoeid: dichtklappen is per tak, niet globaal.
    expect(screen.getByText('Doelen')).toBeInTheDocument()
  })

  it('laat de hoofdpagina zelf een link blijven — de chevron kaapt de rij niet', () => {
    renderSheet('simple')
    const budget = screen.getByRole('link', { name: /^Budget/ })
    expect(budget).toHaveAttribute('href', '/overzicht/budget')
  })
})

/**
 * Testgebruiker-melding 1bb8a1 — op mobiel stonden de hoofdonderdelen van
 * Overzicht (Bezittingen/Schulden/Budget/Belasting) en de actieve apps
 * (Crypto holdings e.d.) als één ongemarkeerde lijst onder elkaar. De sheet
 * moet dezelfde scheiding tonen als de desktop-sidebar: een aparte
 * apps-groep met eigen kop, en die kop ALLEEN bij >=1 actieve app.
 */
describe('NavMenuSheet — apps gescheiden van de onderdelen, onder hun eigen hefboom', () => {
  afterEach(cleanup)

  it('toont geen apps-kop wanneer er geen app actief is', () => {
    renderSheet('full', [])
    expect(screen.queryByRole('group', { name: /apps/i })).not.toBeInTheDocument()
    expect(screen.queryByText('Crypto holdings')).not.toBeInTheDocument()
    // Hoofdonderdelen blijven ongewijzigd zichtbaar.
    expect(screen.getByText('Bezittingen')).toBeInTheDocument()
    expect(screen.getByText('Budget')).toBeInTheDocument()
  })

  it('groepeert actieve apps onder een eigen kop, los van de hoofdonderdelen', () => {
    renderSheet('full', ['crypto-holdings'])

    const appsGroup = screen.getByRole('group', { name: /apps/i })
    // De app zit ín de apps-groep...
    expect(within(appsGroup).getByText('Crypto holdings')).toBeInTheDocument()
    // ...en de hoofdonderdelen staan er nadrukkelijk BUITEN.
    expect(within(appsGroup).queryByText('Bezittingen')).not.toBeInTheDocument()
    expect(within(appsGroup).queryByText('Schulden')).not.toBeInTheDocument()
    expect(within(appsGroup).queryByText('Budget')).not.toBeInTheDocument()
    expect(within(appsGroup).queryByText('Belasting')).not.toBeInTheDocument()
    // Niet-geactiveerde apps blijven weg.
    expect(within(appsGroup).queryByText('Aandelen holdings')).not.toBeInTheDocument()
    // Hoofdonderdelen zelf blijven gewoon in het menu staan.
    expect(screen.getByText('Bezittingen')).toBeInTheDocument()
  })

  it('toont meerdere actieve apps samen in dezelfde groep', () => {
    renderSheet('full', ['crypto-holdings', 'aandelen-holdings'])
    const appsGroup = screen.getByRole('group', { name: /apps/i })
    expect(within(appsGroup).getByText('Crypto holdings')).toBeInTheDocument()
    expect(within(appsGroup).getByText('Aandelen holdings')).toBeInTheDocument()
  })

  // Budgetteren stond hier als app tot UR3-28. Het is nu basisfunctionaliteit en
  // een vast hoofdonderdeel ("Budget", de derde hefboom) — dus nadrukkelijk NIET
  // in de apps-groep, ook niet wanneer de oude app-sleutel nog actief zou zijn.
  it('rekent Budget tot de hoofdonderdelen, niet tot de apps', () => {
    renderSheet('full', ['budgetteren'])
    expect(screen.queryByRole('group', { name: /apps/i })).not.toBeInTheDocument()
    expect(screen.getByText('Budget')).toBeInTheDocument()
  })

  it("verbergt in 'simple' de apps-groep van de niet-actieve Bezittingen-tak", () => {
    // Actieve route in deze suite is /toekomst, dus Bezittingen klapt in
    // Eenvoudig niet uit — apps horen dan ook niet te verschijnen.
    renderSheet('simple', ['crypto-holdings'])
    expect(screen.queryByRole('group', { name: /apps/i })).not.toBeInTheDocument()
    expect(screen.queryByText('Crypto holdings')).not.toBeInTheDocument()
  })
})
