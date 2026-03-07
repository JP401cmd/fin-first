// ── User Preference Block for Will's Briefing Prompting ────
// Combines engagement (clicks) and feedback (thumbs up/down) to build
// a preference block that steers Will's card selection.

import { getEngagementSummary } from './engagement'

const FEEDBACK_KEY = 'briefing_feedback_history'
const MIN_DATA_POINTS = 10

export interface FeedbackEntry {
  cardType: string
  positive: boolean
  timestamp: string
}

/** Read all feedback entries from localStorage */
function readFeedbackEntries(): FeedbackEntry[] {
  try {
    const raw = localStorage.getItem(FEEDBACK_KEY)
    if (!raw) return []
    return JSON.parse(raw) as FeedbackEntry[]
  } catch {
    return []
  }
}

/** Persist a feedback entry to localStorage (long-term) */
export function persistFeedback(cardType: string, positive: boolean): void {
  try {
    const entries = readFeedbackEntries()
    entries.push({ cardType, positive, timestamp: new Date().toISOString() })
    // Keep max 200 entries (FIFO)
    while (entries.length > 200) {
      entries.shift()
    }
    localStorage.setItem(FEEDBACK_KEY, JSON.stringify(entries))
  } catch { /* quota / SSR */ }
}

/** Get feedback counts per card type: { type: { up: N, down: N } } */
function getFeedbackSummary(): Record<string, { up: number; down: number }> {
  const entries = readFeedbackEntries()
  const summary: Record<string, { up: number; down: number }> = {}
  for (const entry of entries) {
    if (!summary[entry.cardType]) {
      summary[entry.cardType] = { up: 0, down: 0 }
    }
    if (entry.positive) {
      summary[entry.cardType].up++
    } else {
      summary[entry.cardType].down++
    }
  }
  return summary
}

/**
 * Build a user preference prompt block for Will's system prompt.
 * Combines engagement (clicks) and feedback (thumbs up/down) to score card types.
 * Returns null if fewer than MIN_DATA_POINTS data points exist.
 */
export function buildUserPreferenceBlock(): string | null {
  const engagement = getEngagementSummary()
  const feedback = getFeedbackSummary()

  // Count total data points (clicks + feedback entries)
  const totalClicks = Object.values(engagement).reduce((a, b) => a + b, 0)
  const totalFeedback = Object.values(feedback).reduce(
    (a, b) => a + b.up + b.down,
    0,
  )
  const totalDataPoints = totalClicks + totalFeedback

  if (totalDataPoints < MIN_DATA_POINTS) {
    return null
  }

  // Score per card type: clicks + thumbs_up - thumbs_down
  const allTypes = new Set([
    ...Object.keys(engagement),
    ...Object.keys(feedback),
  ])

  const scores: { type: string; score: number }[] = []
  for (const type of allTypes) {
    const clicks = engagement[type] ?? 0
    const fb = feedback[type] ?? { up: 0, down: 0 }
    const score = clicks + fb.up - fb.down
    scores.push({ type, score })
  }

  // Sort by score descending
  scores.sort((a, b) => b.score - a.score)

  // Top 3 preferred and bottom 3 least preferred (with negative or zero scores)
  const preferred = scores.filter((s) => s.score > 0).slice(0, 3)
  const avoided = scores
    .filter((s) => s.score < 0)
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)

  if (preferred.length === 0 && avoided.length === 0) {
    return null
  }

  const lines: string[] = ['== GEBRUIKERSVOORKEUREN ==']

  if (preferred.length > 0) {
    const types = preferred.map((s) => s.type).join(', ')
    lines.push(
      `Deze gebruiker vindt ${types} cards het meest waardevol. Gebruik deze vaker.`,
    )
  }

  if (avoided.length > 0) {
    const types = avoided.map((s) => s.type).join(', ')
    lines.push(`Gebruik minder ${types} cards.`)
  }

  return lines.join('\n')
}
