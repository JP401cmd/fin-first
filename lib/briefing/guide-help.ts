// ── Guide-Help types & server-getter ─────────────────────────────────────
// Help-content per stap (uitleg + how-to + screenshots). Opslag: één
// `app_settings`-row met key 'guide_help_content', JSONB met helpKey →
// HelpEntry. Screenshots leven in Supabase Storage bucket 'guide-help',
// path `{helpKey}/{filename}` — de URL wordt hier opgeslagen voor snel
// renderen zonder extra round-trip.

import type { SupabaseClient } from '@supabase/supabase-js'

export const GUIDE_HELP_SETTINGS_KEY = 'guide_help_content' as const

export interface HelpScreenshot {
  /** Bestandsnaam binnen `{helpKey}/` in de Supabase bucket. */
  filename: string
  /** Public URL (cached zodat clients geen extra signed-url-call nodig hebben). */
  url: string
  /** Optionele bijschrift onder de afbeelding. */
  caption?: string
}

export interface HelpEntry {
  /** Korte uitleg: "wat is dit?". */
  explanation: string
  /** Stap-voor-stap: "hoe doe je dit?". Newlines worden gerespecteerd. */
  howTo: string
  screenshots: HelpScreenshot[]
  /** ISO-string van laatste mutatie (server-side gezet). */
  updatedAt: string
}

/** helpKey → HelpEntry. Lege blob = geen uitleg geconfigureerd voor enige stap. */
export type GuideHelpBlob = Record<string, HelpEntry>

/** Lege default — helper zodat callers nooit op `null` hoeven te checken. */
export const EMPTY_GUIDE_HELP: GuideHelpBlob = {}

/**
 * Server-side getter: laad de hele help-content blob uit `app_settings`.
 * Returnt een leeg object wanneer er nog geen row bestaat.
 *
 * Gebruik vanuit server-components (will-landing data-load) en API-routes.
 */
export async function getGuideHelp(
  supabase: SupabaseClient,
): Promise<GuideHelpBlob> {
  const { data: row } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', GUIDE_HELP_SETTINGS_KEY)
    .maybeSingle()

  if (!row?.value) return EMPTY_GUIDE_HELP

  try {
    const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return EMPTY_GUIDE_HELP
    }
    return parsed as GuideHelpBlob
  } catch {
    return EMPTY_GUIDE_HELP
  }
}

// ── Validatie-helpers (gebruikt door API-routes) ──────────────────────

export function isValidHelpEntry(entry: unknown): entry is HelpEntry {
  if (!entry || typeof entry !== 'object') return false
  const e = entry as Record<string, unknown>
  if (typeof e.explanation !== 'string') return false
  if (typeof e.howTo !== 'string') return false
  if (!Array.isArray(e.screenshots)) return false
  for (const s of e.screenshots) {
    if (!s || typeof s !== 'object') return false
    const sc = s as Record<string, unknown>
    if (typeof sc.filename !== 'string' || !sc.filename) return false
    if (typeof sc.url !== 'string' || !sc.url) return false
    if (sc.caption !== undefined && typeof sc.caption !== 'string') return false
  }
  if (typeof e.updatedAt !== 'string') return false
  return true
}

/** Tel hoeveel keys in de blob daadwerkelijk inhoud hebben (voor coverage-stats). */
export function countHelpEntries(blob: GuideHelpBlob): number {
  let n = 0
  for (const entry of Object.values(blob)) {
    if (entry.explanation || entry.howTo || entry.screenshots.length > 0) n++
  }
  return n
}
