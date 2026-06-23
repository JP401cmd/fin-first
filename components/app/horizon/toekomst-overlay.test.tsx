import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ToekomstOverlay, type OverlayBalloonDef, type ToekomstOverlayGeometry } from './toekomst-overlay'
import { TOEKOMST_OVERLAY_BALLOONS } from './toekomst-overlay-balloons'

// `canHover` (hover-apparaat ja/nee) en `inline` (ruim scherm ja/nee)
// deterministisch sturen — anders hangt het gedrag af van de jsdom-matchMedia-
// stub. Default = false (touch + smal), per test te overschrijven.
// `useIsLgUp` delegeert naar de gemockte `useMediaQuery` met de lg-query, zodat
// één mock beide stuurt (lg-up via een `mockImplementation` op de query).
vi.mock('@/lib/hooks/use-media-query', () => {
  const useMediaQuery = vi.fn((_query: string) => false)
  return {
    useMediaQuery,
    useIsLgUp: () => useMediaQuery('(min-width: 1024px)'),
  }
})
import { useMediaQuery } from '@/lib/hooks/use-media-query'

beforeEach(() => {
  vi.mocked(useMediaQuery).mockReset()
  vi.mocked(useMediaQuery).mockReturnValue(false)
})

afterEach(() => {
  // Sommige tests gebruiken fake timers (hover-emphasis-debounce); altijd terug
  // naar echte timers zodat een leak nooit een volgende test beïnvloedt.
  vi.useRealTimers()
})

/**
 * Bewaakt dat de tips-overlay daadwerkelijk sluit: zowel het ✕ (via portal naar
 * document.body) als de blurred achtergrond roepen `onClose` aan.
 */
