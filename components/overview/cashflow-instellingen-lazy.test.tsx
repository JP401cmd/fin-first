import { StrictMode } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import { DisplayModeProvider, type DisplayMode } from '@/lib/hooks/use-display-mode'
import { CashflowInstellingenBlokLazy } from './cashflow-instellingen-lazy'

/**
 * `CashflowInstellingenBlokLazy` — in-view-gedrag (perf Task 2.2, stap 5).
 *
 * De hele winst van die stap zit in ÉÉN eigenschap: er gaat niets over de lijn
 * zolang het blok niet in beeld komt. Dat is precies wat je bij een refactor
 * gratis verliest — de skeleton ziet er identiek uit, de data verschijnt
 * uiteindelijk ook, en alleen de netwerktab verraadt dat de ~25
 * `loadCoreData`-queries er tóch bij elk hub-bezoek doorheen gaan. Vandaar een
 * expliciete assertie op "nog niet gefetcht" vóór de observer vuurt.
 *
 * De globale IntersectionObserver-mock uit test/setup.ts vuurt meteen bij
 * `observe()` — bruikbaar voor animaties, onbruikbaar hier. Deze suite zet er
 * daarom een bestuurbare variant overheen die pas vuurt als de test dat zegt.
 */

vi.mock('@/components/overview/cashflow-instellingen-blok', () => ({
  CashflowInstellingenBlok: ({
    data,
    hideHeading,
  }: {
    data: { netMonthlyIncome: number }
    hideHeading?: boolean
  }) => (
    <div data-testid="instellingen-blok" data-hide-heading={hideHeading ? 'true' : 'false'}>
      {data.netMonthlyIncome}
    </div>
  ),
}))

/** Elke `observe()` legt hier een "scroll 'm in beeld"-knop neer. */
let enterViewport: Array<() => void> = []

class ControlledIntersectionObserver {
  private callback: IntersectionObserverCallback
  private disconnected = false
  root: Element | Document | null = null
  rootMargin = ''
  thresholds: readonly number[] = []

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback
  }
  observe(target: Element) {
    enterViewport.push(() => {
      if (this.disconnected) return
      this.callback(
        [{ isIntersecting: true, target } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver,
      )
    })
  }
  unobserve() {}
  disconnect() {
    this.disconnected = true
  }
  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
}

/**
 * Variant die meteen bij `observe()` vuurt — het geval "blok staat al in beeld
 * bij mount". Nodig om de StrictMode-dubbelmount écht te raken: de fetch start
 * dan tíjdens de eerste effect-run, en de opruiming daarvan komt vóór het
 * antwoord.
 */
class EagerIntersectionObserver {
  private callback: IntersectionObserverCallback
  root: Element | Document | null = null
  rootMargin = ''
  thresholds: readonly number[] = []

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback
  }
  observe(target: Element) {
    this.callback(
      [{ isIntersecting: true, target } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    )
  }
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
}

const fetchMock = vi.fn()

