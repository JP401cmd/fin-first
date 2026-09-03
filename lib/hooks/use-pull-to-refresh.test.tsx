import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import { useRef, type CSSProperties } from 'react'
import { usePullToRefresh, PULL_THRESHOLD_PX } from './use-pull-to-refresh'
import { acquireOverlay, __resetOverlayCount } from '@/lib/overlay-signal'

/**
 * De vier manieren waarop een eigen pull-to-refresh standaard kapot gaat:
 *  1. de handler grijpt terwijl de gebruiker gewoon omhoog wil scrollen,
 *  2. hij vecht met het swipe-down-to-dismiss van een open sheet,
 *  3. hij draait ook op desktop, waar de `<main>` geen scroller is,
 *  4. hij ververst twee keer (of nul keer) op één gebaar.
 * Plus de `preventDefault`-grens: alleen tijdens een actieve pull, want die
 * bepaalt of native scroll en native pull-to-refresh nog kunnen werken.
 */

const REST_SIGNAL = 'phase:'

type HarnessProps = {
  onRefresh: () => void
  refreshing?: boolean
  overflowY?: CSSProperties['overflowY']
}

function Harness({ onRefresh, refreshing = false, overflowY = 'auto' }: HarnessProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const { phase, distance } = usePullToRefresh({ scrollRef, onRefresh, refreshing })
  return (
    <div ref={scrollRef} data-testid="scroller" style={{ overflowY }}>
      <span data-testid="state">{`${REST_SIGNAL}${phase} d:${distance}`}</span>
    </div>
  )
}

/** Touch-event met alleen de velden die de hook leest. */
function touchEvent(type: string, clientY: number, clientX = 0, count = 1): Event {
  const ev = new Event(type, { bubbles: true, cancelable: true })
  const touches = Array.from({ length: count }, () => ({ clientY, clientX }))
  Object.defineProperty(ev, 'touches', { value: touches })
  return ev
}

function setScrollTop(el: HTMLElement, value: number) {
  Object.defineProperty(el, 'scrollTop', { value, configurable: true })
}

/** Eén volledig gebaar. Geeft de touchmove-events terug voor preventDefault-asserties. */
function pull(el: HTMLElement, fromY: number, toY: number, x = 0) {
  const moves: Event[] = []
  act(() => {
    el.dispatchEvent(touchEvent('touchstart', fromY, x))
  })
  // Twee bewegingen: de eerste passeert de beslisdrempel, de tweede is de
  // daadwerkelijke pull (de hook herijkt het nulpunt op de beslissing).
  const decide = touchEvent('touchmove', fromY + (toY > fromY ? 8 : -8), x)
  const move = touchEvent('touchmove', toY, x)
  act(() => {
    document.dispatchEvent(decide)
    document.dispatchEvent(move)
  })
  moves.push(decide, move)
  act(() => {
    document.dispatchEvent(touchEvent('touchend', toY, x))
  })
  return moves
}

afterEach(() => {
  cleanup()
  __resetOverlayCount()
})

