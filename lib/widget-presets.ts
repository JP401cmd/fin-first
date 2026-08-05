// ── Widget Presets ─────────────────────────────────────────────
// Persona-based preset configurations for the dashboard widget grid.
// Each preset defines a curated selection of widgets tailored to a user archetype.

import { WIDGET_CATALOG, type WidgetPref, type WidgetModule } from '@/lib/widget-catalog'

export interface WidgetPreset {
  id: string
  name: string
  description: string
  module: WidgetModule
  icon: string          // Lucide icon name
  widgets: WidgetPref[]
}

/**
 * Four persona presets for quick dashboard configuration.
 * Widget arrays will be populated in subsequent features.
 */
export const WIDGET_PRESETS: WidgetPreset[] = [
  {
    id: 'pensioenplanner',
    name: 'Pensioenplanner',
    description: 'Focus op pensioen, AOW en langetermijnprojecties',
    module: 'horizon',
    icon: 'CalendarClock',
    widgets: [
      { id: 'fire_prognose',       enabled: true, size: 'full',    order: 1 },
      { id: 'netto_vermogen',      enabled: true, size: 'half',    order: 2 },
      { id: 'sim_vermogenspad',    enabled: true, size: 'half',    order: 3 },
      { id: 'vrijheidsmijlpalen', enabled: true, size: 'quarter', order: 4 },
      { id: 'levensgebeurtenissen',enabled: true, size: 'quarter', order: 5 },
      { id: 'cash_flow',           enabled: true, size: 'quarter', order: 6 },
    ],
  },
  {
    id: 'vermogensverdeler',
    name: 'Vermogensverdeler',
    description: 'Focus op vermogensopbouw, beleggingen en allocatie',
    module: 'kern',
    icon: 'PieChart',
    widgets: [
      { id: 'netto_vermogen',      enabled: true, size: 'full',    order: 1 },
      { id: 'box3_drag',           enabled: true, size: 'half',    order: 2 },
      { id: 'schulden',            enabled: true, size: 'half',    order: 3 },
      { id: 'spaarquote',          enabled: true, size: 'quarter', order: 4 },
      { id: 'cash_flow',           enabled: true, size: 'quarter', order: 5 },
      { id: 'vrijheidsvoortgang',  enabled: true, size: 'quarter', order: 6 },
    ],
  },
  {
    id: 'budgetteerder',
    name: 'Budgetteerder',
    description: 'Focus op budgetten, uitgaven en cashflow',
    module: 'kern',
    icon: 'Wallet',
    widgets: [
      { id: 'cash_flow',            enabled: true, size: 'full',    order: 1 },
      { id: 'spaarquote',           enabled: true, size: 'half',    order: 2 },
      { id: 'acties',               enabled: true, size: 'half',    order: 3 },
      { id: 'netto_vermogen',       enabled: true, size: 'quarter', order: 4 },
      { id: 'vrijheidsvoortgang',   enabled: true, size: 'quarter', order: 5 },
      { id: 'fire_prognose',        enabled: true, size: 'quarter', order: 6 },
    ],
  },
  {
    id: 'fire-strijder',
    name: 'FIRE Strijder',
    description: 'Focus op financiele onafhankelijkheid en early retirement',
    module: 'horizon',
    icon: 'Flame',
    widgets: [
      { id: 'fire_prognose',        enabled: true, size: 'full',    order: 1 },
      { id: 'vrijheidsscenarios',   enabled: true, size: 'half',    order: 2 },
      { id: 'sim_vermogenspad',     enabled: true, size: 'half',    order: 3 },
      { id: 'backtesting_score',    enabled: true, size: 'quarter', order: 4 },
      { id: 'spaarquote',           enabled: true, size: 'quarter', order: 5 },
      { id: 'vrijheidsmijlpalen',   enabled: true, size: 'quarter', order: 6 },
    ],
  },
]

/**
 * Look up a preset by its slug id.
 */
export function getWidgetPreset(id: string): WidgetPreset | undefined {
  return WIDGET_PRESETS.find(p => p.id === id)
}

// ── Opschonen van opgeslagen presets ───────────────────────────────
//
// De beheerder-override leeft als JSON-blob in app_settings (key
// 'widget_presets') en beweegt NIET mee wanneer een widget uit
// WIDGET_CATALOG verdwijnt. Een verwijderde widget bleef daardoor als
// wees-id in de opgeslagen preset staan: /beheer/widget-presets toonde de
// kale interne id zonder foutindicatie en widget-renderer liet het slot
// stilzwijgend vallen (`getWidgetDef(id)` → undefined → `return null`),
// waardoor een gebruiker mínder widgets kreeg dan het getoonde aantal.
//
// Daarom schonen we bij het LEZEN op: dat repareert de bestaande rij zonder
// DB-ingreep én voorkomt dat een toekomstige widget-verwijdering opnieuw
// stil bederft. Bewust geen terugschrijven op GET: die route wordt door
// élke ingelogde gebruiker geraakt (dashboard-dropdown), terwijl het
// RLS-beleid op app_settings schrijven tot superadmin beperkt — een
// self-heal-write zou voor gewone gebruikers simpelweg falen.

/** Dynamische favoriet-widgets hebben bewust geen catalogus-entry. */
function isDynamicWidgetId(id: string): boolean {
  return id.startsWith('budget_fav:') || id.startsWith('holding_fav:')
}

/**
 * Is dit widget-id bruikbaar in een preset? Spiegelt exact de validatie in
 * PUT /api/widget-presets, zodat lezen en schrijven dezelfde grens hanteren.
 */
export function isKnownPresetWidgetId(id: string): boolean {
  if (!id) return false
  if (isDynamicWidgetId(id)) return true
  return WIDGET_CATALOG.some(w => w.id === id)
}

/**
 * Verwijder wees-ids uit een widgetlijst. Is er daadwerkelijk iets
 * weggevallen, dan worden de resterende `order`-waarden hernummerd naar
 * 1..n (dezelfde conventie als de sleep-herordening in de beheer-UI), zodat
 * er geen gat in de volgorde achterblijft. Zonder wezen blijft de lijst
 * ongemoeid — schoon opgeslagen presets veranderen dus niet van vorm.
 */
export function sanitizePresetWidgets(widgets: WidgetPref[]): WidgetPref[] {
  if (!Array.isArray(widgets)) return []
  const kept = widgets.filter(w => w && isKnownPresetWidgetId(w.id))
  if (kept.length === widgets.length) return widgets
  return [...kept]
    .sort((a, b) => a.order - b.order)
    .map((w, i) => ({ ...w, order: i + 1 }))
}

/**
 * Pas `sanitizePresetWidgets` toe op elke preset uit de opgeslagen blob.
 */
export function sanitizeStoredPresets(presets: WidgetPreset[]): WidgetPreset[] {
  return presets.map(p => {
    const widgets = sanitizePresetWidgets(p.widgets)
    return widgets === p.widgets ? p : { ...p, widgets }
  })
}
