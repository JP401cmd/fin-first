import { ERROR_SIGNATURE_RE } from '@/lib/alerts/error-signature-vorm'
import { FOUT_CONTEXT_PARAM, FOUT_SOORT_PARAM } from './doorklik'

/**
 * Het filter van `/beheer/errors` uit de URL: één foutsoort uitlichten of op
 * een context-prefix filteren. Het beheerdashboard linkt hiermee naar precies
 * de fouten waar een signaal over gaat.
 *
 * Een waarde uit de URL is invoer van buiten. Wat niet de verwachte vorm heeft,
 * wordt genegeerd; het filter werkt op de al geladen lijst en gaat nooit een
 * query in.
 *
 * Puur en zonder server-imports: de pagina is een clientcomponent.
 */

export interface FoutenFilter {
  /** Sleutel van de foutsoort die uitgelicht wordt. */
  soort: string | null
  /** Begin van de context, in kleine letters (bv. `ai:`). */
  context: string | null
}

const CONTEXT_RE = /^[a-z0-9][a-z0-9:_./-]{0,39}$/

export function leesFoutenFilter(params: { get(naam: string): string | null }): FoutenFilter {
  const soort = params.get(FOUT_SOORT_PARAM)
  const context = params.get(FOUT_CONTEXT_PARAM)?.trim().toLowerCase() ?? null
  return {
    soort: soort && ERROR_SIGNATURE_RE.test(soort) ? soort : null,
    context: context && CONTEXT_RE.test(context) ? context : null,
  }
}

export function heeftFilter(filter: FoutenFilter): boolean {
  return filter.soort !== null || filter.context !== null
}

interface Filterbaar {
  signature: string
  context: string | null
  open: boolean
}

/**
 * De zichtbare foutsoorten. De uitgelichte soort blijft altijd zichtbaar, ook
 * als hij is afgehandeld en afgehandelde soorten verborgen zijn: wie op een
 * signaal doorklikt, moet de soort zien waar het om ging.
 */
export function zichtbareSoorten<T extends Filterbaar>(
  groups: readonly T[],
  filter: FoutenFilter,
  toonAfgehandeld: boolean,
): T[] {
  return groups.filter((g) => {
    if (filter.soort !== null && g.signature === filter.soort) return true
    if (filter.context !== null && !(g.context ?? '').toLowerCase().startsWith(filter.context)) return false
    return toonAfgehandeld || g.open
  })
}