describe('usePullToRefresh — wanneer het gebaar NIET mag grijpen', () => {
  it('doet niets wanneer de container al gescrold is (gewoon omhoog scrollen blijft werken)', () => {
    const onRefresh = vi.fn()
    const { getByTestId } = render(<Harness onRefresh={onRefresh} />)
    const el = getByTestId('scroller')
    setScrollTop(el, 40)

    const moves = pull(el, 100, 400)

    expect(onRefresh).not.toHaveBeenCalled()
    expect(moves.some((m) => m.defaultPrevented)).toBe(false)
    expect(getByTestId('state').textContent).toBe(`${REST_SIGNAL}idle d:0`)
  })

  it('doet niets zolang er een overlay open staat (sheet-dismiss wint)', () => {
    const onRefresh = vi.fn()
    act(() => {
      acquireOverlay()
    })
    const { getByTestId } = render(<Harness onRefresh={onRefresh} />)
    const el = getByTestId('scroller')
    setScrollTop(el, 0)

    pull(el, 100, 400)

    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('doet niets wanneer het element geen scroll-container is (desktop-poort)', () => {
    const onRefresh = vi.fn()
    const { getByTestId } = render(<Harness onRefresh={onRefresh} overflowY="visible" />)
    const el = getByTestId('scroller')
    setScrollTop(el, 0)

    pull(el, 100, 400)

    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('laat een overwegend horizontale beweging met rust (carrousel/brede tabel)', () => {
    const onRefresh = vi.fn()
    const { getByTestId } = render(<Harness onRefresh={onRefresh} />)
    const el = getByTestId('scroller')
    setScrollTop(el, 0)

    act(() => {
      el.dispatchEvent(touchEvent('touchstart', 100, 100))
    })
    const move = touchEvent('touchmove', 104, 260) // 4px omlaag, 160px opzij
    act(() => {
      document.dispatchEvent(move)
    })
    act(() => {
      document.dispatchEvent(touchEvent('touchend', 104, 260))
    })

    expect(onRefresh).not.toHaveBeenCalled()
    expect(move.defaultPrevented).toBe(false)
  })

  it('laat een omhoog-veeg met rust en blokkeert de native scroll niet', () => {
    const onRefresh = vi.fn()
    const { getByTestId } = render(<Harness onRefresh={onRefresh} />)
    const el = getByTestId('scroller')
    setScrollTop(el, 0)

    const moves = pull(el, 400, 100)

    expect(onRefresh).not.toHaveBeenCalled()
    expect(moves.some((m) => m.defaultPrevented)).toBe(false)
  })

  it('negeert multi-touch (pinch-zoom op een grafiek)', () => {
    const onRefresh = vi.fn()
    const { getByTestId } = render(<Harness onRefresh={onRefresh} />)
    const el = getByTestId('scroller')
    setScrollTop(el, 0)

    act(() => {
      el.dispatchEvent(touchEvent('touchstart', 100, 0, 2))
    })
    act(() => {
      document.dispatchEvent(touchEvent('touchmove', 400))
      document.dispatchEvent(touchEvent('touchend', 400))
    })

    expect(onRefresh).not.toHaveBeenCalled()
  })
})

describe('usePullToRefresh — het gebaar zelf', () => {
  it('ververst precies één keer bij een pull voorbij de drempel en blokkeert de native pull', () => {
    const onRefresh = vi.fn()
    const { getByTestId } = render(<Harness onRefresh={onRefresh} />)
    const el = getByTestId('scroller')
    setScrollTop(el, 0)

    // 400px vinger × 0.45 weerstand = 180px > 72px drempel.
    const moves = pull(el, 100, 500)

    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(moves.every((m) => m.defaultPrevented)).toBe(true)
    expect(getByTestId('state').textContent).toContain(`${REST_SIGNAL}refreshing`)
  })

  it('veert terug zonder te verversen bij een pull onder de drempel', () => {
    const onRefresh = vi.fn()
    const { getByTestId } = render(<Harness onRefresh={onRefresh} />)
    const el = getByTestId('scroller')
    setScrollTop(el, 0)

    // 60px vinger × 0.45 = 27px < 72px drempel.
    pull(el, 100, 160)

    expect(onRefresh).not.toHaveBeenCalled()
    expect(getByTestId('state').textContent).toBe(`${REST_SIGNAL}idle d:0`)
  })

  it('geeft een pull-afstand die onder de vinger-afstand blijft (weerstand)', () => {
    const onRefresh = vi.fn()
    const { getByTestId } = render(<Harness onRefresh={onRefresh} />)
    const el = getByTestId('scroller')
    setScrollTop(el, 0)

    act(() => {
      el.dispatchEvent(touchEvent('touchstart', 100))
    })
    act(() => {
      document.dispatchEvent(touchEvent('touchmove', 108))
      document.dispatchEvent(touchEvent('touchmove', 308)) // 200px ná herijking
    })

    const text = getByTestId('state').textContent ?? ''
    const distance = Number(text.split('d:')[1])
    expect(distance).toBeGreaterThan(PULL_THRESHOLD_PX)
    expect(distance).toBeLessThan(200)
  })

  it('vuurt niet nogmaals zolang de vorige verversing nog loopt', () => {
    const onRefresh = vi.fn()
    const { getByTestId, rerender } = render(<Harness onRefresh={onRefresh} />)
    const el = getByTestId('scroller')
    setScrollTop(el, 0)

    pull(el, 100, 500)
    rerender(<Harness onRefresh={onRefresh} refreshing />)
    pull(el, 100, 500)

    expect(onRefresh).toHaveBeenCalledTimes(1)
  })
})
