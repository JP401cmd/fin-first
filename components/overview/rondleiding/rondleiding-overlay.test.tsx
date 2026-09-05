/**
 * Tests voor de SPOTLIGHT-LAAG van de rondleiding (ADR 0130, fase 3b).
 *
 * Wat hier vastligt is precies wat de gedocumenteerde uitzondering op de
 * ShellOverlay-driewegregel draagbaar maakt — en dus niet stilletjes mag
 * wegglippen:
 *
 *  - de laag zit op `z-[70]` en is een `role="dialog"` met `aria-modal="false"`
 *    (er is geen modale afsluiting: het gat blijft tikbaar);
 *  - hij claimt GEEN overlay-signaal — anders zou de nav-pill zichzelf
 *    verbergen, precies het element dat de mobiele slotstap uitlicht;
 *  - Esc sluit in één tik en meldt `overgeslagen`;
 *  - een doelwit dat na de zoekdeadline niet bestaat, laat de stap OVERSLAAN in
 *    plaats van de rondleiding te laten hangen;
 *  - de `aria-live`-regio kondigt elke stap aan;
 *  - `prefers-reduced-motion` haalt de beweging uit het scrollen.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react'
import { getOverlayCount, __resetOverlayCount } from '@/lib/overlay-signal'
import { useScrollLock } from '@/lib/hooks/use-scroll-lock'
import { resolveRondleidingStappen, type RondleidingData } from '@/lib/rondleiding/steps'
import { RondleidingOverlay } from './rondleiding-overlay'

/** Speelt een écht open BottomSheet na: die houdt de scroll-lock-teller vast. */
function ScrollLockHouder() {
  useScrollLock(true)
  return null
}

const DATA: RondleidingData = {
  userName: 'Bas',
  totals: { bezittingen: 368270, schulden: 221400, cashflow: 38, belasting: 1240 },
  housingSplit: null,
  leverStatus: { bezittingen: 'good', schulden: 'warn', cashflow: 'good', belasting: 'warn' },
  assetTypeCount: 4,
  largestAssetTypeShare: 0.42,
  health: { total: 72, label: 'Sterk' },
  currentNetWorth: 146870,
  dailyExpenseRate: 92.4,
  isPensioen: false,
  vrijheid: null,
}

const STAPPEN = resolveRondleidingStappen('desktop')

/** Zet een element met het gevraagde `data-tour` in de DOM en geeft 'm terug. */
function plaatsTarget(tour: string): HTMLElement {
  const el = document.createElement('div')
  el.setAttribute('data-tour', tour)
  // jsdom geeft overal 0×0 terug; de hook toetst zichtbaarheid via
  // getClientRects, dus die stubben we naar één echte rechthoek.
  el.getClientRects = (() => [
    { x: 100, y: 200, width: 300, height: 120 },
  ]) as unknown as Element['getClientRects']
  el.getBoundingClientRect = (() =>
    ({ top: 200, left: 100, width: 300, height: 120, bottom: 320, right: 400, x: 100, y: 200, toJSON: () => ({}) })) as unknown as Element['getBoundingClientRect']
  document.body.appendChild(el)
  return el
}

function renderOverlay(
  stapIndex: number,
  handlers: Partial<Record<string, () => void>> = {},
) {
  const stap = STAPPEN[stapIndex]
  const noop = () => {}
  return render(
    <RondleidingOverlay
      stap={stap}
      body={stap.body(DATA, { platform: 'desktop', masked: false })}
      index={stapIndex}
      totaal={STAPPEN.length}
      platform="desktop"
      afscheid={false}
      onVorige={handlers.onVorige ?? noop}
      onVolgende={handlers.onVolgende ?? noop}
      onOverslaan={handlers.onOverslaan ?? noop}
      onEersteStap={handlers.onEersteStap ?? noop}
      onRondkijken={handlers.onRondkijken ?? noop}
      onStart={handlers.onStart ?? noop}
      onTargetOntbreekt={handlers.onTargetOntbreekt ?? noop}
    />,
  )
}

