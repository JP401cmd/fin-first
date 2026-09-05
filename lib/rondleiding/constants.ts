/**
 * rondleiding/constants — de kale namen rond de rondleiding op /overzicht
 * (ADR 0130). Géén React, géén 'use client'.
 *
 * ══ Waarom apart van `signal.ts` ══════════════════════════════════════════
 *
 * Deze vier namen worden aan BEIDE kanten van de server/client-grens gelezen:
 *
 *  - server: `lib/rondleiding/seed.ts` leest `module_guide_state` uit het
 *    profiel dat `app/(app)/overzicht/page.tsx` (een Server Component) al
 *    ophaalt;
 *  - client: de provider, de gidsweergave in Fin en de pagina-`i`.
 *
 * Stonden ze in `signal.ts`, dan trekt die server-import het hele
 * `useSyncExternalStore`-signaal de RSC-graaf in — en dat is geen theoretisch
 * bezwaar: Next weigert dat met "You're importing a module that depends on
 * useSyncExternalStore into a React Server Component module", en /overzicht
 * geeft een 500. Vandaar deze splitsing: de NAMEN hier, het GEDRAG in
 * `signal.ts` (dat ze re-exporteert, zodat bestaande client-imports niets
 * merken).
 */

/** De enige route waar de rondleiding draait. */
export const RONDLEIDING_ROUTE = '/overzicht'

/**
 * Query-parameter waarmee een herstart vanaf een ANDERE route op /overzicht
 * landt (`/overzicht?rondleiding=start`). Bewust niet gebruikt voor de eerste,
 * automatische start: een query-param overleeft geen reload en lekt in
 * bladwijzers en gedeelde links.
 */
export const RONDLEIDING_QUERY_PARAM = 'rondleiding'

/** Coachmark-id waaronder de afloop van de rondleiding wordt bewaard. */
export const RONDLEIDING_COACHMARK_ID = 'overzicht-rondleiding'

/**
 * Sleutel in `profiles.module_guide_state` die zegt "deze gebruiker heeft de
 * rondleiding nog tegoed". Wordt geschreven in dezelfde update als
 * `onboarding_completed = true`.
 */
export const RONDLEIDING_PENDING_KEY = 'rondleiding:pending'