describe('ToekomstOverlay — sluiten', () => {
  const balloons: OverlayBalloonDef[] = [
    {
      id: 'inkomen',
      icon: null,
      kicker: 'Je inkomen',
      body: 'x',
      cta: 'y',
      row: 'top',
      slot: 'bottom-left',
      emphasis: 'accumulation',
      onActivate: () => {},
    },
  ]

  it('roept onClose aan bij klik op het ✕ (portal) én op de achtergrond', () => {
    const onClose = vi.fn()
    render(
      <ToekomstOverlay
        visible
        balloons={balloons}
        onEmphasisChange={() => {}}
        onClose={onClose}
      >
        <div data-testid="chart">chart</div>
      </ToekomstOverlay>,
    )

    const closers = screen.getAllByLabelText('Tips sluiten')
    expect(closers.length).toBeGreaterThanOrEqual(2) // achtergrond + ✕
    closers.forEach((el) => fireEvent.click(el))
    expect(onClose).toHaveBeenCalled()
  })

  it('blur-scrim dekt de volle inhoud (top-0 + expliciete hoogte), niet één viewport (geen inset-0/fixed)', () => {
    // Regressie voor "blur zit te hoog / maar de helft geblurrd" op desktop:
    // de scrim is een child van de gescrolde scroll-container. `inset-0`/`fixed`
    // hangt 'm aan de inhoud-oorsprong en is maar één viewport hoog, dus bij
    // scrollTop > 0 blijft de onderkant scherp. De fix dekt de VOLLE scrollHeight.
    render(
      <ToekomstOverlay
        visible
        balloons={balloons}
        onEmphasisChange={() => {}}
        onClose={() => {}}
      >
        <div data-testid="chart">chart</div>
      </ToekomstOverlay>,
    )
    const scrim = screen
      .getAllByLabelText('Tips sluiten')
      .find((el) => el.className.includes('backdrop-blur-md'))
    expect(scrim).toBeTruthy()
    expect(scrim!.className).not.toMatch(/inset-0/)
    expect(scrim!.className).not.toMatch(/\bfixed\b/)
    expect(scrim!.className).toMatch(/\btop-0\b/)
    // Hoogte komt uit een inline style (volle inhoudshoogte), niet uit een
    // viewport-gebonden klasse.
    expect(scrim!.getAttribute('style') ?? '').toMatch(/height/)
  })

  it('rendert de samenvattingsregel (netto vermogen + vrijheidsleeftijd) als summary gegeven is', () => {
    render(
      <ToekomstOverlay
        visible
        balloons={balloons}
        summary={{ netWorth: 1_860_000, freedomAge: 65, masked: false }}
        onEmphasisChange={() => {}}
        onClose={() => {}}
      >
        <div data-testid="chart">chart</div>
      </ToekomstOverlay>,
    )
    expect(screen.getByText('netto vermogen')).toBeTruthy()
    // Leeftijd wordt afgerond getoond ("rond je 65e").
    expect(screen.getByText('65e')).toBeTruthy()
  })

  it('toont een nette fallback als de vrijheidsleeftijd null is', () => {
    render(
      <ToekomstOverlay
        visible
        balloons={balloons}
        summary={{ netWorth: 0, freedomAge: null, masked: false }}
        onEmphasisChange={() => {}}
        onClose={() => {}}
      >
        <div data-testid="chart">chart</div>
      </ToekomstOverlay>,
    )
    expect(screen.getByText('vrijheid nog niet in zicht')).toBeTruthy()
  })

  it('lockt de pagina-scroll alleen als de overlay NIET overflowt (anders blijft scrollen mogelijk)', () => {
    // De lock-conditie vergelijkt de inhoudshoogte van de wrapper (`scrollHeight`)
    // met de beschikbare hoogte (`innerHeight − HEADER_OFFSET`, 64px). In jsdom is
    // `scrollHeight` 0, dus we stuben hem expliciet per scenario.
    const innerHeight = window.innerHeight // jsdom default 768

    const renderAt = (contentHeight: number) => {
      // Forceer de inhoudshoogte die de overlay meet op de wrapper-div.
      const spy = vi
        .spyOn(HTMLElement.prototype, 'scrollHeight', 'get')
        .mockReturnValue(contentHeight)
      const utils = render(
        <ToekomstOverlay
          visible
          balloons={balloons}
          onEmphasisChange={() => {}}
          onClose={() => {}}
        >
          <div data-testid="chart">chart</div>
        </ToekomstOverlay>,
      )
      return { ...utils, spy }
    }

    // PAST (inhoud kleiner dan beschikbare hoogte) → lock: body overflow = hidden.
    const fits = renderAt(innerHeight - 200)
    expect(document.body.style.overflow).toBe('hidden')
    fits.unmount()
    fits.spy.mockRestore()
    // Cleanup herstelt de overflow.
    expect(document.body.style.overflow).not.toBe('hidden')

    // OVERFLOW (inhoud groter dan beschikbare hoogte) → GEEN lock: body scrollt.
    const overflowed = renderAt(innerHeight + 400)
    expect(document.body.style.overflow).not.toBe('hidden')
    overflowed.unmount()
    overflowed.spy.mockRestore()
  })

  it('rendert geen sluit-knoppen als de overlay onzichtbaar is', () => {
    render(
      <ToekomstOverlay
        visible={false}
        balloons={balloons}
        onEmphasisChange={() => {}}
        onClose={() => {}}
      >
        <div data-testid="chart">chart</div>
      </ToekomstOverlay>,
    )
    expect(screen.queryByLabelText('Tips sluiten')).toBeNull()
  })

  // ── Bug 2: ✕ + scrim mogen de pointerdown niet naar boven laten bubbelen ──
  // De ✕/scrim zijn via een portal weliswaar DOM-kinderen van body/scroll-
  // container, maar in de REACT-tree nog steeds afstammelingen van de
  // ZoomableChartContainer (de parent hier). Die doet `setPointerCapture` op
  // élke pointerdown; zonder stopPropagation kaapt dat de pointer en belandt de
  // `click` op de grafiek-div i.p.v. de sluit-knop → de overlay sluit niet.
  it('Bug 2 — ✕ én scrim stoppen pointerdown-propagatie maar sluiten nog steeds bij klik', () => {
    const onParentPointerDown = vi.fn()
    const onClose = vi.fn()
    render(
      <div onPointerDown={onParentPointerDown}>
        <ToekomstOverlay
          visible
          balloons={balloons}
          onEmphasisChange={() => {}}
          onClose={onClose}
        >
          <div data-testid="chart">chart</div>
        </ToekomstOverlay>
      </div>,
    )
    const closers = screen.getAllByLabelText('Tips sluiten')
    expect(closers.length).toBeGreaterThanOrEqual(2) // scrim + ✕
    // pointerdown mag de grafiek-container (parent) NIET bereiken (anders kaapt
    // `setPointerCapture` de klik) ...
    closers.forEach((el) => fireEvent.pointerDown(el))
    expect(onParentPointerDown).not.toHaveBeenCalled()
    // ... maar de klik moet alsnog sluiten (stopPropagation mag de close niet breken).
    closers.forEach((el) => fireEvent.click(el))
    expect(onClose).toHaveBeenCalled()
  })

  // ── Bug 1: op touch (geen hover) mag focus de popover NIET openen ──
  // De pointerdown van een tik focust de marker al vóór de click. Opende
  // `onFocus` dan de popover, dan sloot de daaropvolgende click-toggle 'm meteen
  // weer ("eerste tik doet niets, tweede tik opent"). Op touch togglet alléén de
  // klik.
  it('Bug 1 — op touch opent één klik de popover; focus alléén opent NIET', () => {
    vi.mocked(useMediaQuery).mockReturnValue(false) // canHover = false (touch)
    render(
      <ToekomstOverlay
        visible
        balloons={balloons}
        onEmphasisChange={() => {}}
        onClose={() => {}}
      >
        <div data-testid="chart">chart</div>
      </ToekomstOverlay>,
    )
    const marker = screen.getByLabelText('Tip: Je inkomen')
    // Focus (zoals een tik die doet) mag NIET openen.
    fireEvent.focus(marker)
    expect(marker.getAttribute('aria-expanded')).toBe('false')
    // Eén klik opent in één keer.
    fireEvent.click(marker)
    expect(marker.getAttribute('aria-expanded')).toBe('true')
  })

  // Op hover-apparaten blijft toetsenbord-focus de popover openen (geen regressie).
  it('op hover-apparaten opent focus (toetsenbord) de popover wél', () => {
    // canHover = true (hover-apparaat), maar lg-up = false zodat we in
    // popover-modus blijven (op ruim scherm zou de body inline staan en zou er
    // geen marker-knop zijn om te focussen).
    vi.mocked(useMediaQuery).mockImplementation((q: string) => !q.includes('min-width: 1024px'))
    render(
      <ToekomstOverlay
        visible
        balloons={balloons}
        onEmphasisChange={() => {}}
        onClose={() => {}}
      >
        <div data-testid="chart">chart</div>
      </ToekomstOverlay>,
    )
    const marker = screen.getByLabelText('Tip: Je inkomen')
    fireEvent.focus(marker)
    expect(marker.getAttribute('aria-expanded')).toBe('true')
  })

  // ── Standaard tip-ballonnen tonen GEEN actie-knop (puur informatief) ──
  // De tips leggen de grafiek uit en navigeren niet meer. Zonder cta/onActivate
  // mag er geen knop in de popover staan; alleen de uitleg-body.
  it('toont geen actie-knop in de popover als de ballon puur informatief is (geen cta)', () => {
    vi.mocked(useMediaQuery).mockReturnValue(false) // touch: één klik opent de popover
    render(
      <ToekomstOverlay
        visible
        balloons={[{ id: 'inkomen', icon: null, kicker: 'Je inkomen', body: 'Uitleg.', row: 'top', slot: 'bottom-left', emphasis: 'accumulation' }]}
        onEmphasisChange={() => {}}
        onClose={() => {}}
      >
        <div data-testid="chart">chart</div>
      </ToekomstOverlay>,
    )
    fireEvent.click(screen.getByLabelText('Tip: Je inkomen')) // open popover
    expect(screen.getByText('Uitleg.')).toBeTruthy()
    // Geen knoppen behalve het ✕ "Tip sluiten"-knopje op touch.
    expect(screen.queryByRole('button', { name: /aanpassen|instellen|kiezen|toevoegen|bijwerken/i })).toBeNull()
  })

  // ── Optionele CTA blijft werken waar 'ie expliciet wordt meegegeven ──
  // De component ondersteunt nog een actie-knop; die wordt alleen gerenderd als
  // zowel cta als onActivate aanwezig zijn, en een klik vuurt onActivate af.
  it('rendert de optionele CTA wél en roept onActivate aan als cta+onActivate gegeven zijn', () => {
    vi.mocked(useMediaQuery).mockReturnValue(false) // touch: één klik opent de popover
    const onActivate = vi.fn()
    render(
      <ToekomstOverlay
        visible
        balloons={[{ ...balloons[0], cta: 'Inkomen aanpassen', onActivate }]}
        onEmphasisChange={() => {}}
        onClose={() => {}}
      >
        <div data-testid="chart">chart</div>
      </ToekomstOverlay>,
    )
    fireEvent.click(screen.getByLabelText('Tip: Je inkomen')) // open popover
    fireEvent.click(screen.getByText('Inkomen aanpassen')) // klik de CTA
    expect(onActivate).toHaveBeenCalledTimes(1)
  })

  // ── Adaptieve weergave: op ruim scherm (≥1024px) tonen de markers hun volledige
  // inhoud (kicker + body) DIRECT, niet uitklapbaar (geen popover-toggle). ──
  it('toont de body direct (inline) op ruime schermen zonder uitklappen', () => {
    // useIsLgUp() => true (ruim scherm). Andere queries (hover) blijven false.
    vi.mocked(useMediaQuery).mockImplementation((q: string) =>
      q.includes('min-width: 1024px'),
    )
    render(
      <ToekomstOverlay
        visible
        balloons={[{ id: 'inkomen', icon: null, kicker: 'Je inkomen', body: 'Directe uitleg.', row: 'top', slot: 'bottom-left', emphasis: 'accumulation' }]}
        onEmphasisChange={() => {}}
        onClose={() => {}}
      >
        <div data-testid="chart">chart</div>
      </ToekomstOverlay>,
    )
    // Body is meteen zichtbaar, zonder dat er een marker-knop aangeklikt hoeft.
    expect(screen.getByText('Directe uitleg.')).toBeTruthy()
    // Geen uitklap-marker-knop in inline-modus.
    expect(screen.queryByLabelText('Tip: Je inkomen')).toBeNull()
  })

  // ── M1-regressie: Escape-eigenaarschap tussen overlay en exit-melding-modal ──
  // De exit-melding-modal verschijnt VÓÓRDAT de overlay sluit en laat de overlay
  // `visible`; beide luisteren op window-keydown. Zonder gate zouden twee
  // Escape-handlers tegelijk vuren (correct-bij-toeval, afhankelijk van
  // registratie-volgorde). `escapeSuspended` geeft Escape exclusief aan de modal:
  // de overlay registreert dan geen listener.
  it('Escape sluit de overlay als de exit-modal NIET open is (escapeSuspended=false)', () => {
    const onClose = vi.fn()
    render(
      <ToekomstOverlay
        visible
        balloons={balloons}
        onEmphasisChange={() => {}}
        onClose={onClose}
      >
        <div data-testid="chart">chart</div>
      </ToekomstOverlay>,
    )
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Escape laat de overlay met rust als de exit-modal open is (escapeSuspended) — de modal bezit Escape', () => {
    const onClose = vi.fn()
    render(
      <ToekomstOverlay
        visible
        escapeSuspended
        balloons={balloons}
        onEmphasisChange={() => {}}
        onClose={onClose}
      >
        <div data-testid="chart">chart</div>
      </ToekomstOverlay>,
    )
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(onClose).not.toHaveBeenCalled()
  })

  // ── Inline-kaarten accentueren bij hover de grafiekfase (emphasis-only) ──
  // Op ruim scherm zijn de kaarten niet uitklapbaar, maar hover legt nog steeds
  // de visuele koppeling kaart↔grafiek door de bijbehorende fase te accentueren.
  // Emphasis-only: er wordt géén popover/openId geactiveerd.
  it('accentueert de grafiekfase bij hover op een inline-kaart en reset bij leave', () => {
    vi.useFakeTimers()
    // useIsLgUp() => true (ruim scherm → inline-modus).
    vi.mocked(useMediaQuery).mockImplementation((q: string) =>
      q.includes('min-width: 1024px'),
    )
    const onEmphasisChange = vi.fn()
    render(
      <ToekomstOverlay
        visible
        balloons={[{ id: 'inkomen', icon: null, kicker: 'Je inkomen', body: 'Directe uitleg.', row: 'top', slot: 'bottom-left', emphasis: 'accumulation' }]}
        onEmphasisChange={onEmphasisChange}
        onClose={() => {}}
      >
        <div data-testid="chart">chart</div>
      </ToekomstOverlay>,
    )
    const card = screen.getByText('Directe uitleg.').closest('div')!
    fireEvent.mouseEnter(card)
    // Hover accentueert meteen de fase van deze kaart.
    expect(onEmphasisChange).toHaveBeenLastCalledWith('accumulation')
    fireEvent.mouseLeave(card)
    vi.advanceTimersByTime(160) // korte leave-debounce (140ms)
    // Na het verlaten reset de emphasis weer.
    expect(onEmphasisChange).toHaveBeenLastCalledWith(null)
  })

  // ── Race-fix: auto-scroll mag NIET vuren op de pre-restore default ──
  // Bug "Verkeerde view de toekomst": de pagina sprong bij elke load naar de
  // grafiek omdat de overlay bij de eerste render `visible={true}` kreeg (default
  // vóór de localStorage-restore) en daardoor `scrollIntoView` triggerde — ook
  // als de gebruiker de tips eerder had uitgezet. `autoScrollIntoView` gate dat:
  // de ouder zet 'm pas op true nadat de voorkeur ná hydratie is ingelezen.
  describe('auto-scroll gate', () => {
    const balloons2: OverlayBalloonDef[] = [
      { id: 'inkomen', icon: null, kicker: 'Je inkomen', body: 'x', row: 'top', slot: 'bottom-left', emphasis: 'accumulation' },
    ]

    // jsdom definieert `scrollIntoView` niet op de prototype (de component guard't
    // daar al op met `typeof === 'function'`). We installeren een eigen mock vóór
    // elke test en ruimen 'm daarna op, zodat we de aanroepen kunnen tellen.
    let scrollMock: ReturnType<typeof vi.fn>
    beforeEach(() => {
      scrollMock = vi.fn()
      // @ts-expect-error — scrollIntoView ontbreekt in de jsdom-prototype
      HTMLElement.prototype.scrollIntoView = scrollMock
    })
    afterEach(() => {
      // @ts-expect-error — terugzetten naar 'niet gedefinieerd' (jsdom-default)
      delete HTMLElement.prototype.scrollIntoView
    })

    it('scrollt NIET bij visible + autoScrollIntoView=false (transiënte pre-restore default — geen sprong naar de grafiek)', () => {
      render(
        <ToekomstOverlay
          visible
          autoScrollIntoView={false}
          balloons={balloons2}
          onEmphasisChange={() => {}}
          onClose={() => {}}
        >
          <div data-testid="chart">chart</div>
        </ToekomstOverlay>,
      )
      expect(scrollMock).not.toHaveBeenCalled()
    })

    it('scrollt WEL bij een échte open (visible + autoScrollIntoView=true) — eerste bezoek / tips bewust aan', () => {
      render(
        <ToekomstOverlay
          visible
          autoScrollIntoView
          balloons={balloons2}
          onEmphasisChange={() => {}}
          onClose={() => {}}
        >
          <div data-testid="chart">chart</div>
        </ToekomstOverlay>,
      )
      expect(scrollMock).toHaveBeenCalled()
    })

    it('scrollt NIET als de overlay onzichtbaar is, ook met autoScrollIntoView=true (tips uit → geen sprong)', () => {
      render(
        <ToekomstOverlay
          visible={false}
          autoScrollIntoView
          balloons={balloons2}
          onEmphasisChange={() => {}}
          onClose={() => {}}
        >
          <div data-testid="chart">chart</div>
        </ToekomstOverlay>,
      )
      expect(scrollMock).not.toHaveBeenCalled()
    })

    it('default autoScrollIntoView=true behoudt bestaand gedrag (scrollt bij visible)', () => {
      render(
        <ToekomstOverlay
          visible
          balloons={balloons2}
          onEmphasisChange={() => {}}
          onClose={() => {}}
        >
          <div data-testid="chart">chart</div>
        </ToekomstOverlay>,
      )
      expect(scrollMock).toHaveBeenCalled()
    })
  })

  it('toont de hint hoe je het Tips-scherm later terugvindt', () => {
    render(
      <ToekomstOverlay
        visible
        balloons={balloons}
        onEmphasisChange={() => {}}
        onClose={() => {}}
      >
        <div data-testid="chart">chart</div>
      </ToekomstOverlay>,
    )
    expect(screen.getByText(/Je kan dit scherm weer vinden/)).toBeTruthy()
  })
})

