// ── Auto Dashboard Builder ───────────────────────────────────
// Pure scoring function that builds a personalized 4×4 dashboard layout.
// Deterministic client-side logic — no AI/API calls.

import { WIDGET_CATALOG, WIDGET_FEATURE_MAP, type WidgetDef, type WidgetPref, type WidgetSize } from './widget-catalog'
import { isFeatureAccessible, type FeatureAccessMap } from './compute-feature-access'

// ── Types ────────────────────────────────────────────────────

export type FocusChoice =
  | 'budget_cashflow'
  | 'assets_investments'
  | 'fire_freedom'
  | 'goals_actions'
  | 'overview'

export type ModulePreference = 'kern' | 'wil' | 'horizon' | 'balanced'
export type DetailLevel = 'compact' | 'balanced' | 'detailed'
export type GridSize = 'small' | 'medium' | 'large'

export interface AutoDashboardAnswers {
  focuses: FocusChoice[]
  modulePreference: ModulePreference
  gridSize: GridSize
  detailLevel: DetailLevel
  selectedBudgetFavIds: string[]
}

/** Grid size → target cell count (4 cols × rows) */
export const GRID_TARGET_CELLS: Record<GridSize, number> = {
  small:  12,  // 4×3
  medium: 16,  // 4×4
  large:  20,  // 4×5
}

// ── Constants ────────────────────────────────────────────────

/** Focus → widget IDs that get a scoring boost */
export const FOCUS_WIDGET_BOOST: Record<FocusChoice, string[]> = {
  budget_cashflow: [
    'cash_flow', 'budgetten', 'spaarquote', 'abonnementen',
    'terugkerende_transacties', 'nibud_benchmark', 'noodfonds',
    'trend_inkomen', 'trend_uitgaven', 'trend_sparen', 'trend_schulden',
  ],
  assets_investments: [
    'netto_vermogen', 'assets', 'holdings', 'belasting_box3',
    'box3_drag', 'huishouden_vergelijking',
  ],
  fire_freedom: [
    'fire_prognose', 'monte_carlo', 'vrijheidsscenarios',
    'sim_vermogenspad', 'passief_inkomen', 'vrijheidsmijlpalen',
    'backtesting_score', 'veerkracht_score', 'vrijheidsvoortgang',
    'levensgebeurtenissen',
  ],
  goals_actions: [
    'voorstellen', 'acties', 'doelen', 'volgende_stap',
    'beslissingspatronen', 'vrijheidsdagen_maand', 'wilskracht',
  ],
  overview: [
    'netto_vermogen', 'cash_flow', 'fire_prognose', 'acties',
    'spaarquote', 'vrijheidsvoortgang', 'jouw_pad', 'maandoverzicht',
  ],
}

/** Base popularity score per widget (0–10). Higher = more universally useful. */
export const WIDGET_POPULARITY: Record<string, number> = {
  netto_vermogen: 10,
  cash_flow: 9,
  budgetten: 8,
  spaarquote: 8,
  acties: 7,
  fire_prognose: 7,
  vrijheidsvoortgang: 7,
  schulden: 6,
  noodfonds: 6,
  jouw_pad: 6,
  maandoverzicht: 6,
  volgende_stap: 6,
  terugkerende_transacties: 5,
  abonnementen: 5,
  assets: 5,
  doelen: 5,
  voorstellen: 5,
  wilskracht: 5,
  meldingen: 5,
  nibud_benchmark: 4,
  berichten: 4,
  agenda: 4,
  veerkracht_score: 4,
  levensgebeurtenissen: 4,
  vrijheidsscenarios: 4,
  sim_vermogenspad: 4,
  vrijheidsmijlpalen: 4,
  passief_inkomen: 4,
  ai_inzicht: 4,
  holdings: 3,
  belasting_box3: 3,
  streaks: 3,
  badges: 3,
  monte_carlo: 3,
  backtesting_score: 3,
  box3_drag: 3,
  huishouden_vergelijking: 3,
  huishouden_activiteit: 3,
  beslissingspatronen: 3,
  vrijheidsdagen_maand: 3,
  trend_inkomen: 3,
  trend_uitgaven: 3,
  trend_sparen: 3,
  trend_schulden: 3,
}

