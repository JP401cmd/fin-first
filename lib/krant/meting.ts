// ── De K1-meting in job_runs: tellingen zonder inhoud ────────────────────────
//
// De weekcron schrijft per run hoeveel edities er zijn gebouwd en hoeveel
// daarvan leeg bleven, per profieltype (leeftijdsklasse × wonen × partner,
// zonder id). Die verdeling landt in job_runs.summary en is zichtbaar op
// /beheer/jobs — dus geldt ADR 0146/0153: beheer ziet gebruik, geen inhoud,
// en een cel van 1 t/m 4 gebruikers kan met de accountlijst ernaast aan één
// persoon worden gehangen ("de enige 67-plusser met een koophuis kreeg een
// lege editie" verraadt dat híj een huis bezit).
//
// Daarom twee tellingen:
//   perProfieltype       echte gebruikers, onderdrukt met het huis-algoritme
//                        onderdrukVerdeling (k = 5, primair én aanvullend,
//                        eigenschaps-getest tegen een lezer die het algoritme
//                        kent) — de totalen `edities`/`leeg` blijven zichtbaar
//   testaccounts.        de vijf persona's (is_demo_user): fictief, dus
//   perProfieltype       ongedrukt — precies de vijf profieltypes waarop de
//                        K1-poort "lege edities per profieltype" is gedefinieerd
//
// PUUR: geen IO.

import { GEBRUIK_K, onderdrukVerdeling, type Cel } from '@/lib/beheer/gebruik-analyse/onderdrukking'

export interface ProfieltypeTelling {
  edities: number
  leeg: number
}

/** Een cel na onderdrukking: het getal, of waarom het niet zichtbaar is. */
export type MetingCel = number | 'klein' | 'verborgen'

export interface OnderdrukteTelling {
  edities: MetingCel
  leeg: MetingCel
}

export const METING_K = GEBRUIK_K

function celWaarde(cel: Cel): MetingCel {
  return cel.soort === 'waarde' ? cel.n : cel.soort
}

/**
 * De verdeling over profieltypes onderdrukt tegen haar eigen (publieke)
 * totalen. `edities` en `leeg` zijn twee verdelingen met elk hun totaal.
 */
export function onderdrukPerProfieltype(
  perType: Readonly<Record<string, ProfieltypeTelling>>,
  totaal: ProfieltypeTelling,
  k: number = METING_K,
): Record<string, OnderdrukteTelling> {
  const types = Object.keys(perType).sort()
  const edities = onderdrukVerdeling(types.map((t) => perType[t].edities), totaal.edities, k)
  const leeg = onderdrukVerdeling(types.map((t) => perType[t].leeg), totaal.leeg, k)
  const uit: Record<string, OnderdrukteTelling> = {}
  types.forEach((t, i) => {
    uit[t] = { edities: celWaarde(edities.cellen[i]), leeg: celWaarde(leeg.cellen[i]) }
  })
  return uit
}

/** Telt één editie bij een profieltype op (muteert `perType`). */
export function telProfieltype(perType: Record<string, ProfieltypeTelling>, type: string, leeg: boolean): void {
  const t = (perType[type] ??= { edities: 0, leeg: 0 })
  t.edities++
  if (leeg) t.leeg++
}