// ── Regressie: exact DRIE fase-bubbels met de juiste kickers + emphasis-mapping ──
// De gebruiker verving 11 bubbels door precies drie (Opbouw / Financiële vrijheid
// / Afbouw). Deze test pint dat aantal, de kickers, de slot-plaatsing en de
// fase-mapping (accumulation/fire/withdrawal) vast tegen toekomstige drift.
describe('TOEKOMST_OVERLAY_BALLOONS — drie fase-bubbels', () => {
  it('bevat exact 3 bubbels', () => {
    expect(TOEKOMST_OVERLAY_BALLOONS).toHaveLength(3)
  })

  it('mapt Opbouw → accumulation (links-onder), Vrijheid → fire (midden-boven), Afbouw → withdrawal (rechts-onder)', () => {
    const byId = Object.fromEntries(TOEKOMST_OVERLAY_BALLOONS.map((b) => [b.id, b]))

    expect(byId.opbouw.kicker).toBe('Opbouw')
    expect(byId.opbouw.emphasis).toBe('accumulation')
    expect(byId.opbouw.slot).toBe('bottom-left')

    expect(byId.vrijheid.kicker).toBe('Financiële vrijheid')
    expect(byId.vrijheid.emphasis).toBe('fire')
    expect(byId.vrijheid.slot).toBe('top-center')

    expect(byId.afbouw.kicker).toBe('Afbouw')
    expect(byId.afbouw.emphasis).toBe('withdrawal')
    expect(byId.afbouw.slot).toBe('bottom-right')
  })

  it('elke bubbel heeft een unieke slot en is puur informatief (geen cta/onActivate)', () => {
    const slots = TOEKOMST_OVERLAY_BALLOONS.map((b) => b.slot)
    expect(new Set(slots).size).toBe(3)
    for (const b of TOEKOMST_OVERLAY_BALLOONS) {
      expect(b.cta).toBeUndefined()
      expect(b.onActivate).toBeUndefined()
      expect(b.body.length).toBeGreaterThan(0)
    }
  })
})

