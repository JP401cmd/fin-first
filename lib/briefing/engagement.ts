// ── Briefing Card Engagement Tracking ──────────────────────
// Logs which briefing cards the user clicks to learn which card types are valuable.
// Stored in localStorage as a FIFO array (max 100 entries).

import type { CardModule } from './types'

const STORAGE_KEY = 'briefing_engagement'
const MAX_ENTRIES = 100

export interface EngagementEntry {
  cardType: string
  module: CardModule | undefined
  timestamp: string
}

/** Read all engagement entries from localStorage */
function readEntries(): EngagementEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as EngagementEntry[]
  } catch {
    return []
  }
}

/** Write engagement entries to localStorage */
function writeEntries(entries: EngagementEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch { /* quota / SSR */ }
}

/** Log a card engagement event. FIFO: drops oldest when > 100 entries. */
export function logCardEngagement(cardType: string, module: CardModule | undefined): void {
  const entries = readEntries()
  entries.push({ cardType, module, timestamp: new Date().toISOString() })

  // FIFO: keep only the last MAX_ENTRIES
  while (entries.length > MAX_ENTRIES) {
    entries.shift()
  }

  writeEntries(entries)
}

/** Get engagement counts per card type */
export function getEngagementSummary(): Record<string, number> {
  const entries = readEntries()
  const summary: Record<string, number> = {}
  for (const entry of entries) {
    summary[entry.cardType] = (summary[entry.cardType] ?? 0) + 1
  }
  return summary
}
