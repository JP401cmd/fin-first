import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render } from '@testing-library/react'
import { NettoVermogenWidget } from './netto-vermogen-widget'
import type { DashboardData } from './widget-renderer'

// Privacy default zichtbaar (bedragen niet gemaskeerd) — spiegelt cash-flow-widget.test.
const mockPrivacy = { masked: false }
vi.mock('@/lib/hooks/use-privacy', () => ({
  useMaskedAmounts: () => mockPrivacy,
}))

// Perspectief default 'personal' zodat de MoM-vergelijking (eigen historie) rendert.
vi.mock('@/components/app/perspective-provider', () => ({
  usePerspective: () => ({ perspective: 'personal', partnerName: null }),
}))

// Animatie geforceerd "in view" zodat de sparkline zijn paden/labels tekent.
vi.mock('@/lib/hooks/use-in-view-animation', () => ({
  useInViewAnimation: () => ({ ref: { current: null }, hasEntered: true, animationComplete: true }),
}))

beforeEach(() => {
  mockPrivacy.masked = false
})

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver

function makeData(overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    netWorth: 300000,
    monthlyIncome: 5500,
    monthlyExpenses: 3600,
    dailyExpenseRate: 100,
    monthlyContributions: 1000,
    totalAssets: 320000,
    totalDebts: 20000,
    // Laatste history-rij == live netWorth: dit is exact de current-day-snapshot die de
    // oude, lokale delta-som ~€0 gaf. De widget hoort dit te NEGEREN en netWorthDelta te lezen.
    netWorthHistory: [{ value: 300000 }, { value: 300000 }],
    netWorthDelta: 2500,
    householdOverrides: null,
    partnerOverrides: null,
    ...overrides,
  } as unknown as DashboardData
}

describe('NettoVermogenWidget — mojibake-regressie (fix #1)', () => {
  const MOJIBAKE = ['‰ˆ', '–²', '–¼', 'Î', 'ˆ', '�']

  it('full-size: herstelde ≈ en Δ, geen mojibake', () => {
    const { container } = render(<NettoVermogenWidget size="full" data={makeData()} />)
    const text = container.textContent ?? ''
    expect(text).toContain('≈')            // vrijheids-benadering
    expect(text).toContain('Δ deze maand') // full-size deltarij
    for (const glyph of MOJIBAKE) expect(text).not.toContain(glyph)
  })

  it('half-size: herstelde deltapijl ▲, geen mojibake', () => {
    const { container } = render(<NettoVermogenWidget size="half" data={makeData()} />)
    const text = container.textContent ?? ''
    expect(text).toContain('▲') // positieve deltapijl (aria-hidden, puur visueel)
    for (const glyph of MOJIBAKE) expect(text).not.toContain(glyph)
  })
})

describe('NettoVermogenWidget — MoM delta consumeert netWorthDelta (fix #2)', () => {
  it('toont de canonieke delta (≠ €0) ook als de laatste history-rij == live netWorth', () => {
    // Oude lokale som: netWorth − history[last] = 300000 − 300000 = 0 → "0.0%".
    // Nieuwe som: data.netWorthDelta = +2500, prevValue = 297500 → +0.8%.
    const { container } = render(<NettoVermogenWidget size="full" data={makeData()} />)
    const text = container.textContent ?? ''
    expect(text).toContain('+0.8%')
    expect(text).not.toContain('0.0%')
  })

  it('rendert geen deltarij als er geen canonieke delta is (netWorthDelta = null)', () => {
    const { container } = render(
      <NettoVermogenWidget size="full" data={makeData({ netWorthDelta: null })} />,
    )
    expect(container.textContent ?? '').not.toContain('Δ deze maand')
  })
})

describe('NettoVermogenWidget — negatief vermogen (fix #4)', () => {
  it('framet een tekort als "vrijheid terug te kopen", niet als positieve vrijheid', () => {
    const { container } = render(
      <NettoVermogenWidget
        size="full"
        data={makeData({ netWorth: -5000, netWorthHistory: [], netWorthDelta: null })}
      />,
    )
    const text = container.textContent ?? ''
    expect(text).toContain('vrijheid terug te kopen')
  })
})