/** Grid size × detail level → size distribution budget */
const DETAIL_BUDGETS: Record<GridSize, Record<DetailLevel, { full: number; half: number; quarter: number }>> = {
  small: {
    compact:  { full: 0, half: 2, quarter: 8 },   // 0+4+8 = 12
    balanced: { full: 1, half: 2, quarter: 4 },   // 4+4+4 = 12
    detailed: { full: 2, half: 2, quarter: 0 },   // 8+4+0 = 12
  },
  medium: {
    compact:  { full: 0, half: 4, quarter: 8 },   // 0+8+8 = 16
    balanced: { full: 1, half: 4, quarter: 4 },   // 4+8+4 = 16
    detailed: { full: 2, half: 2, quarter: 4 },   // 8+4+4 = 16
  },
  large: {
    compact:  { full: 0, half: 4, quarter: 12 },  // 0+8+12 = 20
    balanced: { full: 1, half: 4, quarter: 8 },   // 4+8+8  = 20
    detailed: { full: 2, half: 4, quarter: 4 },   // 8+8+4  = 20
  },
}

// ── Scoring ──────────────────────────────────────────────────

interface ScoredWidget {
  def: WidgetDef
  score: number
  catalogIndex: number
}

function scoreWidgets(
  catalog: WidgetDef[],
  answers: AutoDashboardAnswers,
  features: FeatureAccessMap,
): ScoredWidget[] {
  // Build set of boosted widget IDs from selected focuses
  const boostedIds = new Set<string>()
  for (const focus of answers.focuses) {
    for (const id of FOCUS_WIDGET_BOOST[focus]) {
      boostedIds.add(id)
    }
  }

  const scored: ScoredWidget[] = []

  for (let i = 0; i < catalog.length; i++) {
    const def = catalog[i]

    // Filter: skip if widget is feature-gated and locked
    const featureId = WIDGET_FEATURE_MAP[def.id]
    if (featureId && !isFeatureAccessible(features, featureId)) continue

    // Focus bonus: +1 per focus that includes this widget (max 2)
    const focusBonus = answers.focuses.reduce(
      (sum, f) => sum + (FOCUS_WIDGET_BOOST[f].includes(def.id) ? 1 : 0),
      0,
    )

    // Module bonus: +1 if widget matches module preference
    const moduleBonus =
      answers.modulePreference === 'balanced'
        ? 0
        : (def.module === answers.modulePreference ? 1 : 0)

    // Popularity base
    const popularity = WIDGET_POPULARITY[def.id] ?? 3

    // Final score: focusBonus × 3 + moduleBonus × 2 + popularity
    const score = focusBonus * 3 + moduleBonus * 2 + popularity

    scored.push({ def, score, catalogIndex: i })
  }

  // Sort descending by score, then by catalog order as tiebreaker
  scored.sort((a, b) => b.score - a.score || a.catalogIndex - b.catalogIndex)

  return scored
}

// ── Layout builder ───────────────────────────────────────────

/**
 * Build a personalized dashboard layout based on user answers.
 * Grid size determines total cells: small=12, medium=16, large=20.
 * Returns WidgetPref[] with sequential order values.
 */
