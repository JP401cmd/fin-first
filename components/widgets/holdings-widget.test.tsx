import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render } from '@testing-library/react'
import { HoldingsWidget } from './holdings-widget'
import type { DashboardData } from './widget-renderer'

// Privacy default zichtbaar (bedragen niet gemaskeerd) — spiegelt assets-widget.test.
const mockPrivacy = { masked: false }
vi.mock('@/lib/hooks/use-privacy', () => ({
  useMaskedAmounts: () => mockPrivacy,
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
    totalAssets: 100000,
    totalPurchaseValue: 80000,
    monthlyContributions: 500,
    monthlyExpenses: 3000,
    dailyExpenseRate: 100,
    assetsByType: [
      // Belegd: waarde 60k, aankoopwaarde 50k → +20% werkelijk rendement.
      { type: 'investment', value: 60000, purchaseValue: 50000, expectedReturn: 7 },
      // Cash telt niet mee in de beleggingssubset.
      { type: 'cash', value: 40000, purchaseValue: 40000, expectedReturn: 0 },
    ],
    householdOverrides: null,
    partnerOverrides: null,
    ...overrides,
  } as unknown as DashboardData
}

describe('HoldingsWidget — werkelijk rendement (Q3: vervangt de expected_return-aanname)', () => {
  it('full-size: toont het werkelijke rendement (waarde − aankoopwaarde), niet "Verwacht"', () => {
    const { container } = render(<HoldingsWidget size="full" data={makeData()} />)
    const text = container.textContent ?? ''
    // Werkelijk rendement = (60.000 − 50.000) / 50.000 = +20,0%
    expect(text).toContain('Rendement')
    expect(text).toContain('+20.0%')
    // De aanname-framing is verdwenen.
    expect(text).not.toContain('Verwacht')
  })

  it('quarter-size: toont het werkelijke rendement-percentage', () => {
    const { container } = render(<HoldingsWidget size="quarter" data={makeData()} />)
    const text = container.textContent ?? ''
    expect(text).toContain('Rendement')
    expect(text).toContain('+20.0%')
    expect(text).not.toContain('Verwacht')
  })

  it('toont geen rendement-regel als er geen aankoopwaarde bekend is (deel-door-nul-guard)', () => {
    const data = makeData({
      assetsByType: [
        { type: 'investment', value: 60000, purchaseValue: 0, expectedReturn: 7 },
      ],
    } as unknown as Partial<DashboardData>)
    const { container } = render(<HoldingsWidget size="full" data={data} />)
    const text = container.textContent ?? ''
    expect(text).not.toContain('Rendement')
    expect(text).not.toContain('Verwacht')
  })
})