beforeEach(() => {
  enterViewport = []
  fetchMock.mockReset()
  vi.stubGlobal('IntersectionObserver', ControlledIntersectionObserver)
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function jsonOk(body: unknown) {
  return { ok: true, json: async () => body }
}

/** Zet het blok "in beeld" — één klik op elke geregistreerde observer. */
async function scrollIntoView() {
  await act(async () => {
    for (const trigger of enterViewport) trigger()
  })
}

describe('CashflowInstellingenBlokLazy — laadt pas bij in-view', () => {
  it('fetcht niets zolang het blok buiten beeld staat', () => {
    const { container } = render(<CashflowInstellingenBlokLazy />)

    expect(fetchMock).not.toHaveBeenCalled()
    // Wel meteen een skeleton, zodat de hoogte gereserveerd is.
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull()
    expect(screen.queryByTestId('instellingen-blok')).toBeNull()
  })

  it('haalt de bundel op zodra het blok in beeld komt en rendert die', async () => {
    fetchMock.mockResolvedValue(jsonOk({ netMonthlyIncome: 4200 }))
    render(<CashflowInstellingenBlokLazy />)

    await scrollIntoView()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/overzicht/cashflow-settings')
    expect(await screen.findByTestId('instellingen-blok')).toHaveTextContent('4200')
  })

  it('fetcht één keer, ook als de observer meermaals vuurt', async () => {
    fetchMock.mockResolvedValue(jsonOk({ netMonthlyIncome: 4200 }))
    render(<CashflowInstellingenBlokLazy />)

    await scrollIntoView()
    await scrollIntoView()

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('CashflowInstellingenBlokLazy — StrictMode (dubbele mount in dev)', () => {
  it('rendert het blok ook als de observer al tijdens de eerste effect-run vuurt', async () => {
    // React draait effecten in StrictMode twee keer (mount → cleanup → mount).
    // Met een per-run `cancelled`-vlag gooit de opruiming van run 1 het antwoord
    // van zijn eigen fetch weg en blijft de skeleton staan — zichtbaar in dev,
    // onzichtbaar in productie, dus precies het soort regressie dat blijft zitten.
    vi.stubGlobal('IntersectionObserver', EagerIntersectionObserver)
    fetchMock.mockResolvedValue(jsonOk({ netMonthlyIncome: 4200 }))

    render(
      <StrictMode>
        <CashflowInstellingenBlokLazy />
      </StrictMode>,
    )

    expect(await screen.findByTestId('instellingen-blok')).toHaveTextContent('4200')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

// ── W-002 — GEEN disclosure meer: dit blok woont op het instellingenscherm ──
//
// HERZIEN 7 sep 2026. Hier stond CF-4: in Eenvoudig hing het blok in een
// `DepthSection` met de titel "Instellingen & toekomst", zodat de
// TRANSACTIEPAGINA rust hield zonder de instellingen weg te nemen. Met de
// verhuizing naar /overzicht/budget/instellingen vervalt die reden — op een
// pagina die zélf "Instellingen" heet is de disclosure een tweede kop om
// hetzelfde blok. De oude assertie pinde bovendien de titelstring letterlijk
// vast, en die klopte al niet meer ("& toekomst" verhuisde met de FIRE-doorkijk
// naar /toekomst).
//
// Wat de suite nu bewaakt is de andere kant van dezelfde eis: het blok is er in
// BÉIDE weergaven, ongewijzigd, mét zijn eigen kop — en er komt geen
// verpakking omheen terug.

describe('CashflowInstellingenBlokLazy — W-002: onverpakt in beide weergaven', () => {
  async function renderReady(mode: DisplayMode) {
    fetchMock.mockResolvedValue(jsonOk({ netMonthlyIncome: 4200 }))
    const result = render(
      <DisplayModeProvider initialMode={mode}>
        <CashflowInstellingenBlokLazy />
      </DisplayModeProvider>,
    )
    await scrollIntoView()
    await screen.findByTestId('instellingen-blok')
    return result
  }

  for (const mode of ['simple', 'full'] as const) {
    it(`${mode}: geen disclosure eromheen — het blok draagt zijn eigen kop`, async () => {
      const { container } = await renderReady(mode)

      expect(container.querySelector('[data-testid="depth-section"]')).toBeNull()
      expect(screen.getByTestId('instellingen-blok')).toHaveTextContent('4200')
      // `hideHeading` ongezet = het blok toont zijn eigen kicker + h2.
      expect(screen.getByTestId('instellingen-blok').getAttribute('data-hide-heading')).toBe(
        'false',
      )
    })
  }

  it('de instellingen zijn in Eenvoudig niet hard verborgen', async () => {
    // Instellingen mag je nooit wegnemen (de oorspronkelijke CF-4-eis, en die
    // blijft staan): geen HideInSimple, geen weggegooide inhoud.
    await renderReady('simple')
    expect(screen.getByTestId('instellingen-blok')).toHaveTextContent('4200')
  })
})

describe('CashflowInstellingenBlokLazy — mislukte fetch', () => {
  it('rendert niets bij een niet-ok antwoord — geen eeuwige skeleton', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: 'Niet ingelogd' }) })
    const { container } = render(<CashflowInstellingenBlokLazy />)

    await scrollIntoView()

    // Leeg, niet "leeg-met-padding": het component draagt zijn eigen
    // <section>-wrapper, dus bij een fout blijft er geen dode ruimte staan.
    await waitFor(() => {
      expect(container).toBeEmptyDOMElement()
    })
    expect(screen.queryByTestId('instellingen-blok')).toBeNull()
  })

  it('rendert niets wanneer de fetch gooit', async () => {
    fetchMock.mockRejectedValue(new Error('offline'))
    const { container } = render(<CashflowInstellingenBlokLazy />)

    await scrollIntoView()

    // Leeg, niet "leeg-met-padding": het component draagt zijn eigen
    // <section>-wrapper, dus bij een fout blijft er geen dode ruimte staan.
    await waitFor(() => {
      expect(container).toBeEmptyDOMElement()
    })
  })
})
