/**
 * Regression: money rendered inside an SVG <text> must be PLAIN TEXT, never an
 * HTML element such as <span> (which is what <MaskedAmount> emits).
 *
 * Background — hydration bug on /core/assets/holdings:
 *   <text>{<MaskedAmount .../>}</text> places an HTML <span> inside an SVG
 *   <text> element. That is invalid foreign-content nesting: the browser's
 *   HTML parser handles it differently from React's SSR serialization, so the
 *   hydrated DOM no longer matches the server markup → "Hydration failed".
 *
 * The fix renders the privacy-masked amount as a string via
 * formatMaskedCurrency(value, masked) directly inside the <text>. These tests
 * assert the structural invariant across every chart that shows amounts in an
 * SVG centre/label: NO <span> (or other HTML) may be a descendant of <text>.
 *
 * They are red against the pre-fix code (a <span> lived inside <text>) and
 * green after it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { PrivacyProvider } from '@/lib/hooks/use-privacy'
import PortfolioAllocationVisualization from '@/components/app/portfolio-allocation-chart'
import { CashFlowForecastChart, type ForecastPoint } from '@/components/app/cashflow-forecast-chart'
import { BudgetDonut } from '@/components/app/budget-donut'
import type { HoldingForAllocation } from '@/lib/portfolio-allocation'

// Force charts into their "entered + animation complete" state so build-in
// animations are done and hover handlers are wired (the cashflow value label
// is gated behind animationComplete + hover).
vi.mock('@/lib/hooks/use-in-view-animation', () => ({
  useInViewAnimation: () => ({ ref: { current: null }, hasEntered: true, animationComplete: true }),
}))

function renderInProvider(ui: React.ReactNode) {
  return render(<PrivacyProvider>{ui}</PrivacyProvider>)
}

/** The core invariant: no HTML element may live inside an SVG <text>. */
function expectNoHtmlInsideSvgText(container: HTMLElement) {
  expect(container.querySelectorAll('svg text span')).toHaveLength(0)
  expect(container.querySelectorAll('svg text div')).toHaveLength(0)
  expect(container.querySelectorAll('svg text p')).toHaveLength(0)
}

beforeEach(() => window.localStorage.clear())
afterEach(() => window.localStorage.clear())

describe('SVG <text> never wraps HTML (hydration-safe amounts)', () => {
  it('PortfolioAllocationVisualization renders the donut total as plain SVG text', () => {
    const holdings: HoldingForAllocation[] = [
      { id: 'a', name: 'VWRL', ticker: 'VWRL', value: 30000, asset_class: 'aandelen' },
      { id: 'b', name: 'Cash', ticker: null, value: 18804, asset_class: 'cash' },
    ]
    const { container } = renderInProvider(
      <PortfolioAllocationVisualization holdings={holdings} totalValue={48804} />,
    )

    // The donut centre <text> exists and carries the formatted total as text.
    const donut = container.querySelector('[data-testid="allocation-donut-chart"]')
    expect(donut).not.toBeNull()
    expect(donut?.textContent).toMatch(/48\.804/)

    expectNoHtmlInsideSvgText(container)
  })

  it('CashFlowForecastChart renders the hovered point balance as plain SVG text', () => {
    const forecast: ForecastPoint[] = [
      { month: '2026-06', label: 'jun', projectedBalance: 5000, income: 3000, expenses: 2500, isCurrentMonth: true },
      { month: '2026-07', label: 'jul', projectedBalance: 5500, income: 3000, expenses: 2500, isCurrentMonth: false },
      { month: '2026-08', label: 'aug', projectedBalance: 6000, income: 3000, expenses: 2500, isCurrentMonth: false },
    ]
    const { container } = renderInProvider(
      <CashFlowForecastChart forecast={forecast} alerts={[]} currentBalance={5000} />,
    )

    // Hover the first data point to reveal its value label (the bugged <text>).
    const svg = container.querySelector('[data-testid="cashflow-forecast-svg"]')!
    fireEvent.mouseEnter(svg.querySelectorAll('circle')[0])

    // Confirm the hover label actually rendered (otherwise the test would not
    // exercise the bug and would be a false green). The "5.000" form is unique
    // to the label — grid labels use formatEurShort ("€5.0k").
    expect(svg.textContent).toMatch(/5\.000/)

    expectNoHtmlInsideSvgText(container)
  })

  it('BudgetDonut renders the centre total as plain SVG text', () => {
    const groups = [
      {
        id: 'g1',
        name: 'Boodschappen',
        icon: null,
        budget_type: 'expense',
        default_limit: 600,
        children: [],
      },
    ] as unknown as Parameters<typeof BudgetDonut>[0]['groups']
    const spending = { g1: 420 }

    const { container } = renderInProvider(
      <BudgetDonut groups={groups} spending={spending} onNavigate={() => {}} />,
    )

    // Centre default content shows the spent total (420) as plain text. Pick the
    // donut svg (the one carrying <text>), not a Lucide icon svg.
    const donutSvg = [...container.querySelectorAll('svg')].find((s) => s.querySelector('text'))
    expect(donutSvg?.textContent).toMatch(/420/)

    expectNoHtmlInsideSvgText(container)
  })
})
