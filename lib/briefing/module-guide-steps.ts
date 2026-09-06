// ── Module Guide Steps ──────────────────────────────────────
// Default onboarding/guide steps per module for the moduleGuide briefing card.
// Admin can override via app_settings key 'module_guide_steps'.

import type { ModuleId } from '@/lib/module-registry'

// ── Types ───────────────────────────────────────────────────

export interface ModuleGuideStep {
  key: string
  label: string
  href?: string
}

// ── Display Order ───────────────────────────────────────────
// Fixed rendering order for module guide cards in the briefing.

export const MODULE_GUIDE_DISPLAY_ORDER: ModuleId[] = [
  'budgetteren',
  'vermogensregistratie',
  'aandelenregistratie',
  'inzicht_acties',
  'toekomstplannen',
  'nieuws',
]

// ── Default Steps ───────────────────────────────────────────

export const DEFAULT_MODULE_GUIDE_STEPS: Record<ModuleId, ModuleGuideStep[]> = {
  budgetteren: [
    { key: 'budget_bekijk', label: 'Bekijk je budgetten', href: '/overzicht/budget' },
    { key: 'budget_nibud', label: 'Vergelijk met Nibud-normen', href: '/overzicht/budget' },
    { key: 'budget_spaarquote', label: 'Check je spaarquote', href: '/overzicht' },
    { key: 'budget_noodfonds', label: 'Controleer je noodfonds', href: '/overzicht' },
  ],
  vermogensregistratie: [
    { key: 'vermogen_netto', label: 'Bekijk je netto vermogen', href: '/overzicht' },
    { key: 'vermogen_bezittingen', label: 'Beheer je bezittingen', href: '/overzicht/bezittingen' },
    { key: 'vermogen_box3', label: 'Bekijk box 3 belasting', href: '/overzicht/belasting/box3' },
    { key: 'vermogen_allocatie', label: 'Bekijk je allocatie', href: '/overzicht' },
  ],
  aandelenregistratie: [
    { key: 'aandelen_holdings', label: 'Bekijk je holdings', href: '/overzicht/bezittingen' },
    { key: 'aandelen_rendement', label: 'Bekijk je rendement', href: '/overzicht' },
    { key: 'aandelen_rebalancing', label: 'Check rebalancing', href: '/overzicht' },
  ],
  inzicht_acties: [
    { key: 'inzicht_voorstellen', label: 'Bekijk AI-voorstellen', href: '/overzicht/tips' },
    { key: 'inzicht_detail', label: 'Verdiep je in een inzicht', href: '/overzicht/tips' },
    { key: 'inzicht_besluit', label: 'Neem een beslissing', href: '/overzicht/tips' },
    { key: 'inzicht_score', label: 'Bekijk je wilskracht-score', href: '/overzicht/tips' },
  ],
  toekomstplannen: [
    { key: 'horizon_fire', label: 'Bekijk je FIRE-prognose', href: '/toekomst' },
    { key: 'horizon_params', label: 'Stel je parameters in', href: '/toekomst/voorkeuren' },
    { key: 'horizon_mijlpalen', label: 'Bekijk je mijlpalen', href: '/toekomst' },
    { key: 'horizon_scenario', label: 'Verken scenario\'s', href: '/toekomst' },
  ],
  nieuws: [
    { key: 'nieuws_blader', label: 'Blader door het nieuws', href: '/nieuws' },
    { key: 'nieuws_personaliseer', label: 'Personaliseer je nieuwsfeed', href: '/nieuws' },
  ],
}

// ── Getter ──────────────────────────────────────────────────

/**
 * Get module guide steps, with optional override from app_settings.
 * Falls back to DEFAULT_MODULE_GUIDE_STEPS when no override is provided.
 *
 * @param overrides - Partial overrides from app_settings (key: 'module_guide_steps').
 *   Pass the parsed JSON value from app_settings, or undefined to use defaults.
 */
export function getModuleGuideSteps(
  overrides?: Partial<Record<ModuleId, ModuleGuideStep[]>>,
): Record<ModuleId, ModuleGuideStep[]> {
  if (!overrides) return DEFAULT_MODULE_GUIDE_STEPS

  return {
    ...DEFAULT_MODULE_GUIDE_STEPS,
    ...overrides,
  }
}
