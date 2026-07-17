// ── News preview (server field) ──────────────────────────────────────
// Authoritative, device-independent snapshot of the user's latest news
// edition for the dashboard "Nieuws"-widget (id `berichten`). Reads the
// same server-side cache that /api/news writes (app_settings) plus the
// real edition number from news_editions, so the widget no longer depends
// on the localStorage cache written by a single browser profile.
//
// Consume, don't recompute: the widget renders these fields verbatim;
// edition number and generation date come from the source of truth, not
// from a client-side approximation.

import type { SupabaseClient } from '@supabase/supabase-js'

/** Staleness mirrors app/api/news/route.ts — 7d for a filled edition, 6h for an empty one. */
const CACHE_TTL_HOURS = 7 * 24
const EMPTY_TTL_HOURS = 6
/** Cap the payload embedded in DashboardData — the widget shows at most 4 headlines. */
const PREVIEW_MAX_ITEMS = 6

type ImpactDirection = 'positief' | 'negatief' | 'neutraal'

export interface NewsPreviewItem {
  id: string
  headline: string
  summary: string
  category: string
  /** Direction of the item's impact on the user (drives the semantic status dot). */
  impactDirection: ImpactDirection
}

export interface NewsPreview {
  /** Per-user edition counter from news_editions (null if never generated). */
  editionNr: number | null
  /** Total cached articles in the current edition. */
  count: number
  /** ISO timestamp of when this edition was generated (drives the dateline). */
  generatedAt: string
  items: NewsPreviewItem[]
}

function toDirection(v: unknown): ImpactDirection {
  return v === 'positief' || v === 'negatief' ? v : 'neutraal'
}

/**
 * Load the latest news edition preview for a user. Returns null when there
 * is no cached edition, when it is stale (beyond TTL), or on any parse error
 * — the widget then shows its empty state. Uses the caller's RLS-scoped
 * client; both reads are own-row and need no service role.
 */
export async function loadNewsPreview(
  supabase: SupabaseClient,
  userId: string,
): Promise<NewsPreview | null> {
  const [cacheRes, editionRes] = await Promise.all([
    supabase.from('app_settings').select('value').eq('key', `news_cache:${userId}`).maybeSingle(),
    supabase
      .from('news_editions')
      .select('edition_nr')
      .eq('user_id', userId)
      .order('edition_nr', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const raw = cacheRes.data?.value
  if (!raw) return null

  try {
    const cached = typeof raw === 'string' ? JSON.parse(raw) : raw
    const items: unknown[] = Array.isArray(cached?.items) ? cached.items : []
    const generatedAt = typeof cached?.generatedAt === 'string' ? cached.generatedAt : null
    if (!generatedAt) return null

    const ageHours = (Date.now() - new Date(generatedAt).getTime()) / 3_600_000
    const ttl = items.length === 0 ? EMPTY_TTL_HOURS : CACHE_TTL_HOURS
    if (!Number.isFinite(ageHours) || ageHours > ttl) return null

    return {
      editionNr: (editionRes.data?.edition_nr as number | undefined) ?? null,
      count: items.length,
      generatedAt,
      items: items.slice(0, PREVIEW_MAX_ITEMS).map((it) => {
        const item = it as Record<string, unknown>
        return {
          id: String(item.id ?? ''),
          headline: String(item.headline ?? ''),
          summary: String(item.summary ?? ''),
          category: String(item.category ?? ''),
          impactDirection: toDirection(item.impactDirection),
        }
      }),
    }
  } catch {
    return null
  }
}
