// ── Widget Catalog ────────────────────────────────────────────
// Static definition of all dashboard widgets.

import { PHASES, DEFAULT_MATRIX } from '@/lib/feature-phases'
import { WIDGET_TO_FEATURE } from '@/lib/feature-registry'
import type { ModuleId } from '@/lib/module-registry'
import { getWidgetRequiredModule } from '@/lib/module-registry'

export type WidgetSize = 'mini' | 'quarter' | 'half' | 'full'

/** Downsize a widget one step for mobile display: full→half, half→quarter, quarter→mini */
export function downsizeForMobile(size: WidgetSize): WidgetSize {
  switch (size) {
    case 'full': return 'half'
    case 'half': return 'quarter'
    case 'quarter': return 'mini'
    case 'mini': return 'mini'
  }
}
export type WidgetModule = 'kern' | 'wil' | 'horizon' | 'cross'

export interface WidgetDef {
  id: string
  name: string
  description: string
  module: WidgetModule
  sizes: WidgetSize[]          // allowed sizes
  defaultSize: WidgetSize
  minLevel: number             // sovereignty level required (-2..6)
  /** Phase label shown in locked placeholder */
  requiredPhase?: string
  /** Module that must be active for this widget to be visible (undefined = always visible) */
  requiredModule?: ModuleId
}

export interface WidgetPref {
  id: string
  enabled: boolean
  size: WidgetSize
  order: number
}

export interface WidgetPrefs {
  widgets: WidgetPref[]
}

// ── Derive minLevel & requiredPhase from feature-phase matrix ─
// Single source of truth: DEFAULT_MATRIX determines when a widget unlocks.

/**
 * Find the earliest phase where a feature is enabled and return
 * the lowest sovereignty level of that phase.
 * Returns -2 if the feature is not in the matrix (always available).
 */
export function deriveMinLevel(featureId: string): number {
  const row = DEFAULT_MATRIX[featureId]
  if (!row) return -2
  for (const phase of PHASES) {
    if (row[phase.id] === true) return Math.min(...phase.levels)
  }
  return -2
}

/**
 * Find the earliest phase where a feature is enabled and return its label.
 * Returns undefined if the feature is always available (recovery or not in matrix).
 */
export function deriveRequiredPhase(featureId: string): string | undefined {
  const row = DEFAULT_MATRIX[featureId]
  if (!row) return undefined
  for (const phase of PHASES) {
    if (row[phase.id] === true) {
      // Recovery = always available, no phase label needed
      return phase.id === 'recovery' ? undefined : phase.label
    }
  }
  return undefined
}

