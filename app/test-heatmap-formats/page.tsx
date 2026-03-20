'use client'

import { useEffect, useState, useCallback } from 'react'
import { BudgetHeatmap, type HeatmapSection } from '@/components/app/budget-heatmap'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { BudgetWithChildren } from '@/lib/budget-data'

/**
 * Test page for Feature #432: Responsive heatmap regression test — all 4 formats
 * Uses static test data (no auth required) to verify rendering of mini, quarter, half, full.
 */

// Static budget data for visual regression testing
function makeBudget(id: string, name: string, icon: string, limit: number, parentId: string | null = null): any {
  return {
    id,
    user_id: 'test',
    parent_id: parentId,
    name,
    slug: null,
    icon,
    description: null,
    default_limit: limit,
    budget_type: 'expense' as const,
    interval: 'monthly' as const,
    rollover_type: 'reset' as const,
    limit_type: 'soft' as const,
    alert_threshold: 80,
    max_single_transaction_amount: 0,
    is_essential: false,
    priority_score: 0,
    is_inflation_indexed: false,
    sort_order: 0,
    created_at: '',
    updated_at: '',
    ownership: 'personal' as const,
    household_id: null,
    goal_type: null,
    goal_amount: null,
    goal_date: null,
    goal_frequency: null,
    is_favorite: false,
  }
}

const MOCK_EXPENSE_GROUPS: BudgetWithChildren[] = [
  {
    ...makeBudget('g1', 'Vaste lasten', 'home', 2000),
    children: [
      makeBudget('c1', 'Huur', 'home', 1200, 'g1'),
      makeBudget('c2', 'Energie', 'zap', 200, 'g1'),
      makeBudget('c3', 'Verzekeringen', 'shield', 350, 'g1'),
      makeBudget('c4', 'Internet', 'wifi', 50, 'g1'),
    ],
  },
  {
    ...makeBudget('g2', 'Dagelijkse uitgaven', 'shopping-cart', 800),
    children: [
      makeBudget('c5', 'Boodschappen', 'shopping-cart', 500, 'g2'),
      makeBudget('c6', 'Lunch', 'utensils', 150, 'g2'),
      makeBudget('c7', 'Huishouden', 'home', 100, 'g2'),
    ],
  },
  {
    ...makeBudget('g3', 'Vervoer', 'car', 400),
    children: [
      makeBudget('c8', 'Brandstof', 'fuel', 200, 'g3'),
      makeBudget('c9', 'OV', 'train', 120, 'g3'),
      makeBudget('c10', 'Parkeren', 'parking-meter', 50, 'g3'),
    ],
  },
  {
    ...makeBudget('g4', 'Leuke dingen', 'smile', 500),
    children: [
      makeBudget('c11', 'Uit eten', 'utensils', 200, 'g4'),
      makeBudget('c12', 'Hobby', 'palette', 150, 'g4'),
      makeBudget('c13', 'Kleding', 'shirt', 100, 'g4'),
    ],
  },
]

const MOCK_INCOME_GROUPS: BudgetWithChildren[] = [
  {
    ...makeBudget('gi1', 'Salaris', 'briefcase', 4500),
    children: [],
  },
  {
    ...makeBudget('gi2', 'Bijverdiensten', 'plus-circle', 500),
    children: [],
  },
]

const MOCK_SAVINGS_GROUPS: BudgetWithChildren[] = [
  {
    ...makeBudget('gs1', 'Noodfonds', 'piggy-bank', 300),
    children: [],
  },
  {
    ...makeBudget('gs2', 'Beleggen', 'trending-up', 500),
    children: [],
  },
]

// Override budget_type for income/savings
MOCK_INCOME_GROUPS.forEach(g => { (g as any).budget_type = 'income' })
MOCK_SAVINGS_GROUPS.forEach(g => { (g as any).budget_type = 'savings' })

const MOCK_SPENDING: Record<string, number> = {
  'c1': 1200,   // Huur: 100%
  'c2': 180,    // Energie: 90%
  'c3': 280,    // Verzekeringen: 80%
  'c4': 50,     // Internet: 100%
  'c5': 420,    // Boodschappen: 84%
  'c6': 185,    // Lunch: 123% (over budget)
  'c7': 65,     // Huishouden: 65%
  'c8': 160,    // Brandstof: 80%
  'c9': 100,    // OV: 83%
  'c10': 55,    // Parkeren: 110% (over budget)
  'c11': 250,   // Uit eten: 125% (over budget)
  'c12': 90,    // Hobby: 60%
  'c13': 45,    // Kleding: 45%
  'gi1': 4500,  // Salaris: 100%
  'gi2': 350,   // Bijverdiensten: 70%
  'gs1': 300,   // Noodfonds: 100%
  'gs2': 400,   // Beleggen: 80%
}

