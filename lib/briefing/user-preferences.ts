// ── User Preference Block for Will's Briefing Prompting ────
// Combines engagement (clicks) and feedback (thumbs up/down) to build
// a preference block that steers Will's card selection.

import { getEngagementSummary, getModuleEngagementSummary } from './engagement'

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
 * Compute module preference percentages from engagement data.
 * Returns a map like { kern: 45, horizon: 30, wil: 20, cross: 5 }
 */
function getModulePreferences(): Record<string, number> | null {
  const moduleCounts = getModuleEngagementSummary()
  const total = Object.values(moduleCounts).reduce((a, b) => a + b, 0)
  if (total === 0) return null

  const percentages: Record<string, number> = {}
  for (const [mod, count] of Object.entries(moduleCounts)) {
    percentages[mod] = Math.round((count / total) * 100)
  }
  return percentages
}

/**
 * Build a user preference prompt block for Will's system prompt.
 * Combines engagement (clicks) and feedback (thumbs up/down) to score card types,
 * plus module preference percentages from engagement data.
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

  const lines: string[] = ['== GEBRUIKERSVOORKEUREN ==']
  let hasContent = false

  if (preferred.length > 0) {
    const types = preferred.map((s) => s.type).join(', ')
    lines.push(
      `Deze gebruiker vindt ${types} cards het meest waardevol. Gebruik deze vaker.`,
    )
    hasContent = true
  }

  if (avoided.length > 0) {
    const types = avoided.map((s) => s.type).join(', ')
    lines.push(`Gebruik minder ${types} cards.`)
    hasContent = true
  }

  // Module preferences from engagement data
  const modulePrefs = getModulePreferences()
  if (modulePrefs) {
    const moduleEntries = Object.entries(modulePrefs)
      .filter(([mod]) => mod !== 'cross') // exclude cross — it's generic
      .sort((a, b) => b[1] - a[1])

    if (moduleEntries.length > 0) {
      const parts = moduleEntries.map(([mod, pct]) => `${mod} ${pct}%`)
      lines.push(`Module-voorkeur: ${parts.join(', ')}. Stem je card-mix hierop af.`)
      hasContent = true
    }
  }

  if (!hasContent) {
    return null
  }

  return lines.join('\n')
}
