// ── Opslag van de nieuwseditie: cache, archief en bronmarkering ──────────────
//
// SINGLE SOURCE voor waar een editie landt. Stond als privéfuncties in
// `app/api/news/route.ts`; verhuisd zodra het lokale (on-device) pad erbij kwam.
//
// Waarom dat moest: het cloudpad en het lokale pad schrijven naar DEZELFDE plek —
// `app_settings` onder `news_cache:<userId>` — en diezelfde sleutel wordt gelezen
// door de peek-modus (de freshness-dot in de zijbalk) en het archief. Twee kopieën
// van die sleutelvorm is geen theoretisch risico maar een gegarandeerde stille
// drift: één kant hernoemt, de andere ziet de editie niet meer en er komt geen
// enkele foutmelding. Ó~n definitie, twee consumenten.
//
// SERVER-ONLY: leest en schrijft via de Supabase-server-client (RLS: de
// `app_settings`-sleutels zijn uid-gebonden en vallen onder de "own keys"-policy).

import type { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/service'
import type { NewsItem } from '@/lib/news-item'
import {
  normalizeUrl,
  selectSourceArticles,
  type SelectableArticle,
} from '@/lib/news-selection'

export type NewsSupabaseClient = Awaited<ReturnType<typeof createClient>>

// ── Cache ────────────────────────────────────────────────────────────────────

/** Bewaartermijn van een gevulde editie. */
export const CACHE_TTL_HOURS = 7 * 24 // 7 dagen

/**
 * Bewaartermijn van een LEGE editie ("geen nieuws met impact"). Bewust kort:
 * morgen kan er wél relevant nieuws zijn, en een door een fout veroorzaakte lege
 * editie mag de gebruiker geen week achtervolgen.
 */
export const EMPTY_CACHE_TTL_HOURS = 6

export function newsCacheKey(userId: string): string {
  return `news_cache:${userId}`
}

export interface CachedNews {
  items: NewsItem[]
  generatedAt: string
  sourceCount?: number
  sourceNewestAt?: string
}

export async function getCachedNews(
  supabase: NewsSupabaseClient,
  userId: string,
): Promise<CachedNews | null> {
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', newsCacheKey(userId))
    .maybeSingle()

  if (!data?.value) return null

  try {
    const cached: CachedNews =
      typeof data.value === 'string' ? JSON.parse(data.value) : data.value

    const generatedAt = new Date(cached.generatedAt)
    const ageHours = (Date.now() - generatedAt.getTime()) / (1000 * 60 * 60)

    const ttlHours = cached.items.length === 0 ? EMPTY_CACHE_TTL_HOURS : CACHE_TTL_HOURS
    if (ageHours > ttlHours) return null

    return cached
  } catch {
    return null
  }
}

export async function setCachedNews(
  supabase: NewsSupabaseClient,
  userId: string,
  items: NewsItem[],
  meta: { sourceCount: number; sourceNewestAt?: string },
): Promise<void> {
  const value: CachedNews = {
    items,
    generatedAt: new Date().toISOString(),
    sourceCount: meta.sourceCount,
    sourceNewestAt: meta.sourceNewestAt,
  }

  await supabase.from('app_settings').upsert(
    {
      key: newsCacheKey(userId),
      value: JSON.stringify(value),
      updated_at: new Date().toISOString(),
      updated_by: userId,
    },
    { onConflict: 'key' },
  )
}

// ── Edities ──────────────────────────────────────────────────────────────────

/** Maximaal aantal bewaarde edities per gebruiker. */
export const MAX_ARCHIVED_EDITIONS = 50

export async function getNextEditionNr(
  supabase: NewsSupabaseClient,
  userId: string,
): Promise<number> {
  const { data } = await supabase
    .from('news_editions')
    .select('edition_nr')
    .eq('user_id', userId)
    .order('edition_nr', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (data?.edition_nr ?? 0) + 1
}

/** Jaargang van de krant: jaar 1 = 2026. */
export function currentJaargang(now: Date = new Date()): number {
  return now.getFullYear() - 2025
}

/**
 * Verplaats de huidige gecachte editie naar het archief. Doet niets wanneer er
 * geen (of een lege) editie staat.
 */
export async function archiveCurrentEdition(
  supabase: NewsSupabaseClient,
  userId: string,
): Promise<void> {
  const { data: cacheRow } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', newsCacheKey(userId))
    .maybeSingle()

  if (!cacheRow?.value) return

  let cached: CachedNews
  try {
    cached =
      typeof cacheRow.value === 'string' ? JSON.parse(cacheRow.value) : cacheRow.value
  } catch {
    return
  }

  if (!cached.items || cached.items.length === 0) return

  const nextNr = await getNextEditionNr(supabase, userId)

  await supabase.from('news_editions').insert({
    user_id: userId,
    edition_nr: nextNr,
    jaargang: currentJaargang(),
    articles: cached.items,
    article_count: cached.items.length,
    hero_headline: cached.items[0].headline,
  })

  // Cap afdwingen — oudste edities boven de limiet verwijderen.
  const { data: editions } = await supabase
    .from('news_editions')
    .select('id, edition_nr')
    .eq('user_id', userId)
    .order('edition_nr', { ascending: false })

  if (editions && editions.length > MAX_ARCHIVED_EDITIONS) {
    const toDelete = editions.slice(MAX_ARCHIVED_EDITIONS).map((e) => e.id)
    await supabase.from('news_editions').delete().in('id', toDelete)
  }
}

/** Maximaal aantal koppen dat terugkomt — zie de clamp-toelichting hieronder. */
const MAX_RECENT_HEADLINES = 60
/** Maximale lengte per kop. */
const MAX_HEADLINE_CHARS = 120

/**
 * Koppen van de afgelopen twee maanden — voedt de herhaal-preventie.
 *
 * GECLAMPT, en dat is sinds de on-device editie geen luxe meer. Deze koppen gaan
 * op het cloudpad LETTERLIJK de systeemprompt in ("EERDER GEGENEREERDE KOPPEN …
 * vermijd herhaling"), en ze komen sinds die wijziging uit `news_editions`-rijen
 * die door de BROWSER zijn geschreven. Zonder clamp is dat twee dingen tegelijk:
 * een untrusted→prompt-rand waar een gebruiker zijn eigen instructieregels in kan
 * schrijven (zelf-gericht, dus geen cross-user-lek, maar wel prompt-sturing), en
 * een kostenhefboom — 50 edities × 8 berichten × 200 tekens is ~80 KB extra
 * prompt per cloudgeneratie, op TriFinity's tokens.
 *
 * Regeleindes eruit zodat een kop nooit een eigen regel in de prompt kan worden.
 */
export async function getRecentHeadlines(
  supabase: NewsSupabaseClient,
  userId: string,
): Promise<string[]> {
  const twoMonthsAgo = new Date()
  twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2)

  const { data } = await supabase
    .from('news_editions')
    .select('articles')
    .eq('user_id', userId)
    .gte('created_at', twoMonthsAgo.toISOString())
    .order('created_at', { ascending: false })

  if (!data || data.length === 0) return []
  return data
    .flatMap((row) => {
      const articles = row.articles as NewsItem[]
      return (articles ?? []).map((a) => a?.headline)
    })
    .filter((h): h is string => typeof h === 'string' && h.trim().length > 0)
    .map((h) => h.replace(/\s+/g, ' ').trim().slice(0, MAX_HEADLINE_CHARS))
    .slice(0, MAX_RECENT_HEADLINES)
}

// ── Bronartikelen ────────────────────────────────────────────────────────────

/** Hoeveel recente artikelen we uit de DB halen vóór de selectie erop losgaat. */
export const SOURCE_CANDIDATE_LIMIT = 120

/** Hoe ver terug een artikel nog als "actueel" telt. */
const SOURCE_WINDOW_DAYS = 30

/**
 * Laad bronartikelen via de service-role-client: `news_articles` is een
 * systeemtabel (RLS: service_role + superadmin) en moet voor ÁLLE gebruikers de
 * generatie voeden. Er gaat geen gebruikersinput in deze query.
 *
 * `selectSourceArticles` doet daarna de deterministische voorselectie
 * (recency-decay + ongebruikt-bonus + impact-bonus, met categoriespreiding).
 * De `limit` verschilt per pad: het cloudpad stuurt er 40 in één prompt, het
 * lokale pad ~12-15 omdat elk artikel daar een eigen modelcall krijgt.
 */
export async function loadNewsSourceArticles(limit: number): Promise<SelectableArticle[]> {
  let client: ReturnType<typeof getServiceClient>
  try {
    client = getServiceClient()
  } catch (err) {
    console.error('[news-edition-store] Service client niet beschikbaar — geen bronartikelen:', err)
    return []
  }

  const windowStart = new Date()
  windowStart.setDate(windowStart.getDate() - SOURCE_WINDOW_DAYS)

  const { data, error } = await client
    .from('news_articles')
    .select(
      'id, title, summary, source_url, source_name, category, published_at, potential_impact, is_used',
    )
    .gte('fetched_at', windowStart.toISOString())
    .order('published_at', { ascending: false })
    .limit(SOURCE_CANDIDATE_LIMIT)

  if (error) {
    console.error('[news-edition-store] Laden van bronartikelen mislukt:', error.message)
    return []
  }

  return selectSourceArticles(data || [], { limit })
}

/**
 * Haal specifieke bronartikelen op hun id op — de tegenhanger van
 * {@link loadNewsSourceArticles} voor het persisteren van een LOKAAL samengestelde
 * editie.
 *
 * WAAROM OP ID EN NIET OPNIEUW SELECTEREN: de client kreeg eerder een selectie;
 * die opnieuw draaien kan een ándere set opleveren (nieuwe artikelen, gewijzigde
 * `is_used`, een archief dat intussen groeide) en zou dan geldige berichten
 * weggooien. Door precies de genoemde rijen op te halen blijft de server de
 * autoriteit over de bronvelden, zonder van de client af te hangen wát die rijen
 * bevatten — hij zegt alleen wélke.
 */
export async function loadNewsArticlesByIds(ids: string[]): Promise<SelectableArticle[]> {
  if (ids.length === 0) return []

  let client: ReturnType<typeof getServiceClient>
  try {
    client = getServiceClient()
  } catch (err) {
    console.error('[news-edition-store] Service client niet beschikbaar — geen bronartikelen:', err)
    return []
  }

  const { data, error } = await client
    .from('news_articles')
    .select(
      'id, title, summary, source_url, source_name, category, published_at, potential_impact, is_used',
    )
    .in('id', ids)

  if (error) {
    console.error('[news-edition-store] Laden van bronartikelen op id mislukt:', error.message)
    return []
  }

  return data || []
}

// ── Bronmarkering ────────────────────────────────────────────────────────────

/**
 * Markeer alleen de bronartikelen die daadwerkelijk in de editie zijn gebruikt,
 * zodat `selectSourceArticles` ze de volgende keer minder zwaar weegt.
 * Faal-zacht: dit is boekhouding, geen functionaliteit.
 */
export async function markUsedArticles(
  articles: SelectableArticle[],
  items: NewsItem[],
): Promise<void> {
  const usedUrls = new Set(
    items.map((i) => i.sourceUrl).filter((u): u is string => Boolean(u)).map(normalizeUrl),
  )
  const usedIds = articles.filter((a) => usedUrls.has(normalizeUrl(a.source_url))).map((a) => a.id)
  if (usedIds.length === 0) return

  try {
    const client = getServiceClient()
    await client.from('news_articles').update({ is_used: true }).in('id', usedIds)
  } catch (err) {
    console.error('[news-edition-store] Markeren van gebruikte artikelen mislukt:', err)
  }
}

// ── Verversingslimiet ────────────────────────────────────────────────────────

export interface RefreshLimitStatus {
  allowed: boolean
  remaining: number
  limit: number
}

export async function checkRefreshLimit(
  supabase: NewsSupabaseClient,
  userId: string,
): Promise<RefreshLimitStatus> {
  const { data: setting } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'news_max_refreshes_per_week')
    .maybeSingle()
  const limit = setting?.value ? parseInt(setting.value, 10) : 3

  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)

  const { count } = await supabase
    .from('news_editions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', weekAgo.toISOString())

  const used = count ?? 0
  return { allowed: used < limit, remaining: Math.max(0, limit - used), limit }
}
