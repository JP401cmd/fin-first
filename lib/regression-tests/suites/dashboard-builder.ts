import { registerTests } from '../test-registry'
import { assert, assertGreaterThan, assertLessThanOrEqual, assertGreaterThanOrEqual } from '../assert'
import type { TestCase } from '../test-types'
import { buildDashboardLayout, GRID_TARGET_CELLS, type AutoDashboardAnswers, type GridSize } from '@/lib/auto-dashboard-builder'
import { WIDGET_CATALOG } from '@/lib/widget-catalog'
import type { FeatureAccessMap } from '@/lib/compute-feature-access'

const CAT = 'widgets.builder'

function countCells(prefs: { size: string }[]): number {
  return prefs.reduce((sum, p) => {
    if (p.size === 'full') return sum + 4
    if (p.size === 'half') return sum + 2
    return sum + 1
  }, 0)
}

const ALL_FEATURES_ENABLED: FeatureAccessMap = {}
const NO_FAVS: { id: string; name: string }[] = []

function makeAnswers(o?: Partial<AutoDashboardAnswers>): AutoDashboardAnswers {
  return {
    focuses: ['overview'], modulePreference: 'balanced', gridSize: 'medium',
    detailLevel: 'compact', selectedBudgetFavIds: [], ...o,
  }
}

const tests: TestCase[] = [
  {
    id: 'dash-small-grid', name: 'Klein grid', category: CAT,
    description: 'Small grid vult exact GRID_TARGET_CELLS.small cellen',
    priority: 'high', estimatedDurationMs: 50,
    fn() {
      const result = buildDashboardLayout(makeAnswers({ gridSize: 'small' }), WIDGET_CATALOG, ALL_FEATURES_ENABLED, NO_FAVS)
      const cells = countCells(result)
      assertLessThanOrEqual(cells, GRID_TARGET_CELLS.small + 4, 'max cellen')
      assertGreaterThanOrEqual(cells, GRID_TARGET_CELLS.small - 4, 'min cellen')
    },
  },
  {
    id: 'dash-medium-grid', name: 'Medium grid', category: CAT,
    description: 'Medium grid heeft redelijk aantal widgets',
    priority: 'high', estimatedDurationMs: 50,
    fn() {
      const result = buildDashboardLayout(makeAnswers({ gridSize: 'medium' }), WIDGET_CATALOG, ALL_FEATURES_ENABLED, NO_FAVS)
      assertGreaterThan(result.length, 0, 'widgets aanwezig')
      const cells = countCells(result)
      assertGreaterThanOrEqual(cells, GRID_TARGET_CELLS.medium - 4, 'min cellen')
    },
  },
  {
    id: 'dash-large-grid', name: 'Groot grid', category: CAT,
    description: 'Large grid heeft meer widgets dan small',
    priority: 'high', estimatedDurationMs: 50,
    fn() {
      const small = buildDashboardLayout(makeAnswers({ gridSize: 'small' }), WIDGET_CATALOG, ALL_FEATURES_ENABLED, NO_FAVS)
      const large = buildDashboardLayout(makeAnswers({ gridSize: 'large' }), WIDGET_CATALOG, ALL_FEATURES_ENABLED, NO_FAVS)
      assertGreaterThanOrEqual(countCells(large), countCells(small), 'large ≥ small')
    },
  },
  {
    id: 'dash-all-enabled', name: 'Alle widgets enabled', category: CAT,
    description: 'Resultaat bevat alleen enabled widgets',
    priority: 'medium', estimatedDurationMs: 50,
    fn() {
      const result = buildDashboardLayout(makeAnswers(), WIDGET_CATALOG, ALL_FEATURES_ENABLED, NO_FAVS)
      for (const pref of result) {
        assert(pref.enabled, `${pref.id} enabled`)
      }
    },
  },
]

export function register(): void {
  registerTests(tests)
}
