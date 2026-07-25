import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { BudgetHeatmapWidget } from './budget-heatmap-widget'
import { BudgetHeatmap, type HeatmapSection } from '@/components/app/budget-heatmap'
import type { DashboardData } from './widget-renderer'
import type { WidgetSize } from '@/lib/widget-catalog'

// ── Router-mock: vang router.push zodat we het deeplink-doel kunnen pinnen ──
const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

// Privacy zichtbaar (MaskedAmount toont echte bedragen).
vi.mock('@/lib/hooks/use-privacy', () => ({
  useMaskedAmounts: () => ({ masked: false }),
}))

beforeEach(() => {
  mockPush.mockClear()
})

function makeData(): DashboardData {
  return {
    heatmapExpenseGroups: [
      {
        id: 'parent-1',
        name: 'Boodschappen',
        icon: 'ShoppingCart',
        default_limit: 400,
        children: [
          { id: 'child-1', name: 'Supermarkt', icon: 'Store', default_limit: 300 },
        ],
      },
    ],
    heatmapSpending: { 'child-1': 150 },
    heatmapBeschikbaarMap: {},
    heatmapPreviousSpending: {},
  } as unknown as DashboardData
}

describe('BudgetHeatmapWidget — deeplink per categorie-blok', () => {
  // Het blok moet naar de CANONIEKE categorie-view deeplinken (ShellOverlay-pane
  // via `?budget=`), niet naar de backing-route `/core/budgets/[id]`.
  const EXPECTED = '/overzicht/cashflow/budget?budget=child-1'

  it('desktop-cel klik opent de categorie-pane via ?budget=<id>', () => {
    const { container } = render(
      <BudgetHeatmapWidget size="full" data={makeData()} href="/overzicht/cashflow/budget" />,
    )
    const cell = container.querySelector('g[role="button"]')
    expect(cell).not.toBeNull()
    fireEvent.click(cell!)
    expect(mockPush).toHaveBeenCalledWith(EXPECTED)
  })

  it('mobiele blok-knop opent dezelfde deeplink', () => {
    const { container } = render(
      <BudgetHeatmapWidget size="full" data={makeData()} href="/overzicht/cashflow/budget" />,
    )
    // De gestapelde mobiele lijst rendert <button>-blokken (jsdom kent geen
    // media-queries, dus beide render-paden staan in de DOM).
    const btn = container.querySelector('button')
    expect(btn).not.toBeNull()
    fireEvent.click(btn!)
    expect(mockPush).toHaveBeenCalledWith(EXPECTED)
  })
})

describe('BudgetHeatmap — fit-to-tile vs. natuurlijke hoogte', () => {
  const section: HeatmapSection = {
    label: 'Uitgaven',
    budgetType: 'expense',
    groups: [
      {
        id: 'p1',
        name: 'Boodschappen',
        icon: 'ShoppingCart',
        children: [
          { id: 'c1', name: 'Supermarkt', icon: 'Store', default_limit: 300 },
        ],
        // Overige BudgetWithChildren-velden zijn voor de heatmap-layout niet
        // relevant; cast houdt de test compact.
      },
    ],
  } as unknown as HeatmapSection

  it('widget-context (size gezet) → SVG past in de tegelhoogte (h-full, fit-to-tile)', () => {
    for (const size of ['quarter', 'half', 'full', 'xl'] as WidgetSize[]) {
      const { container, unmount } = render(
        <BudgetHeatmap sections={[section]} spending={{ c1: 100 }} onNavigate={() => {}} size={size} />,
      )
      const svg = container.querySelector('svg')
      expect(svg?.getAttribute('class')).toContain('h-full')
      expect(svg?.getAttribute('class')).not.toContain('h-auto')
      unmount()
    }
  })

  it('vrijstaande pagina (geen size) → SVG behoudt natuurlijke hoogte (h-auto)', () => {
    const { container } = render(
      <BudgetHeatmap sections={[section]} spending={{ c1: 100 }} onNavigate={() => {}} />,
    )
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('class')).toContain('h-auto')
    expect(svg?.getAttribute('class')).not.toContain('h-full')
  })
})
