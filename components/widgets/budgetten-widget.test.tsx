import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BudgettenWidget, fittingRowPlan } from './budgetten-widget'
import type { DashboardData } from './widget-renderer'
import { MASKED_AMOUNT_PLACEHOLDER } from '@/lib/format'

// Stuurbare privacy-mock — default zichtbaar; per test op masked te zetten.
const mockPrivacy = { masked: false }
vi.mock('@/lib/hooks/use-privacy', () => ({
  useMaskedAmounts: () => mockPrivacy,
}))

beforeEach(() => {
  mockPrivacy.masked = false
})

// jsdom kent geen ResizeObserver; WidgetShell gebruikt 'm bij full-size scroll.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver

type TopBudget = DashboardData['topBudgets'][number]

function makeData(topBudgets: TopBudget[], overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    topBudgets,
    budgetingActive: true,
    monthlyExpenses: 3000,
    budgetTotals: {
      income:  { limit: 5000, spent: 5000 },
      expense: { limit: 3000, spent: 2500 },
      savings: { limit: 1000, spent: 800 },
      debt:    { limit: 400,  spent: 400 },
    },
    ...overrides,
  } as unknown as DashboardData
}

const B = (
  id: string,
  name: string,
  budgetType: TopBudget['budgetType'],
  limit: number,
  spent: number,
): TopBudget => ({ id, name, icon: 'Circle', budgetType, limit, spent })

describe('BudgettenWidget — top-N ranking', () => {
  it('sorteert op benuttingsgraad (over-budget bovenaan)', () => {
    const data = makeData([
      B('a', 'Laag', 'expense', 100, 50),      // 0.5
      B('b', 'Over', 'expense', 100, 130),     // 1.3
      B('c', 'Midden', 'expense', 100, 90),    // 0.9
    ])
    const { container } = render(<BudgettenWidget size="full" data={data} />)
    const names = Array.from(container.querySelectorAll('span.truncate')).map(n => n.textContent)
    expect(names).toEqual(['Over', 'Midden', 'Laag'])
  })

  it('quarter toont alleen de top-3 drukste budgetten', () => {
    const data = makeData([
      B('a', 'B-een', 'expense', 100, 95),
      B('b', 'B-twee', 'expense', 100, 80),
      B('c', 'B-drie', 'expense', 100, 60),
      B('d', 'B-vier', 'expense', 100, 40),
      B('e', 'B-vijf', 'expense', 100, 20),
    ])
    render(<BudgettenWidget size="quarter" data={data} />)
    expect(screen.getByText('B-een')).toBeInTheDocument()
    expect(screen.getByText('B-twee')).toBeInTheDocument()
    expect(screen.getByText('B-drie')).toBeInTheDocument()
    expect(screen.queryByText('B-vier')).not.toBeInTheDocument()
    expect(screen.queryByText('B-vijf')).not.toBeInTheDocument()
  })

  it('half toont de top-4', () => {
    const data = makeData([
      B('a', 'H1', 'expense', 100, 95),
      B('b', 'H2', 'expense', 100, 80),
      B('c', 'H3', 'expense', 100, 60),
      B('d', 'H4', 'expense', 100, 40),
      B('e', 'H5', 'expense', 100, 20),
    ])
    render(<BudgettenWidget size="half" data={data} />)
    expect(screen.getByText('H4')).toBeInTheDocument()
    expect(screen.queryByText('H5')).not.toBeInTheDocument()
  })
})

describe('fittingRowPlan — grootte-bewuste afkapping (geen halve rij)', () => {
  it('valt terug op desiredN zolang niet gemeten (capacity null)', () => {
    expect(fittingRowPlan(null, 4, 5)).toEqual({ visible: 4, hidden: 1, showMore: false })
    expect(fittingRowPlan(null, 4, 3)).toEqual({ visible: 3, hidden: 0, showMore: false })
  })

  it('kapt af op de gemeten capaciteit zonder "+N meer" te offeren', () => {
    // Er passen maar 2 rijen; 5 budgetten → toon 2, kap de rest netjes af.
    expect(fittingRowPlan(2, 4, 5)).toEqual({ visible: 2, hidden: 3, showMore: false })
  })

  it('toont "+N meer" alleen bij een écht vrije rij-slot', () => {
    // Capaciteit 5, desiredN 4, 6 budgetten → 4 rijen + vrije slot ⇒ "+2 meer".
    expect(fittingRowPlan(5, 4, 6)).toEqual({ visible: 4, hidden: 2, showMore: true })
  })

  it('geen "+N meer" als alles zichtbaar is', () => {
    expect(fittingRowPlan(3, 4, 2)).toEqual({ visible: 2, hidden: 0, showMore: false })
  })

  it('overschrijdt nooit desiredN, ook bij veel ruimte', () => {
    expect(fittingRowPlan(10, 4, 8).visible).toBe(4)
  })
})

