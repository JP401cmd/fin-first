import { describe, it, expect, beforeAll } from 'vitest'
import { render } from '@testing-library/react'
import { MonteCarloWidget } from './monte-carlo-widget'
import type { DashboardData } from './widget-renderer'

// jsdom mist ResizeObserver (WidgetShell), IntersectionObserver + matchMedia.
beforeAll(() => {
  class MockObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  global.ResizeObserver = MockObserver as unknown as typeof ResizeObserver
  global.IntersectionObserver = MockObserver as unknown as typeof IntersectionObserver
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia
  }
})

/**
 * Minimale SVG-pad-grammatica: elk commando krijgt een veelvoud van zijn
 * argument-aantal (M/L/T 2, H/V 1, C 6, S/Q 4, A 7, Z 0). jsdom valideert
 * `d` niet; de browser wel, en meldt bij een half segment
 * "Unexpected end of attribute. Expected number" (WF-BEHEER-29-bug5).
 * Beperking: gepakte arc-flags (`A r r 0 01x,y`) worden als één getal gelezen —
 * voldoende hier (de fan-chart gebruikt alleen M/C/L/Z), niet als algemene
 * SVG-validator inzetten.
 */
const ARITY: Record<string, number> = { M: 2, L: 2, T: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, A: 7, Z: 0 }

function pathIsWellFormed(d: string): boolean {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? []
  let cmd: string | null = null
  let args = 0
  const complete = () => {
    if (cmd === null) return false
    const arity = ARITY[cmd]
    if (arity === undefined) return false
    return arity === 0 ? args === 0 : args > 0 && args % arity === 0
  }
  for (const token of tokens) {
    if (/[a-zA-Z]/.test(token)) {
      if (cmd !== null && !complete()) return false
      cmd = token.toUpperCase()
      args = 0
    } else {
      args += 1
    }
  }
  return complete()
}

function makeData(overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    backtestSuccessRate: 82,
    backtestNamedPaths: [{ label: '2008', success: true }, { label: '1929', success: false }],
    ...overrides,
  } as unknown as DashboardData
}

describe('pathIsWellFormed (testhulp)', () => {
  it('herkent een half C-segment als ongeldig en volledige segmenten als geldig', () => {
    expect(pathIsWellFormed('M0,48 C40,44 80,38 120,30 160,24 200,20')).toBe(false)
    expect(pathIsWellFormed('M0,48 C40,44 80,38 120,30 160,24 200,20 200,20')).toBe(true)
    expect(pathIsWellFormed('M0,48 C40,44 80,38 120,30 S160,24 200,20')).toBe(true)
    expect(pathIsWellFormed('M0,0 L10,10 Z')).toBe(true)
    expect(pathIsWellFormed('M0,0 L')).toBe(false)
  })
})

describe('MonteCarloWidget — de decoratieve fan-chart bevat alleen goedgevormde SVG-paden', () => {
  it('full-size met succeskans: elk <path d> is parseerbaar (geen half Bézier-segment)', () => {
    const { container } = render(<MonteCarloWidget size="full" data={makeData()} />)
    const paths = Array.from(container.querySelectorAll('path')).map((p) => p.getAttribute('d') ?? '')
    expect(paths.length).toBeGreaterThan(0)
    for (const d of paths) {
      expect(pathIsWellFormed(d), `ongeldig pad: "${d}"`).toBe(true)
    }
  })

  it('de P50-mediaanlijn loopt door tot de rechterrand (200,20), niet alleen het eerste segment', () => {
    const { container } = render(<MonteCarloWidget size="full" data={makeData()} />)
    const median = Array.from(container.querySelectorAll('path')).find(
      (p) => p.getAttribute('fill') === 'none',
    )
    expect(median).toBeDefined()
    expect(median!.getAttribute('d')).toMatch(/200,20\s*$/)
    expect(pathIsWellFormed(median!.getAttribute('d') ?? '')).toBe(true)
  })
})