const SECTIONS: HeatmapSection[] = [
  { label: 'Uitgaven', budgetType: 'expense', groups: MOCK_EXPENSE_GROUPS },
  { label: 'Inkomen', budgetType: 'income', groups: MOCK_INCOME_GROUPS },
  { label: 'Sparen', budgetType: 'savings', groups: MOCK_SAVINGS_GROUPS },
]

export default function TestHeatmapFormatsPage() {
  const [testResults, setTestResults] = useState<{ name: string; pass: boolean; detail: string }[]>([])

  const handleNavigate = useCallback(() => {}, [])

  // Run automated tests after render
  useEffect(() => {
    // Wait for animations to complete
    const timer = setTimeout(() => {
      const results: { name: string; pass: boolean; detail: string }[] = []

      // Test 1: all 4 size containers rendered with SVGs
      const sizes: WidgetSize[] = ['mini', 'quarter', 'half', 'full']
      for (const sz of sizes) {
        const container = document.getElementById(`heatmap-${sz}`)
        const hasSvg = container?.querySelector('svg') !== null
        results.push({
          name: `${sz} format renders SVG`,
          pass: hasSvg,
          detail: hasSvg ? 'SVG treemap found' : 'No SVG found in container',
        })
      }

      // Test 2: mini — no foreignObject (no text content)
      const miniContainer = document.getElementById('heatmap-mini')
      const miniFO = miniContainer?.querySelectorAll('foreignObject')
      results.push({
        name: 'mini: no text (foreignObject absent)',
        pass: (miniFO?.length ?? 0) === 0,
        detail: `foreignObject count: ${miniFO?.length ?? 0}`,
      })

      // Test 3: mini — has colored rects
      const miniRects = miniContainer?.querySelectorAll('rect[fill]:not([fill="none"])')
      results.push({
        name: 'mini: color blocks present',
        pass: (miniRects?.length ?? 0) > 2,
        detail: `Colored rects: ${miniRects?.length ?? 0}`,
      })

      // Test 4: mini — no legend (gradient elements)
      const miniLegendGradients = miniContainer?.querySelectorAll('linearGradient[id*="legend"]')
      results.push({
        name: 'mini: no legend',
        pass: (miniLegendGradients?.length ?? 0) === 0,
        detail: `Legend gradients: ${miniLegendGradients?.length ?? 0}`,
      })

      // Test 5: quarter — has foreignObjects (names visible)
      const quarterContainer = document.getElementById('heatmap-quarter')
      const quarterFO = quarterContainer?.querySelectorAll('foreignObject')
      results.push({
        name: 'quarter: text content (foreignObject) present',
        pass: (quarterFO?.length ?? 0) > 0,
        detail: `foreignObject count: ${quarterFO?.length ?? 0}`,
      })

      // Test 6: quarter — no legend
      const quarterLegendGradients = quarterContainer?.querySelectorAll('linearGradient[id*="legend"]')
      results.push({
        name: 'quarter: no legend',
        pass: (quarterLegendGradients?.length ?? 0) === 0,
        detail: `Legend gradients: ${quarterLegendGradients?.length ?? 0}`,
      })

      // Test 7: quarter — no parent outlines
      const quarterOutlines = quarterContainer?.querySelectorAll('rect[stroke-dasharray]')
      results.push({
        name: 'quarter: no parent outlines',
        pass: (quarterOutlines?.length ?? 0) === 0,
        detail: `Dashed outline rects: ${quarterOutlines?.length ?? 0}`,
      })

      // Test 8: half — has legend
      const halfContainer = document.getElementById('heatmap-half')
      const halfLegendGradients = halfContainer?.querySelectorAll('linearGradient[id*="legend"]')
      results.push({
        name: 'half: legend present',
        pass: (halfLegendGradients?.length ?? 0) >= 2,
        detail: `Legend gradients: ${halfLegendGradients?.length ?? 0}`,
      })

      // Test 9: half — has parent outlines
      const halfOutlines = halfContainer?.querySelectorAll('rect[stroke-dasharray]')
      results.push({
        name: 'half: parent outlines present',
        pass: (halfOutlines?.length ?? 0) > 0,
        detail: `Dashed outline rects: ${halfOutlines?.length ?? 0}`,
      })

      // Test 10: half — has section labels
      const halfLabels = halfContainer?.querySelectorAll('text')
      results.push({
        name: 'half: section labels present',
        pass: (halfLabels?.length ?? 0) > 0,
        detail: `Text elements: ${halfLabels?.length ?? 0}`,
      })

      // Test 11: full — has legend
      const fullContainer = document.getElementById('heatmap-full')
      const fullLegendGradients = fullContainer?.querySelectorAll('linearGradient[id*="legend"]')
      results.push({
        name: 'full: legend present',
        pass: (fullLegendGradients?.length ?? 0) >= 2,
        detail: `Legend gradients: ${fullLegendGradients?.length ?? 0}`,
      })

      // Test 12: full — has parent outlines
      const fullOutlines = fullContainer?.querySelectorAll('rect[stroke-dasharray]')
      results.push({
        name: 'full: parent outlines present',
        pass: (fullOutlines?.length ?? 0) > 0,
        detail: `Dashed outline rects: ${fullOutlines?.length ?? 0}`,
      })

      // Test 13: full — has foreignObjects (with amounts for large cells)
      const fullFO = fullContainer?.querySelectorAll('foreignObject')
      results.push({
        name: 'full: text content (foreignObject) present',
        pass: (fullFO?.length ?? 0) > 0,
        detail: `foreignObject count: ${fullFO?.length ?? 0}`,
      })

      // Test 14: mobile heatmap container exists and has content
      const mobileContainer = document.getElementById('heatmap-mobile')
      const mobileButtons = mobileContainer?.querySelectorAll('button')
      results.push({
        name: 'mobile: MobileCombinedHeatmap renders buttons',
        pass: (mobileButtons?.length ?? 0) > 0,
        detail: `Button count: ${mobileButtons?.length ?? 0}`,
      })

      // Test 15: mini is clickable (has cursor-pointer class on g elements)
      const miniCursors = miniContainer?.querySelectorAll('.cursor-pointer')
      results.push({
        name: 'mini: clickable (cursor-pointer present)',
        pass: (miniCursors?.length ?? 0) > 0,
        detail: `Cursor-pointer elements: ${miniCursors?.length ?? 0}`,
      })

      setTestResults(results)
    }, 1500) // Wait for stagger animations

    return () => clearTimeout(timer)
  }, [])

  const allPass = testResults.length > 0 && testResults.every(r => r.pass)

  return (
    <div className="min-h-screen bg-[var(--paper)] p-6">
      <h1 className="mb-2 text-xl font-bold text-[var(--ink)]">Heatmap Format Regression Test</h1>
      <p className="mb-6 text-sm text-[var(--ink-3)]">Feature #432 — All 4 heatmap formats side by side (static test data)</p>

      {/* Test results summary */}
      <div className="mb-8 rounded-lg border border-[var(--border-ed)] bg-white p-4" data-testid="test-results">
        <h2 className="mb-3 text-sm font-semibold text-[var(--ink)]">
          Test Results: {allPass ? 'ALL PASS' : testResults.length === 0 ? 'RUNNING...' : 'SOME FAILURES'}
        </h2>
        <div className="space-y-1">
          {testResults.map((r, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className={r.pass ? 'text-green-600' : 'text-red-600'}>{r.pass ? 'PASS' : 'FAIL'}</span>
              <span className="font-medium text-[var(--ink)]">{r.name}</span>
              <span className="text-[var(--ink-4)]">{r.detail}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Grid: all 4 sizes */}
      <div className="grid grid-cols-2 gap-6">
        {/* MINI */}
        <div className="rounded-lg border border-[var(--border-ed)] p-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--ink-3)]">Mini (200x150)</h3>
          <div id="heatmap-mini" style={{ maxWidth: 200 }}>
            <BudgetHeatmap
              sections={SECTIONS}
              spending={MOCK_SPENDING}
              onNavigate={handleNavigate}
              size="mini"
            />
          </div>
        </div>

        {/* QUARTER */}
        <div className="rounded-lg border border-[var(--border-ed)] p-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--ink-3)]">Quarter (400x300)</h3>
          <div id="heatmap-quarter" style={{ maxWidth: 400 }}>
            <BudgetHeatmap
              sections={SECTIONS}
              spending={MOCK_SPENDING}
              onNavigate={handleNavigate}
              size="quarter"
            />
          </div>
        </div>

        {/* HALF */}
        <div className="rounded-lg border border-[var(--border-ed)] p-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--ink-3)]">Half (800x500) — current default</h3>
          <div id="heatmap-half">
            <BudgetHeatmap
              sections={SECTIONS}
              spending={MOCK_SPENDING}
              onNavigate={handleNavigate}
              size="half"
            />
          </div>
        </div>

        {/* FULL */}
        <div className="rounded-lg border border-[var(--border-ed)] p-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--ink-3)]">Full (800x500) — extra detail</h3>
          <div id="heatmap-full">
            <BudgetHeatmap
              sections={SECTIONS}
              spending={MOCK_SPENDING}
              onNavigate={handleNavigate}
              size="full"
            />
          </div>
        </div>
      </div>

      {/* Mobile view test - force visible */}
      <div className="mt-8 rounded-lg border border-[var(--border-ed)] p-3">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--ink-3)]">Mobile (MobileCombinedHeatmap — forced visible for testing)</h3>
        <div id="heatmap-mobile" style={{ maxWidth: 390 }}>
          <style>{`#heatmap-mobile .hidden.md\\:block { display: none !important; } #heatmap-mobile .md\\:hidden { display: block !important; }`}</style>
          <BudgetHeatmap
            sections={SECTIONS}
            spending={MOCK_SPENDING}
            onNavigate={handleNavigate}
            size="half"
          />
        </div>
      </div>
    </div>
  )
}
