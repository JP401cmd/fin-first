// ── Progression Detection for AI Briefing ──────────────────
// Detects sovereignty level changes, freedom milestones, and
// financial achievements by comparing current state to the
// previous briefing snapshot stored in localStorage.

import { levelToPhaseId } from '@/lib/feature-phases'

export const LONG_TERM_KEY = 'briefing_progression'

// ── Types ──────────────────────────────────────────────────

export interface ProgressionSnapshot {
  sovereigntyLevel: number
  freedomPct: number
  hasConsumerDebt: boolean
  netWorth: number
  monthsCovered: number
  timestamp: string
}

export type ProgressionEventType =
  | 'level_up'
  | 'level_down'
  | 'phase_transition'
  | 'milestone_reached'
  | 'debt_free'
  | 'emergency_fund_reached'
  | 'net_worth_ath'

export interface ProgressionEvent {
  type: ProgressionEventType
  label: string
  previousValue: number | string | boolean
  currentValue: number | string | boolean
}

// ── Storage helpers ────────────────────────────────────────

export function loadPreviousSnapshot(): ProgressionSnapshot | null {
  try {
    const raw = localStorage.getItem(LONG_TERM_KEY)
    if (!raw) return null
    return JSON.parse(raw) as ProgressionSnapshot
  } catch {
    return null
  }
}

export function saveSnapshot(snapshot: ProgressionSnapshot): void {
  try {
    localStorage.setItem(LONG_TERM_KEY, JSON.stringify(snapshot))
  } catch { /* quota / SSR */ }
}

export function buildSnapshot(
  sovereigntyLevel: number,
  freedomPct: number,
  hasConsumerDebt: boolean,
  netWorth: number,
  monthsCovered: number,
): ProgressionSnapshot {
  return {
    sovereigntyLevel,
    freedomPct,
    hasConsumerDebt,
    netWorth,
    monthsCovered,
    timestamp: new Date().toISOString(),
  }
}

// ── Detection logic ────────────────────────────────────────

const FREEDOM_MILESTONES = [25, 50, 75, 100] as const
const EMERGENCY_MILESTONES = [3, 6] as const

/**
 * Compare previous snapshot with current values and return
 * all detected progression events.
 *
 * Returns an empty array when `previous` is null (first visit).
 */
export function detectProgressionEvents(
  previous: ProgressionSnapshot | null,
  current: ProgressionSnapshot,
): ProgressionEvent[] {
  // First visit — no previous data — no events
  if (!previous) return []

  const events: ProgressionEvent[] = []

  // ── Level changes ────────────────────────────────────────
  if (current.sovereigntyLevel > previous.sovereigntyLevel) {
    events.push({
      type: 'level_up',
      label: `Sovereignty level gestegen van ${previous.sovereigntyLevel} naar ${current.sovereigntyLevel}`,
      previousValue: previous.sovereigntyLevel,
      currentValue: current.sovereigntyLevel,
    })
  } else if (current.sovereigntyLevel < previous.sovereigntyLevel) {
    events.push({
      type: 'level_down',
      label: `Sovereignty level gedaald van ${previous.sovereigntyLevel} naar ${current.sovereigntyLevel}`,
      previousValue: previous.sovereigntyLevel,
      currentValue: current.sovereigntyLevel,
    })
  }

  // ── Phase transition ──────────────────────────────────────
  const previousPhase = levelToPhaseId(previous.sovereigntyLevel)
  const currentPhase = levelToPhaseId(current.sovereigntyLevel)
  if (previousPhase !== currentPhase) {
    events.push({
      type: 'phase_transition',
      label: `Fase-transitie van ${previousPhase} naar ${currentPhase}`,
      previousValue: previousPhase,
      currentValue: currentPhase,
    })
  }

  // ── Freedom milestones (25%, 50%, 75%, 100%) ─────────────
  for (const milestone of FREEDOM_MILESTONES) {
    if (previous.freedomPct < milestone && current.freedomPct >= milestone) {
      events.push({
        type: 'milestone_reached',
        label: `${milestone}% vrijheid bereikt`,
        previousValue: Math.round(previous.freedomPct),
        currentValue: Math.round(current.freedomPct),
      })
    }
  }

  // ── Debt free ────────────────────────────────────────────
  if (previous.hasConsumerDebt && !current.hasConsumerDebt) {
    events.push({
      type: 'debt_free',
      label: 'Schuldenvrij geworden',
      previousValue: true,
      currentValue: false,
    })
  }

  // ── Emergency fund milestones (3 months, 6 months) ──────
  for (const months of EMERGENCY_MILESTONES) {
    if (previous.monthsCovered < months && current.monthsCovered >= months) {
      events.push({
        type: 'emergency_fund_reached',
        label: `Noodfonds: ${months} maanden buffer bereikt`,
        previousValue: Math.round(previous.monthsCovered * 10) / 10,
        currentValue: Math.round(current.monthsCovered * 10) / 10,
      })
    }
  }

  // ── Net worth all-time high ──────────────────────────────
  if (current.netWorth > previous.netWorth && current.netWorth > 0) {
    events.push({
      type: 'net_worth_ath',
      label: 'Nieuw vermogensrecord (all-time high)',
      previousValue: previous.netWorth,
      currentValue: current.netWorth,
    })
  }

  return events
}
