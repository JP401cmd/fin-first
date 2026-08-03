// ── Lokale nieuwseditie: het bron-artikel zoals de BROWSER het krijgt ─────────
//
// Op het cloudpad schrijft het model de hele `NewsItem` — inclusief `sourceUrl`,
// `sourceName`, `category` en `date`. Dat is precies de kwetsbare plek: het model
// moet een URL foutloos overtypen, en `filterGroundedItems` (lib/news-selection.ts)
// staat er als vangnet achter om hallucinaties eruit te gooien.
//
// Op het LOKALE pad draaien we dat om. Deze velden komen NOOIT uit het model maar
// worden 1-op-1 uit de bronrij meegedragen: de resolver kopieert ze van de
// `LocalNewsSource` naar het `NewsItem`. Daarmee vervalt de hele hallucinatie-URL-
// klasse bij de bron in plaats van bij de uitgang — `filterGroundedItems` blijft
// server-side staan als vangnet in plaats van als eerste verdediging.
//
// Het model schrijft op dit pad alleen nog proza (kop, samenvatting, impactzin) en
// twee labels. Dat is wat een 2B-model binnen een 8192-token venster aankan.
//
// Dit bestand is PUUR (geen IO, geen imports uit de runtime) zodat het aan beide
// kanten van de naad bruikbaar is: de server bouwt de lijst in
// /api/local-news-sources, de browser consumeert 'm in de resolver.

import type { SelectableArticle } from '@/lib/news-selection'
import { NEWS_CATEGORIES, type NewsCategory } from '@/lib/news-item'

/**
 * De categorie-enum, geconsumeerd uit de gedeelde `lib/news-item.ts` — dezelfde
 * lijst die het cloud-schema afdwingt. Bewust NIET hier herhaald: een tweede
 * kopie zou stil uit de pas lopen zodra er een categorie bijkomt.
 */
export type LocalNewsCategory = NewsCategory

/**
 * Terugval-categorie. `news_articles.category` is `string | null` en de ingest kan
 * een waarde opleveren die buiten de zes valt. Op het cloudpad loste het model dat
 * impliciet op (het koos zelf een enum-waarde); hier moet de CODE kiezen. 'macro'
 * is de breedste, minst misleidende bak — een verkeerd gelabeld artikel is dan
 * "algemeen economisch nieuws" en geen valse fiscale claim.
 */
const FALLBACK_CATEGORY: LocalNewsCategory = 'macro'

/** Normaliseer een ruwe categoriewaarde naar de enum; onbekend → 'macro'. */
export function normalizeNewsCategory(raw: string | null | undefined): LocalNewsCategory {
  const value = (raw ?? '').trim().toLowerCase()
  return (NEWS_CATEGORIES as readonly string[]).includes(value)
    ? (value as LocalNewsCategory)
    : FALLBACK_CATEGORY
}

/**
 * Eén bronartikel, klaar voor het lokale pad. Alle velden die het uiteindelijke
 * `NewsItem` NIET van het model mag krijgen, zitten hier al in hun definitieve vorm.
 *
 * PRIVACY: dit is openbaar nieuws. Er zit geen enkel gebruikersgegeven in, dus de
 * lijst mag zonder bezwaar naar de browser (zie de route-toelichting).
 */
export interface LocalNewsSource {
  /** `news_articles.id` — draagt de "is_used"-markering terug naar de server. */
  id: string
  title: string
  summary: string | null
  /** Letterlijk uit de bronrij. Komt ongewijzigd op het NewsItem terecht. */
  sourceUrl: string
  /** Letterlijk uit de bronrij. */
  sourceName: string
  category: LocalNewsCategory
  /** Publicatiedatum als YYYY-MM-DD. */
  date: string
  /** De impactanalyse uit de ingest — voedt pass A, niet de uitvoer. */
  potentialImpact: string | null
}

/** ISO-timestamp → YYYY-MM-DD; onbruikbaar/leeg → `fallback`. */
function toDateOnly(raw: string | null | undefined, fallback: string): string {
  if (!raw) return fallback
  const date = raw.split('T')[0]
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : fallback
}

/**
 * Map een DB-rij naar de client-vorm. `today` wordt meegegeven (niet intern
 * `new Date()`) zodat de functie puur en deterministisch testbaar blijft.
 */
export function toLocalNewsSource(article: SelectableArticle, today: string): LocalNewsSource {
  return {
    id: article.id,
    title: article.title,
    summary: article.summary,
    sourceUrl: article.source_url,
    sourceName: article.source_name,
    category: normalizeNewsCategory(article.category),
    date: toDateOnly(article.published_at, today),
    potentialImpact: article.potential_impact,
  }
}

/**
 * Stabiel, uniek `NewsItem.id` afgeleid van de bron-artikel-id.
 *
 * Waarom afgeleid en niet door het model verzonnen: het id draagt de leesstatus
 * (`/api/news/read`). Een door het model bedacht id ("news-2026-03-07-1") is per
 * generatie anders en botst tussen edities; de artikel-id is uniek en stabiel, dus
 * "gelezen" blijft kloppen ook als hetzelfde artikel later opnieuw langskomt.
 */
export function localNewsItemId(articleId: string): string {
  return `news-local-${articleId}`
}

/** Prefix van {@link localNewsItemId} — één definitie voor heen en terug. */
const LOCAL_ITEM_ID_PREFIX = 'news-local-'

/**
 * De omkering van {@link localNewsItemId}: haal de bron-artikel-id uit een
 * item-id. Null wanneer het id niet van het lokale pad komt.
 *
 * De persist-route gebruikt dit om de bijbehorende rij ZELF op te halen. Daarmee
 * hoeft de client de bronvelden niet mee te sturen (en kan hij ze dus ook niet
 * vervalsen): hij zegt alleen wélk artikel het betreft, de server bepaalt wat dat
 * artikel is.
 */
export function parseLocalNewsItemId(itemId: string): string | null {
  if (!itemId.startsWith(LOCAL_ITEM_ID_PREFIX)) return null
  const articleId = itemId.slice(LOCAL_ITEM_ID_PREFIX.length)
  return articleId.length > 0 ? articleId : null
}
