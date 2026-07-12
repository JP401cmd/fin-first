import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { SpaarquoteWidget } from './spaarquote-widget'
import { MOCK_DASHBOARD_DATA } from '@/lib/mock-dashboard-data'
import type { DashboardData } from './widget-renderer'

// Stuurbaar perspectief — default personal.
const mockPerspective = { perspective: 'personal' as string, partnerName: null as string | null }
vi.mock('@/components/app/perspective-provider', () => ({
  usePerspective: () => mockPerspective,
}))

beforeEach(() => {
  mockPerspective.perspective = 'personal'
  mockPerspective.partnerName = null
})

// jsdom kent geen ResizeObserver; WidgetShell gebruikt 'm bij full-size.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver

function makeData(overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    ...MOCK_DASHBOARD_DATA,
    // Deterministische historie in het verleden zodat de huidige maand nooit
    // gesnapshot is → de live 6m-quote wordt altijd als 'nu'-anker toegevoegd.
    savingsHistory: [
      { month: '2020-01', value: 20 },
      { month: '2020-02', value: 24 },
    ],
    monthlyIncome: 5200,
    monthlyExpenses: 3100,
    savingsRate6m: 27,
    monthlySavingsAmount: 1404, // 5200 × 27% — NIET income−expenses (=2100)
    savingsRateIsEstimate: false,
    monthlySavingsBudgetSpent: 0,
    ...overrides,
  }
}

describe('SpaarquoteWidget — consumeert canonieke bundel-velden (geen inline herberekening)', () => {
  it('eigen perspectief (full): toont savingsRate6m én het canonieke maandspaarbedrag, niet de oude income−expenses-som', () => {
    const { container } = render(<SpaarquoteWidget size="full" data={makeData()} />)
    // %-getal = data.savingsRate6m
    expect(container.textContent).toContain('27.0%')
    // €-bedrag = data.monthlySavingsAmount (op quote-grondslag), niet 2.100 (income−expenses)
    expect(container.textContent).toContain('1.404')
    expect(container.textContent).not.toContain('2.100')
  })

  it('F3 — delta komt uit de snapshot-serie (laatste snapshot 24% → nu-anker 27% = +3,0%), niet uit prevMonth-inkomsten', () => {
    const { container } = render(<SpaarquoteWidget size="full" data={makeData()} />)
    expect(container.textContent).toContain('3.0% t.o.v. vorige maand')
  })

  it('F4 — markeert een geschatte quote, en niet wanneer exact', () => {
    const est = render(<SpaarquoteWidget size="full" data={makeData({ savingsRateIsEstimate: true })} />)
    expect(est.container.textContent).toContain('geschat')

    const exact = render(<SpaarquoteWidget size="full" data={makeData({ savingsRateIsEstimate: false })} />)
    expect(exact.container.textContent).not.toContain('geschat')
  })

  it('F2 — huishoud-perspectief consumeert de override-spaarquote (41,5%), niet de eigen 27% of een inline (income−expenses)-formule', () => {
    mockPerspective.perspective = 'household'
    const data = makeData({
      householdOverrides: {
        netWorth: 500_000,
        totalAssets: 560_000,
        totalDebts: 60_000,
        monthlyExpenses: 5000,
        monthlyIncome: 8000,
        savingsRate: 41.5,      // canoniek via savingsRateFromAggregates
        monthlySavings: 3320,   // 8000 × 41,5% — dezelfde grondslag als de quote
      },
    })
    const { container } = render(<SpaarquoteWidget size="full" data={data} />)
    expect(container.textContent).toContain('41.5%')
    // Niet de eigen (persoonlijke) 6m-quote van 27%.
    expect(container.textContent).not.toContain('27.0%')
    // Consumeert het override-spaarbedrag, niet income−expenses (=3.000).
    expect(container.textContent).toContain('3.320')
    expect(container.textContent).not.toContain('3.000')
  })
})
