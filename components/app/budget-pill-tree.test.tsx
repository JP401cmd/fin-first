import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { BudgetPillTree } from './budget-pill-tree'
import { computeBarSegments, getTypeColors } from './budget-shared'
import type { Budget, BudgetWithChildren } from '@/lib/budget-data'

/* ── Test-fixtures ─────────────────────────────────────────────────────── */

function makeBudget(over: Partial<Budget> & { id: string; name: string }): Budget {
  return {
    user_id: 'u1',
    parent_id: null,
    slug: null,
    icon: 'ShoppingCart',
    description: null,
    default_limit: 100,
    budget_type: 'expense',
    interval: 'monthly',
    rollover_type: 'reset',
    limit_type: 'soft',
    alert_threshold: 80,
    max_single_transaction_amount: 0,
    is_essential: false,
    priority_score: 0,
    is_inflation_indexed: false,
    sort_order: 0,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    ownership: 'personal',
    household_id: null,
    goal_type: null,
    goal_amount: null,
    goal_date: null,
    goal_frequency: null,
    is_favorite: false,
    ...over,
  }
}

function makeGroup(
  parent: Partial<Budget> & { id: string; name: string },
  children: Array<Partial<Budget> & { id: string; name: string }>,
): BudgetWithChildren {
  return {
    ...makeBudget(parent),
    children: children.map((c) => makeBudget({ ...c, parent_id: parent.id })),
  }
}

/* ── Tests ─────────────────────────────────────────────────────────────── */

