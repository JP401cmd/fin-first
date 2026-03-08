// ── Widget Catalog ────────────────────────────────────────────
// Static definition of all dashboard widgets.

import { PHASES, DEFAULT_MATRIX } from '@/lib/feature-phases'

export type WidgetSize = 'quarter' | 'half' | 'full'
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
    sizes: ['quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: -2,
  },
  {
    id: 'cash_flow',
    name: 'Cashflow Maand',
    description: 'Inkomsten en uitgaven deze maand',
    module: 'kern',
    sizes: ['quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: -2,
  },
  {
    id: 'budgetten',
    name: 'Budgetten',
    description: 'Top budgetten en bestedingen',
    module: 'kern',
    sizes: ['quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: -2,
  },
  {
    id: 'assets',
    name: 'Vermogen',
    description: 'Portfolio allocatie en groei',
    module: 'kern',
    sizes: ['quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: 1,
    requiredPhase: 'Stability',
  },
  {
    id: 'schulden',
    name: 'Schulden',
    description: 'Openstaande schulden en aflossingstatus',
    module: 'kern',
    sizes: ['quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: -2,
  },
  {
    id: 'holdings',
    name: 'Beleggingen',
    description: 'Beleggingsportefeuille overzicht',
    module: 'kern',
    sizes: ['quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: 3,
    requiredPhase: 'Momentum',
  },
  {
    id: 'voorstellen',
    name: 'Voorstellen',
    description: 'Persoonlijke aanbevelingen',
    module: 'wil',
    sizes: ['quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: 1,
    requiredPhase: 'Stability',
  },
  {
    id: 'acties',
    name: 'Acties',
    description: 'Open acties en vrijheidsdagen te winnen',
    module: 'wil',
    sizes: ['quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: -2,
  },
  {
    id: 'doelen',
    name: 'Doelen',
    description: 'Actieve financiële doelen',
    module: 'wil',
    sizes: ['quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: 1,
    requiredPhase: 'Stability',
  },
  {
    id: 'fire_prognose',
    name: 'FIRE Prognose',
    description: 'Countdown naar financiële vrijheid',
    module: 'horizon',
    sizes: ['quarter', 'half', 'full'],
    defaultSize: 'full',
    minLevel: 1,
    requiredPhase: 'Stability',
  },
  {
    id: 'monte_carlo',
    name: 'Monte Carlo',
    description: 'Scenario-analyse met kansverdelingen',
    module: 'horizon',
    sizes: ['quarter', 'half', 'full'],
    defaultSize: 'full',
    minLevel: 3,
    requiredPhase: 'Momentum',
  },
  {
    id: 'levensgebeurtenissen',
    name: 'Levensgebeurtenissen',
    description: 'Impact van life events op je plan',
    module: 'horizon',
    sizes: ['quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: 1,
    requiredPhase: 'Stability',
  },
  {
    id: 'spaarquote',
    name: 'Spaarquote',
    description: 'Percentage van inkomen dat je spaart',
    module: 'kern',
    sizes: ['quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: -2,
  },
  {
    id: 'vrijheidsvoortgang',
    name: 'Vrijheidsvoortgang',
    description: 'Voortgang naar FIRE doel in %',
    module: 'cross',
    sizes: ['quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: -2,
  },
  {
    id: 'abonnementen',
    name: 'Abonnementen',
    description: 'Maandelijkse vaste lasten kalender',
    module: 'kern',
    sizes: ['quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: -2,
  },
  {
    id: 'jouw_pad',
    name: 'Jouw Pad',
    description: 'Sovereignty level en voortgang',
    module: 'cross',
    sizes: ['quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: -2,
  },
  {
    id: 'veerkracht_score',
    name: 'Veerkracht Score',
    description: 'Financiële weerbaarheid 0-100',
    module: 'horizon',
    sizes: ['quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: 1,
    requiredPhase: 'Stability',
  },
  {
    id: 'belasting_box3',
    name: 'Box 3 Belasting',
    description: 'Vermogensbelasting berekening',
    module: 'kern',
    sizes: ['quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: 1,
    requiredPhase: 'Stability',
  },
  {
    id: 'terugkerende_transacties',
    name: 'Vaste Lasten',
    description: 'Terugkerende transacties dit jaar',
    module: 'kern',
    sizes: ['quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: -2,
  },
  {
    id: 'nibud_benchmark',
    name: 'NIBUD Benchmark',
    description: 'Vergelijking met NIBUD richtlijnen',
    module: 'kern',
    sizes: ['quarter', 'half', 'full'],
    defaultSize: 'full',
    minLevel: -2,
  },
  {
    id: 'vrijheidsscenarios',
    name: "Vrijheidsscenario's",
    description: 'Pessimistisch / verwacht / optimistisch FIRE-leeftijd',
    module: 'horizon',
    sizes: ['quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: 1,
    requiredPhase: 'Stability',
  },
  {
    id: 'sim_vermogenspad',
    name: 'Vermogenspad',
    description: 'Gesimuleerd vermogenspad naar FIRE en daarna',
    module: 'horizon',
    sizes: ['quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: 1,
    requiredPhase: 'Stability',
  },
  {
    id: 'passief_inkomen',
    name: 'Passief Inkomen',
    description: 'Huidige passieve inkomsten vs. FIRE-doel',
    module: 'horizon',
    sizes: ['quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: 1,
    requiredPhase: 'Stability',
  },
  {
    id: 'box3_drag',
    name: 'Box 3 Belastingdrag',
    description: 'Jaarlijkse Box 3-belasting in euro\'s en vrijheidsdagen',
    module: 'horizon',
    sizes: ['quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: 1,
    requiredPhase: 'Stability',
  },
  {
    id: 'vrijheidsmijlpalen',
    name: 'Vrijheidsmijlpalen',
    description: 'Voortgang naar de 4 vrijheidsmijlpalen met datums',
    module: 'horizon',
    sizes: ['quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: 0,
  },
  {
    id: 'backtesting_score',
    name: 'Historische Weerbaarheid',
    description: 'Hoe je plan presteert bij historische marktcrises',
    module: 'horizon',
    sizes: ['quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: 3,
    requiredPhase: 'Momentum',
  },
  {
    id: 'meldingen',
    name: 'Meldingen',
    description: 'Notificaties en waarschuwingen',
    module: 'cross',
    sizes: ['quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: -2,
  },
  {
    id: 'badges',
    name: 'Badges',
    description: 'Verdiende badges en voortgang',
    module: 'cross',
    sizes: ['quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: -2,
  },
  {
    id: 'streaks',
    name: 'Streaks',
    description: 'Login-, budget- en actie-streaks',
    module: 'cross',
    sizes: ['quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: -2,
  },
  {
    id: 'ai_inzicht',
    name: 'AI Inzicht',
    description: 'Persoonlijke AI-gedreven inzichten',
    module: 'cross',
    sizes: ['quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: 0,
  },
  {
    id: 'volgende_stap',
    name: 'Volgende Stap',
    description: 'Aanbevolen volgende actie',
    module: 'cross',
    sizes: ['quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: -2,
  },
  {
    id: 'maandoverzicht',
    name: 'Maandoverzicht',
    description: 'Samenvatting van deze maand',
    module: 'cross',
    sizes: ['quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: -2,
  },
  {
    id: 'agenda',
    name: 'Agenda',
    description: 'Aankomende financiele gebeurtenissen',
    module: 'cross',
    sizes: ['quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: -2,
  },
  {
    id: 'noodfonds',
    name: 'Noodfonds',
    description: 'Voortgang noodfonds opbouw',
    module: 'kern',
    sizes: ['quarter', 'half', 'full'],
    defaultSize: 'half',
    minLevel: -2,
  },
  {
    id: 'huishouden_vergelijking',
    name: 'Huishouden Vergelijking',
    description: 'Vrijheidstijd per partner naast elkaar',
    module: 'kern',
    sizes: ['half', 'full'],
    defaultSize: 'half',
    minLevel: -2,
  },
  {
    id: 'huishouden_activiteit',
    name: 'Huishouden Activiteit',
    description: 'Recente gedeelde transacties van het huishouden',
    module: 'kern',
    sizes: ['half', 'full'],
    defaultSize: 'half',
    minLevel: -2,
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
  assets:                   '/core/assets',
  schulden:                 '/core/debts',
  holdings:                 '/core/assets',
  voorstellen:              '/will',
  acties:                   '/will',
  doelen:                   '/will',
  fire_prognose:            '/horizon?modal=projections',
  monte_carlo:              '/horizon?modal=simulations',
  levensgebeurtenissen:     '/horizon?modal=life_events',
  spaarquote:               '/core',
  vrijheidsvoortgang:       '/horizon',
  abonnementen:             '/will?modal=subscriptions',
  jouw_pad:                 '/identity',
  veerkracht_score:         '/horizon',
  belasting_box3:           '/core/debts',
  terugkerende_transacties: '/core/cash',
  nibud_benchmark:          '/core',
  vrijheidsscenarios:       '/horizon?modal=scenarios',
  sim_vermogenspad:         '/horizon?modal=simulations',
  passief_inkomen:          '/horizon',
  box3_drag:                '/core/debts',
  vrijheidsmijlpalen:       '/horizon',
  backtesting_score:        '/horizon?modal=backtesting',
  meldingen:                '/berichten',
  badges:                   '/identity',
  streaks:                  '/identity',
  ai_inzicht:               '/dashboard',
  volgende_stap:            '/will',
  maandoverzicht:           '/core',
  agenda:                   '/core/cash',
  noodfonds:                '/core',
  huishouden_vergelijking:  '/core',
  huishouden_activiteit:   '/core/cash',
}

// ── Widget → Feature-phase mapping ───────────────────────────
// Maps widget catalog ids to feature-phase matrix ids.
// Single source of truth for which feature controls which widget.
// Widgets NOT in this map are always available (no feature gating).

export const WIDGET_FEATURE_MAP: Record<string, string> = {
  assets:               'widget_assets',
  belasting_box3:       'widget_belasting',
  holdings:             'widget_holdings',
  monte_carlo:          'widget_monte_carlo',
  voorstellen:          'widget_voorstellen',
  doelen:               'doelen_systeem',
  fire_prognose:        'fire_projecties',
  levensgebeurtenissen: 'levensgebeurtenissen',
  veerkracht_score:     'veerkracht_score',
  vrijheidsscenarios:   'widget_vrijheidsscenarios',
  sim_vermogenspad:     'widget_sim_vermogenspad',
  passief_inkomen:      'widget_passief_inkomen',
  box3_drag:            'widget_box3_drag',
  vrijheidsmijlpalen:  'widget_vrijheidsmijlpalen',
  backtesting_score:    'widget_backtesting_score',
  ai_inzicht:           'widget_ai_inzicht',
  nibud_benchmark:      'nibud_benchmark',
}

// ── Sync minLevel & requiredPhase from matrix ────────────────
// Override hardcoded values with derived values from DEFAULT_MATRIX
// to prevent drift between widget-catalog and feature-phases.
for (const widget of WIDGET_CATALOG) {
  const featureId = WIDGET_FEATURE_MAP[widget.id]
  if (featureId) {
    widget.minLevel = deriveMinLevel(featureId)
    widget.requiredPhase = deriveRequiredPhase(featureId)
  }
}

/** Allowed sizes for dynamic budget_fav:* widgets */
export const BUDGET_FAV_SIZES: WidgetSize[] = ['quarter', 'half', 'full']

/** Get the widget definition by id */
export function getWidgetDef(id: string): WidgetDef | undefined {
  return WIDGET_CATALOG.find(w => w.id === id)
}

/** Merge saved prefs with catalog defaults (adds new widgets, removes stale ones).
 *  Preserves dynamic widget prefs (e.g. budget_fav:*) from saved data. */
export function mergeWidgetPrefs(saved: WidgetPrefs | null): WidgetPrefs {
  if (!saved?.widgets) return DEFAULT_WIDGET_PREFS

  const savedMap = new Map(saved.widgets.map(w => [w.id, w]))
  const merged: WidgetPref[] = WIDGET_CATALOG.map((def, i) => {
    const existing = savedMap.get(def.id)
    if (existing) return existing
    // New widget not in saved prefs — add with disabled default
    return { id: def.id, enabled: false, size: def.defaultSize, order: 100 + i }
  })

  // Preserve dynamic widget prefs (budget_fav:*) from saved data
  for (const w of saved.widgets) {
    if (w.id.startsWith('budget_fav:')) merged.push(w)
  }

  return { widgets: merged }
}
