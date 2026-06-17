import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ToekomstOverlay, type OverlayBalloonDef } from './toekomst-overlay'

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
        balloons={[{ id: 'inkomen', icon: null, kicker: 'Je inkomen', body: 'Uitleg.', row: 'top', emphasis: 'accumulation' }]}
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
        balloons={[{ id: 'inkomen', icon: null, kicker: 'Je inkomen', body: 'Directe uitleg.', row: 'top', emphasis: 'accumulation' }]}
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
        balloons={[{ id: 'inkomen', icon: null, kicker: 'Je inkomen', body: 'Directe uitleg.', row: 'top', emphasis: 'accumulation' }]}
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
