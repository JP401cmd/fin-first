import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render } from '@testing-library/react'
import { BudgetFavWidget } from './budget-fav-widget'
import { calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'

// Privacy default zichtbaar (bedragen niet gemaskeerd) — spiegelt holding-fav-widget.test.
const mockPrivacy = { masked: false }
vi.mock('@/lib/hooks/use-privacy', () => ({
  useMaskedAmounts: () => mockPrivacy,
}))

beforeEach(() => {
  mockPrivacy.masked = false
})

class MockObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.IntersectionObserver = MockObserver as unknown as typeof IntersectionObserver
global.ResizeObserver = MockObserver as unknown as typeof ResizeObserver

interface FavBudget {
  id: string
  name: string
  icon: string
  budgetType: string
  limit: number
  spent: number
}

function makeBudget(overrides: Partial<FavBudget> = {}): FavBudget {
  return {
    id: 'b1',
    name: 'Boodschappen',
    icon: '🛒',
    budgetType: 'expense',
    limit: 500,
    spent: 200,
    ...overrides,
  }
}

describe('BudgetFavWidget — vrijheidstijd (Geld is opgeslagen tijd)', () => {
  it('full: toont exact de canonieke vrijheidstijd van het restant', () => {
    const budget = makeBudget() // restant = 300
    const dailyExp = 100
    // Canonieke engine-uitvoer voor dezelfde input — de render mag hier niet van driften.
    const expected = formatFreedomTimeString(
      calculateFreedomTime(budget.limit - budget.spent, dailyExp),
      'short',
    )
    const { container } = render(<BudgetFavWidget size="full" budget={budget} dailyExp={dailyExp} />)
    expect(container.textContent ?? '').toContain(`≈ ${expected} vrijheid over`)
  })

  it('xl: toont limiet- én restant-vrijheidstijd plus bredere context', () => {
    const budget = makeBudget()
    const dailyExp = 100
    const expLimit = formatFreedomTimeString(calculateFreedomTime(budget.limit, dailyExp), 'short')
    const expRemaining = formatFreedomTimeString(
      calculateFreedomTime(budget.limit - budget.spent, dailyExp),
      'short',
    )
    const { container } = render(<BudgetFavWidget size="xl" budget={budget} dailyExp={dailyExp} />)
    const text = container.textContent ?? ''
    expect(text).toContain(`Budget ≈ ${expLimit} vrijheid`)
    expect(text).toContain(`nog ${expRemaining} over`)
    // XL benut de bredere strip: prognose + KPI's die de kleine tegels niet tonen.
    expect(text).toContain('Op dit tempo')
    expect(text).toContain('Resterende dagen')
    expect(text).toContain('Limiet')
  })

  it('geen vrijheidstijd-regel zonder dagtarief (mock-/empty-bundel)', () => {
    const { container } = render(<BudgetFavWidget size="xl" budget={makeBudget()} />)
    expect(container.textContent ?? '').not.toContain('vrijheid')
  })

  it('over budget: geen restant-vrijheidsregel (restant = 0)', () => {
    const budget = makeBudget({ spent: 600 }) // over de limiet van 500
    const { container } = render(<BudgetFavWidget size="full" budget={budget} dailyExp={100} />)
    expect(container.textContent ?? '').not.toContain('vrijheid over')
  })
})
