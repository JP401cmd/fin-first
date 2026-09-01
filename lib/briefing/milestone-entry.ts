// ── Verse mijlpaal → briefing-entry ──────────────────────────────────
//
// Aparte module naast `engine.ts` met opzet: de injectie moet NÁ het bevriezen
// van de weeksnapshot gebeuren. `getOrCreateWeeklySnapshot` legt de briefing per
// ISO-week vast; zat de mijlpaal in de engine zelf, dan werd een mijlpaal van
// dinsdag pas de week erop zichtbaar (ADR 0123 §6).
//
// De entry wordt daarom niet gerangschikt maar POSITIONEEL vooraan gezet: hij
// komt langs `mergeRankedEntries` heen, dus de rang-tabel in `engine.ts` raakt
// hem niet.

import type { BriefingEntry } from '@/lib/types/briefing'
import { OVERVIEW_BRIEFING_MAX } from './overview-briefing'
import { buildMilestoneCopy } from '@/lib/milestones/copy'
import { MILESTONE_FRESH_WINDOW_MS, type AchievedMilestoneRow } from '@/lib/milestones/types'

/** Id-prefix van de verse-mijlpaal-entry. Stabiel: hij is ook de React-key. */
export const FRESH_MILESTONE_ID_PREFIX = 'milestone:fresh:'

/**
 * Bouw het briefje voor één gelogde mijlpaal. Teksten komen uit
 * `lib/milestones/copy.ts` — dit bestand schrijft geen eigen copy en rekent
 * geen eigen vrijheidstijd.
 */
export function buildFreshMilestoneEntry(
  row: AchievedMilestoneRow,
  dailyExpenseRate: number | null,
  context?: { goalName?: string | null },
): BriefingEntry {
  const { titel, betekenis } = buildMilestoneCopy(row, dailyExpenseRate, context)
  return {
    id: `${FRESH_MILESTONE_ID_PREFIX}${row.milestone_key}`,
    category: 'milestone',
    text: `${titel}. ${betekenis}`,
    // Naar de tijdlijn: sinds /mijn/mijlpalen bestaat is dát de plek waar de
    // gebeurtenis blijvend staat — /overzicht toont alleen het moment zelf.
    href: '/mijn/mijlpalen',
  }
}

/**
 * Zet een verse mijlpaal vooraan in de briefing.
 *
 * - `row === null` of ouder dan het verse venster → lijst blijft ongewijzigd.
 * - De lijst GROEIT NIET: de entry verdringt de laatste, want /overzicht toont
 *   er `OVERVIEW_BRIEFING_MAX` (3-koloms × 2 rijen) en een zevende briefje zou
 *   het raster breken.
 * - Een reeds aanwezig briefje met dezelfde id wordt verwijderd vóór de
 *   injectie, zodat een tweede aanroep geen duplicaat oplevert.
 *
 * @param now  injecteerbaar voor tests; standaard de wandklok
 */
export function withFreshMilestone(
  entries: BriefingEntry[],
  row: AchievedMilestoneRow | null,
  dailyExpenseRate: number | null,
  now: Date = new Date(),
  context?: { goalName?: string | null },
): BriefingEntry[] {
  if (!row) return entries

  const achievedAt = Date.parse(row.achieved_at)
  if (!Number.isFinite(achievedAt)) return entries

  // Een tijdstip in de toekomst (klok-scheefstand) telt als "zojuist", nooit als
  // verlopen — anders zou juist de meest verse mijlpaal wegvallen.
  const ageMs = now.getTime() - achievedAt
  if (ageMs > MILESTONE_FRESH_WINDOW_MS) return entries

  const entry = buildFreshMilestoneEntry(row, dailyExpenseRate, context)
  const rest = entries.filter((e) => e.id !== entry.id)
  return [entry, ...rest].slice(0, OVERVIEW_BRIEFING_MAX)
}
