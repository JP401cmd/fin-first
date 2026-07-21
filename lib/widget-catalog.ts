// ── Widget Catalog ────────────────────────────────────────────
// Static definition of all dashboard widgets.

import { WIDGET_TO_FEATURE } from '@/lib/feature-registry'
import type { ModuleId } from '@/lib/module-registry'
import { getWidgetRequiredModule } from '@/lib/module-registry'

// 'xl' ("Double" in de UI) is een opt-in bouwblok voor stats-heavy widgets:
// alleen widgets die 'xl' expliciet in hun `sizes` hebben, bieden de optie aan.
// Op mobiel bestaat Double niet — de selector biedt 'm daar niet aan en de
// weergave zakt via downsizeForMobile terug naar 'full'.
export type WidgetSize = 'mini' | 'quarter' | 'half' | 'full' | 'xl'

/** Downsize a widget one step for mobile display: xl→full, full→half, half→quarter, quarter→mini */
export function downsizeForMobile(size: WidgetSize): WidgetSize {
  switch (size) {
    case 'xl': return 'full'
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

export const WIDGET_CATALOG: WidgetDef[] = [
  {
    id: 'netto_vermogen',
    name: 'Netto Vermogen',
    description: 'Totaal vermogen minus schulden',
    module: 'kern',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
  },
  {
    id: 'cash_flow',
    name: 'Cashflow Maand',
    description: 'Inkomsten en uitgaven deze maand',
    module: 'kern',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
  },
  {
    id: 'budgetten',
    name: 'Budgetten',
    description: 'Je drukste budgetten deze maand',
    module: 'kern',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
  },
  {
    id: 'uitgaven_heatmap',
    name: 'Uitgaven Heatmap',
    description: 'Treemap-visualisatie van uitgaven per hoofdcategorie',
    module: 'kern',
    // 'xl' (Double): dubbele breedte → grotere cellen met icoon + bedrag +
    // maand-op-maand-trend, i.p.v. de smallere full-treemap.
    sizes: ['mini', 'quarter', 'half', 'full', 'xl'],
    defaultSize: 'half',
  },
  {
    id: 'assets',
    name: 'Vermogen',
    description: 'Portfolio allocatie en groei',
    module: 'kern',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
  },
  {
    id: 'schulden',
    name: 'Schulden',
    description: 'Openstaande schulden en aflossingstatus',
    module: 'kern',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
  },
  {
    id: 'holdings',
    name: 'Beleggingen',
    description: 'Beleggingsportefeuille overzicht',
    module: 'kern',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
  },
  {
    id: 'voorstellen',
    name: 'Tips',
    description: 'Persoonlijke tips van Fin',
    module: 'wil',
    // 'xl' (Double): horizontale impactvergelijking van de top-tips' jaarlijkse
    // vrijheidsdagen — benut de dubbele breedte i.p.v. dezelfde lijst rekken.
    sizes: ['mini', 'quarter', 'half', 'full', 'xl'],
    defaultSize: 'half',
  },
  {
    id: 'acties',
    name: 'Acties',
    description: 'Open acties en vrijheidsdagen te winnen',
    module: 'wil',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
  },
  {
    id: 'doelen',
    name: 'Doelen',
    description: 'Actieve financiële doelen',
    module: 'wil',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
  },
  {
    id: 'fire_prognose',
    name: 'FIRE Prognose',
    description: 'Countdown naar financiële vrijheid',
    module: 'horizon',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'full',
  },
  {
    id: 'monte_carlo',
    name: 'Monte Carlo',
    description: 'Scenario-analyse met kansverdelingen',
    module: 'horizon',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'full',
  },
  {
    id: 'levensgebeurtenissen',
    name: 'Levensgebeurtenissen',
    description: 'Impact van life events op je plan',
    module: 'horizon',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
  },
  {
    id: 'spaarquote',
    name: 'Spaarquote',
    description: 'Percentage van inkomen dat je spaart',
    module: 'kern',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
  },
  {
    id: 'vrijheidsvoortgang',
    name: 'Vrijheidsvoortgang',
    description: 'Voortgang naar FIRE doel in %',
    module: 'cross',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
  },
  {
    id: 'vaste_lasten',
    name: 'Vaste Lasten',
    description: 'Abonnementen en terugkerende kosten in één overzicht',
    module: 'kern',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
  },
  {
    id: 'jouw_pad',
    name: 'Jouw Pad',
    description: 'Sovereignty level en voortgang',
    module: 'cross',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
  },
  {
    id: 'gezondheids_score',
    name: 'Financiële Gezondheid',
    description: 'Financiële gezondheidsscore 0-100',
    module: 'horizon',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
  },
  {
    id: 'belasting_box3',
    name: 'Box 3 Belasting',
    description: 'Vermogensbelasting berekening',
    module: 'kern',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
  },
  {
    id: 'vrijheidsscenarios',
    name: "Vrijheidsscenario's",
    description: 'Pessimistisch / verwacht / optimistisch FIRE-leeftijd',
    module: 'horizon',
    // 'xl' (Double): dubbele breedte → een echte vrijheidstijd-as (jaren vanaf nu)
    // met de drie scenario-markers + dynamisch scenario-rendement, i.p.v. de
    // statische voetregel van de full-variant.
    sizes: ['mini', 'quarter', 'half', 'full', 'xl'],
    defaultSize: 'half',
  },
  {
    id: 'sim_vermogenspad',
    name: 'Vermogenspad',
    description: 'Gesimuleerd vermogenspad naar FIRE en daarna',
    module: 'horizon',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
  },
  {
    id: 'box3_drag',
    name: 'Box 3 Belastingdrag',
    description: 'Jaarlijkse Box 3-belasting in euro\'s en vrijheidsdagen',
    module: 'horizon',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
  },
  {
    id: 'vrijheidsmijlpalen',
    name: 'Vrijheidsmijlpalen',
    description: 'Voortgang naar de 4 vrijheidsmijlpalen met datums',
    module: 'horizon',
    // 'xl' (Double): dubbele breedte → de mijlpaal-tijdlijn met eronder een
    // mini-vermogenspad-sparkline (uit data.simRows) waarop de vier mijlpalen
    // in de tijd geprojecteerd staan. Zie de xl-rendertak in de widget zelf.
    sizes: ['mini', 'quarter', 'half', 'full', 'xl'],
    defaultSize: 'half',
  },
  {
    id: 'backtesting_score',
    name: 'Historische Weerbaarheid',
    description: 'Hoe je plan presteert bij historische marktcrises',
    module: 'horizon',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
  },
  {
    id: 'surplus_gap',
    name: 'Surplus / Gap',
    description: 'Jaarlijkse vermogensstromen — opbouw vs. inteer',
    module: 'horizon',
    sizes: ['quarter', 'half', 'full'],
    defaultSize: 'half',
  },
  {
    id: 'inflatie_impact',
    name: 'Inflatie-impact',
    description: 'Koopkrachtverlies door inflatie over tijd',
    module: 'horizon',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
  },
  {
    id: 'beleggingsrendement',
    name: 'Beleggingsrendement',
    description: 'Totaalrendement sinds aankoop, per beleggingstype',
    module: 'kern',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
  },
  {
    id: 'swr_monitor',
    name: 'SWR Monitor',
    description: 'Safe Withdrawal Rate na Box 3 + inflatie met scenario-vergelijking',
    module: 'horizon',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
  },
  {
    id: 'pensioen_aow',
    name: 'Pensioen / AOW',
    description: 'AOW-leeftijd countdown en verwacht bedrag',
    module: 'horizon',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
  },
  {
    id: 'meldingen',
    name: 'Meldingen',
    description: 'Notificaties en waarschuwingen',
    module: 'cross',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
  },
  {
    id: 'ai_inzicht',
    name: 'AI Inzicht',
    description: 'Persoonlijke AI-gedreven inzichten',
    module: 'cross',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
  },
  {
    id: 'volgende_stap',
    name: 'Volgende Stap',
    description: 'Aanbevolen volgende actie',
    module: 'cross',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
  },
  {
    id: 'maandoverzicht',
    name: 'Maandoverzicht',
    description: 'Samenvatting van deze maand',
    module: 'cross',
    // Eerste widget met de opt-in 'xl' (Double): stats-heavy rapportkaart
    // die de volle breedte benut. Zie de xl-rendertak in de widget zelf.
    sizes: ['mini', 'quarter', 'half', 'full', 'xl'],
    defaultSize: 'half',
  },
  {
    id: 'weekoverzicht',
    name: 'Weekoverzicht',
    description: 'Wekelijks uitgavenoverzicht met dagelijks staafdiagram',
    module: 'kern',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
  },
  {
    id: 'agenda',
    name: 'Agenda',
    description: 'Aankomende financiele gebeurtenissen',
    module: 'cross',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
  },
  {
    id: 'noodfonds',
    name: 'Noodfonds',
    description: 'Voortgang noodfonds opbouw',
    module: 'kern',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
  },
  {
    id: 'huishouden_vergelijking',
    name: 'Huishouden Vergelijking',
    description: 'Vrijheidstijd per partner naast elkaar',
    module: 'kern',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
  },
  {
    id: 'huishouden_activiteit',
    name: 'Huishouden Activiteit',
    description: 'Recente gedeelde transacties van het huishouden',
    module: 'kern',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
  },
  {
    id: 'beslissingspatronen',
    name: 'Beslissingspatronen',
    description: 'Vrijheidsdagen gewonnen per type actie',
    module: 'wil',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
  },
  {
    id: 'vrijheidsdagen_maand',
    name: 'Gewonnen vrijheidsdagen/maand',
    description: 'Maandelijkse trend van gewonnen vrijheidsdagen',
    module: 'wil',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
  },
  {
    id: 'wilskracht',
    name: 'Wilskracht',
    description: 'Wilskrachtscore en vrijheidsdagen gewonnen',
    module: 'wil',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
  },
  {
    // NB: id blijft `berichten` (bestaande layouts/widget_prefs ongewijzigd) —
    // alleen het label wijzigt van "Berichten" naar "Nieuws" zodat naam,
    // inhoud en bestemming (/nieuws) samenvallen. Zie widgetreview 2026-07-17.
    id: 'berichten',
    name: 'Nieuws',
    description: 'Laatste nieuws uit je persoonlijke editie',
    module: 'cross',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
  },
  {
    id: 'trend_inkomen',
    name: 'Inkomentrend',
    description: 'Maandelijkse inkomstentrend',
    module: 'kern',
    // 'xl' (Double): dubbele breedte → staafhistogram tot 24 maanden (waar de
    // bundel historie levert) met maandlabels + streeflijn + cijferstrip. Zie de
    // xl-rendertak in components/widgets/budget-trend-widget.tsx.
    sizes: ['mini', 'quarter', 'half', 'full', 'xl'],
    defaultSize: 'half',
  },
  {
    id: 'trend_uitgaven',
    name: 'Uitgaventrend',
    description: 'Maandelijkse uitgaventrend',
    module: 'kern',
    // 'xl' (Double): dubbele breedte → 12-maands staafhistogram met budgetband
    // (per maand over/onder budget) + cijferstrip. Zie de xl-rendertak in
    // components/widgets/budget-trend-widget.tsx.
    sizes: ['mini', 'quarter', 'half', 'full', 'xl'],
    defaultSize: 'half',
  },
  {
    id: 'trend_sparen',
    name: 'Spaartrend',
    description: 'Maandelijkse spaartrend',
    module: 'kern',
    // 'xl' (Double): dubbele breedte → staafhistogram met per-maand waarde-labels
    // op de staven (sparen = vrijheid opbouwen) + doel-referentielijn + cijferstrip.
    // Zie de xl-rendertak in components/widgets/budget-trend-widget.tsx.
    sizes: ['mini', 'quarter', 'half', 'full', 'xl'],
    defaultSize: 'half',
  },
  {
    id: 'trend_schulden',
    name: 'Schuldtrend',
    description: 'Maandelijkse schuldaflossingstrend',
    module: 'kern',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
  },
  {
    id: 'rebalancing',
    name: 'Rebalancing',
    description: 'Portfolio drift analyse met target vs actuele allocatie',
    module: 'kern',
    // 'xl' (Double): dubbele breedte → links de allocatie-diagnose (dumbbell
    // current ↔ target), rechts de concrete trade-lijst + Box 3-peildatumbanner.
    sizes: ['mini', 'quarter', 'half', 'full', 'xl'],
    defaultSize: 'half',
  },
  {
    id: 'fee_analyzer',
    name: 'Kostenanalyse',
    description: 'Totale portefeuillekosten en FIRE-impact van fondsbeheer',
    module: 'kern',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
  },
  {
    id: 'hypotheek_vs_beleggen',
    name: 'Hypotheek vs Beleggen',
    description: 'Samenvatting hypotheek vs beleggen vergelijking met breakeven rendement',
    module: 'kern',
    sizes: ['mini', 'quarter', 'half', 'full'],
    defaultSize: 'half',
  },
]

/**
 * Standaard-widgetprefs voor een gebruiker zónder opgeslagen `widget_prefs`.
 *
 * Bewust ALLE widgets uit (`enabled: false`). De enige render-plek van de
 * widget-grid is de /overzicht hero-rail (`HeroWidgetRail`), die bij
 * `hasActiveWidgets === false` de standaard Voortgang-doelen + Vrijheidsstrip
 * toont. Een onaangeraakt account hoort die defaults te zien — niet de
 * widget-grid. De grid verschijnt alleen wanneer de gebruiker (a) zelf een
 * widget aanzet, of (b) een budget/holding favoriet maakt (de loader injecteert
 * dan een enabled `budget_fav:`/`holding_fav:`-pref). Vroeger stonden hier 7
 * widgets default aan, waardoor élk vers account de grid zag i.p.v. de defaults.
 */
export const DEFAULT_WIDGET_PREFS: WidgetPrefs = {
  widgets: WIDGET_CATALOG.map((w, i) => ({
    id: w.id,
    enabled: false,
    size: w.defaultSize,
    order: i,
  })),
}

// ── Widget navigation targets ─────────────────────────────────
// Each widget links directly to its module page.
// Where a modal can be auto-opened via URL param, include ?modal=...

export const WIDGET_HREFS: Record<string, string> = {
  netto_vermogen:           '/overzicht',
  cash_flow:                '/overzicht/cashflow',
  budgetten:                '/overzicht/cashflow/budget',
  uitgaven_heatmap:         '/overzicht/cashflow/budget',
  assets:                   '/overzicht/bezittingen',
  schulden:                 '/overzicht/schulden',
  holdings:                 '/overzicht/bezittingen/investment?tab=aandelen-holdings',
  voorstellen:              '/overzicht/tips',
  acties:                   '/overzicht/tips#acties',
  doelen:                   '/toekomst/doelen',
  fire_prognose:            '/toekomst',
  monte_carlo:              '/toekomst?modal=simulations',
  levensgebeurtenissen:     '/toekomst/gebeurtenissen',
  spaarquote:               '/overzicht/cashflow/forecast',
  vrijheidsvoortgang:       '/toekomst',
  vaste_lasten:             '/overzicht/cashflow?view=vaste-lasten',
  jouw_pad:                 '/mijn',
  gezondheids_score:        '/toekomst',
  belasting_box3:           '/overzicht/belasting/box3',
  vrijheidsscenarios:       '/toekomst?modal=scenarios',
  sim_vermogenspad:         '/toekomst?modal=simulations',
  box3_drag:                '/overzicht/belasting/box3',
  vrijheidsmijlpalen:       '/toekomst',
  backtesting_score:        '/toekomst?modal=backtesting',
  surplus_gap:              '/toekomst#vermogensstromen',
  swr_monitor:              '/toekomst/voorkeuren',
  inflatie_impact:          '/toekomst/voorkeuren',
  beleggingsrendement:      '/overzicht/bezittingen',
  pensioen_aow:             '/toekomst/gebeurtenissen',
  meldingen:                '/berichten',
  ai_inzicht:               '/berichten',
  volgende_stap:            '/overzicht/tips',
  maandoverzicht:           '/overzicht/cashflow',
  weekoverzicht:            '/overzicht/cashflow',
  agenda:                   '/overzicht/cashflow',
  noodfonds:                '/overzicht/cashflow/budget',
  huishouden_vergelijking:  '/overzicht',
  huishouden_activiteit:   '/overzicht/cashflow/transacties',
  beslissingspatronen:     '/overzicht/tips',
  vrijheidsdagen_maand:    '/overzicht/tips',
  wilskracht:              '/overzicht/tips',
  berichten:               '/nieuws',
  trend_inkomen:           '/overzicht/cashflow/forecast',
  trend_uitgaven:          '/overzicht/cashflow/forecast',
  trend_sparen:            '/overzicht/cashflow/forecast',
  trend_schulden:          '/overzicht/cashflow/forecast',
  rebalancing:             '/overzicht/bezittingen',
  fee_analyzer:            '/overzicht/bezittingen',
  hypotheek_vs_beleggen:   '/overzicht/schulden/mortgage',
}

// ── Widget → Feature mapping ─────────────────────────────────
// Maps widget catalog ids to unified feature ids.
// Generated from feature-registry.ts WIDGET_TO_FEATURE.
// Widgets NOT in this map are always available (no feature gating).

export const WIDGET_FEATURE_MAP: Record<string, string> = WIDGET_TO_FEATURE

// ── Sync requiredModule from module-registry ─────────────────────────────────
// Single source of truth: WIDGET_MODULE_MAP drives requiredModule. Running this
// loop prevents drift between widget-catalog and module-registry.
for (const widget of WIDGET_CATALOG) {
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
  'noodfonds',
  'trend_inkomen',
  'trend_uitgaven',
  'trend_sparen',
  'trend_schulden',
  'maandoverzicht',
  'weekoverzicht',
  'huishouden_activiteit',
])

/** Allowed sizes for dynamic budget_fav:* widgets (geen mini; xl = Double, desktop-only) */
export const BUDGET_FAV_SIZES: WidgetSize[] = ['quarter', 'half', 'full', 'xl']

/** Allowed sizes for dynamic holding_fav:* widgets (geen mini; xl = Double, desktop-only) */
export const HOLDING_FAV_SIZES: WidgetSize[] = ['quarter', 'half', 'full', 'xl']

/** Get the widget definition by id */
export function getWidgetDef(id: string): WidgetDef | undefined {
  return WIDGET_CATALOG.find(w => w.id === id)
}

/**
 * Canonieke toegestane maten voor een widget-id — inclusief de dynamische
 * favorieten (`budget_fav:*`, `holding_fav:*`) die geen catalog-entry hebben.
 * Eén bron zodat de maatkiezer, fill-all-clamp en auto-builder niet driften.
 */
export function getWidgetSizes(id: string): WidgetSize[] {
  if (id.startsWith('budget_fav:')) return BUDGET_FAV_SIZES
  if (id.startsWith('holding_fav:')) return HOLDING_FAV_SIZES
  return getWidgetDef(id)?.sizes ?? ['quarter', 'half', 'full']
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
