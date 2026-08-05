// components/overview/belasting/optimizer-model.ts
//
// PRESENTATIE-laag van de fiscale optimizer: sorteerstanden, winnaar-koppeling
// en redactionele hulpjes. De kansen zélf worden geproduceerd in
// `lib/tax-optimizer/opportunities.ts` — dat is de enige bron, gedeeld met de
// belasting-hub en de aandachtspunten (ADR 0086). Dit bestand her-exporteert
// die bouwers zodat de optimizer-componenten één import-pad houden.
//
// HARDE REGEL: hier wordt NIETS gerekend. Sorteren en filteren gebeurt op
// GELEVERDE velden (netEffect / savings / hasReturnCost).

import {
  buildOpportunities,
  toTaxOpportunities,
  type Dots,
  type Opportunity,
  type TaxOpportunity,
} from '@/lib/tax-optimizer/opportunities'
import { JAARRUIMTE_TITLE, JAARRUIMTE_CAVEAT } from '@/lib/tax-optimizer/rank'
import type { OptimizerTopChoice } from '@/lib/tax-optimizer/types'

// Eén import-pad voor de componenten; de bron blijft lib/tax-optimizer.
export { buildOpportunities, toTaxOpportunities, JAARRUIMTE_TITLE, JAARRUIMTE_CAVEAT }
export type { Dots, Opportunity, TaxOpportunity }

/**
 * Gearceerd negatief-patroon (2px `--negative` + 3px 30%-tint, 45°) — ÉÉN
 * recept voor alle "kost je geld"-vlakken: de netto-effect-balken (katern II)
 * én de verkenner-legenda (katern III). De SVG-`<pattern>` in de verkenner
 * spiegelt ditzelfde recept (5px-tegel: 2px streep + 30%-tint-achtergrond).
 */
export const NEGATIVE_HATCH_CSS =
  'repeating-linear-gradient(45deg, var(--negative) 0, var(--negative) 2px, color-mix(in srgb, var(--negative) 30%, transparent) 2px, color-mix(in srgb, var(--negative) 30%, transparent) 5px)'

// ── Sorteerstanden ───────────────────────────────────────────────

export type SortMode = 'netto' | 'besparing' | 'geen-verlies'

export const SORT_MODES: { id: SortMode; label: string }[] = [
  { id: 'netto', label: 'Netto effect' },
  { id: 'besparing', label: 'Grootste besparing' },
  { id: 'geen-verlies', label: 'Zonder rendementsverlies' },
]

/** Sorteert/filtert op GELEVERDE velden — geen herberekening. */
export function sortOpportunities(list: Opportunity[], mode: SortMode): Opportunity[] {
  const arr = mode === 'geen-verlies' ? list.filter((o) => !o.hasReturnCost) : [...list]
  if (mode === 'besparing') {
    arr.sort((a, b) => b.savings - a.savings || b.netEffect - a.netEffect)
  } else {
    arr.sort((a, b) => b.netEffect - a.netEffect || b.savings - a.savings)
  }
  return arr
}

/** Koppelt de server-gekozen topkans op id aan de bijbehorende rij in de lijst. */
export function findWinner(
  opportunities: Opportunity[],
  topChoice: OptimizerTopChoice | null,
): Opportunity | null {
  if (!topChoice) return null
  return opportunities.find((o) => o.id === topChoice.opportunityId) ?? null
}

/**
 * Eerste zin van een kanttekening, geschikt als staartje achter "let op:".
 * Zet de beginletter klein tenzij het woord duidelijk een eigennaam/afkorting
 * is (tweede teken is dan geen kleine letter, bv. "Box 3").
 */
export function shortCaveat(caveat: string): string {
  const first = caveat.split(/[.;]/)[0]?.trim() ?? ''
  if (first.length < 2) return first
  const second = first[1]
  if (second !== second.toLowerCase()) return first
  return first[0].toLowerCase() + first.slice(1)
}
