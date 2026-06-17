/**
 * Nieuws-datalaag voor de publieke Vrijheidscheck-rapport (`/api/check/submit`).
 *
 * Hecht tot 3 ALGEMENE financiële nieuwsitems aan het rapport (krant-sectie van
 * het ontwerp). De bron is de gedeelde `news_articles`-systeemtabel (cron-ingest
 * uit RSS/web-bronnen) — exact dezelfde bron die de in-app `/api/news`-generatie
 * voedt, maar ZONDER het dure, auth-gated AI-pad: dit publieke, anonieme pad
 * bakt het nieuws deterministisch in op submit-moment.
 *
 * BEWUSTE GRENZEN (privacy/security — dit is een publiek, niet-geauthenticeerd pad):
 *  - Uitsluitend algemeen nieuws: geen gebruikersdata, geen PII, geen
 *    personalisatie. Er gaat GEEN intake/e-mail in deze query of in de output.
 *  - De read gebruikt DEZELFDE service-role-client die de route al voor de write
 *    aanmaakt (parameter `serviceClient`) — geen tweede client, geen anon/user-
 *    client. `news_articles` is RLS-dicht (service_role/superadmin) en moet voor
 *    iedere bezoeker leesbaar zijn, dus de read hoort op de service-rol.
 *  - Faalt de bron of is hij leeg, dan degradeert de sectie netjes naar
 *    `{ items: [], sourceNote: '' }` — `buildCheckReportNews` werpt NOOIT naar de
 *    aanroeper, zodat een nieuws-hapering nooit het opslaan van de lead blokkeert.
 *
 * Consume, don't recompute: de bronartikel-selectie hergebruikt de bestaande pure
 * `selectSourceArticles` (lib/news-selection.ts) — geen eigen ranking hier.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { selectSourceArticles, type SelectableArticle } from '@/lib/news-selection'
import type { ReportNews, ReportNewsItem } from './types'

/** Aantal nieuwsitems in de rapport-krant (ontwerp: tot 3). */
const REPORT_NEWS_LIMIT = 3

/** Kandidaat-venster: laatste ~30 dagen (gelijk aan `/api/news`). */
const NEWS_WINDOW_DAYS = 30

/** Bovengrens op de kandidatenset vóór selectie (gelijk aan `/api/news`). */
const SOURCE_CANDIDATE_LIMIT = 120

/**
 * Toegestane nieuws-categorieën in de rapport-DTO. Een artikel-`category` die
 * hier niet in valt, valt terug op `null` (de render kleurt 'm dan neutraal).
 */
const ALLOWED_CATEGORIES: ReadonlySet<string> = new Set<NonNullable<ReportNewsItem['category']>>([
  'fiscaal', 'rente', 'woningmarkt', 'beleggingen', 'pensioen', 'macro',
])

/**
 * Maandnamen voor de nl-NL-datumweergave (bv. '17 juni 2026'). Bewust een lokale
 * kopie i.p.v. een import: dezelfde conventie als `masthead.dateLabel` in
 * `lib/check/build-report.ts` (dat bestand is in deze wave consume-only en mag
 * niet worden aangeraakt). De render formatteert zelf geen datums.
 */
const NL_MONTHS = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
] as const

