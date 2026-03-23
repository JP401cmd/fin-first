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
    widgets: [],
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
    widgets: [],
  },
  {
    id: 'fire-strijder',
    name: 'FIRE Strijder',
    description: 'Focus op financiele onafhankelijkheid en early retirement',
    module: 'horizon',
    icon: 'Flame',
    widgets: [],
  },
]

/**
 * Look up a preset by its slug id.
 */
export function getWidgetPreset(id: string): WidgetPreset | undefined {
  return WIDGET_PRESETS.find(p => p.id === id)
}