describe('BudgettenWidget — edge cases', () => {
  it('budget zonder limiet (limit 0) crasht niet en toont — als percentage', () => {
    const data = makeData([
      B('a', 'Geen limiet', 'expense', 0, 500),
      B('b', 'Met limiet', 'expense', 100, 50),
    ])
    render(<BudgettenWidget size="quarter" data={data} />)
    // "Met limiet" (util 0.5) staat boven "Geen limiet" (util 0)
    expect(screen.getByText('Geen limiet')).toBeInTheDocument()
    expect(screen.getByText('Met limiet')).toBeInTheDocument()
    // Zonder data toont de rij een em-dash i.p.v. een percentage.
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('over-budget inkomen wordt positief (groen) geduid via isOverPositive', () => {
    const data = makeData([B('a', 'Salaris', 'income', 1000, 1200)])
    const { container } = render(<BudgettenWidget size="half" data={data} />)
    // rich-rij toont €besteed/€limiet; over-positief ⇒ text-positive, niet text-negative.
    const positive = container.querySelector('.text-positive')
    expect(positive).not.toBeNull()
    expect(container.querySelector('.text-negative')).toBeNull()
  })

  it('over-budget uitgave wordt negatief (rood) geduid', () => {
    const data = makeData([B('a', 'Boodschappen', 'expense', 100, 150)])
    const { container } = render(<BudgettenWidget size="half" data={data} />)
    expect(container.querySelector('.text-negative')).not.toBeNull()
  })
})

describe('BudgettenWidget — states', () => {
  it('toont first-use empty state zonder geconfigureerde budgetten', () => {
    const data = makeData([])
    render(<BudgettenWidget size="half" data={data} />)
    expect(screen.getByText('Nog geen budgetten')).toBeInTheDocument()
  })

  it('empty-state met href produceert GEEN geneste anchors (hydration-safe)', () => {
    // Regressie: WidgetShell kreeg href (whole-card link) én de WidgetEmpty-CTA
    // rendert een eigen <Link> → <a> in <a> = ongeldige HTML + hydration-error.
    // In de empty-state hoort de CTA de ENIGE, intentionele navigatie te zijn.
    const data = makeData([])
    const { container } = render(
      <BudgettenWidget size="half" data={data} href="/overzicht/cashflow/budget" />,
    )
    expect(container.querySelectorAll('a a').length).toBe(0)
    const anchors = container.querySelectorAll('a')
    expect(anchors.length).toBe(1)
    expect(anchors[0]?.getAttribute('href')).toBe('/core/budgets/new')
  })

  it('toont activatie-hint wanneer budgetteren niet actief is', () => {
    const data = makeData([B('a', 'Boodschappen', 'expense', 100, 50)], { budgetingActive: false })
    render(<BudgettenWidget size="half" data={data} />)
    expect(screen.getByText('Activeer budgetteren')).toBeInTheDocument()
  })

  it('full: netto-maandbalans (payoff) blijft zichtbaar bij >=7 budgetten', () => {
    // Regressie W1: op 'full' werd het maandbalans-blok mee de scroll in geduwd
    // en onder de vouw afgekapt. Het staat nu als gepinde voet (shrink-0) buiten
    // de fit-lijst en MOET altijd in beeld zijn — ook met meer dan 7 budgetten.
    const many = Array.from({ length: 9 }, (_, i) =>
      B(`b${i}`, `Budget-${i}`, 'expense', 100, 90 - i * 5),
    )
    render(<BudgettenWidget size="full" data={makeData(many)} />)
    expect(screen.getByText('Netto maandbalans')).toBeInTheDocument()
    // De top-rij (drukste budget) staat er ook; geen lege/afgekapte lijst.
    expect(screen.getByText('Budget-0')).toBeInTheDocument()
  })

  it('mini toont een op-schema-telling', () => {
    const data = makeData([
      B('a', 'X', 'expense', 100, 50),   // op koers
      B('b', 'Y', 'expense', 100, 150),  // over budget
    ])
    render(<BudgettenWidget size="mini" data={data} />)
    expect(screen.getByText('1/2 op schema')).toBeInTheDocument()
  })
})

describe('BudgettenWidget — masking', () => {
  it('maskeert bedragen wanneer privacy actief is', () => {
    mockPrivacy.masked = true
    const data = makeData([B('a', 'Boodschappen', 'expense', 600, 485)])
    render(<BudgettenWidget size="full" data={data} />)
    expect(screen.getAllByText(MASKED_AMOUNT_PLACEHOLDER).length).toBeGreaterThan(0)
  })
})
