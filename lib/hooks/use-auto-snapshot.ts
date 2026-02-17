'use client'

import { useEffect, useRef } from 'react'

/**
 * useAutoSnapshot — Client-side auto-snapshot trigger
 *
 * On component mount, calls GET /api/snapshots/auto to create a monthly
 * snapshot if one doesn't exist yet. This is idempotent and fire-and-forget.
 *
 * The endpoint:
 * - Checks if a snapshot already exists for the current month
 * - If not, creates one capturing: net_worth, total_assets, total_debts,
 *   freedom_percentage, fire_age, sovereignty_level, savings_rate, resilience_score
 * - Returns { created: false } if already captured this month
 *
 * Designed to be called from the authenticated app layout so every user
 * gets automatic monthly snapshots without needing an external cron.
 *
 * Combined with the Supabase Edge Function cron (for users who don't log in),
 * this ensures comprehensive monthly snapshot coverage.
 */
export function useAutoSnapshot() {
  const triggered = useRef(false)

  useEffect(() => {
    // Only trigger once per mount (React StrictMode may double-mount)
    if (triggered.current) return
    triggered.current = true

    // Fire-and-forget: don't block rendering
    fetch('/api/snapshots/auto', { credentials: 'include' })
      .then(res => {
        if (res.ok) {
          return res.json()
        }
        // Silently ignore auth errors (user might not be fully authenticated yet)
        return null
      })
      .then(data => {
        if (data?.created) {
          console.log('[AutoSnapshot] Monthly snapshot created:', data.snapshot?.snapshot_date)
        }
        // If data?.created === false, snapshot already existed — all good
      })
      .catch(() => {
        // Silent fail — auto-snapshot is non-critical
      })
  }, [])
}
