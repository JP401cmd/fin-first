/**
 * `useKolomPlotHoogte` — meet de lab-kolom en de grafiekkolom en onthoudt de plothoogte
 * waarbij ze even hoog zijn (27 sep). Pint: alleen meten waar het moet, de som uit
 * `kolomPlotHoogte`, geen trilling onder de drempel, en de meting hoort bij de plot die
 * getekend is.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import { useState } from 'react'
import { useKolomPlotHoogte } from './use-kolom-plot-hoogte'

let callback: (() => void) | null = null
const observe = vi.fn()
const disconnect = vi.fn()
const origineel = globalThis.ResizeObserver

beforeEach(() => {
  callback = null
  observe.mockClear()
  disconnect.mockClear()
  globalThis.ResizeObserver = class {
    constructor(cb: () => void) {
      callback = cb
    }
    observe = observe
    unobserve() {}
    disconnect = disconnect
  } as unknown as typeof ResizeObserver
})
afterEach(() => {
  cleanup()
  globalThis.ResizeObserver = origineel
})

function hoogte(el: HTMLElement | null, px: number) {
  if (el) Object.defineProperty(el, 'offsetHeight', { configurable: true, value: px })
}

function Host({ meten, plot }: { meten: boolean; plot: number }) {
  const [onthouden, setOnthouden] = useState<number | null>(null)
  const { kolomRef, grafiekRef } = useKolomPlotHoogte({ meten, huidigePlot: plot, setOnthouden })
  return (
    <>
      <div ref={kolomRef} data-testid="kolom" />
      <div ref={grafiekRef} data-testid="grafiek" />
      <output data-testid="uit">{onthouden ?? 'null'}</output>
    </>
  )
}

describe('useKolomPlotHoogte', () => {
  it('meet niet buiten Doelen/desktop', () => {
    render(<Host meten={false} plot={240} />)
    expect(callback).toBeNull()
    expect(observe).not.toHaveBeenCalled()
  })

  it('observeert beide kolommen en onthoudt kolomhoogte − chrome', () => {
    const { getByTestId } = render(<Host meten plot={240} />)
    expect(observe).toHaveBeenCalledTimes(2)
    hoogte(getByTestId('kolom'), 460)
    hoogte(getByTestId('grafiek'), 400)
    act(() => callback?.())
    expect(getByTestId('uit').textContent).toBe('300')
  })

  it('negeert verschillen onder de drempel (geen trilling)', () => {
    const { getByTestId, rerender } = render(<Host meten plot={240} />)
    hoogte(getByTestId('kolom'), 460)
    hoogte(getByTestId('grafiek'), 400)
    act(() => callback?.())
    rerender(<Host meten plot={300} />)
    // Na de render: grafiekkolom = chrome 160 + 300 = 460, maar een halve pixel kolomverschil.
    hoogte(getByTestId('kolom'), 461)
    hoogte(getByTestId('grafiek'), 460)
    act(() => callback?.())
    expect(getByTestId('uit').textContent).toBe('300')
  })

  it('ruimt de observer op bij unmount en bij stoppen met meten', () => {
    const { rerender, unmount } = render(<Host meten plot={240} />)
    rerender(<Host meten={false} plot={240} />)
    expect(disconnect).toHaveBeenCalledTimes(1)
    rerender(<Host meten plot={240} />)
    unmount()
    expect(disconnect).toHaveBeenCalledTimes(2)
  })
})
