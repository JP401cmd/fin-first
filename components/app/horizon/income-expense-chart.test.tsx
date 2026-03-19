import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { IncomeExpenseChart } from './income-expense-chart'
import type { SimRow } from '@/lib/fire-simulation'

vi.mock('@/lib/hooks/use-in-view-animation', () => ({
  useInViewAnimation: () => ({
    ref: { current: document.createElement('div') },
    hasEntered: true,
    animationComplete: true,
  }),
}))

class MockResizeObserver {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}

beforeEach(() => {
  global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver
})

function makeRows(count: number, startAge: number): SimRow[] {
  return Array.from({ length: count }, (_, i) => ({
    age: startAge + i,
    phase: 'accumulation' as const,
    startPortfolio: 100000 + i * 10000,
    growth: 7000 + i * 500,
    savings: 18000,
    withdrawal: 0,
    cashflowNet: 0,
    endPortfolio: 125000 + i * 10500,
    grossIncome: 54000 + i * 500,
    grossExpenses: 36000,
  }))
}

describe('IncomeExpenseChart', () => {
  it('renders SVG element', () => {
    const { container } = render(
      <IncomeExpenseChart
        rows={makeRows(10, 35)}
        currentAge={35}
        endAge={44}
      />
    )

    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
  })

  it('renders income and expense lines as path elements', () => {
    const { container } = render(
      <IncomeExpenseChart
        rows={makeRows(10, 35)}
        currentAge={35}
        endAge={44}
      />
    )

    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()

    const paths = svg!.querySelectorAll('path')
    expect(paths.length).toBeGreaterThan(0)

    const strokes = Array.from(paths)
      .map((p) => p.getAttribute('stroke'))
      .filter(Boolean)
    expect(strokes.length).toBeGreaterThan(0)
  })

  it('renders filled area segments', () => {
    const { container } = render(
      <IncomeExpenseChart
        rows={makeRows(10, 35)}
        currentAge={35}
        endAge={44}
      />
    )

    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()

    const paths = svg!.querySelectorAll('path')
    const filledPaths = Array.from(paths).filter((p) => {
      const fill = p.getAttribute('fill')
      return fill && fill !== 'none' && fill !== 'transparent'
    })
    expect(filledPaths.length).toBeGreaterThan(0)
  })

  it('zoom synchronization - filters rows by visibleMinAge/visibleMaxAge', () => {
    const { container } = render(
      <IncomeExpenseChart
        rows={makeRows(20, 35)}
        currentAge={35}
        endAge={54}
        visibleMinAge={40}
        visibleMaxAge={50}
      />
    )

    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()

    const textElements = container.querySelectorAll('text')
    const ageLabels = Array.from(textElements)
      .map((t) => parseInt(t.textContent || '', 10))
      .filter((n) => !isNaN(n))

    // All rendered age labels should be within the visible range
    for (const age of ageLabels) {
      expect(age).toBeGreaterThanOrEqual(40)
      expect(age).toBeLessThanOrEqual(50)
    }
  })

  it('responsive height - uses mobile height when containerW defaults to 600', () => {
    const { container } = render(
      <IncomeExpenseChart
        rows={makeRows(10, 35)}
        currentAge={35}
        endAge={44}
      />
    )

    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()

    const viewBox = svg!.getAttribute('viewBox')
    expect(viewBox).toBeTruthy()

    // With ResizeObserver mocked (no callback fired), containerW stays at
    // default (0 or 600). The mobile height threshold is 768px, so the
    // viewBox height should be 120 (mobile).
    const parts = viewBox!.split(/\s+/)
    const height = parseFloat(parts[3])
    expect(height).toBe(120)
  })

  it('renders legend with Inkomen and Uitgaven labels', () => {
    render(
      <IncomeExpenseChart
        rows={makeRows(10, 35)}
        currentAge={35}
        endAge={44}
      />
    )

    expect(screen.getByText('Inkomen')).toBeTruthy()
    expect(screen.getByText('Uitgaven')).toBeTruthy()
  })

  it('handles empty rows gracefully', () => {
    const { container } = render(
      <IncomeExpenseChart
        rows={[]}
        currentAge={35}
        endAge={44}
      />
    )

    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
  })
})
