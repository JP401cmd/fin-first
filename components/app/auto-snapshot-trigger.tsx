'use client'

import { useAutoSnapshot } from '@/lib/hooks/use-auto-snapshot'

/**
 * AutoSnapshotTrigger — Client component that triggers monthly auto-snapshot
 *
 * Renders nothing visible. When mounted in the authenticated app layout,
 * it fires a single GET /api/snapshots/auto request to ensure the current
 * month's snapshot exists. Idempotent and non-blocking.
 *
 * This implements "no user action needed" from feature #211:
 * automatic monthly snapshots that capture net_worth, total_assets,
 * total_debts, freedom_percentage, fire_age, sovereignty_level,
 * savings_rate, and resilience_score.
 */
export function AutoSnapshotTrigger() {
  useAutoSnapshot()
  return null
}
