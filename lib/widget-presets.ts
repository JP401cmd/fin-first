// ── Widget Presets ─────────────────────────────────────────────
// Persona-based preset configurations for the dashboard widget grid.
// Each preset defines a curated selection of widgets tailored to a user archetype.

import type { WidgetPref, WidgetModule } from '@/lib/widget-catalog'

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
      { id: 'passief_inkomen',     enabled: true, size: 'quarter', order: 4 },
      { id: 'vrijheidsmijlpalen', enabled: true, size: 'quarter', order: 5 },
      { id: 'levensgebeurtenissen',enabled: true, size: 'quarter', order: 6 },
      { id: 'cash_flow',           enabled: true, size: 'quarter', order: 7 },
    ],
  },
  {
    id: 'vermogensverdeler',
    name: 'Vermogensverdeler',
    description: 'Focus op vermogensopbouw, beleggingen en allocatie',
    module: 'kern',
    icon: 'PieChart',
    widgets: [],
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
      { id: 'jouw_pad',             enabled: true, size: 'quarter', order: 5 },
      { id: 'vrijheidsvoortgang',   enabled: true, size: 'quarter', order: 6 },
      { id: 'fire_prognose',        enabled: true, size: 'quarter', order: 7 },
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
      { id: 'passief_inkomen',      enabled: true, size: 'quarter', order: 7 },
    ],
  },
]

/**
 * Look up a preset by its slug id.
 */
export function getWidgetPreset(id: string): WidgetPreset | undefined {
  return WIDGET_PRESETS.find(p => p.id === id)
}
