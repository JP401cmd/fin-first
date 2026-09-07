/**
 * Wanneer telt een aanbeveling als "wacht op je"? — één bron.
 *
 * Achtergrond (UR3-27, D1). Deze vraag werd op twee plekken gesteld en op twee
 * manieren beantwoord:
 *
 *  - `lib/fin-data-loader.ts` (de tips-pagina én de briefing) filterde op
 *    `pending` OF (`postponed` EN `postponed_until <= vandaag`);
 *  - `app/(app)/layout.tsx` telde voor de zijbalk-stip simpelweg
 *    `status IN ('pending','postponed')`, zónder de `postponed_until`-toets.
 *
 * Gevolg, deterministisch: druk je bij je laatste tip op "Later"
 * (`status='postponed'`, `postponed_until = nu + 14 dagen`), dan brandt de
 * zijbalk-stip veertien dagen door terwijl de tips-pagina "Geen tips wachten op
 * je" toont. Geen race, geen cache — een filterverschil.
 *
 * Dat is dezelfde klasse fout als de holdings-staleness in de shell (zie de
 * toelichting daar): twee vragen die hetzelfde antwoord moeten geven, gesteld op
 * twee manieren. De remedie is dezelfde — het oordeel woont hier, beide
 * oppervlakken vragen het hier op.
 */

/** De velden waarop het oordeel rust. Bewust smal: dit is ook de kolomlijst
 *  die de shell ophaalt. */
export type RecommendationOpenState = {
  status: string
  postponed_until?: string | null
}

/** De kolommen die je minimaal nodig hebt om {@link isRecommendationOpen} te
 *  kunnen stellen. Gebruik deze constante in de `select()` zodat de query en het
 *  predicaat niet uit elkaar kunnen groeien. */
export const RECOMMENDATION_OPEN_COLUMNS = 'status, postponed_until'

/** De statussen die überhaupt in aanmerking komen — het grove voorfilter dat de
 *  database mag doen. Het fijne oordeel (`postponed_until`) doet
 *  {@link isRecommendationOpen}, omdat "vandaag" een aanroepmoment is en geen
 *  kolomwaarde. */
export const RECOMMENDATION_OPEN_STATUSES = ['pending', 'postponed'] as const

/**
 * Wacht deze aanbeveling vandaag op de gebruiker?
 *
 * @param rec    de rij (alleen `status` + `postponed_until` worden gelezen)
 * @param today  ISO-datum (`YYYY-MM-DD`) van vandaag; expliciet meegegeven zodat
 *               het oordeel puur en testbaar blijft
 */
export function isRecommendationOpen(rec: RecommendationOpenState, today: string): boolean {
  if (rec.status === 'pending') return true
  return (
    rec.status === 'postponed' &&
    rec.postponed_until != null &&
    rec.postponed_until <= today
  )
}

/** Hoeveel aanbevelingen wachten er vandaag? Het telvoorschrift voor de
 *  zijbalk-stip, zodat die niet zijn eigen som schrijft. */
export function countOpenRecommendations(
  recs: readonly RecommendationOpenState[],
  today: string,
): number {
  return recs.reduce((n, rec) => (isRecommendationOpen(rec, today) ? n + 1 : n), 0)
}
