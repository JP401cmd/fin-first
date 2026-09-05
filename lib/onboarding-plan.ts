/**
 * Het plan uit de onboarding (stap "Jouw plan") → de plan-kolommen op `profiles`
 * (ADR 0129: stop-anker × eind-vorm).
 *
 * `POST /api/onboarding/save-own-data` lost het plan hier ÉÉN keer op en schrijft
 * het resultaat in het multi-step pad, zodat er nooit een rij ontstaat die zichzelf
 * tegenspreekt (D2):
 *
 *  - Een LEGACY-label in `fire_end_strategy` zonder anker ('pensioen' /
 *    'nu-stoppen' — oude drafts en clients van vóór 5 sep 2026) wordt vertaald naar
 *    eind-vorm `deplete` + het anker dat het label droeg (`aow` / `now`). Het label
 *    zelf wordt nooit meer weggeschreven. Bij 'pensioen' wordt de eindleeftijd 100
 *    (`LEGACY_PENSIOEN_END_AGE`, spiegel van backfill 20260903141000 — D6/M1): een
 *    oude draft kan de 90-default nooit zelf gekozen hebben.
 *  - Een legacy-label NAAST een expliciet anker — ook een "bevestigend" — is een
 *    tegenspraak → fout. Letterlijke spiegel van kruistoets R2 in `/api/fire-settings`
 *    (het label draagt zelf al een anker; wie een anker meestuurt, stuurt een eind-vorm).
 *  - Anker + stopleeftijd lopen door dezelfde schrijftoets als de fire-settings-
 *    route (`validateStopAnchorInput`) en dezelfde B7-regel (stop < eind).
 *
 * Pure functie, geen Supabase — testbaar in `lib/onboarding-plan.test.ts`.
 */

import {
  LEGACY_PENSIOEN_END_AGE,
  STOP_AGE_BEFORE_END_AGE_ERROR,
  isFireEndForm,
  legacyAnchorOf,
  stopAgeConflictsWithEndAge,
  validateStopAnchorInput,
  type FireEndForm,
  type StopAnchorKind,
} from '@/lib/fire-strategy'

export interface OnboardingPlanInput {
  /** `horizonData.fire_end_strategy ?? identity.fire_end_strategy ?? 'deplete'` — eind-vorm óf legacy-label. */
  strategy: string
  /** `horizonData.fire_stop_anchor`; ontbreekt bij oude clients. */
  anchor?: string | null
  /** `horizonData.fire_stop_age`; alleen betekenisvol bij anker `age`. */
  stopAge?: number | null
  /** De al opgeloste eindleeftijd (`?? 90`). */
  endAge: number
}

export interface OnboardingPlanColumns {
  fire_end_strategy: FireEndForm
  fire_end_age: number
  fire_stop_anchor: StopAnchorKind
  fire_stop_age: number | null
}

export function resolveOnboardingPlanColumns(
  input: OnboardingPlanInput,
): OnboardingPlanColumns | { error: string } {
  const legacyAnchor = legacyAnchorOf(input.strategy)

  if (legacyAnchor !== null) {
    // R2 — een expliciet anker (welk dan ook) naast een label dat zelf een anker
    // draagt, is een tegenspraak; identiek aan `/api/fire-settings`.
    if (input.anchor != null) {
      return {
        error: `Kies een eind-vorm (deplete, legacy of perpetual) wanneer je een stopmoment meestuurt; "${input.strategy}" draagt zelf al een anker.`,
      }
    }
    if (input.stopAge != null) {
      return { error: 'Een stopleeftijd hoort alleen bij het anker "age".' }
    }
    return {
      fire_end_strategy: 'deplete',
      fire_end_age: input.strategy === 'pensioen' ? LEGACY_PENSIOEN_END_AGE : input.endAge,
      fire_stop_anchor: legacyAnchor.kind,
      fire_stop_age: null,
    }
  }

  // Een onbekende waarde vouwt naar 'deplete' — dezelfde terugval als
  // `parseFirePlan`, en de zod-enum van de route laat 'm in de praktijk niet door.
  const endForm: FireEndForm = isFireEndForm(input.strategy) ? input.strategy : 'deplete'

  const anchor = validateStopAnchorInput(input.anchor ?? 'solved', input.stopAge ?? null)
  if ('error' in anchor) return anchor

  if (stopAgeConflictsWithEndAge(anchor, input.endAge)) {
    return { error: STOP_AGE_BEFORE_END_AGE_ERROR }
  }

  return {
    fire_end_strategy: endForm,
    fire_end_age: input.endAge,
    fire_stop_anchor: anchor.anchor,
    fire_stop_age: anchor.stopAge,
  }
}