describe('BudgetPillTree', () => {
  it('rendert parent-pil en toont children pas na uitklappen', () => {
    const groups = [
      makeGroup(
        { id: 'p1', name: 'Boodschappen' },
        [
          { id: 'c1', name: 'Supermarkt' },
          { id: 'c2', name: 'Markt' },
        ],
      ),
    ]
    const spending = { c1: 40, c2: 20 }
    const beschikbaarMap = { c1: 60, c2: 80 }

    const { getByRole, queryByText, getByText } = render(
      <BudgetPillTree
        groups={groups}
        spending={spending}
        budgetType="expense"
        onNavigate={vi.fn()}
        beschikbaarMap={beschikbaarMap}
      />,
    )

    // Parent zichtbaar, children verborgen tot uitklappen.
    expect(getByText('Boodschappen')).toBeTruthy()
    expect(queryByText('Supermarkt')).toBeNull()

    const parentBtn = getByRole('button', { name: /Boodschappen uitklappen/i })
    expect(parentBtn.getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(parentBtn)
    expect(getByText('Supermarkt')).toBeTruthy()
    expect(getByText('Markt')).toBeTruthy()
    expect(getByRole('button', { name: /Boodschappen inklappen/i }).getAttribute('aria-expanded')).toBe('true')

    // Weer inklappen → children verdwijnen.
    fireEvent.click(getByRole('button', { name: /Boodschappen inklappen/i }))
    expect(queryByText('Supermarkt')).toBeNull()
  })

  it('vult de normaal-balk op basis van computeBarSegments (consume-only)', () => {
    // Eén child: spent 40 / limit 100 → rawPct 40, onder threshold 80.
    const groups = [makeGroup({ id: 'p1', name: 'Wonen' }, [{ id: 'c1', name: 'Huur' }])]
    const spending = { c1: 40 }
    const beschikbaarMap = { c1: 60 } // limit = 60 + 40 = 100

    const colors = getTypeColors('expense')
    const seg = computeBarSegments(40, 100, 80, colors, false)

    const { getByRole, container } = render(
      <BudgetPillTree
        groups={groups}
        spending={spending}
        budgetType="expense"
        onNavigate={vi.fn()}
        beschikbaarMap={beschikbaarMap}
      />,
    )

    fireEvent.click(getByRole('button', { name: /Wonen uitklappen/i }))
    // Na de ombouw zit de PillBars-laag (de width-spans) in de pil-wrapper
    // (`<div data-budget-id>`), niet meer in de body-knop.
    const childPill = container.querySelector('[data-budget-id="c1"]') as HTMLElement
    const fills = childPill.querySelectorAll('span[style*="width"]')
    // Eerste width-span = normaal-fill.
    const normalFill = fills[0] as HTMLElement
    expect(normalFill.style.width).toBe(`${seg.normalPct}%`)
    expect(seg.normalPct).toBeCloseTo(40, 5)
  })

  it('toont semantische waarschuwingskleur bij over-budget', () => {
    // spent 120 / limit 100 → rawPct 120 (>105) → isFullyOver → overColor (#ef4444).
    const groups = [makeGroup({ id: 'p1', name: 'Uit eten' }, [{ id: 'c1', name: 'Restaurant' }])]
    const spending = { c1: 120 }
    const beschikbaarMap = { c1: -20 } // limit = -20 + 120 = 100

    const colors = getTypeColors('expense')
    const seg = computeBarSegments(120, 100, 80, colors, false)
    expect(seg.isFullyOver).toBe(true)
    expect(seg.normalColor).toBe('#ef4444')

    const { container } = render(
      <BudgetPillTree
        groups={groups}
        spending={spending}
        budgetType="expense"
        onNavigate={vi.fn()}
        beschikbaarMap={beschikbaarMap}
      />,
    )

    // Parent aggregeert het ene over-budget kind → parent-pil toont over-budget.
    // De PillBars-laag zit in de pil-wrapper (`<div data-budget-id>`).
    const parentPill = container.querySelector('[data-budget-id="p1"]') as HTMLElement
    const parentFill = parentPill.querySelector('span[style*="width"]') as HTMLElement
    expect(parentFill.style.backgroundColor).toBe('rgb(239, 68, 68)') // #ef4444
  })

  it('roept onNavigate aan bij klik op een parent zonder kinderen', () => {
    const onNavigate = vi.fn()
    const groups = [makeGroup({ id: 'solo', name: 'Sparen' }, [])]
    const spending = { solo: 50 }
    const beschikbaarMap = { solo: 50 }

    const { getByRole } = render(
      <BudgetPillTree
        groups={groups}
        spending={spending}
        budgetType="savings"
        onNavigate={onNavigate}
        beschikbaarMap={beschikbaarMap}
      />,
    )

    fireEvent.click(getByRole('button', { name: /Sparen openen/i }))
    expect(onNavigate).toHaveBeenCalledWith('solo')
  })

  it('roept onNavigate aan bij klik op een child', () => {
    const onNavigate = vi.fn()
    const groups = [makeGroup({ id: 'p1', name: 'Vervoer' }, [{ id: 'c1', name: 'Benzine' }])]
    const spending = { c1: 30 }
    const beschikbaarMap = { c1: 70 }

    const { getByRole } = render(
      <BudgetPillTree
        groups={groups}
        spending={spending}
        budgetType="expense"
        onNavigate={onNavigate}
        beschikbaarMap={beschikbaarMap}
      />,
    )

    fireEvent.click(getByRole('button', { name: /Vervoer uitklappen/i }))
    fireEvent.click(getByRole('button', { name: /Benzine openen/i }))
    expect(onNavigate).toHaveBeenCalledWith('c1')
  })

  it('opent het detailscherm bij klik op de icoon-knop van een PARENT', () => {
    const onNavigate = vi.fn()
    const groups = [
      makeGroup({ id: 'p1', name: 'Boodschappen' }, [{ id: 'c1', name: 'Supermarkt' }]),
    ]
    const spending = { c1: 40 }
    const beschikbaarMap = { c1: 60 }

    const { getByRole } = render(
      <BudgetPillTree
        groups={groups}
        spending={spending}
        budgetType="expense"
        onNavigate={onNavigate}
        beschikbaarMap={beschikbaarMap}
      />,
    )

    // De icoon-knop is een aparte klik-target die ALTIJD onNavigate aanroept.
    const iconBtn = getByRole('button', { name: /Boodschappen budget openen/i })
    // Zichtbare tooltip voor muisgebruikers (nice-to-have).
    expect(iconBtn.getAttribute('title')).toBe('Boodschappen openen')
    fireEvent.click(iconBtn)
    expect(onNavigate).toHaveBeenCalledWith('p1')
  })

  it('klik op de icoon-knop triggert NIET de toggle van een parent', () => {
    const onNavigate = vi.fn()
    const groups = [
      makeGroup({ id: 'p1', name: 'Boodschappen' }, [{ id: 'c1', name: 'Supermarkt' }]),
    ]
    const spending = { c1: 40 }
    const beschikbaarMap = { c1: 60 }

    const { getByRole, queryByText } = render(
      <BudgetPillTree
        groups={groups}
        spending={spending}
        budgetType="expense"
        onNavigate={onNavigate}
        beschikbaarMap={beschikbaarMap}
      />,
    )

    // Vooraf: children verborgen, body-knop niet uitgeklapt.
    expect(queryByText('Supermarkt')).toBeNull()
    const bodyBtn = getByRole('button', { name: /Boodschappen uitklappen/i })
    expect(bodyBtn.getAttribute('aria-expanded')).toBe('false')

    // Klik op het icoon → opent detail, klapt NIET uit.
    fireEvent.click(getByRole('button', { name: /Boodschappen budget openen/i }))
    expect(onNavigate).toHaveBeenCalledWith('p1')
    expect(queryByText('Supermarkt')).toBeNull()
    expect(
      getByRole('button', { name: /Boodschappen uitklappen/i }).getAttribute('aria-expanded'),
    ).toBe('false')
  })

  it('de body-knop van een uitklapbare parent toggelt nog steeds', () => {
    const groups = [
      makeGroup({ id: 'p1', name: 'Boodschappen' }, [{ id: 'c1', name: 'Supermarkt' }]),
    ]
    const spending = { c1: 40 }
    const beschikbaarMap = { c1: 60 }

    const { getByRole, getByText, queryByText } = render(
      <BudgetPillTree
        groups={groups}
        spending={spending}
        budgetType="expense"
        onNavigate={vi.fn()}
        beschikbaarMap={beschikbaarMap}
      />,
    )

    expect(queryByText('Supermarkt')).toBeNull()
    fireEvent.click(getByRole('button', { name: /Boodschappen uitklappen/i }))
    expect(getByText('Supermarkt')).toBeTruthy()
    expect(
      getByRole('button', { name: /Boodschappen inklappen/i }).getAttribute('aria-expanded'),
    ).toBe('true')
  })

  it('rendert niets bij lege groups', () => {
    const { container } = render(
      <BudgetPillTree groups={[]} spending={{}} budgetType="expense" onNavigate={vi.fn()} />,
    )
    expect(container.firstChild).toBeNull()
  })
})
