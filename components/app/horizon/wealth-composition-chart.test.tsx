/**
 * Component tests for WealthCompositionChart
 *
 * Feature #363 — Regression tests for wealth composition chart rendering
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WealthCompositionChart } from './wealth-composition-chart'
import type { StackedRow } from '@/lib/wealth-composition'

// ── Mocks ──────────────────────────────────────────────────────

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

// ── Helpers ────────────────────────────────────────────────────

function makeRows(count: number, startAge: number): StackedRow[] {
  return Array.from({ length: count }, (_, i) => ({
    age: startAge + i,
    spaargeld: 20000 + i * 1000,
    beleggingen: 100000 + i * 5000,
    pensioen: 50000 + i * 2000,
    vastgoed: 300000 + i * 3000,
    overig: 10000 + i * 500,
    schulden: i < count / 2 ? -(80000 - i * 3000) : 0,
  }))
}

function makeMinimalRows(): StackedRow[] {
  return [
    { age: 35, spaargeld: 10000, beleggingen: 50000, pensioen: 0, vastgoed: 0, overig: 0, schulden: 0 },
    { age: 36, spaargeld: 12000, beleggingen: 55000, pensioen: 0, vastgoed: 0, overig: 0, schulden: 0 },
  ]
}

// ── Step 7: Renders SVG, bars, legend ──────────────────────────

describe('WealthCompositionChart — rendering', () => {
  it('renders an SVG element', () => {
    const { container } = render(
      <WealthCompositionChart
        stackedRows={makeRows(10, 35)}
        currentAge={35}
        endAge={44}
      />
    )

    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
  })

  it('renders stacked bar rects for each visible row', () => {
    const rows = makeRows(5, 35)
    const { container } = render(
      <WealthCompositionChart
        stackedRows={rows}
        currentAge={35}
        endAge={39}
      />
    )

    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()

    // Each row should have multiple rects (one per wealth group with value > 0)
    const rects = svg!.querySelectorAll('rect')
    // At minimum: bars + debt bars + tooltip bg (if hovered)
    // Each row has up to 5 positive groups + 1 debt = 6 rects per bar
    expect(rects.length).toBeGreaterThan(0)
  })

  it('renders legend items for groups that have data', () => {
    const rows = makeRows(5, 35)
    const { container } = render(
      <WealthCompositionChart
        stackedRows={rows}
        currentAge={35}
        endAge={39}
      />
    )

    // Should show legend labels for groups that appear in data
    expect(screen.getByText('Beleggingen')).toBeTruthy()
    expect(screen.getByText('Spaargeld')).toBeTruthy()
    expect(screen.getByText('Vastgoed')).toBeTruthy()
    expect(screen.getByText('Overig')).toBeTruthy()
    // Schulden legend should appear since we have negative schulden values
    expect(screen.getByText('Schulden')).toBeTruthy()
  })

  it('does not render legend for groups with no data', () => {
    // Only spaargeld and beleggingen have data
    const rows = makeMinimalRows()
    const { container } = render(
      <WealthCompositionChart
        stackedRows={rows}
        currentAge={35}
        endAge={36}
      />
    )

    expect(screen.getByText('Spaargeld')).toBeTruthy()
    expect(screen.getByText('Beleggingen')).toBeTruthy()
    // These should NOT appear
    expect(screen.queryByText('Pensioen')).toBeNull()
    expect(screen.queryByText('Vastgoed')).toBeNull()
    expect(screen.queryByText('Overig')).toBeNull()
    expect(screen.queryByText('Schulden')).toBeNull()
  })

  it('renders FIRE age vertical line when fireAge is provided', () => {
    const { container } = render(
      <WealthCompositionChart
        stackedRows={makeRows(30, 35)}
        currentAge={35}
        endAge={64}
        fireAge={55}
      />
    )

    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()

    // Should render FIRE label text — jsdom may use lowercase attributes
    const texts = svg!.querySelectorAll('text')
    const fireText = Array.from(texts).find(t => t.textContent?.includes('FIRE'))
    expect(fireText).toBeTruthy()
    expect(fireText!.textContent).toContain('55')
  })

  it('does not render FIRE line when fireAge is null', () => {
    const { container } = render(
      <WealthCompositionChart
        stackedRows={makeRows(5, 35)}
        currentAge={35}
        endAge={39}
        fireAge={null}
      />
    )

    const svg = container.querySelector('svg')
    const texts = svg!.querySelectorAll('text')
    const fireText = Array.from(texts).find(t => t.textContent?.includes('FIRE'))
    expect(fireText).toBeFalsy()
  })

  it('shows "Geen gegevens beschikbaar" when rows are empty', () => {
    render(
      <WealthCompositionChart
        stackedRows={[]}
        currentAge={35}
        endAge={44}
      />
    )

    expect(screen.getByText('Geen gegevens beschikbaar')).toBeTruthy()
  })
})

// ── Step 8: Zoom sync ──────────────────────────────────────────

describe('WealthCompositionChart — zoom synchronization', () => {
  it('filters bars by visibleMinAge/visibleMaxAge', () => {
    const rows = makeRows(30, 35)
    const { container } = render(
      <WealthCompositionChart
        stackedRows={rows}
        currentAge={35}
        endAge={64}
        visibleMinAge={45}
        visibleMaxAge={55}
      />
    )

    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()

    // X-axis labels should only show ages within the visible range
    const textElements = svg!.querySelectorAll('text')
    const ageLabels = Array.from(textElements)
      .map(t => parseInt(t.textContent || '', 10))
      .filter(n => !isNaN(n) && n >= 30 && n <= 100) // filter to plausible age values

    for (const age of ageLabels) {
      expect(age).toBeGreaterThanOrEqual(45)
      expect(age).toBeLessThanOrEqual(55)
    }
  })

  it('uses full range when visibleMinAge/visibleMaxAge not provided', () => {
    const rows = makeRows(10, 35)
    const { container } = render(
      <WealthCompositionChart
        stackedRows={rows}
        currentAge={35}
        endAge={44}
      />
    )

    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()

    // Should render bars for the full range
    const rects = svg!.querySelectorAll('rect')
    expect(rects.length).toBeGreaterThan(0)
  })
})

// ── Step 9: Responsive height ──────────────────────────────────

describe('WealthCompositionChart — responsive', () => {
  it('uses mobile height (180) when containerW defaults < 768', () => {
    const { container } = render(
      <WealthCompositionChart
        stackedRows={makeRows(5, 35)}
        currentAge={35}
        endAge={39}
      />
    )

    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()

    const viewBox = svg!.getAttribute('viewBox')
    expect(viewBox).toBeTruthy()

    // Default containerW is 600 (< 768) → mobile height = 180
    const parts = viewBox!.split(/\s+/)
    const height = parseFloat(parts[3])
    expect(height).toBe(180)
  })

  it('viewBox width matches default container width (600)', () => {
    const { container } = render(
      <WealthCompositionChart
        stackedRows={makeRows(5, 35)}
        currentAge={35}
        endAge={39}
      />
    )

    const svg = container.querySelector('svg')
    const viewBox = svg!.getAttribute('viewBox')
    const parts = viewBox!.split(/\s+/)
    const width = parseFloat(parts[2])
    expect(width).toBe(600) // default containerW
  })
})

// ── Y-axis and debt rendering ──────────────────────────────────

describe('WealthCompositionChart — debt layer', () => {
  it('renders debt bars below zero line when schulden < 0', () => {
    const rows: StackedRow[] = [
      { age: 35, spaargeld: 10000, beleggingen: 50000, pensioen: 0, vastgoed: 0, overig: 0, schulden: -100000 },
      { age: 36, spaargeld: 12000, beleggingen: 55000, pensioen: 0, vastgoed: 0, overig: 0, schulden: -95000 },
    ]

    const { container } = render(
      <WealthCompositionChart
        stackedRows={rows}
        currentAge={35}
        endAge={36}
      />
    )

    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()

    // Should render debt bars (red rects)
    const rects = Array.from(svg!.querySelectorAll('rect'))
    const redRects = rects.filter(r => r.getAttribute('fill') === '#ef4444')
    expect(redRects.length).toBeGreaterThan(0)
  })

  it('renders SVG with correct structure when debts exist', () => {
    const rows: StackedRow[] = [
      { age: 35, spaargeld: 10000, beleggingen: 50000, pensioen: 0, vastgoed: 0, overig: 0, schulden: -50000 },
      { age: 36, spaargeld: 12000, beleggingen: 55000, pensioen: 0, vastgoed: 0, overig: 0, schulden: -45000 },
    ]

    const { container } = render(
      <WealthCompositionChart
        stackedRows={rows}
        currentAge={35}
        endAge={36}
      />
    )

    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()

    // With debts, we should have more SVG elements (zero line, debt bars)
    const lines = svg!.querySelectorAll('line')
    expect(lines.length).toBeGreaterThan(0) // grid lines + zero line
  })
})
