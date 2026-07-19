'use client'

import { useEffect } from 'react'

/**
 * useAutoSnapshot — Client-side auto-snapshot trigger
 *
 * On component mount, calls GET /api/snapshots/auto once per UTC day to ensure
 * the current-day snapshot exists. The endpoint has a SERVER-side day-gate
 * (besluit: 1×/dag is akkoord): as soon as a snapshot for (user, today) exists,
 * it returns a cheap no-op without recompute/upsert. That gate is the real
 * throttle; this hook only avoids redundant client roundtrips.
 *
 * The endpoint captures: net_worth, total_assets, total_debts,
 * freedom_percentage, fire_age, sovereignty_level, savings_rate, resilience_score.
 *
 * Designed to be called from the authenticated app layout so every user
 * gets a fresh monthly snapshot without needing an external cron.
 *
 * DEDUPE (perf fase 1): een module-level dag-guard i.p.v. de vorige per-mount
 * `useRef` — zo vuurt de trigger óók bij twéé gelijktijdige mounts (of een
 * StrictMode-dubbelmount) maar één keer per UTC-dag. Een nieuwe dag of een harde
 * reload (nieuw JS-context) laat 'm weer één keer lopen; de server-gate maakt een
 * eventuele herhaling toch een goedkope no-op.
 */
let lastAutoSnapshotDay: string | null = null

export function useAutoSnapshot() {
  useEffect(() => {
    const day = new Date().toISOString().split('T')[0]
    // Al gedaan vandaag (welke mount dan ook) → geen tweede roundtrip.
    if (lastAutoSnapshotDay === day) return
    lastAutoSnapshotDay = day

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
        // Silent fail — auto-snapshot is non-critical. Guard vrijgeven zodat een
        // volgende mount opnieuw mag proberen (transiente netwerk-fout).
        lastAutoSnapshotDay = null
      })
  }, [])
}
