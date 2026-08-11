// components/core/holdings/holdings-list-view.ts
// ---------------------------------------------------------------------------
// Pure filter- + sorteer-logica voor de holdings-LIJST, geëxtraheerd uit de
// god-component `holdings-client.tsx` zodat het gedrag (gesloten-filter +
// opbrengst-sortering) testbaar is zonder de hele pagina te renderen.
//
// GEDRAGSBEHOUDEND: de functies zijn 1-op-1 verplaatst uit holdings-client.tsx
// (geen logica-wijziging). Ze werken op een minimale `HoldingListItem`-shape —
// de subset van de page-`Holding` die de filter/sort daadwerkelijk lezen —
// zodat de helper onafhankelijk blijft van de volledige holding-vorm.
// ---------------------------------------------------------------------------

import type { SortKey, AssetClassFilter } from './holdings-toolbar'

import { isClosedPosition, CLOSED_UNITS_EPSILON } from '@/lib/holdings-staleness'

export { CLOSED_UNITS_EPSILON }

/** Minimale velden die de filter/sort lezen. Superset-veilig: de page-`Holding`
 *  voldoet hieraan. `bucket` is optioneel (investment/crypto-onderscheid). */
export interface HoldingListItem {
  units: number
  avg_purchase_price: number
  current_price: number | null
  daily_change_percent?: number | null
  name: string
  ticker?: string | null
  isin?: string | null
  last_price_update?: string | null
  pnl_total?: number | null
  pnl_is_closed?: boolean | null
  bucket?: string
}

/**
 * Of een holding een gesloten positie is. De server-afgeleide engine-vlag
 * `pnl_is_closed` is leidend wanneer aanwezig (gebaseerd op de transactie-
 * historie via computePositionFromTransactions); valt anders terug op de
 * `units`-kolom met dezelfde EPSILON als de engine.
 */
export function isClosedHolding(h: HoldingListItem): boolean {
  // Delegeert bewust: één implementatie van "is deze positie gesloten", gedeeld
  // met de verouderd-regel. Twee kopieën die vandaag hetzelfde doen, doen dat
  // morgen niet meer.
  return isClosedPosition(h)
}

/**
 * Past de filter-chip toe op een holdings-set.
 *  - 'all'        → actieve posities (gesloten posities horen niet in de
 *                   default-lijst; hun marktwaarde is 0).
 *  - 'closed'     → alleen gesloten posities.
 *  - 'crypto'     → bucket === 'crypto'.
 *  - 'investment' → bucket === 'investment' of geen bucket.
 */
export function filterHoldingsByChip<T extends HoldingListItem>(
  holdings: readonly T[],
  chip: AssetClassFilter,
): T[] {
  if (chip === 'all') return holdings.filter((h) => !isClosedHolding(h))
  if (chip === 'closed') return holdings.filter((h) => isClosedHolding(h))
  return holdings.filter((h) => {
    if (chip === 'crypto') return h.bucket === 'crypto'
    return h.bucket === 'investment' || !h.bucket
  })
}

/** Marktwaarde van een holding (huidige prijs ⨯ aantal; valt terug op gem.
 *  inkoopprijs als er geen koers is). Geklemd op ≥0 stuks. */
function valueOf(h: HoldingListItem): number {
  return (h.current_price ?? h.avg_purchase_price) * Math.max(0, h.units)
}

/** Rendement% t.o.v. de kostenbasis (markt − kosten) / kosten. Geen kosten →
 *  −∞ zodat zulke rijen onderaan een aflopende sortering belanden.
 *
 *  BEWUST een lokaal %-getal uit de opgeslagen holding-velden (markt o.b.v.
 *  current_price/avg_purchase_price × units), NIET de engine-pnl_total uit
 *  `computePositionFromTransactions`. Dat is de snelle relatieve positie-
 *  ranking over de actieve set; `pnlOf` (sortKey 'opbrengst') geeft de absolute
 *  € uit de engine — beide zijn intentioneel verschillend en worden als
 *  "Rendement %" resp. "Opbrengst €" gelabeld in de toolbar zodat de twee
 *  opties duidelijk onderscheidbaar zijn. */
function returnOf(h: HoldingListItem): number {
  const cost = h.avg_purchase_price * Math.max(0, h.units)
  if (cost <= 0) return Number.NEGATIVE_INFINITY
  return ((valueOf(h) - cost) / cost) * 100
}

/** Totale opbrengst (server-afgeleide P&L). Ontbreekt → −∞ zodat rijen zónder
 *  transactiehistorie onderaan de opbrengst-sortering komen. */
function pnlOf(h: HoldingListItem): number {
  return typeof h.pnl_total === 'number' ? h.pnl_total : Number.NEGATIVE_INFINITY
}

/**
 * Sorteert een (al gefilterde) holdings-set. Default 'weight' (gewicht
 * aflopend, Sharesight/Empower-conventie); 'opbrengst' sorteert op de
 * server-afgeleide totale P&L (`pnl_total`, hoog→laag). Pure functie — geeft
 * een nieuwe array terug, muteert de input niet.
 */
export function sortHoldings<T extends HoldingListItem>(
  holdings: readonly T[],
  sortKey: SortKey,
): T[] {
  const list = [...holdings]
  if (sortKey === 'weight') list.sort((a, b) => valueOf(b) - valueOf(a))
  else if (sortKey === 'return') list.sort((a, b) => returnOf(b) - returnOf(a))
  else if (sortKey === 'opbrengst') list.sort((a, b) => pnlOf(b) - pnlOf(a))
  else if (sortKey === 'today')
    list.sort(
      (a, b) =>
        (b.daily_change_percent ?? Number.NEGATIVE_INFINITY) -
        (a.daily_change_percent ?? Number.NEGATIVE_INFINITY),
    )
  else if (sortKey === 'alpha') list.sort((a, b) => a.name.localeCompare(b.name))
  return list
}
