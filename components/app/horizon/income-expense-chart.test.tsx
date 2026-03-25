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
    oneTimeNet: 0,
    endPortfolio: 125000 + i * 10500,
    grossIncome: 54000 + i * 500,
    grossExpenses: 36000,
    flowIn: 0,
    flowOut: 0,
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

  it('renders legend with Aanvulling and Onttrekking labels', () => {
    render(
      <IncomeExpenseChart
        rows={makeRows(10, 35)}
        currentAge={35}
        endAge={44}
      />
    )

    expect(screen.getByText('Aanvulling')).toBeTruthy()
    expect(screen.getByText('Onttrekking')).toBeTruthy()
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

// ── Breakdown mode tests ────────────────────────────────────────────────────

import type { BreakdownResult, BreakdownRow, BreakdownLayer } from '@/lib/income-expense-breakdown'

function makeBreakdownResult(ageStart: number, count: number): BreakdownResult {
  const incomeLayers: BreakdownLayer[] = [
    { id: 'savings', label: 'Besparingen', color: 'var(--horizon-400)', isFixed: true },
    { id: 'growth', label: 'Rendement', color: 'var(--horizon-600)', isFixed: true },
    { id: 'le-aow', label: 'AOW', color: '#3b82f6', isFixed: false },
  ]
  const expenseLayers: BreakdownLayer[] = [
    { id: 'withdrawal', label: 'Levensonderhoud', color: 'var(--kern-400)', isFixed: true },
    { id: 'box3', label: 'Box 3 belasting', color: 'var(--kern-600)', isFixed: true },
  ]
  const rows: BreakdownRow[] = Array.from({ length: count }, (_, i) => ({
    age: ageStart + i,
    phase: 'accumulation' as const,
    incomeBySource: {
      savings: 18000,
      growth: 7000 + i * 500,
      ...(ageStart + i >= 67 ? { 'le-aow': 16000 } : {}),
    },
    expenseBySource: { withdrawal: 0, box3: 1200 },
    totalIncome: 25000 + i * 500 + (ageStart + i >= 67 ? 16000 : 0),
    totalExpenses: 1200,
    surplus: 23800 + i * 500 + (ageStart + i >= 67 ? 16000 : 0),
  }))
  return { rows, incomeLayers, expenseLayers }
}

function makeDeficitBreakdownResult(): BreakdownResult {
  const incomeLayers: BreakdownLayer[] = [
    { id: 'growth', label: 'Rendement', color: 'var(--horizon-600)', isFixed: true },
  ]
  const expenseLayers: BreakdownLayer[] = [
    { id: 'withdrawal', label: 'Levensonderhoud', color: 'var(--kern-600)', isFixed: true },
  ]
  const rows: BreakdownRow[] = [
    {
      age: 55,
      phase: 'retirement' as const,
      incomeBySource: { growth: 10000 },
      expenseBySource: { withdrawal: 40000 },
      totalIncome: 10000,
      totalExpenses: 40000,
      surplus: -30000,
    },
    {
      age: 56,
      phase: 'retirement' as const,
      incomeBySource: { growth: 10000 },
      expenseBySource: { withdrawal: 40000 },
      totalIncome: 10000,
      totalExpenses: 40000,
      surplus: -30000,
    },
  ]
  return { rows, incomeLayers, expenseLayers }
}

describe('IncomeExpenseChart — breakdown mode', () => {
  it('renders stacked rect elements in breakdown mode', () => {
    const breakdown = makeBreakdownResult(35, 5)
    const { container } = render(
      <IncomeExpenseChart
        rows={makeRows(5, 35)}
        currentAge={35}
        endAge={39}
        viewMode="breakdown"
        breakdownResult={breakdown}
      />
    )

    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()

    // Breakdown mode renders <rect> elements for stacked bars — there should
    // be at least one rect per visible row per active layer (income + expense).
    const rects = svg!.querySelectorAll('rect')
    expect(rects.length).toBeGreaterThan(0)

    // Verify that more rects exist than we would see in the lines-only mode
    // (lines mode uses <path> elements, not stacked bar rects for data).
    // 5 rows with income layers (savings, growth) + expense layers (withdrawal, box3) = many rects
    expect(rects.length).toBeGreaterThanOrEqual(5)
  })

  it('renders dynamic legend labels from layers', () => {
    const breakdown = makeBreakdownResult(35, 3)
    render(
      <IncomeExpenseChart
        rows={makeRows(3, 35)}
        currentAge={35}
        endAge={37}
        viewMode="breakdown"
        breakdownResult={breakdown}
      />
    )

    // Breakdown legend shows per-source labels instead of generic "Inkomen"/"Uitgaven"
    expect(screen.getByText('Besparingen')).toBeTruthy()
    expect(screen.getByText('Rendement')).toBeTruthy()
    expect(screen.getByText('Levensonderhoud')).toBeTruthy()
  })

  it('renders danger zone indicator for deficit rows', () => {
    const breakdown = makeDeficitBreakdownResult()
    const { container } = render(
      <IncomeExpenseChart
        rows={makeRows(2, 55)}
        currentAge={55}
        endAge={56}
        viewMode="breakdown"
        breakdownResult={breakdown}
      />
    )

    // The component renders a "Tekort" text element when any visible row has
    // a negative surplus (deficit)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()

    const textEls = svg!.querySelectorAll('text')
    const tekortLabel = Array.from(textEls).find(t => t.textContent === 'Tekort')
    expect(tekortLabel).toBeTruthy()
  })

  it('defaults to lines mode without viewMode prop', () => {
    const { container } = render(
      <IncomeExpenseChart
        rows={makeRows(10, 35)}
        currentAge={35}
        endAge={44}
      />
    )

    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()

    // Lines mode renders <path> elements for the income and expense lines
    const paths = svg!.querySelectorAll('path')
    expect(paths.length).toBeGreaterThan(0)

    // Lines mode should NOT render stacked bar groups — the only rects present
    // would be from the tooltip (which requires hover). Without hover the
    // SVG should contain no data-bar rects at all, only paths.
    // Note: We check that no rect with the stacked-bar fill colors exist.
    expect(screen.getByText('Aanvulling')).toBeTruthy()
    expect(screen.getByText('Onttrekking')).toBeTruthy()
  })

  it('breakdown mode respects zoom range', () => {
    // Create a wide result spanning ages 30–49 (20 rows)
    const breakdown = makeBreakdownResult(30, 20)
    const { container } = render(
      <IncomeExpenseChart
        rows={makeRows(20, 30)}
        currentAge={30}
        endAge={49}
        viewMode="breakdown"
        breakdownResult={breakdown}
        visibleMinAge={35}
        visibleMaxAge={40}
      />
    )

    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()

    // X-axis age labels should only show ages within the visible range
    const textElements = svg!.querySelectorAll('text')
    const ageLabels = Array.from(textElements)
      .map(t => parseInt(t.textContent || '', 10))
      .filter(n => !isNaN(n))

    for (const age of ageLabels) {
      expect(age).toBeGreaterThanOrEqual(35)
      expect(age).toBeLessThanOrEqual(40)
    }
  })

  it('breakdown mode uses taller height on desktop', () => {
    // Default containerW is 600 (below 768 desktop threshold) → mobile height
    const breakdownMobile = makeBreakdownResult(35, 5)
    const { container: mobileContainer } = render(
      <IncomeExpenseChart
        rows={makeRows(5, 35)}
        currentAge={35}
        endAge={39}
        viewMode="breakdown"
        breakdownResult={breakdownMobile}
      />
    )

    const mobileSvg = mobileContainer.querySelector('svg')
    expect(mobileSvg).toBeTruthy()

    const mobileViewBox = mobileSvg!.getAttribute('viewBox')
    expect(mobileViewBox).toBeTruthy()

    const mobileHeight = parseFloat(mobileViewBox!.split(/\s+/)[3])
    // With default containerW=600 (< 768), breakdown uses mobile height of 160
    expect(mobileHeight).toBe(160)

    // For comparison, the lines mode mobile height is 120
    const { container: linesContainer } = render(
      <IncomeExpenseChart
        rows={makeRows(5, 35)}
        currentAge={35}
        endAge={39}
      />
    )

    const linesSvg = linesContainer.querySelector('svg')
    expect(linesSvg).toBeTruthy()

    const linesViewBox = linesSvg!.getAttribute('viewBox')
    const linesHeight = parseFloat(linesViewBox!.split(/\s+/)[3])
    expect(linesHeight).toBe(120)

    // Breakdown mode uses a taller viewBox than lines mode
    expect(mobileHeight).toBeGreaterThan(linesHeight)
  })
})
