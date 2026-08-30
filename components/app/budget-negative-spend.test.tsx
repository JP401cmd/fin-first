/**
 * C1 — een NEGATIEVE besteding mag nergens als negatief percentage of als
 * ongeldige CSS-breedte op het scherm komen.
 *
 * Sinds de norm van 30 aug 2026 gaat een inkomst op een uitgaven-budget AF van
 * de besteding (lib/budget-spending.ts). Het bedrag mag dan negatief zijn — dat
 * is de expliciete eigenaarskeuze — maar de vier standaard-weergaven rekenden
 * hun percentage zélf en ongeklemd. Het gemelde budget (limiet €1.642, netto
 * −€6.735) rendeerde daardoor "−410%" en een `width: -410%`, wat als ongeldige
 * CSS wordt genegeerd zodat de balk stil verdwijnt.
 *
 * Elke weergave krijgt hier dezelfde case: spent = −6735, limit = 1642 ⇒ 0%.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { BudgetTree } from './budget-tree'
import { BudgetPillTree } from './budget-pill-tree'
import { BudgetDonut } from './budget-donut'
import { BudgetHeatmap, type HeatmapSection } from './budget-heatmap'
import { computeBarSegments, getTypeColors } from './budget-shared'
import type { Budget, BudgetWithChildren } from '@/lib/budget-data'

vi.mock('@/lib/hooks/use-privacy', () => ({
  useMaskedAmounts: () => ({ masked: false }),
}))

const SPENT = -6735
const LIMIT = 1642

function makeBudget(over: Partial<Budget> & { id: string; name: string }): Budget {
  return {
    user_id: 'u1',
    parent_id: null,
    slug: null,
    icon: 'ShoppingCart',
    description: null,
    default_limit: LIMIT,
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
    is_archived: false,
    created_at: '2026-01-01',
    ...over,
  } as Budget
}

const parent: BudgetWithChildren = {
  ...makeBudget({ id: 'inventaris', name: 'Inventaris & apparaten' }),
  children: [],
} as BudgetWithChildren

const groups = [parent]
const spending = { inventaris: SPENT }

/** Alle inline width-waarden in de gerenderde DOM. */
function widths(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[style*="width"]'))
    .map((el) => el.style.width)
    .filter(Boolean)
}

/** Een geldige CSS-breedte is nooit negatief. */
function expectNoNegativeWidths(container: HTMLElement) {
  for (const w of widths(container)) {
    expect(w.startsWith('-')).toBe(false)
  }
}

beforeEach(cleanup)

describe('computeBarSegments — de gedeelde balkmotor achter tree en pill-tree', () => {
  const colors = getTypeColors('expense')

  it('produceert geen negatieve segmentbreedtes', () => {
    const seg = computeBarSegments(SPENT, LIMIT, 80, colors, false)
    expect(seg.normalPct).toBeGreaterThanOrEqual(0)
    expect(seg.warnPct).toBeGreaterThanOrEqual(0)
    expect(seg.extensionPct).toBeGreaterThanOrEqual(0)
    expect(seg.isFullyOver).toBe(false)
  })

  it('houdt de over-budget-staart intact (klem is alleen aan de onderkant)', () => {
    const seg = computeBarSegments(9265, LIMIT, 80, colors, false)
    expect(seg.isFullyOver).toBe(true)
    expect(seg.extensionPct).toBeGreaterThan(0)
  })
})

describe('BudgetTree', () => {
  it('toont 0% en geen negatieve breedte bij een negatieve besteding', () => {
    const { container } = render(
      <BudgetTree groups={groups} spending={spending} budgetType="expense" onNavigate={vi.fn()} />,
    )
    expect(screen.getByText('0%')).toBeTruthy()
    expect(container.textContent).not.toContain('-410%')
    expectNoNegativeWidths(container)
  })
})

describe('BudgetPillTree', () => {
  it('rendert geen negatieve breedte bij een negatieve besteding', () => {
    const { container } = render(
      <BudgetPillTree groups={groups} spending={spending} budgetType="expense" onNavigate={vi.fn()} />,
    )
    expectNoNegativeWidths(container)
  })
})

describe('BudgetDonut', () => {
  it('trekt de ring niet omlaag door één negatief budget', () => {
    const { container } = render(
      <BudgetDonut groups={groups} spending={spending} onNavigate={vi.fn()} />,
    )
    expect(container.textContent).not.toContain('-410%')
    expectNoNegativeWidths(container)
  })
})

describe('BudgetHeatmap', () => {
  const section = {
    label: 'Uitgaven',
    budgetType: 'expense',
    groups: [{ id: 'inventaris', name: 'Inventaris & apparaten', icon: 'ShoppingCart', default_limit: LIMIT, children: [] }],
  } as unknown as HeatmapSection

  it('toont 0% in het aria-label en geen negatieve breedte', () => {
    const { container } = render(
      <BudgetHeatmap sections={[section]} spending={spending} onNavigate={vi.fn()} size="full" />,
    )
    expect(container.textContent).not.toContain('-410%')
    expectNoNegativeWidths(container)

    const labelled = Array.from(container.querySelectorAll('[aria-label]'))
      .map((el) => el.getAttribute('aria-label') ?? '')
      .filter((l) => l.includes('van budget besteed'))
    for (const label of labelled) {
      expect(label).not.toContain('-410')
      expect(label).toContain('0%')
    }
  })
})