// ── Gewogen layout (ruim scherm + geometrie): drie bubbels + leader-laag ──
// Op ruime schermen met geometrie rendert de overlay de gewogen layout: de drie
// bodies staan direct leesbaar (geen uitklap-markers) en de SVG-leader-laag
// (fase-kaders + FIRE-cirkel + lijnen) verschijnt over de grafiek.
describe('ToekomstOverlay — gewogen layout', () => {
  const geometry: ToekomstOverlayGeometry = {
    padLeft: 60,
    padRight: 16,
    padTop: 16,
    padBottom: 28,
    fireFraction: 0.45,
  }

  beforeEach(() => {
    // useIsLgUp() => true (ruim scherm → weighted layout).
    vi.mocked(useMediaQuery).mockImplementation((q: string) => q.includes('min-width: 1024px'))
  })

  it('toont de drie bodies direct (geen uitklap-markers) wanneer geometry gegeven is', () => {
    render(
      <ToekomstOverlay
        visible
        balloons={TOEKOMST_OVERLAY_BALLOONS}
        geometry={geometry}
        onEmphasisChange={() => {}}
        onClose={() => {}}
      >
        <div data-testid="chart">chart</div>
      </ToekomstOverlay>,
    )
    // Alle drie de kickers zijn direct zichtbaar.
    expect(screen.getByText('Opbouw')).toBeTruthy()
    expect(screen.getByText('Financiële vrijheid')).toBeTruthy()
    expect(screen.getByText('Afbouw')).toBeTruthy()
    // Geen uitklap-marker-knoppen in de gewogen layout.
    expect(screen.queryByLabelText(/^Tip: /)).toBeNull()
  })

  // ── Regressie: bubbels horen ALLEEN in de tips-overlay, niet standaard in de
  // pagina ── Op ruim scherm + geometrie zou de gewogen layout de bubbels eerder
  // ook tonen wanneer de tips UIT stonden (visible=false). De fase-bubbels mogen
  // alleen verschijnen als de overlay zichtbaar is.
  it('toont GEEN fase-bubbels als de tips uit staan (visible=false), ook op ruim scherm met geometrie', () => {
    render(
      <ToekomstOverlay
        visible={false}
        balloons={TOEKOMST_OVERLAY_BALLOONS}
        geometry={geometry}
        onEmphasisChange={() => {}}
        onClose={() => {}}
      >
        <div data-testid="chart">chart</div>
      </ToekomstOverlay>,
    )
    // De grafiek staat er (in-flow), maar geen enkele bubbel-kicker.
    expect(screen.getByTestId('chart')).toBeTruthy()
    expect(screen.queryByText('Opbouw')).toBeNull()
    expect(screen.queryByText('Financiële vrijheid')).toBeNull()
    expect(screen.queryByText('Afbouw')).toBeNull()
  })

  it('accentueert de juiste grafiekfase bij hover op een gewogen bubbel', () => {
    const onEmphasisChange = vi.fn()
    render(
      <ToekomstOverlay
        visible
        balloons={TOEKOMST_OVERLAY_BALLOONS}
        geometry={geometry}
        onEmphasisChange={onEmphasisChange}
        onClose={() => {}}
      >
        <div data-testid="chart">chart</div>
      </ToekomstOverlay>,
    )
    // Target via de body-tekst (een <p> in de kaart) → `.closest('div')` levert
    // de kaart-div met de hover-handler (zelfde patroon als de inline-kaart-test).
    const opbouwCard = screen.getByText(TOEKOMST_OVERLAY_BALLOONS[0].body).closest('div')!
    fireEvent.mouseEnter(opbouwCard)
    expect(onEmphasisChange).toHaveBeenLastCalledWith('accumulation')

    const vrijheidCard = screen.getByText(TOEKOMST_OVERLAY_BALLOONS[1].body).closest('div')!
    fireEvent.mouseEnter(vrijheidCard)
    expect(onEmphasisChange).toHaveBeenLastCalledWith('fire')
  })
})
