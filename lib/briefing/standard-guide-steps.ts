// ── Standard Guide Steps ─────────────────────────────────────────────────
// Algemene onboarding-stappen die voor iedere gebruiker gelden, los van
// gekozen doel of actieve modules. Dit standaard-stappenplan staat naast
// het doel-stappenplan in de "Stappenplannen-strook" bovenaan /will.
//
// Type-shape is uitgebreid t.o.v. `ModuleGuideStep` met een optionele
// `autoComplete(data)`-functie zodat we stappen automatisch kunnen
// afvinken op basis van DashboardData (bv. "Vul je bezittingen aan" is
// klaar zodra `totalAssets > 0`).
//
// Module-scheiding: dit stappenplan is fundament (geen module-gating).
// De stap "horizon-instellingen" verwijst bewust naar /identity/instellingen,
// niet naar een module-gated route.

import type { DashboardData } from '@/components/widgets/widget-renderer'
import type { ModuleGuideStep } from './module-guide-steps'

// ── Progress-key prefix ────────────────────────────────────────────────
// Parallel aan de bestaande `goal:<slug>` conventie (zie goal-guide-steps.ts).
// State leeft in dezelfde JSONB-kolom `profiles.module_guide_state` —
// geen schema-wijziging nodig.
export const STANDARD_GUIDE_MODULE_ID = 'standard:guide' as const

// ── Step-shape ─────────────────────────────────────────────────────────

export interface StandardGuideStep extends ModuleGuideStep {
  /**
   * Optionele auto-completion check. Returnt true zodra de stap als
   * "klaar" mag worden beschouwd op basis van de DashboardData-bundle.
   * Wordt OR-gecombineerd met handmatig afvinken (zie
   * `isStandardStepComplete`).
   */
  autoComplete?: (data: DashboardData) => boolean
}

// ── Default Steps ──────────────────────────────────────────────────────

export const DEFAULT_STANDARD_GUIDE_STEPS: readonly StandardGuideStep[] = [
  {
    key: 'sg_assets',
    label: 'Vul je bezittingen aan',
    href: '/core/assets',
    autoComplete: (data) => data.totalAssets > 0,
  },
  {
    key: 'sg_debts',
    label: 'Registreer je schulden (of vink af: geen)',
    href: '/core/debts',
    // Geen autoComplete — schulden zijn vaak afwezig; gebruiker vinkt zelf af.
  },
  {
    key: 'sg_cash',
    label: 'Voeg je spaarrekening(en) toe',
    href: '/overzicht/cashflow',
    autoComplete: (data) =>
      (data.assetsByType.find((t) => t.type === 'cash')?.value ?? 0) > 0,
  },
  {
    key: 'sg_horizon',
    label: 'Bekijk je horizon-instellingen',
    href: '/identity/instellingen',
    // Geen autoComplete — bewuste actie van de gebruiker.
  },
] as const

// ── Back-compat alias ──────────────────────────────────────────────────
// `STANDARD_GUIDE_STEPS` blijft de bron-van-waarheid voor user-facing
// rendering en alle completion-helpers. Admin-overrides leven in
// `app_settings.standard_guide_steps` en worden via `getStandardGuideSteps()`
// teruggelezen door de API-route. Deze const zijn de defaults — wil je
// admin-overrides in een server-component renderen, gebruik dan de getter
// hieronder met een passende `overrides`-arg.
export const STANDARD_GUIDE_STEPS = DEFAULT_STANDARD_GUIDE_STEPS

// ── Override-getter (defaults + admin-overrides via app_settings) ─────

/**
 * Get standard-guide steps met optionele override-array uit app_settings.
 * Returnt de override wanneer aanwezig en valide, anders de defaults.
 *
 * Spiegelt het patroon van `getGoalGuideSteps()`. Admin-API-route
 * (`/api/standard-guide/steps`) gebruikt deze getter om de actuele lijst
 * terug te geven. User-facing (`StandaardStappenplanCard`) gebruikt
 * vooralsnog de defaults — gelijk aan goal/module-guide bestaande
 * gedrag — totdat overrides server-side worden gepiped.
 */
export function getStandardGuideSteps(
  overrides?: StandardGuideStep[],
): readonly StandardGuideStep[] {
  if (Array.isArray(overrides) && overrides.length > 0) {
    return overrides
  }
  return DEFAULT_STANDARD_GUIDE_STEPS
}

// ── Completion helper ──────────────────────────────────────────────────

/**
 * Of een specifieke stap voltooid is. Een stap geldt als done wanneer
 * óf de auto-complete-check waar is, óf de gebruiker hem handmatig heeft
 * afgevinkt (via toggleStep in de hook).
 */
export function isStandardStepComplete(
  stepKey: string,
  data: DashboardData,
  manuallyCompletedKeys: string[],
): boolean {
  const step = STANDARD_GUIDE_STEPS.find((s) => s.key === stepKey)
  if (!step) return false
  if (manuallyCompletedKeys.includes(stepKey)) return true
  if (step.autoComplete?.(data)) return true
  return false
}

/** Aantal voltooide stappen — gebruikt voor de voortgangsbalk. */
export function countCompleteStandardSteps(
  data: DashboardData,
  manuallyCompletedKeys: string[],
): number {
  return STANDARD_GUIDE_STEPS.filter((s) =>
    isStandardStepComplete(s.key, data, manuallyCompletedKeys),
  ).length
}

/** Of alle stappen voltooid zijn (auto + handmatig). */
export function isAllStandardComplete(
  data: DashboardData,
  manuallyCompletedKeys: string[],
): boolean {
  return countCompleteStandardSteps(data, manuallyCompletedKeys) === STANDARD_GUIDE_STEPS.length
}
