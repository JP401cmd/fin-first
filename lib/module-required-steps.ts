// ── Module → vereiste onboarding-stappen ───────────────────────────
// Verhuisd uit components/app/module-activation-modal.tsx zodat lib
// (regression) deze map kan importeren zonder terug naar components te reiken
// (import-richting UI→lib). Zuiver data.

import type { ModuleId } from '@/lib/module-registry'

export type OnboardingStep = 'bezittingen' | 'budgets' | 'horizon'

/**
 * Maps each module to the onboarding steps it requires before activation.
 * When a user enables a module they haven't gone through onboarding for,
 * we check this map to determine which steps are missing.
 */
export const MODULE_REQUIRED_STEPS: Partial<Record<ModuleId, OnboardingStep[]>> = {
  budgetteren: ['bezittingen', 'budgets'],
  vermogensregistratie: ['bezittingen'],
  aandelenregistratie: ['bezittingen'],
  toekomstplannen: ['horizon'],
  inzicht_acties: [],
}
