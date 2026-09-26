/**
 * `useInViewOnce` haakt alsnog aan als het geobserveerde element láter mount
 * (review fase 1, W5). In `PlanVerdieping` mount de duiding-sectie pas zodra
 * `heeftKaternIII` waar is én de modus Volledig is; een ref-wissel triggert geen
 * effect, dus zonder remountKey bleef de observer los en draaiden de presets
 * onder solved nooit.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useRef } from 'react'
import { act, render } from '@testing-library/react'
import { useInViewOnce } from './use-in-view-once'

type Callback = (entries: Array<{ isIntersecting: boolean }>) => void
let observed: Element[] = []
let callbacks: Callback[] = []

class FakeObserver {
  constructor(private cb: Callback) {
    callbacks.push(cb)
  }
  observe(el: Element) {
    observed.push(el)
  }
  disconnect() {}
  unobserve() {}
}

beforeEach(() => {
  observed = []
  callbacks = []
  vi.stubGlobal('IntersectionObserver', FakeObserver)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

function Harness({ toon, metSleutel }: { toon: boolean; metSleutel: boolean }) {
  const ref = useRef<HTMLElement | null>(null)
  const inView = useInViewOnce(ref, '600px', metSleutel ? toon : null)
  return (
    <div>
      <span data-testid="stand">{inView ? 'in-beeld' : 'uit-beeld'}</span>
      {toon && <section ref={ref} data-testid="sectie" />}
    </div>
  )
}

describe('useInViewOnce — late mount', () => {
  it('met remountKey: de observer haakt aan zodra de sectie verschijnt', () => {
    const { rerender, getByTestId } = render(<Harness toon={false} metSleutel />)
    expect(observed).toHaveLength(0)
    rerender(<Harness toon metSleutel />)
    expect(observed).toEqual([getByTestId('sectie')])
    act(() => callbacks[callbacks.length - 1]([{ isIntersecting: true }]))
    expect(getByTestId('stand').textContent).toBe('in-beeld')
  })

  it('zonder remountKey blijft de observer los (het defect dat de sleutel oplost)', () => {
    const { rerender } = render(<Harness toon={false} metSleutel={false} />)
    rerender(<Harness toon metSleutel={false} />)
    expect(observed).toHaveLength(0)
  })
})
