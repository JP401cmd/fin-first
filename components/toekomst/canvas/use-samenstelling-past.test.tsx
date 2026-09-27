/**
 * `useSamenstellingPast` — mobiel in Doelen stelt de Samenstelling-plot zo bij dat die laag
 * even hoog is als de Vermogen-laag (27 sep). Meet de INHOUD van beide lagen.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import { useSamenstellingPast } from './use-samenstelling-past'

let callback: (() => void) | null = null
const observe = vi.fn()
const origineel = globalThis.ResizeObserver

beforeEach(() => {
  callback = null
  observe.mockClear()
  globalThis.ResizeObserver = class {
    constructor(cb: () => void) {
      callback = cb
    }
    observe = observe
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})
afterEach(() => {
  cleanup()
  globalThis.ResizeObserver = origineel
})

function hoogte(el: Element | null, px: number) {
  if (el) Object.defineProperty(el, 'offsetHeight', { configurable: true, value: px })
}

function Host({ actief, start = 152, vermogenPlot = 192 }: { actief: boolean; start?: number; vermogenPlot?: number }) {
  const { vermogenRef, samenstellingRef, samenstellingPlot } = useSamenstellingPast({ actief, startPlot: start, vermogenPlot })
  return (
    <>
      <div ref={vermogenRef}>
        <div data-testid="vermogen-inhoud" />
      </div>
      <div ref={samenstellingRef}>
        <div data-testid="samenstelling-inhoud" />
      </div>
      <output data-testid="uit">{samenstellingPlot ?? 'null'}</output>
    </>
  )
}

describe('useSamenstellingPast', () => {
  it('niet actief: de startwaarde, geen meting', () => {
    const { getByTestId } = render(<Host actief={false} />)
    expect(getByTestId('uit').textContent).toBe('152')
    expect(callback).toBeNull()
  })

  it('actief: startwaarde, daarna precies passend in de Vermogen-laag', () => {
    const { getByTestId } = render(<Host actief />)
    expect(getByTestId('uit').textContent).toBe('152')
    hoogte(getByTestId('vermogen-inhoud'), 232)
    hoogte(getByTestId('samenstelling-inhoud'), 244)
    act(() => callback?.())
    expect(getByTestId('uit').textContent).toBe('140')
    // Volgende ronde: nu even hoog ⇒ stabiel.
    hoogte(getByTestId('samenstelling-inhoud'), 232)
    act(() => callback?.())
    expect(getByTestId('uit').textContent).toBe('140')
  })

  it('observeert de inhoud van beide lagen', () => {
    const { getByTestId } = render(<Host actief />)
    hoogte(getByTestId('vermogen-inhoud'), 232)
    hoogte(getByTestId('samenstelling-inhoud'), 232)
    act(() => callback?.())
    const doelen = observe.mock.calls.map((c) => c[0])
    expect(doelen).toContain(getByTestId('vermogen-inhoud'))
    expect(doelen).toContain(getByTestId('samenstelling-inhoud'))
  })
})
