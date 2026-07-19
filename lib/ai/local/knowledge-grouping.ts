// Kennisbank lokale AI — PURE presentatie-helpers voor het beheerscherm (fase K1.1).
//
// Bewust los van page.tsx (geen React/'use client') zodat de groepeer-logica en
// de freshness→kleur-mapping unit-testbaar zijn zonder React Testing Library.
// De groepering is PUUR VISUEEL: elk item behoudt zijn originele index in de
// flat `items`-array, zodat de up/down-verplaatsing en de volgorde-nummering
// ongewijzigd op die flat array blijven werken (de `volgorde` bij opslaan blijft
// de array-index).

import {
  knowledgeFreshness,
  type KnowledgeFreshness,
  type LocalKnowledgeItem,
} from './knowledge-context'

/** Eén item mét zijn originele positie in de flat `items`-array. */
export interface IndexedKnowledgeItem {
  item: LocalKnowledgeItem
  index: number
}

/** Eén categorie-groep voor de gegroepeerde weergave. */
export interface KnowledgeGroup {
  categorie: string
  entries: IndexedKnowledgeItem[]
  /** Aantal items in deze groep. */
  total: number
  /** Aantal actieve items in deze groep. */
  active: number
}

/**
 * Groepeer de flat itemlijst per `categorie` voor de visuele weergave.
 *
 * Volgorde van de groepen: eerst de categorieën uit `categoryOrder` (in díe
 * volgorde), daarna eventuele afwijkende/legacy-categorieën (bv. "Algemeen" van
 * oude items) alfabetisch achteraan. Binnen een groep behouden items hun
 * onderlinge flat-array-volgorde, elk mét de originele `index`.
 */
export function groupItemsByCategory(
  items: LocalKnowledgeItem[],
  categoryOrder: readonly string[],
): KnowledgeGroup[] {
  const orderIndex = new Map<string, number>()
  categoryOrder.forEach((cat, i) => orderIndex.set(cat, i))

  const byCategory = new Map<string, IndexedKnowledgeItem[]>()
  items.forEach((item, index) => {
    const cat = item.categorie?.trim() || 'Algemeen'
    const bucket = byCategory.get(cat)
    if (bucket) bucket.push({ item, index })
    else byCategory.set(cat, [{ item, index }])
  })

  const categories = [...byCategory.keys()].sort((a, b) => {
    const ai = orderIndex.has(a) ? orderIndex.get(a)! : Number.MAX_SAFE_INTEGER
    const bi = orderIndex.has(b) ? orderIndex.get(b)! : Number.MAX_SAFE_INTEGER
    if (ai !== bi) return ai - bi
    // Beide onbekend → alfabetisch (bekende categorieën hebben altijd een
    // distincte index, dus deze tiebreak raakt alleen legacy-categorieën).
    return a.localeCompare(b, 'nl')
  })

  return categories.map((categorie) => {
    const entries = byCategory.get(categorie)!
    return {
      categorie,
      entries,
      total: entries.length,
      active: entries.filter((e) => e.item.actief).length,
    }
  })
}

/**
 * Stoplicht-kleur per freshness-status — status-semantiek (op koers / aandacht /
 * verlopen), GEEN module-accent. Palet 1-op-1 gelijk aan `LEVERAGE_STATUS_DOT`
 * (emerald/amber/red/stone). Evergreen krijgt een onopvallende neutrale stip
 * (geen alarm: er is bewust geen controledatum).
 */
export const FRESHNESS_DOT: Record<KnowledgeFreshness, string> = {
  ok: 'bg-emerald-500',
  binnenkort: 'bg-amber-500',
  verlopen: 'bg-red-500',
  evergreen: 'bg-stone-300',
}

/**
 * Formatteer een ISO-datumstring als leesbare NL-datum, bv. "1 oktober 2027".
 * `timeZone: 'Europe/Amsterdam'` is bewust vast: een datum-only ISO-string
 * (bv. "2027-10-01") parset als UTC-middernacht, en zonder vaste tijdzone zou
 * de weergave (en dus de dag) verschuiven op een machine met een andere
 * lokale tijdzone (bv. CI in een VS-regio) — de grens tussen freshness-
 * statussen mag daar niet van afhangen.
 */
export function formatReviewDate(iso: string): string | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Amsterdam',
  }).format(d)
}

/** Presentatie-metadata voor het freshness-bolletje van één item. */
export interface FreshnessMeta {
  freshness: KnowledgeFreshness
  dotClass: string
  /** Toegankelijke omschrijving (tooltip + aria-label). */
  label: string
}

/**
 * Bepaal freshness + bijbehorende stoplicht-kleur en leesbaar label voor één
 * item. `now` injecteerbaar voor tests.
 */
export function freshnessMeta(item: LocalKnowledgeItem, now: Date = new Date()): FreshnessMeta {
  const freshness = knowledgeFreshness(item, now)
  const dotClass = FRESHNESS_DOT[freshness]

  if (freshness === 'evergreen') {
    return { freshness, dotClass, label: 'Geen controledatum (evergreen)' }
  }

  const datum = item.controleerVoor ? formatReviewDate(item.controleerVoor) : null
  const label =
    freshness === 'verlopen'
      ? datum
        ? `Controledatum verstreken — was ${datum}. Controleer dit item.`
        : 'Controledatum verstreken. Controleer dit item.'
      : freshness === 'binnenkort'
        ? datum
          ? `Binnenkort te controleren — vóór ${datum}`
          : 'Binnenkort te controleren'
        : datum
          ? `Controleer vóór ${datum}`
          : 'Controledatum ingesteld'

  return { freshness, dotClass, label }
}

/** Aantallen items met een openstaande controle, voor de pagina-samenvatting. */
export interface FreshnessSummary {
  verlopen: number
  binnenkort: number
}

/**
 * Tel de items die verlopen of binnenkort te controleren zijn. Wordt gebruikt
 * voor de pagina-brede samenvattingsregel (alleen tonen als er iets openstaat).
 */
export function summarizeFreshness(
  items: LocalKnowledgeItem[],
  now: Date = new Date(),
): FreshnessSummary {
  let verlopen = 0
  let binnenkort = 0
  for (const item of items) {
    const f = knowledgeFreshness(item, now)
    if (f === 'verlopen') verlopen++
    else if (f === 'binnenkort') binnenkort++
  }
  return { verlopen, binnenkort }
}
