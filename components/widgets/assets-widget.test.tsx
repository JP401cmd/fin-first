import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render } from '@testing-library/react'
import { AssetsWidget } from './assets-widget'
import type { DashboardData } from './widget-renderer'

// Privacy default zichtbaar (bedragen niet gemaskeerd) — spiegelt netto-vermogen-widget.test.
const mockPrivacy = { masked: false }
vi.mock('@/lib/hooks/use-privacy', () => ({
  useMaskedAmounts: () => mockPrivacy,
}))

// Perspectief instelbaar per test: default 'personal'.
const mockPerspective: { perspective: 'personal' | 'household' | 'partner'; partnerName: string | null } = {
  perspective: 'personal',
  partnerName: null,
}
vi.mock('@/components/app/perspective-provider', () => ({
  usePerspective: () => mockPerspective,
}))

beforeEach(() => {
  mockPrivacy.masked = false
  mockPerspective.perspective = 'personal'
  mockPerspective.partnerName = null
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
      { type: 'stocks', value: 60000, expectedReturn: undefined },
      { type: 'real_estate', value: 30000, expectedReturn: undefined },
      { type: 'cash', value: 10000, expectedReturn: undefined },
    ],
    householdOverrides: null,
    partnerOverrides: null,
    ...overrides,
  } as unknown as DashboardData
}

describe('AssetsWidget — vrijheidstijd-grondslag (bevinding 3)', () => {
  it('framet vrijheidstijd expliciet als bruto bezit ("vrijheid in bezit")', () => {
    const { container } = render(<AssetsWidget size="full" data={makeData()} />)
    const text = container.textContent ?? ''
    expect(text).toContain('vrijheid in bezit')
  })
})

describe('AssetsWidget — allocatie-balk a11y (bevinding 2)', () => {
  it('quarter-size: geeft de balk role="img" + samenvattend aria-label met de verdeling', () => {
    const { container } = render(<AssetsWidget size="quarter" data={makeData()} />)
    const bar = container.querySelector('[role="img"]')
    expect(bar).not.toBeNull()
    const label = bar?.getAttribute('aria-label') ?? ''
    // Grootste segment eerst, percentages (geen bedragen → geen mask-lek naar AT).
    expect(label).toContain('Vermogensverdeling:')
    expect(label).toContain('60%')
    expect(label).toContain('30%')
    // Segmenten zelf zijn decoratief.
    expect(bar?.querySelector('[aria-hidden="true"]')).not.toBeNull()
  })
})

describe('AssetsWidget — perspectief (Optie A, bevinding 1)', () => {
  it('huishoudperspectief: headline toont het SCALAIRE huishoud-totaal + badge, geen persoonlijke breakdown', () => {
    mockPerspective.perspective = 'household'
    const { container } = render(
      <AssetsWidget
        size="full"
        data={makeData({
          householdOverrides: {
            netWorth: 250000,
            totalAssets: 260000,
            totalDebts: 10000,
            monthlyExpenses: 4500,
            monthlyIncome: 7000,
            savingsRate: 0,
            monthlySavings: 0,
          },
        } as Partial<DashboardData>)}
      />,
    )
    const text = container.textContent ?? ''
    // Scalair huishoud-totaal beweegt mee (€ 260.000), niet het persoonlijke €100.000.
    expect(text).toContain('260.000')
    expect(text).not.toContain('100.000')
    expect(text).toContain('Huishouden')
    // Persoonlijke breakdown (ongerealiseerde winst, allocatie-balk) verdwijnt.
    expect(text).not.toContain('Ongerealiseerde winst')
    expect(container.querySelector('[role="img"]')).toBeNull()
  })

  it('partnerperspectief: kicker en badge tonen de partnernaam', () => {
    mockPerspective.perspective = 'partner'
    mockPerspective.partnerName = 'Sam'
    const { container } = render(
      <AssetsWidget
        size="quarter"
        data={makeData({
          partnerOverrides: {
            netWorth: 50000,
            totalAssets: 55000,
            totalDebts: 5000,
            monthlyExpenses: 2500,
            monthlyIncome: 3500,
            savingsRate: 0,
            monthlySavings: 0,
          },
        } as Partial<DashboardData>)}
      />,
    )
    const text = container.textContent ?? ''
    expect(text).toContain('Sam')
    expect(text).toContain('55.000')
  })
})
