/**
 * Catalogus van de feature-slugs die een INGELOGDE CLIENT via
 * `POST /api/feature-visits` mag wegschrijven.
 *
 * ## Waarom een whitelist en niet "elke string"
 *
 * `user_feature_visits` is geen logtabel maar een gedeeld markeringsregister:
 * één tabel, meerdere slug-families, met heel verschillend gewicht.
 *
 *   - `guide_*`          — "heb je hier al gekeken" voor de welkomstgids.
 *                          Cosmetisch: hooguit een vinkje te vroeg.
 *   - `*_shown` / `*_dismissed`
 *                        — eenmalige meldingen die niet mogen terugkomen.
 *                          Cosmetisch, en uitsluitend eigen data.
 *   - `*_setup_completed` — POORTEN. `lib/app-setup-status.ts` leest ze om te
 *                          bepalen of de setup-gate van een app (budgetteren,
 *                          holdings, crypto, hypotheekplanner,
 *                          verhuurrendement) nog getoond moet worden, en
 *                          `lib/account-status.ts` leest
 *                          `horizon_setup_completed`.
 *
 * De route accepteerde tot nu toe elke `typeof x === 'string'`. Daarmee kon een
 * client zichzelf met één fetch een `budgetteren_setup_completed` toekennen en
 * de setup-gate overslaan zonder de setup te doen — een marker die verder
 * alléén door de server-routes onder `app/api/<app>/setup` gezet hoort te worden.
 * Dat is de reden dat deze lijst een gesloten enum is en niet "alles behalve".
 *
 * ## Waarom letterlijke strings en geen afgeleide lijst
 *
 * `z.enum()` heeft een literal-tuple nodig; de bestaande bronnen
 * (`GUIDE_VISIT_SLUGS`, de horizon-constanten) zijn `readonly string[]` of
 * leven in een zware server-loader resp. een `'use client'`-component, die een
 * API-route niet hoort te importeren. De lijst staat hier dus voluit, en
 * `feature-visit-slugs.test.ts` bewaakt de twee dingen die er echt toe doen:
 * dat élke gids-slug erin staat, en dat géén enkele setup-poort erin staat.
 */

/**
 * Bezoek-slugs van de welkomstgids. Spiegelt `GUIDE_VISIT_SLUG_BY_STEP_ID`
 * in `lib/welcome-guide.ts` — bewaakt door de test.
 */
const GUIDE_SLUGS = [
  'guide_toekomst_grafiek',
  'guide_vaste_lasten',
  'guide_tips',
  'guide_nieuws',
  'guide_rekenhulp',
  'guide_whatif',
  'guide_belasting',
  'guide_rapportages',
  'guide_uiterlijk',
] as const

/**
 * Eenmalige UI-meldingen die de client zelf uitzet (cross-device, daarom niet
 * in localStorage). Call-sites: `components/app/horizon/toekomst-welcome.tsx`,
 * `components/app/horizon/horizon-client.tsx` (dismissExitNoticeForever) en
 * `components/app/budget-koppel-nudge.tsx`.
 */
const DISMISSAL_SLUGS = [
  'horizon_welcome_shown',
  'horizon_exit_notice_dismissed',
  'budget_koppel_nudge_shown',
] as const

/** Alles wat een client zelf mag stempelen. */
export const CLIENT_WRITABLE_FEATURE_SLUGS = [
  ...GUIDE_SLUGS,
  ...DISMISSAL_SLUGS,
] as const

export type ClientWritableFeatureSlug =
  (typeof CLIENT_WRITABLE_FEATURE_SLUGS)[number]
