import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react'
import { DisplayModeProvider, type DisplayMode } from '@/lib/hooks/use-display-mode'
import { MijnOverview } from './mijn-overview'

/**
 * De modus staat hier EXPLICIET in de boom, in élke test.
 *
 * Zonder provider valt `useDisplayMode()` terug op 'simple' (zie
 * use-display-mode.tsx) — precies de modus die de curatie aanzet. De oude
 * tests draaiden zonder provider en zouden dus stilzwijgend de Eenvoudig-boom
 * meten terwijl ze "de 7 kaarten" heten te bewaken. Erger nog: `DepthSection`
 * houdt zijn kinderen gemount (`max-h-0` + `inert`), dus `getByText(...)` en de
 * href-lijst blijven groen ook als de reductie werkt. Groene tests bewijzen
 * daar niets. Vandaar: de inhoudscontroles hangen aan een `full`-provider, en
 * de curatie wordt gemeten aan `data-collapsed` en aan de plaats in de boom.
 */
function renderIn(mode: DisplayMode) {
  return render(
    <DisplayModeProvider initialMode={mode}>
      <MijnOverview />
    </DisplayModeProvider>,
  )
}

const PRIMAIR = ['Profiel', 'Privacy', 'Koppelingen', 'Uiterlijk']
const SECUNDAIR = ['Notificaties', 'Check-ins', 'Geavanceerd']

beforeEach(() => {
  // Een modus-wissel doet een optimistische PUT; die mag geen netwerk raken.
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('MijnOverview — render', () => {
  it('rendert narratieve masthead-kop', () => {
    renderIn('full')
    // PageOpening splitst de kop over tekst + italic-em ("naar jouw hand") —
    // match daarom op de samengestelde heading-tekst.
    // Niveau 2, niet 1: de enige <h1> van een route is de sr-only paginanaam in
    // de shell (ADR 0110); de pagina-aanhef zelf is een <h2>.
    const heading = screen.getByRole('heading', { level: 2 })
    expect(heading.textContent).toBe('Alles naar jouw hand gezet')
  })

  it('rendert de 7 sub-route cards', () => {
    renderIn('full')
    for (const label of [...PRIMAIR, ...SECUNDAIR]) {
      expect(screen.getByText(label)).toBeTruthy()
    }
  })

  it('elke card linkt naar juiste sub-route', () => {
    const { container } = renderIn('full')
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) =>
      a.getAttribute('href'),
    )
    expect(hrefs).toContain('/mijn/profiel')
    expect(hrefs).toContain('/mijn/privacy')
    expect(hrefs).toContain('/mijn/koppelingen')
    expect(hrefs).toContain('/mijn/uiterlijk')
    expect(hrefs).toContain('/mijn/notificaties')
    expect(hrefs).toContain('/mijn/checkins')
    expect(hrefs).toContain('/mijn/geavanceerd')
  })

  // Bevinding M14 (optie b2): Rapportages en Account hebben elk al een vaste
  // ingang buiten dit grid — Rapportages permanent in de desktop-zijbalk,
  // Account in de mobiele nav-pill én (sinds dezelfde wijziging) de
  // zijbalk-footer. Ze horen hier niet nóg een keer te staan.
  it('toont geen tweede ingang voor Rapportages of Account', () => {
    const { container } = renderIn('full')
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) =>
      a.getAttribute('href'),
    )
    expect(hrefs).not.toContain('/rapportages')
    expect(hrefs).not.toContain('/mijn/account')
    expect(screen.queryByText('Rapportages')).toBeNull()
    expect(screen.queryByText('Account')).toBeNull()
  })

  it('toont beschrijving per card', () => {
    renderIn('full')
    expect(screen.getByText(/Naam, geboortejaar/i)).toBeTruthy()
    // H19 — NL-eerst zonder afkortingen (was: "PSD2-banken, UPO, brokerage-sync.")
    expect(screen.getByText(/Bank koppelen, pensioenoverzicht/i)).toBeTruthy()
    expect(screen.queryByText(/PSD2|UPO|brokerage/i)).toBeNull()
    expect(screen.getByText(/Kleurpalet, typografie/i)).toBeTruthy()
    expect(screen.getByText(/Tijdlijn van al je maandelijkse/i)).toBeTruthy()
  })

  it('bevat geen legacy /identity/instellingen-link meer in de footer', () => {
    const { container } = renderIn('full')
    const legacyLink = container.querySelector('a[href="/identity/instellingen"]')
    expect(legacyLink).toBeNull()
  })

  it('toont uitleg-deck onder de kop (telwoord-vrij)', () => {
    renderIn('full')
    expect(screen.getByText(/eigen rustige pagina/i)).toBeTruthy()
  })
})

/**
 * S8 — de curatie zelf.
 *
 * Bijt-proef gedraaid (en teruggedraaid): `simple` hardgecodeerd op `false`,
 * zodat beide modi de volledige boom renderen → vier van de zes tests hieronder
 * lopen rood op de ontbrekende `depth-section`. De twee die groen bleven zijn
 * dat terecht: "alle zeven in Volledig" meet het onveranderde pad, en
 * "bereikbaar in Eenvoudig" is bewust modus-agnostisch — bereikbaarheid moet
 * gelden of de kaarten nu gevouwen zijn of niet.
 */
describe('MijnOverview — curatie per weergavemodus (S8, optie B)', () => {
  it('toont in Volledig alle zeven kaarten in één grid, zonder disclosure', () => {
    renderIn('full')
    expect(screen.queryByTestId('depth-section')).toBeNull()
    for (const label of [...PRIMAIR, ...SECUNDAIR]) {
      expect(screen.getByText(label)).toBeTruthy()
    }
  })

  it('vouwt in Eenvoudig de secundaire kaarten weg achter "Alle instellingen"', () => {
    renderIn('simple')

    const depth = screen.getByTestId('depth-section')
    expect(depth).toHaveAttribute('data-collapsed', 'true')
    expect(screen.getByTestId('depth-section-title').textContent).toBe('Alle instellingen')

    // De vier primaire kaarten staan BUITEN de dichte sectie...
    for (const label of PRIMAIR) {
      expect(depth.contains(screen.getByText(label))).toBe(false)
    }
    // ...en de drie secundaire zitten er allemaal ín.
    for (const label of SECUNDAIR) {
      expect(within(depth).getByText(label)).toBeTruthy()
    }
  })

  it('houdt in Eenvoudig elke instelling bereikbaar — weggevouwen, niet weg', () => {
    const { container } = renderIn('simple')
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) =>
      a.getAttribute('href'),
    )
    expect(hrefs).toContain('/mijn/notificaties')
    expect(hrefs).toContain('/mijn/checkins')
    expect(hrefs).toContain('/mijn/geavanceerd')
  })

  it('zegt bij een dichte sectie wát erin zit (duiding boven reductie)', () => {
    renderIn('simple')
    expect(screen.getByTestId('depth-section-summary').textContent).toContain('Notificaties')
  })

  it('opent de sectie op één klik', () => {
    renderIn('simple')
    fireEvent.click(screen.getByTestId('depth-section-toggle'))
    expect(screen.getByTestId('depth-section')).toHaveAttribute('data-collapsed', 'false')
  })

  it('houdt Uiterlijk vooraan — dat is de vluchtroute terug naar Volledig', () => {
    renderIn('simple')
    const depth = screen.getByTestId('depth-section')
    expect(depth.contains(screen.getByText('Uiterlijk'))).toBe(false)
  })
})