beforeEach(() => {
  __resetOverlayCount()
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('RondleidingOverlay — de laag zelf', () => {
  it('rendert op z-[70] als dialoog zonder modale afsluiting', () => {
    plaatsTarget('hefboom-bezittingen')
    renderOverlay(1)

    const laag = screen.getByTestId('rondleiding-overlay')
    expect(laag.className).toContain('z-[70]')
    expect(laag.className).toContain('fixed')
    expect(laag.className).toContain('inset-0')
    expect(laag).toHaveAttribute('role', 'dialog')
    expect(laag).toHaveAttribute('aria-modal', 'false')
    expect(laag).toHaveAttribute('aria-labelledby')
    expect(laag).toHaveAttribute('aria-describedby')
  })

  it('claimt GEEN overlay-signaal — de nav-pill blijft dus staan', () => {
    plaatsTarget('hefboom-bezittingen')
    renderOverlay(1)
    expect(getOverlayCount()).toBe(0)
  })

  it('kondigt de huidige stap aan in een aria-live-regio', () => {
    plaatsTarget('hefboom-schulden')
    renderOverlay(2)

    const live = screen
      .getByTestId('rondleiding-overlay')
      .querySelector('[aria-live="polite"]')
    expect(live).not.toBeNull()
    expect(live!.textContent).toContain(`Stap 3 van ${STAPPEN.length}`)
    expect(live!.textContent).toContain('Je schulden')
  })

  it('toont de titel als h3 en de body eronder', () => {
    plaatsTarget('hefboom-bezittingen')
    renderOverlay(1)

    const kop = screen.getByRole('heading', { level: 3, name: 'Je bezittingen' })
    expect(kop).toBeInTheDocument()
    expect(screen.getByText(/Je bezittingen staan op/)).toBeInTheDocument()
  })
})

describe('RondleidingOverlay — toetsenbord', () => {
  it('Esc slaat de rondleiding over — één tik, geen tussenvraag', () => {
    plaatsTarget('hefboom-bezittingen')
    const onOverslaan = vi.fn()
    renderOverlay(1, { onOverslaan })

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onOverslaan).toHaveBeenCalledTimes(1)
  })

  it('pijltjes stappen vooruit en achteruit', () => {
    plaatsTarget('hefboom-bezittingen')
    const onVolgende = vi.fn()
    const onVorige = vi.fn()
    renderOverlay(1, { onVolgende, onVorige })

    fireEvent.keyDown(document, { key: 'ArrowRight' })
    fireEvent.keyDown(document, { key: 'ArrowLeft' })
    expect(onVolgende).toHaveBeenCalledTimes(1)
    expect(onVorige).toHaveBeenCalledTimes(1)
  })

  it('negeert Esc zolang er een échte overlay bovenop staat — die sluit dan, niet de tour', () => {
    // BottomSheet luistert óók op `document`. Zonder guard sloot één Esc de
    // sheet (bv. de gezondheidskaart) én beëindigde hij de onzichtbare
    // rondleiding als `overgeslagen` — onomkeerbaar voor de autostart.
    plaatsTarget('hefboom-bezittingen')
    const onOverslaan = vi.fn()
    const onVolgende = vi.fn()
    const lock = render(<ScrollLockHouder />)
    try {
      renderOverlay(1, { onOverslaan, onVolgende })
      fireEvent.keyDown(document, { key: 'Escape' })
      fireEvent.keyDown(document, { key: 'ArrowRight' })
      expect(onOverslaan).not.toHaveBeenCalled()
      expect(onVolgende).not.toHaveBeenCalled()
    } finally {
      lock.unmount()
    }
    // Sheet dicht → de tour luistert weer.
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onOverslaan).toHaveBeenCalledTimes(1)
  })

  it('laat toetsaanslagen in een invoerveld met rust', () => {
    plaatsTarget('hefboom-bezittingen')
    const onVolgende = vi.fn()
    renderOverlay(1, { onVolgende })

    const input = document.createElement('input')
    document.body.appendChild(input)
    fireEvent.keyDown(input, { key: 'ArrowRight' })
    expect(onVolgende).not.toHaveBeenCalled()
  })
})

describe('RondleidingOverlay — ontbrekend doelwit', () => {
  it('meldt na de zoekdeadline dat de stap over kan', async () => {
    vi.useFakeTimers()
    const onTargetOntbreekt = vi.fn()
    // GEEN plaatsTarget: het element bestaat niet.
    renderOverlay(1, { onTargetOntbreekt })

    expect(onTargetOntbreekt).not.toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(2600)
    })
    expect(onTargetOntbreekt).toHaveBeenCalledTimes(1)
  })

  it('meldt niets zolang het doelwit er wél is', async () => {
    vi.useFakeTimers()
    plaatsTarget('hefboom-bezittingen')
    const onTargetOntbreekt = vi.fn()
    renderOverlay(1, { onTargetOntbreekt })

    await act(async () => {
      vi.advanceTimersByTime(5000)
    })
    expect(onTargetOntbreekt).not.toHaveBeenCalled()
  })
})

describe('RondleidingOverlay — reduced motion', () => {
  it('scrollt zonder animatie wanneer de gebruiker beweging beperkt', () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: query.includes('reduce'),
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }) as unknown as MediaQueryList,
    )

    plaatsTarget('hefboom-bezittingen')
    renderOverlay(1)

    expect(scrollIntoView).toHaveBeenCalled()
    expect(scrollIntoView.mock.calls[0][0]).toMatchObject({ behavior: 'auto', block: 'center' })
  })
})
