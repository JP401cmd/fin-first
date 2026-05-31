// ── Markt-briefje uit de nieuws-cache (server, read-only) ───────────
//
// Activeert de slapende `market`-categorie van de briefing door het top
// 'direct'-impact item uit de bestaande, per-user gecachte nieuws-feed te
// lezen. STRIKT read-only: triggert NOOIT nieuws-generatie (dat is duur en zou
// bovendien een ververs-quotum kunnen verbruiken) — leest alleen de cache die
// `GET /api/news` al heeft gevuld. Leeg/verlopen cache → null → kaart verbergt zich.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { BriefingEntry, HefboomTag } from '@/components/overview/briefing-panel'

/** Spiegelt de TTL van `app/api/news/route.ts` (7 dagen). */
const NEWS_CACHE_TTL_HOURS = 7 * 24
const MAX_TEXT_LENGTH = 180

type NewsCategory =
  | 'fiscaal'
  | 'rente'
  | 'woningmarkt'
  | 'beleggingen'
  | 'pensioen'
  | 'macro'

const CATEGORY_HEFBOOM: Record<NewsCategory, HefboomTag | undefined> = {
  rente: 'schulden',
  woningmarkt: 'schulden',
  fiscaal: 'belasting',
  beleggingen: 'bezittingen',
  pensioen: 'bezittingen',
  macro: undefined,
}

interface RawNewsItem {
  id?: unknown
  headline?: unknown
  personalImpact?: unknown
  impactType?: unknown
  category?: unknown
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max - 1).trimEnd() + '…'
}

/**
 * Lees het meest impactvolle nieuwsitem uit de cache en maak er een
 * `market`-briefing-entry van. Prefereert een 'direct'-impact item (concrete
 * impact) en valt anders terug op het eerste item. Returnt null bij geen
 * (verse) cache of geen bruikbaar item.
 */
export async function loadTopMarketBriefing(
  supabase: SupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<BriefingEntry | null> {
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', `news_cache:${userId}`)
    .maybeSingle()
  if (!data?.value) return null

  let cached: { items?: unknown; generatedAt?: unknown }
  try {
    cached = typeof data.value === 'string' ? JSON.parse(data.value) : data.value
  } catch {
    return null
  }
  if (typeof cached?.generatedAt !== 'string' || !Array.isArray(cached.items)) return null

  const ageHours = (now.getTime() - new Date(cached.generatedAt).getTime()) / (1000 * 60 * 60)
  if (!isFinite(ageHours) || ageHours > NEWS_CACHE_TTL_HOURS) return null

  const items = cached.items as RawNewsItem[]
  const usable = (it: RawNewsItem) => it && typeof it.headline === 'string' && it.headline.length > 0
  const top = items.find((it) => usable(it) && it.impactType === 'direct') ?? items.find(usable)
  if (!top) return null

  const headline = String(top.headline)
  const impact =
    typeof top.personalImpact === 'string' && top.personalImpact.trim().length > 0
      ? ` — ${top.personalImpact.trim()}`
      : ''
  const category = top.category as NewsCategory

  return {
    id: `market:${typeof top.id === 'string' ? top.id : 'news'}`,
    category: 'market',
    text: truncate(`${headline}${impact}`, MAX_TEXT_LENGTH),
    href: '/berichten',
    hefboom: CATEGORY_HEFBOOM[category],
  }
}
