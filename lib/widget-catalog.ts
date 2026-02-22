// ── Widget Catalog ────────────────────────────────────────────
// Static definition of all 20 dashboard widgets.

export type WidgetSize = 'half' | 'full'
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

export const WIDGET_CATALOG: WidgetDef[] = [
  {
    id: 'netto_vermogen',
    name: 'Netto Vermogen',
    description: 'Totaal vermogen minus schulden',
    module: 'kern',
    sizes: ['half', 'full'],
    defaultSize: 'half',
    minLevel: -2,
  },
  {
    id: 'cash_flow',
    name: 'Cashflow Maand',
    description: 'Inkomsten en uitgaven deze maand',
    module: 'kern',
    sizes: ['half', 'full'],
    defaultSize: 'half',
    minLevel: -2,
  },
  {
    id: 'budgetten',
    name: 'Budgetten',
    description: 'Top budgetten en bestedingen',
    module: 'kern',
    sizes: ['half', 'full'],
    defaultSize: 'half',
    minLevel: -2,
  },
  {
    id: 'assets',
    name: 'Vermogen',
    description: 'Portfolio allocatie en groei',
    module: 'kern',
    sizes: ['half', 'full'],
    defaultSize: 'half',
    minLevel: 1,
    requiredPhase: 'Stability',
  },
  {
    id: 'schulden',
    name: 'Schulden',
    description: 'Openstaande schulden en aflossingstatus',
    module: 'kern',
    sizes: ['half', 'full'],
    defaultSize: 'half',
    minLevel: -2,
  },
  {
    id: 'holdings',
    name: 'Beleggingen',
    description: 'Beleggingsportefeuille overzicht',
    module: 'kern',
    sizes: ['half', 'full'],
    defaultSize: 'half',
    minLevel: 3,
    requiredPhase: 'Momentum',
  },
  {
    id: 'voorstellen',
    name: 'Voorstellen',
    description: 'Persoonlijke aanbevelingen',
    module: 'wil',
    sizes: ['half', 'full'],
    defaultSize: 'half',
    minLevel: 1,
    requiredPhase: 'Stability',
  },
  {
    id: 'acties',
    name: 'Acties',
    description: 'Open acties en vrijheidsdagen te winnen',
    module: 'wil',
    sizes: ['half', 'full'],
    defaultSize: 'half',
    minLevel: -2,
  },
  {
    id: 'doelen',
    name: 'Doelen',
    description: 'Actieve financiële doelen',
    module: 'wil',
    sizes: ['half', 'full'],
    defaultSize: 'half',
    minLevel: 1,
    requiredPhase: 'Stability',
  },
  {
    id: 'fire_prognose',
    name: 'FIRE Prognose',
    description: 'Countdown naar financiële vrijheid',
    module: 'horizon',
    sizes: ['half', 'full'],
    defaultSize: 'full',
    minLevel: 1,
    requiredPhase: 'Stability',
  },
  {
    id: 'monte_carlo',
    name: 'Monte Carlo',
    description: 'Scenario-analyse met kansverdelingen',
    module: 'horizon',
    sizes: ['full'],
    defaultSize: 'full',
    minLevel: 3,
    requiredPhase: 'Momentum',
  },
  {
    id: 'levensgebeurtenissen',
    name: 'Levensgebeurtenissen',
    description: 'Impact van life events op je plan',
    module: 'horizon',
    sizes: ['half', 'full'],
    defaultSize: 'half',
    minLevel: 1,
    requiredPhase: 'Stability',
  },
  {
    id: 'spaarquote',
    name: 'Spaarquote',
    description: 'Percentage van inkomen dat je spaart',
    module: 'kern',
    sizes: ['half', 'full'],
    defaultSize: 'half',
    minLevel: -2,
  },
  {
    id: 'vrijheidsvoortgang',
    name: 'Vrijheidsvoortgang',
    description: 'Voortgang naar FIRE doel in %',
    module: 'cross',
    sizes: ['half', 'full'],
    defaultSize: 'half',
    minLevel: -2,
  },
  {
    id: 'abonnementen',
    name: 'Abonnementen',
    description: 'Maandelijkse vaste lasten kalender',
    module: 'kern',
    sizes: ['half', 'full'],
    defaultSize: 'half',
    minLevel: -2,
  },
  {
    id: 'jouw_pad',
    name: 'Jouw Pad',
    description: 'Sovereignty level en voortgang',
    module: 'cross',
    sizes: ['half', 'full'],
    defaultSize: 'half',
    minLevel: -2,
  },
  {
    id: 'veerkracht_score',
    name: 'Veerkracht Score',
    description: 'Financiële weerbaarheid 0-100',
    module: 'horizon',
    sizes: ['half', 'full'],
    defaultSize: 'half',
    minLevel: 1,
    requiredPhase: 'Stability',
  },
  {
    id: 'belasting_box3',
    name: 'Box 3 Belasting',
    description: 'Vermogensbelasting berekening',
    module: 'kern',
    sizes: ['half', 'full'],
    defaultSize: 'half',
    minLevel: 1,
    requiredPhase: 'Stability',
  },
  {
    id: 'terugkerende_transacties',
    name: 'Vaste Lasten',
    description: 'Terugkerende transacties dit jaar',
    module: 'kern',
    sizes: ['half', 'full'],
    defaultSize: 'half',
    minLevel: -2,
  },
  {
    id: 'nibud_benchmark',
    name: 'NIBUD Benchmark',
    description: 'Vergelijking met NIBUD richtlijnen',
    module: 'kern',
    sizes: ['full'],
    defaultSize: 'full',
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
  belasting_box3:           '/core/belasting',
  terugkerende_transacties: '/core/cash',
  nibud_benchmark:          '/core',
}

/** Get the widget definition by id */
export function getWidgetDef(id: string): WidgetDef | undefined {
  return WIDGET_CATALOG.find(w => w.id === id)
}

/** Merge saved prefs with catalog defaults (adds new widgets, removes stale ones) */
export function mergeWidgetPrefs(saved: WidgetPrefs | null): WidgetPrefs {
  if (!saved?.widgets) return DEFAULT_WIDGET_PREFS

  const savedMap = new Map(saved.widgets.map(w => [w.id, w]))
  const merged: WidgetPref[] = WIDGET_CATALOG.map((def, i) => {
    const existing = savedMap.get(def.id)
    if (existing) return existing
    // New widget not in saved prefs — add with disabled default
    return { id: def.id, enabled: false, size: def.defaultSize, order: 100 + i }
  })

  return { widgets: merged }
}