/** Formatteer een datum als '17 juni 2026' — gelijk aan de masthead-conventie. */
function formatDateLabel(d: Date): string {
  return `${d.getDate()} ${NL_MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

/**
 * Laad de geselecteerde bronartikelen via de meegegeven service-role-client.
 *
 * Spiegelt de SELECT van `loadSourceArticles` in `app/api/news/route.ts`:
 * laatste ~30 dagen op `fetched_at`, aflopend op `published_at`, tot 120
 * kandidaten — daarna versmald met de pure `selectSourceArticles` tot de 3
 * met de beste spreiding/score. Er gaat GEEN gebruikersinput in deze query.
 *
 * Bij een query-fout wordt een lege lijst teruggegeven (de aanroeper degradeert
 * dan naar een lege sectie); deze functie werpt niet.
 */
export async function loadCheckNewsArticles(
  serviceClient: SupabaseClient,
  now: Date = new Date(),
): Promise<SelectableArticle[]> {
  const windowStart = new Date(now)
  windowStart.setDate(windowStart.getDate() - NEWS_WINDOW_DAYS)

  const { data, error } = await serviceClient
    .from('news_articles')
    .select('id, title, summary, source_url, source_name, category, published_at, potential_impact, is_used')
    .gte('fetched_at', windowStart.toISOString())
    .order('published_at', { ascending: false })
    .limit(SOURCE_CANDIDATE_LIMIT)

  if (error) {
    console.error('[check/report-news] Bronartikelen laden mislukt:', error.message)
    return []
  }

  // `windowDays` herhaalt bewust de eigen default van `selectSourceArticles` (30),
  // zodat de recency-decay (op `published_at`) en het DB-kandidaatvenster (op
  // `fetched_at`) samen meebewegen als `NEWS_WINDOW_DAYS` ooit wijzigt. Let op:
  // de category-spreiding in `selectSourceArticles` is best-effort en treedt
  // alléén op bij méér kandidaten dan `limit`; op een dunne nieuwsdag (≤3
  // artikelen) valt het terug op pure score-sortering (mogelijk zelfde categorie).
  return selectSourceArticles(data || [], { limit: REPORT_NEWS_LIMIT, now, windowDays: NEWS_WINDOW_DAYS })
}

/**
 * Pure map van bronartikelen naar de rapport-DTO-items. Geen I/O.
 *
 * - `category`: doorgegeven als het een toegestane enum-waarde is, anders `null`.
 * - `headline` ← `title`, `summary` ← `summary` (leeg → lege string),
 *   `sourceName` ← `source_name`, `sourceUrl` ← `source_url`.
 * - `dateLabel`: `published_at` in nl-NL ('17 juni 2026'); ontbreekt/ongeldig → ''.
 * - `impact` ← `potential_impact` (getrimd); leeg/whitespace/`null` → `null`.
 */
export function toReportNewsItems(articles: SelectableArticle[]): ReportNewsItem[] {
  return articles.map((a) => {
    const category = a.category && ALLOWED_CATEGORIES.has(a.category)
      ? (a.category as NonNullable<ReportNewsItem['category']>)
      : null

    let dateLabel = ''
    if (a.published_at) {
      const d = new Date(a.published_at)
      if (!Number.isNaN(d.getTime())) dateLabel = formatDateLabel(d)
    }

    return {
      category,
      headline: a.title,
      summary: a.summary ?? '',
      sourceName: a.source_name,
      sourceUrl: a.source_url,
      dateLabel,
      impact: (a.potential_impact ?? '').trim() || null,
    }
  })
}

/**
 * Bouw de rapport-nieuws-sectie: laad + selecteer + map de bronartikelen en stel
 * een voorgemaakte `sourceNote` samen. Volledig fail-safe — bij ELKE fout of een
 * lege bron retourneert deze `{ items: [], sourceNote: '' }` en werpt nooit, zodat
 * een nieuws-hapering het schrijven van de lead niet kan blokkeren.
 */
export async function buildCheckReportNews(
  serviceClient: SupabaseClient,
  now: Date = new Date(),
): Promise<ReportNews> {
  try {
    const articles = await loadCheckNewsArticles(serviceClient, now)
    const items = toReportNewsItems(articles)
    if (items.length === 0) return { items: [], sourceNote: '' }
    return {
      items,
      sourceNote: `Gebaseerd op de laatste bronnen · bijgewerkt ${formatDateLabel(now)}`,
    }
  } catch (err) {
    console.error('[check/report-news] Nieuws-sectie bouwen mislukt:', err)
    return { items: [], sourceNote: '' }
  }
}
