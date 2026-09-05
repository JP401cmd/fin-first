import { RONDLEIDING_COACHMARK_ID, RONDLEIDING_PENDING_KEY } from './constants'

/**
 * rondleiding/seed — de server-seed van de rondleiding op /overzicht (ADR 0130).
 *
 * PUUR, GEEN QUERY. Beide gegevens zitten al in `profiles.module_guide_state`,
 * en die kolom wordt op /overzicht toch al opgehaald (`ownProfileRes`). Deze
 * helper leest 'm alleen uit, zodat de rondleiding géén extra round-trip per
 * paginabezoek kost.
 *
 * FAIL-SAFE RICHTING STIL. Bij een ontbrekende of corrupte kolom is het
 * antwoord `{ pending: false, seen: true }`. Een rondleiding die per ongeluk
 * NIET start is een gemis; eentje die bij een bestaande gebruiker uit het niets
 * over het scherm valt is een defect.
 */

/**
 * Top-level sleutel waaronder de coachmark-afloop staat. De vorm
 * (`coachmark:<id>`) is die van `app/api/coachmark/route.ts#coachmarkStateKey`;
 * bewust hier herhaald i.p.v. geïmporteerd, zodat een lib-module geen
 * route-handler (met `next/server`) hoeft mee te trekken.
 */
const RONDLEIDING_COACHMARK_STATE_KEY = `coachmark:${RONDLEIDING_COACHMARK_ID}`

export interface RondleidingSeed {
  /** De gebruiker heeft de rondleiding nog tegoed (net geonboard). */
  pending: boolean
  /** De rondleiding is al eens afgelopen (voltooid, overgeslagen of onderbroken). */
  seen: boolean
}

export function loadRondleidingSeed(moduleGuideState: unknown): RondleidingSeed {
  if (!moduleGuideState || typeof moduleGuideState !== 'object' || Array.isArray(moduleGuideState)) {
    return { pending: false, seen: true }
  }
  const map = moduleGuideState as Record<string, unknown>
  return {
    pending: map[RONDLEIDING_PENDING_KEY] != null,
    seen: map[RONDLEIDING_COACHMARK_STATE_KEY] != null,
  }
}

/**
 * Zet de "rondleiding tegoed"-vlag in een bestaande `module_guide_state`-map,
 * zonder andere sleutels aan te raken.
 *
 * Gedeeld door de twee plekken die `onboarding_completed = true` schrijven
 * (`/api/onboarding/save-own-data` en `/api/check/activate`). Een blinde
 * `module_guide_state: { 'rondleiding:pending': … }` zou daar de welkomstgids,
 * de coachmarks én de coach-staat wissen — vandaar deze merge.
 */
export function withRondleidingPending(
  current: unknown,
  now: Date = new Date(),
): Record<string, unknown> {
  const base =
    current && typeof current === 'object' && !Array.isArray(current)
      ? (current as Record<string, unknown>)
      : {}
  return { ...base, [RONDLEIDING_PENDING_KEY]: { since: now.toISOString() } }
}