export const WIDGET_CATALOG: WidgetDef[] = [
  {
    id: 'netto_vermogen',
    name: 'Netto Vermogen',
    description: 'Totaal vermogen minus schulden',
    module: 'kern',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: -2,
  },
  {
    id: 'cash_flow',
    name: 'Cashflow Maand',
    description: 'Inkomsten en uitgaven deze maand',
    module: 'kern',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: -2,
  },
  {
    id: 'budgetten',
    name: 'Budgetten',
    description: 'Top budgetten en bestedingen',
    module: 'kern',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: -2,
  },
  {
    id: 'uitgaven_heatmap',
    name: 'Uitgaven Heatmap',
    description: 'Treemap-visualisatie van uitgaven per hoofdcategorie',
    module: 'kern',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: -2,
  },
  {
    id: 'assets',
    name: 'Vermogen',
    description: 'Portfolio allocatie en groei',
    module: 'kern',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: 1,
    requiredPhase: 'Stability',
  },
  {
    id: 'schulden',
    name: 'Schulden',
    description: 'Openstaande schulden en aflossingstatus',
    module: 'kern',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: -2,
  },
  {
    id: 'holdings',
    name: 'Beleggingen',
    description: 'Beleggingsportefeuille overzicht',
    module: 'kern',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: 3,
    requiredPhase: 'Momentum',
  },
  {
    id: 'voorstellen',
    name: 'Tips',
    description: 'Persoonlijke tips van Will',
    module: 'wil',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: 1,
    requiredPhase: 'Stability',
  },
  {
    id: 'acties',
    name: 'Acties',
    description: 'Open acties en vrijheidsdagen te winnen',
    module: 'wil',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: -2,
  },
  {
    id: 'doelen',
    name: 'Doelen',
    description: 'Actieve financiële doelen',
    module: 'wil',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: 1,
    requiredPhase: 'Stability',
  },
  {
    id: 'fire_prognose',
    name: 'FIRE Prognose',
    description: 'Countdown naar financiële vrijheid',
    module: 'horizon',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'full',
    minLevel: 1,
    requiredPhase: 'Stability',
  },
  {
    id: 'monte_carlo',
    name: 'Monte Carlo',
    description: 'Scenario-analyse met kansverdelingen',
    module: 'horizon',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'full',
    minLevel: 3,
    requiredPhase: 'Momentum',
  },
  {
    id: 'levensgebeurtenissen',
    name: 'Levensgebeurtenissen',
    description: 'Impact van life events op je plan',
    module: 'horizon',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: 1,
    requiredPhase: 'Stability',
  },
  {
    id: 'spaarquote',
    name: 'Spaarquote',
    description: 'Percentage van inkomen dat je spaart',
    module: 'kern',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: -2,
  },
  {
    id: 'vrijheidsvoortgang',
    name: 'Vrijheidsvoortgang',
    description: 'Voortgang naar FIRE doel in %',
    module: 'cross',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: -2,
  },
  {
    id: 'vaste_lasten',
    name: 'Vaste Lasten',
    description: 'Abonnementen en terugkerende kosten in één overzicht',
    module: 'kern',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: -2,
  },
  {
    id: 'jouw_pad',
    name: 'Jouw Pad',
    description: 'Sovereignty level en voortgang',
    module: 'cross',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: -2,
  },
  {
    id: 'gezondheids_score',
    name: 'Financiële Gezondheid',
    description: 'Financiële gezondheidsscore 0-100',
    module: 'horizon',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: 1,
    requiredPhase: 'Stability',
  },
  {
    id: 'belasting_box3',
    name: 'Box 3 Belasting',
    description: 'Vermogensbelasting berekening',
    module: 'kern',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: 1,
    requiredPhase: 'Stability',
  },
  {
    id: 'nibud_benchmark',
    name: 'NIBUD Benchmark',
    description: 'Vergelijking met NIBUD richtlijnen',
    module: 'kern',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'full',
    minLevel: -2,
  },
  {
    id: 'vrijheidsscenarios',
    name: "Vrijheidsscenario's",
    description: 'Pessimistisch / verwacht / optimistisch FIRE-leeftijd',
    module: 'horizon',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: 1,
    requiredPhase: 'Stability',
  },
  {
    id: 'sim_vermogenspad',
    name: 'Vermogenspad',
    description: 'Gesimuleerd vermogenspad naar FIRE en daarna',
    module: 'horizon',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: 1,
    requiredPhase: 'Stability',
  },
  {
    id: 'box3_drag',
    name: 'Box 3 Belastingdrag',
    description: 'Jaarlijkse Box 3-belasting in euro\'s en vrijheidsdagen',
    module: 'horizon',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: 1,
    requiredPhase: 'Stability',
  },
  {
    id: 'vrijheidsmijlpalen',
    name: 'Vrijheidsmijlpalen',
    description: 'Voortgang naar de 4 vrijheidsmijlpalen met datums',
    module: 'horizon',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: 0,
  },
  {
    id: 'backtesting_score',
    name: 'Historische Weerbaarheid',
    description: 'Hoe je plan presteert bij historische marktcrises',
    module: 'horizon',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: 3,
    requiredPhase: 'Momentum',
  },
  {
    id: 'surplus_gap',
    name: 'Surplus / Gap',
    description: 'Jaarlijkse vermogensstromen — opbouw vs. inteer',
    module: 'horizon',
    sizes: ['quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: -2,
  },
  {
    id: 'inflatie_impact',
    name: 'Inflatie-impact',
    description: 'Koopkrachtverlies door inflatie over tijd',
    module: 'horizon',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: -2,
  },
  {
    id: 'beleggingsrendement',
    name: 'Beleggingsrendement',
    description: 'Portfolio return performance: YTD, 1-jaar en totaal',
    module: 'kern',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: 1,
    requiredPhase: 'Stability',
  },
  {
    id: 'swr_monitor',
    name: 'SWR Monitor',
    description: 'Safe Withdrawal Rate na Box 3 + inflatie met scenario-vergelijking',
    module: 'horizon',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: 1,
    requiredPhase: 'Stability',
  },
  {
    id: 'pensioen_aow',
    name: 'Pensioen / AOW',
    description: 'AOW-leeftijd countdown en verwacht bedrag',
    module: 'horizon',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: -2,
  },
  {
    id: 'meldingen',
    name: 'Meldingen',
    description: 'Notificaties en waarschuwingen',
    module: 'cross',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: -2,
  },
  {
    id: 'ai_inzicht',
    name: 'AI Inzicht',
    description: 'Persoonlijke AI-gedreven inzichten',
    module: 'cross',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: 0,
  },
  {
    id: 'volgende_stap',
    name: 'Volgende Stap',
    description: 'Aanbevolen volgende actie',
    module: 'cross',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: -2,
  },
  {
    id: 'maandoverzicht',
    name: 'Maandoverzicht',
    description: 'Samenvatting van deze maand',
    module: 'cross',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: -2,
  },
  {
    id: 'weekoverzicht',
    name: 'Weekoverzicht',
    description: 'Wekelijks uitgavenoverzicht met dagelijks staafdiagram',
    module: 'kern',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: -2,
  },
  {
    id: 'agenda',
    name: 'Agenda',
    description: 'Aankomende financiele gebeurtenissen',
    module: 'cross',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: -2,
  },
  {
    id: 'noodfonds',
    name: 'Noodfonds',
    description: 'Voortgang noodfonds opbouw',
    module: 'kern',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: -2,
  },
  {
    id: 'huishouden_vergelijking',
    name: 'Huishouden Vergelijking',
    description: 'Vrijheidstijd per partner naast elkaar',
    module: 'kern',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: -2,
  },
  {
    id: 'huishouden_activiteit',
    name: 'Huishouden Activiteit',
    description: 'Recente gedeelde transacties van het huishouden',
    module: 'kern',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: -2,
  },
  {
    id: 'beslissingspatronen',
    name: 'Beslissingspatronen',
    description: 'Vrijheidsdagen gewonnen per type actie',
    module: 'wil',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: 1,
    requiredPhase: 'Stability',
  },
  {
    id: 'vrijheidsdagen_maand',
    name: 'Vrijheidsdagen/maand',
    description: 'Maandelijkse trend van gewonnen vrijheidsdagen',
    module: 'wil',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: -2,
  },
  {
    id: 'wilskracht',
    name: 'Wilskracht',
    description: 'Wilskrachtscore en vrijheidsdagen gewonnen',
    module: 'wil',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: -2,
  },
  {
    id: 'berichten',
    name: 'Berichten',
    description: 'Laatste nieuws uit je persoonlijke editie',
    module: 'cross',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: -2,
  },
  {
    id: 'trend_inkomen',
    name: 'Inkomentrend',
    description: 'Maandelijkse inkomstentrend',
    module: 'kern',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: -2,
  },
  {
    id: 'trend_uitgaven',
    name: 'Uitgaventrend',
    description: 'Maandelijkse uitgaventrend',
    module: 'kern',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: -2,
  },
  {
    id: 'trend_sparen',
    name: 'Spaartrend',
    description: 'Maandelijkse spaartrend',
    module: 'kern',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: -2,
  },
  {
    id: 'trend_schulden',
    name: 'Schuldtrend',
    description: 'Maandelijkse schuldaflossingstrend',
    module: 'kern',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: -2,
  },
  {
    id: 'rebalancing',
    name: 'Rebalancing',
    description: 'Portfolio drift analyse met target vs actuele allocatie',
    module: 'kern',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: 3,
    requiredPhase: 'Momentum',
  },
  {
    id: 'fee_analyzer',
    name: 'Kostenanalyse',
    description: 'Totale portefeuillekosten en FIRE-impact van fondsbeheer',
    module: 'kern',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: 3,
    requiredPhase: 'Momentum',
  },
  {
    id: 'hypotheek_vs_beleggen',
    name: 'Hypotheek vs Beleggen',
    description: 'Samenvatting hypotheek vs beleggen vergelijking met breakeven rendement',
    module: 'kern',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: 3,
    requiredPhase: 'Momentum',
  },
]

export const DEFAULT_WIDGET_PREFS: WidgetPrefs = {
  widgets: WIDGET_CATALOG.map((w, i) => ({
    id: w.id,
    enabled: ['netto_vermogen', 'cash_flow', 'fire_prognose', 'acties', 'spaarquote', 'vrijheidsvoortgang', 'jouw_pad'].includes(w.id),
    size: w.defaultSize,
    order: i,
  })),
}

// ── Widget navigation targets ─────────────────────────────────
// Each widget links directly to its module page.
// Where a modal can be auto-opened via URL param, include ?modal=...

export const WIDGET_HREFS: Record<string, string> = {
  netto_vermogen:           '/core',
  cash_flow:                '/core/cash',
  budgetten:                '/core/budgets',
  uitgaven_heatmap:         '/core/budgets',
  assets:                   '/core/assets',
  schulden:                 '/core/debts',
  holdings:                 '/core/assets',
  voorstellen:              '/overzicht/tips',
  acties:                   '/overzicht/tips#acties',
  doelen:                   '/toekomst#doelen',
  fire_prognose:            '/horizon',
  monte_carlo:              '/horizon?modal=simulations',
  levensgebeurtenissen:     '/horizon?modal=life_events',
  spaarquote:               '/core',
  vrijheidsvoortgang:       '/horizon',
  vaste_lasten:             '/overzicht/cashflow?view=vaste-lasten',
  jouw_pad:                 '/identity',
  gezondheids_score:        '/horizon',
  belasting_box3:           '/core/debts',
  nibud_benchmark:          '/core',
  vrijheidsscenarios:       '/horizon?modal=scenarios',
  sim_vermogenspad:         '/horizon?modal=simulations',
  box3_drag:                '/core/debts',
  vrijheidsmijlpalen:       '/horizon',
  backtesting_score:        '/horizon?modal=backtesting',
  surplus_gap:              '/horizon#vermogensstromen',
  swr_monitor:              '/identity/instellingen',
  inflatie_impact:          '/identity/instellingen',
  beleggingsrendement:      '/core/assets',
  pensioen_aow:             '/horizon',
  meldingen:                '/berichten',
  ai_inzicht:               '/berichten',
  volgende_stap:            '/will',
  maandoverzicht:           '/core',
  weekoverzicht:            '/core/budgets',
  agenda:                   '/core/cash',
  noodfonds:                '/core',
  huishouden_vergelijking:  '/core',
  huishouden_activiteit:   '/core/cash',
  beslissingspatronen:     '/will',
  vrijheidsdagen_maand:    '/will',
  wilskracht:              '/will',
  berichten:               '/berichten',
  trend_inkomen:           '/core/budgets',
  trend_uitgaven:          '/core/budgets',
  trend_sparen:            '/core/budgets',
  trend_schulden:          '/core/budgets',
  rebalancing:             '/core/assets',
  fee_analyzer:            '/core/assets',
  hypotheek_vs_beleggen:   '/core/debts',
}

// ── Widget → Feature mapping ─────────────────────────────────
// Maps widget catalog ids to unified feature ids.
// Generated from feature-registry.ts WIDGET_TO_FEATURE.
// Widgets NOT in this map are always available (no feature gating).

export const WIDGET_FEATURE_MAP: Record<string, string> = WIDGET_TO_FEATURE

// ── Sync minLevel, requiredPhase & requiredModule from matrix/registry ───────
// Single source of truth: DEFAULT_MATRIX drives minLevel/requiredPhase; WIDGET_MODULE_MAP
// drives requiredModule. Running this loop prevents drift between widget-catalog,
// feature-phases, and module-registry.
for (const widget of WIDGET_CATALOG) {
  const featureId = WIDGET_FEATURE_MAP[widget.id]
  if (featureId) {
    widget.minLevel = deriveMinLevel(featureId)
    widget.requiredPhase = deriveRequiredPhase(featureId)
  }
  // Populate module gate from WIDGET_MODULE_MAP (undefined when always visible)
  widget.requiredModule = getWidgetRequiredModule(widget.id)
}

/** Widgets that require budgeting to be active (hidden when budgetingActive = false) */
export const BUDGET_WIDGETS = new Set([
  'cash_flow',
  'budgetten',
  'uitgaven_heatmap',
  'spaarquote',
  'vaste_lasten',
  'nibud_benchmark',
  'noodfonds',
  'trend_inkomen',
  'trend_uitgaven',
  'trend_sparen',
  'trend_schulden',
  'maandoverzicht',
  'weekoverzicht',
  'huishouden_activiteit',
])

/** Allowed sizes for dynamic budget_fav:* widgets */
export const BUDGET_FAV_SIZES: WidgetSize[] = ['quarter', 'half', 'full']

/** Allowed sizes for dynamic holding_fav:* widgets (geen mini) */
export const HOLDING_FAV_SIZES: WidgetSize[] = ['quarter', 'half', 'full']

/** Get the widget definition by id */
export function getWidgetDef(id: string): WidgetDef | undefined {
  return WIDGET_CATALOG.find(w => w.id === id)
}

/** Merge saved prefs with catalog defaults (adds new widgets, removes stale ones).
 *  Preserves dynamic widget prefs (e.g. budget_fav:*) from saved data. */
export function mergeWidgetPrefs(saved: WidgetPrefs | null): WidgetPrefs {
  if (!saved?.widgets) return DEFAULT_WIDGET_PREFS

  // ── Migration: merge old abonnementen + terugkerende_transacties → vaste_lasten ──
  // If user had either old widget, map it to the new consolidated widget.
  const migratedWidgets = saved.widgets.map(w => {
    if (w.id === 'abonnementen' || w.id === 'terugkerende_transacties') {
      return { ...w, id: 'vaste_lasten' }
    }
    if (w.id === 'veerkracht_score') return { ...w, id: 'gezondheids_score' }
    return w
  })
  // Deduplicate: if both old widgets existed, keep the enabled one (or the first)
  const seen = new Set<string>()
  const deduped = migratedWidgets.filter(w => {
    if (seen.has(w.id)) {
      // Keep the already-seen entry unless this one is enabled and the previous was not
      return false
    }
    seen.add(w.id)
    return true
  })

  const savedMap = new Map(deduped.map(w => [w.id, w]))
  const merged: WidgetPref[] = WIDGET_CATALOG.map((def, i) => {
    const existing = savedMap.get(def.id)
    if (existing) {
      // Sanitize: mini is never persisted, fallback to quarter
      if (existing.size === 'mini') existing.size = 'quarter'
      // Sanitize: if saved size is not in allowed sizes, fallback to defaultSize
      if (!def.sizes.includes(existing.size)) existing.size = def.defaultSize
      return existing
    }
    // New widget not in saved prefs — add with disabled default
    return { id: def.id, enabled: false, size: def.defaultSize, order: 100 + i }
  })

  // Preserve dynamic widget prefs (budget_fav:*, holding_fav:*) from saved data
  for (const w of saved.widgets) {
    if (w.id.startsWith('budget_fav:') || w.id.startsWith('holding_fav:')) merged.push(w)
  }

  return { widgets: merged }
}
