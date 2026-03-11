import { describe, it, expect } from 'vitest'
import { buildDashboardLayout, GRID_TARGET_CELLS, type AutoDashboardAnswers, type GridSize } from './auto-dashboard-builder'
import { WIDGET_CATALOG, WIDGET_FEATURE_MAP } from './widget-catalog'

/** Count cells: full=4, half=2, quarter=1 */
function countCells(prefs: { size: string }[]): number {
  return prefs.reduce((sum, p) => {
    if (p.size === 'full') return sum + 4
    if (p.size === 'half') return sum + 2
    return sum + 1
  }, 0)
}

const ALL_FEATURES_ENABLED: Record<string, boolean> = {}
const NO_FAVS: { id: string; name: string }[] = []

describe('buildDashboardLayout', () => {
  // ── Grid size tests ──────────────────────────────────────────

  it.each<GridSize>(['small', 'medium', 'large'])('fills exactly %s grid (%i cells) for compact', (size) => {
    const answers: AutoDashboardAnswers = {
      focuses: ['overview'],
      modulePreference: 'balanced',
      gridSize: size,
      detailLevel: 'compact',
      selectedBudgetFavIds: [],
    }
    const prefs = buildDashboardLayout(answers, WIDGET_CATALOG, ALL_FEATURES_ENABLED, NO_FAVS)
    expect(countCells(prefs)).toBe(GRID_TARGET_CELLS[size])
  })

  it.each<GridSize>(['small', 'medium', 'large'])('fills exactly %s grid (%i cells) for balanced', (size) => {
    const answers: AutoDashboardAnswers = {
      focuses: ['overview'],
      modulePreference: 'balanced',
      gridSize: size,
      detailLevel: 'balanced',
      selectedBudgetFavIds: [],
    }
    const prefs = buildDashboardLayout(answers, WIDGET_CATALOG, ALL_FEATURES_ENABLED, NO_FAVS)
    expect(countCells(prefs)).toBe(GRID_TARGET_CELLS[size])
  })

  it.each<GridSize>(['small', 'medium', 'large'])('fills exactly %s grid (%i cells) for detailed', (size) => {
    const answers: AutoDashboardAnswers = {
      focuses: ['fire_freedom'],
      modulePreference: 'horizon',
      gridSize: size,
      detailLevel: 'detailed',
      selectedBudgetFavIds: [],
    }
    const prefs = buildDashboardLayout(answers, WIDGET_CATALOG, ALL_FEATURES_ENABLED, NO_FAVS)
    expect(countCells(prefs)).toBe(GRID_TARGET_CELLS[size])
  })

  // ── Scoring tests ────────────────────────────────────────────

  it('ranks horizon widgets higher when fire_freedom focus is selected', () => {
    const answers: AutoDashboardAnswers = {
      focuses: ['fire_freedom'],
      modulePreference: 'balanced',
      gridSize: 'medium',
      detailLevel: 'balanced',
      selectedBudgetFavIds: [],
    }
    const prefs = buildDashboardLayout(answers, WIDGET_CATALOG, ALL_FEATURES_ENABLED, NO_FAVS)
    const ids = prefs.map(p => p.id)
    expect(ids).toContain('fire_prognose')
    expect(ids.indexOf('fire_prognose')).toBeLessThan(prefs.length / 2)
  })

  it('excludes feature-gated widgets when locked', () => {
    const lockedFeatures: Record<string, boolean> = {
      fire_projecties: false,
      widget_monte_carlo: false,
      widget_assets: false,
    }
    const answers: AutoDashboardAnswers = {
      focuses: ['fire_freedom'],
      modulePreference: 'horizon',
      gridSize: 'medium',
      detailLevel: 'balanced',
      selectedBudgetFavIds: [],
    }
    const prefs = buildDashboardLayout(answers, WIDGET_CATALOG, lockedFeatures, NO_FAVS)
    const ids = prefs.map(p => p.id)
    expect(ids).not.toContain('fire_prognose')
    expect(ids).not.toContain('monte_carlo')
    expect(ids).not.toContain('assets')
  })

  it('does not assign quarter size to widgets that only support half/full', () => {
    const answers: AutoDashboardAnswers = {
      focuses: ['overview'],
      modulePreference: 'balanced',
      gridSize: 'large',
      detailLevel: 'compact',
      selectedBudgetFavIds: [],
    }
    const prefs = buildDashboardLayout(answers, WIDGET_CATALOG, ALL_FEATURES_ENABLED, NO_FAVS)
    for (const pref of prefs) {
      const def = WIDGET_CATALOG.find(w => w.id === pref.id)
      if (!def) continue
      expect(def.sizes).toContain(pref.size)
    }
  })

  it('injects selected budget_fav widgets and still fills grid', () => {
    const favs = [
      { id: 'fav-1', name: 'Boodschappen' },
      { id: 'fav-2', name: 'Uit eten' },
    ]
    const answers: AutoDashboardAnswers = {
      focuses: ['budget_cashflow'],
      modulePreference: 'kern',
      gridSize: 'medium',
      detailLevel: 'balanced',
      selectedBudgetFavIds: ['fav-1', 'fav-2'],
    }
    const prefs = buildDashboardLayout(answers, WIDGET_CATALOG, ALL_FEATURES_ENABLED, favs)
    const ids = prefs.map(p => p.id)
    expect(ids).toContain('budget_fav:fav-1')
    expect(ids).toContain('budget_fav:fav-2')
    expect(countCells(prefs)).toBe(16)
  })

  it('combines multiple focuses additively', () => {
    const doubleFocus: AutoDashboardAnswers = {
      focuses: ['budget_cashflow', 'fire_freedom'],
      modulePreference: 'balanced',
      gridSize: 'medium',
      detailLevel: 'balanced',
      selectedBudgetFavIds: [],
    }
    const double = buildDashboardLayout(doubleFocus, WIDGET_CATALOG, ALL_FEATURES_ENABLED, NO_FAVS)
    const doubleIds = double.map(p => p.id)
    expect(doubleIds.some(id => ['fire_prognose', 'vrijheidsscenarios', 'sim_vermogenspad'].includes(id))).toBe(true)
    expect(doubleIds.some(id => ['cash_flow', 'budgetten', 'spaarquote'].includes(id))).toBe(true)
  })

  it('respects module preference by boosting matching widgets', () => {
    const kernAnswers: AutoDashboardAnswers = {
      focuses: ['overview'],
      modulePreference: 'kern',
      gridSize: 'medium',
      detailLevel: 'balanced',
      selectedBudgetFavIds: [],
    }
    const horizonAnswers: AutoDashboardAnswers = {
      ...kernAnswers,
      modulePreference: 'horizon',
    }
    const kernPrefs = buildDashboardLayout(kernAnswers, WIDGET_CATALOG, ALL_FEATURES_ENABLED, NO_FAVS)
    const horizonPrefs = buildDashboardLayout(horizonAnswers, WIDGET_CATALOG, ALL_FEATURES_ENABLED, NO_FAVS)
    const kernCount = kernPrefs.filter(p => WIDGET_CATALOG.find(w => w.id === p.id)?.module === 'kern').length
    const horizonKernCount = horizonPrefs.filter(p => WIDGET_CATALOG.find(w => w.id === p.id)?.module === 'kern').length
    expect(kernCount).toBeGreaterThanOrEqual(horizonKernCount)
  })

  it('assigns sequential order values', () => {
    const answers: AutoDashboardAnswers = {
      focuses: ['overview'],
      modulePreference: 'balanced',
      gridSize: 'medium',
      detailLevel: 'balanced',
      selectedBudgetFavIds: [],
    }
    const prefs = buildDashboardLayout(answers, WIDGET_CATALOG, ALL_FEATURES_ENABLED, NO_FAVS)
    for (let i = 0; i < prefs.length; i++) {
      expect(prefs[i].order).toBe(i)
    }
  })

  it('all widgets are enabled', () => {
    const answers: AutoDashboardAnswers = {
      focuses: ['overview'],
      modulePreference: 'balanced',
      gridSize: 'medium',
      detailLevel: 'balanced',
      selectedBudgetFavIds: [],
    }
    const prefs = buildDashboardLayout(answers, WIDGET_CATALOG, ALL_FEATURES_ENABLED, NO_FAVS)
    for (const pref of prefs) {
      expect(pref.enabled).toBe(true)
    }
  })

  it('works when many features are locked (low sovereignty)', () => {
    const allLocked: Record<string, boolean> = {}
    for (const featureId of Object.values(WIDGET_FEATURE_MAP)) {
      allLocked[featureId] = false
    }
    const answers: AutoDashboardAnswers = {
      focuses: ['overview'],
      modulePreference: 'balanced',
      gridSize: 'medium',
      detailLevel: 'balanced',
      selectedBudgetFavIds: [],
    }
    const prefs = buildDashboardLayout(answers, WIDGET_CATALOG, allLocked, NO_FAVS)
    expect(prefs.length).toBeGreaterThan(0)
    expect(countCells(prefs)).toBeLessThanOrEqual(16)
    for (const pref of prefs) {
      const featureId = WIDGET_FEATURE_MAP[pref.id]
      if (featureId) {
        expect(allLocked[featureId]).not.toBe(false)
      }
    }
  })

  it('small grid with budget_fav still fills to 12 cells', () => {
    const favs = [{ id: 'fav-1', name: 'Boodschappen' }]
    const answers: AutoDashboardAnswers = {
      focuses: ['budget_cashflow'],
      modulePreference: 'kern',
      gridSize: 'small',
      detailLevel: 'balanced',
      selectedBudgetFavIds: ['fav-1'],
    }
    const prefs = buildDashboardLayout(answers, WIDGET_CATALOG, ALL_FEATURES_ENABLED, favs)
    expect(prefs.map(p => p.id)).toContain('budget_fav:fav-1')
    expect(countCells(prefs)).toBe(12)
  })

  it('large grid fills to 20 cells', () => {
    const answers: AutoDashboardAnswers = {
      focuses: ['overview'],
      modulePreference: 'balanced',
      gridSize: 'large',
      detailLevel: 'balanced',
      selectedBudgetFavIds: [],
    }
    const prefs = buildDashboardLayout(answers, WIDGET_CATALOG, ALL_FEATURES_ENABLED, NO_FAVS)
    expect(countCells(prefs)).toBe(20)
  })
})
