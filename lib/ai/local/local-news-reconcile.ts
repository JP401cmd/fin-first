// ── Server-side hervalidatie van de lokaal samengestelde editie ──────────────
//
// Op het lokale pad is de BROWSER de auteur: het model draait op het toestel van
// de gebruiker en de editie komt via een POST binnen. Dat is een wezenlijk andere
// vertrouwensrelatie dan het cloudpad, waar de server zelf genereert. Alles wat
// daar impliciet klopte, moet hier expliciet worden afgedwongen.
//
// DE WIRE-VORM DRAAGT DE INVARIANT. `localNewsClientItemSchema` heeft géén veld
// voor `sourceUrl`, `sourceName`, `category` of `date`. Een client kán ze dus niet
// meesturen, ook niet kwaadwillend — er is geen sleutel om ze in te zetten. Die
// vier velden worden hieronder uit de BRONRIJ gezet, gevonden via het item-id.
// Daarmee is "de bron-URL komt altijd uit de bronrij" geen afspraak maar een
// eigenschap van het formaat.
//
// De koppeling op id is tegelijk de GROUNDING-check: een bericht dat niet naar een
// aangeleverd bronartikel wijst, bestaat niet en wordt weggegooid. Dat is dezelfde
// bedoeling als `filterGroundedItems` (lib/news-selection.ts) op het cloudpad,
// maar strenger — daar volstaat een URL-match, hier moet het artikel echt in de
// aangeboden set zitten.
//
// PUUR (geen IO) → los unit-testbaar.

import { z } from 'zod'
import { clampNewsImpactScore, sortNewsItems, type NewsItem } from '@/lib/news-item'
import { LOCAL_NEWS_MAX_ITEMS } from './local-news-select'
import { localNewsItemId, type LocalNewsSource } from './local-news-source'

/**
 * Wat de client mag aanleveren — en niets meer. Bewust GEEN `sourceUrl`,
 * `sourceName`, `category` of `date`: zie de kop van dit bestand.
 */
export const localNewsClientItemSchema = z.object({
  id: z.string().min(1).max(200),
  headline: z.string().min(1).max(200),
  summary: z.string().min(1).max(600),
  /** Mag leeg zijn: de nummer-guard kan de impactzin hebben laten vervallen. */
  personalImpact: z.string().max(400).default(''),
  impactType: z.enum(['direct', 'relevant']),
  impactScore: z.number().finite(),
  impactDirection: z.enum(['positief', 'negatief', 'neutraal']),
})

export type LocalNewsClientItem = z.infer<typeof localNewsClientItemSchema>

export interface ReconcileResult {
  /** De goedgekeurde editie: gesorteerd, begrensd, bronvelden server-gezet. */
  kept: NewsItem[]
  /** Aantal aangeleverde berichten dat is afgevallen (geen bron, of duplicaat). */
  dropped: number
}

/**
 * Herbouw de editie op basis van de aangeleverde berichten en de bronartikelen.
 *
 * Volgorde van de controles:
 *  1. koppel elk bericht aan zijn bronartikel via het id; geen match → weg;
 *  2. duplicaat-id → alleen de eerste telt;
 *  3. zet `sourceUrl`/`sourceName`/`category`/`date` uit de BRONRIJ;
 *  4. klem `impactScore` op 1-5 (dezelfde clamp als het cloudpad);
 *  5. degradeer naar `impactType: 'relevant'` zodra de impactzin leeg is — de
 *     claim "direct" belooft een concrete impact en die staat er dan niet;
 *  6. sorteer (direct eerst, hoogste score bovenaan) en kap af op 0-8.
 */
export function reconcileLocalEdition(
  items: LocalNewsClientItem[],
  sources: LocalNewsSource[],
): ReconcileResult {
  const byItemId = new Map<string, LocalNewsSource>()
  for (const source of sources) byItemId.set(localNewsItemId(source.id), source)

  const seen = new Set<string>()
  const kept: NewsItem[] = []
  let dropped = 0

  for (const item of items) {
    const source = byItemId.get(item.id)
    if (!source || seen.has(item.id)) {
      dropped++
      continue
    }
    seen.add(item.id)

    const personalImpact = item.personalImpact.trim()

    kept.push({
      id: item.id,
      headline: item.headline.trim(),
      summary: item.summary.trim(),
      impactType: item.impactType === 'direct' && personalImpact ? 'direct' : 'relevant',
      personalImpact,
      impactScore: clampNewsImpactScore(item.impactScore),
      impactDirection: item.impactDirection,
      // ── Uit de bronrij, nooit van de client ──
      category: source.category,
      date: source.date,
      sourceUrl: source.sourceUrl,
      sourceName: source.sourceName,
    })
  }

  const sorted = sortNewsItems(kept)
  if (sorted.length > LOCAL_NEWS_MAX_ITEMS) {
    dropped += sorted.length - LOCAL_NEWS_MAX_ITEMS
  }

  return { kept: sorted.slice(0, LOCAL_NEWS_MAX_ITEMS), dropped }
}
