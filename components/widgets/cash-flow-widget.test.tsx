import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CashFlowWidget } from './cash-flow-widget'
import type { DashboardData } from './widget-renderer'

// Privacy default zichtbaar (bedragen niet gemaskeerd) — spiegelt budgetten-widget.test.
const mockPrivacy = { masked: false }
vi.mock('@/lib/hooks/use-privacy', () => ({
  useMaskedAmounts: () => mockPrivacy,
}))

// Perspectief default 'personal' zodat de vorige-maand-vergelijking (eigen historie) rendert.
vi.mock('@/components/app/perspective-provider', () => ({
  usePerspective: () => ({ perspective: 'personal', partnerName: null }),
}))

// Animatie geforceerd "in view" zodat de balken hun hoogte/kleur tonen.
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
    monthlyIncome: 5500,
    monthlyExpenses: 3600,
    dailyExpenseRate: 120,
    prevMonthIncome: 5000,
    prevMonthExpenses: 3000,
    householdOverrides: null,
    partnerOverrides: null,
    budgetTotals: {
      income:  { limit: 5500, spent: 5500 },
      expense: { limit: 3600, spent: 3600 },
      savings: { limit: 1000, spent: 800 },
      debt:    { limit: 400,  spent: 400 },
    },
    ...overrides,
  } as unknown as DashboardData
}

describe('CashFlowWidget — mojibake-regressie (fix #1)', () => {
  it('toont een echt minteken tussen inkomen en uitgaven, geen garbage', () => {
    const { container } = render(<CashFlowWidget size="full" data={makeData()} />)
    // Het herstelde U+2212 minteken staat in de samenvattingsregel.
    expect(screen.getByText('−')).toBeInTheDocument()
    // Geen enkele mojibake-glyph mag terugkeren.
    for (const glyph of ['ˆ', '’', '�', 'ƒ']) {
      expect(container.textContent ?? '').not.toContain(glyph)
    }
  })
})

describe('CashFlowWidget — kleur-semantiek vergelijkingsgrafiek (fix #2)', () => {
  it('Inkomen omhoog = positief (groen), Uitgaven omhoog = negatief (rood)', () => {
    // income 5500 vs 5000 = +10% · expenses 3600 vs 3000 = +20% · netto 1900 vs 2000 = -5%
    render(<CashFlowWidget size="full" data={makeData()} />)

    // Inkomen: méér inkomen wordt groen geduid (higherIsBetter).
    expect(screen.getByText('+10%').className).toContain('text-positive')
    // Uitgaven: méér uitgaven blijft rood (default gedrag).
    expect(screen.getByText('+20%').className).toContain('text-negative')
    // Netto: lager netto wordt rood geduid (higherIsBetter, delta < 0).
    expect(screen.getByText('-5%').className).toContain('text-negative')
  })
})

describe('CashFlowWidget — tekortmaand zichtbaar (fix #3)', () => {
  it('negatieve netto krijgt een zichtbare, rood getinte balk i.p.v. klem op 0', () => {
    // cashFlow = 3000 - 4000 = -1000 (tekort); prevCashFlow = 3000 - 2500 = +500.
    const data = makeData({
      monthlyIncome: 3000,
      monthlyExpenses: 4000,
      prevMonthIncome: 3000,
      prevMonthExpenses: 2500,
    })
    const { container } = render(<CashFlowWidget size="full" data={data} />)

    // De negatieve netto-balk tekent met de negatief-kleur (inline style-var), niet met savings.
    const negativeBar = container.querySelector('[style*="--color-negative"]')
    expect(negativeBar).not.toBeNull()
    // En de balk heeft een minimale hoogte, dus een tekortmaand blijft zichtbaar.
    expect((negativeBar as HTMLElement).style.minHeight).toBe('2px')
  })
})
