'use client'

import { useEffect, useRef } from 'react'

/**
 * useAutoSnapshot — Client-side auto-snapshot trigger
 *
 * On component mount, calls GET /api/snapshots/auto to recompute and upsert
 * the current-month snapshot. The endpoint always recomputes and upserts on
 * (user_id, snapshot_date), so calling it repeatedly is safe and keeps the
 * row in sync with the latest portfolio + horizon params (incl. fire_age).
 *
 * The endpoint captures: net_worth, total_assets, total_debts,
 * freedom_percentage, fire_age, sovereignty_level, savings_rate, resilience_score.
 *
 * Designed to be called from the authenticated app layout so every user
 * gets a fresh monthly snapshot without needing an external cron.
 *
 * Combined with the Supabase Edge Function cron (for users who don't log in),
 * this ensures comprehensive monthly snapshot coverage.
 */
export function useAutoSnapshot() {
  const triggered = useRef(false)

  useEffect(() => {
    // Only trigger once per mount (React StrictMode may double-mount).
    // This also throttles the always-upsert route to once per page load.
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
        if (data?.updated) {
          console.log('[AutoSnapshot] Monthly snapshot upserted:', data.snapshot?.snapshot_date)
        }
      })
      .catch(() => {
        // Silent fail — auto-snapshot is non-critical
      })
  }, [])
}