export function buildDashboardLayout(
  answers: AutoDashboardAnswers,
  catalog: WidgetDef[],
  features: FeatureAccessMap,
  favoriteBudgets: { id: string; name: string }[],
): WidgetPref[] {
  const TARGET_CELLS = GRID_TARGET_CELLS[answers.gridSize]
  const budget = { ...DETAIL_BUDGETS[answers.gridSize][answers.detailLevel] }
  const result: WidgetPref[] = []
  let cellsUsed = 0

  // 1. Reserve quarter-slots for selected budget favorites
  const selectedFavs = answers.selectedBudgetFavIds.filter(
    id => favoriteBudgets.some(b => b.id === id)
  )
  for (const favId of selectedFavs) {
    if (cellsUsed >= TARGET_CELLS) break
    result.push({ id: `budget_fav:${favId}`, enabled: true, size: 'quarter', order: 0 })
    cellsUsed += 1
    budget.quarter = Math.max(0, budget.quarter - 1)
  }

  // 2. Score and rank catalog widgets
  const scored = scoreWidgets(catalog, answers, features)

  // 3. Assign sizes from the budget (preferred distribution)
  for (const { def } of scored) {
    const gap = TARGET_CELLS - cellsUsed
    if (gap <= 0) break
    const assigned = assignSizeCapped(def, budget, gap)
    if (!assigned) continue
    result.push({ id: def.id, enabled: true, size: assigned.size, order: 0 })
    cellsUsed += assigned.cells
  }

  // 4. Fill-pass: add remaining widgets at smallest fitting size (ignore budget)
  if (cellsUsed < TARGET_CELLS) {
    const usedIds = new Set(result.map(r => r.id))
    const remaining = scored.filter(s => !usedIds.has(s.def.id))
    for (const { def } of remaining) {
      if (cellsUsed >= TARGET_CELLS) break
      const gap = TARGET_CELLS - cellsUsed
      const size = pickSmallestFittingSize(def, gap)
      if (!size) continue
      result.push({ id: def.id, enabled: true, size: size.size, order: 0 })
      cellsUsed += size.cells
    }
  }

  // 5. Upgrade pass: quarter → half where the widget supports it
  if (cellsUsed < TARGET_CELLS) {
    for (let i = 0; i < result.length && cellsUsed < TARGET_CELLS; i++) {
      if (result[i].size !== 'quarter') continue
      const sizes = lookupSizes(result[i].id, catalog)
      if (sizes.includes('half')) {
        result[i] = { ...result[i], size: 'half' }
        cellsUsed += 1
      }
    }
  }

  // 6. Upgrade pass: half → full where the widget supports it (fills 2 extra cells)
  if (cellsUsed < TARGET_CELLS) {
    for (let i = 0; i < result.length && cellsUsed < TARGET_CELLS; i++) {
      if (result[i].size !== 'half') continue
      if (TARGET_CELLS - cellsUsed < 2) break
      const sizes = lookupSizes(result[i].id, catalog)
      if (sizes.includes('full')) {
        result[i] = { ...result[i], size: 'full' }
        cellsUsed += 2
      }
    }
  }

  // 7. Assign sequential order
  return result.map((p, i) => ({ ...p, order: i }))
}

/** Try to assign the best size from the remaining budget, capped by remaining gap */
function assignSizeCapped(
  def: WidgetDef,
  budget: { full: number; half: number; quarter: number },
  gap: number,
): { size: WidgetSize; cells: number } | null {
  // Try from largest budget slot down, but only if it fits in the gap
  if (budget.full > 0 && gap >= 4 && def.sizes.includes('full')) {
    budget.full--
    return { size: 'full', cells: 4 }
  }
  if (budget.half > 0 && gap >= 2 && def.sizes.includes('half')) {
    budget.half--
    return { size: 'half', cells: 2 }
  }
  if (budget.quarter > 0 && gap >= 1 && def.sizes.includes('quarter')) {
    budget.quarter--
    return { size: 'quarter', cells: 1 }
  }

  // Budget exhausted for preferred sizes — try any available size that fits
  if (gap >= 1 && def.sizes.includes('quarter') && budget.quarter > 0) {
    budget.quarter--
    return { size: 'quarter', cells: 1 }
  }
  if (gap >= 2 && def.sizes.includes('half') && budget.half > 0) {
    budget.half--
    return { size: 'half', cells: 2 }
  }

  return null
}

/** Pick the smallest size that fits in the remaining gap */
function pickSmallestFittingSize(
  def: WidgetDef,
  gap: number,
): { size: WidgetSize; cells: number } | null {
  if (gap >= 1 && def.sizes.includes('quarter')) return { size: 'quarter', cells: 1 }
  if (gap >= 2 && def.sizes.includes('half')) return { size: 'half', cells: 2 }
  if (gap >= 4 && def.sizes.includes('full')) return { size: 'full', cells: 4 }
  return null
}

/** Look up allowed sizes for a widget (handles budget_fav:* dynamically) */
function lookupSizes(id: string, catalog: WidgetDef[]): WidgetSize[] {
  if (id.startsWith('budget_fav:')) return ['quarter', 'half', 'full']
  const def = catalog.find(w => w.id === id)
  return def?.sizes ?? ['quarter', 'half', 'full']
}
