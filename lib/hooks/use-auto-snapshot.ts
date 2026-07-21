'use client'

import { useEffect } from 'react'
import {
  AUTO_SNAPSHOT_DAY_KEY,
  shouldSkipAutoSnapshot,
  utcDayStamp,
} from '@/lib/snapshot-daystamp'

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
 * StrictMode-dubbelmount) maar één keer per UTC-dag.
 *
 * THROTTLE (perf): een localStorage-dagstempel als extra fast-path. De module-
 * guard is per JS-context; een HARDE reload start een nieuw context waarin die
 * guard leeg is → de (goedkope, server-gegate) roundtrip vuurde dan opnieuw. De
 * localStorage-stempel overleeft de reload en slaat die no-op-call over. Hij wordt
 * pas ná een GESLAAGDE roundtrip gezet, zodat een mislukte poging vandaag opnieuw
 * mag proberen — de dagelijkse garantie blijft dus intact. De server-side dag-gate
 * blijft de échte garantie tegen dubbel wegschrijven.
 */
let lastAutoSnapshotDay: string | null = null

export function useAutoSnapshot() {
  useEffect(() => {
    const day = utcDayStamp()

    let storedDay: string | null = null
    try {
      if (typeof window !== 'undefined') {
        storedDay = window.localStorage.getItem(AUTO_SNAPSHOT_DAY_KEY)
      }
    } catch {
      // localStorage niet beschikbaar (private mode e.d.) → val terug op de roundtrip.
    }

    // Al gedaan vandaag (deze JS-context óf een eerdere geslaagde roundtrip) →
    // geen tweede roundtrip. Wel de module-guard bijzetten voor volgende mounts.
    if (shouldSkipAutoSnapshot(lastAutoSnapshotDay, storedDay, day)) {
      lastAutoSnapshotDay = day
      return
    }
    lastAutoSnapshotDay = day

    // Fire-and-forget: don't block rendering
    fetch('/api/snapshots/auto', { credentials: 'include' })
      .then(res => {
        if (res.ok) {
          // Geslaagde roundtrip → dagstempel zetten zodat een harde reload vandaag
          // de no-op-call overslaat. (res.ok geldt ook voor de server-no-op.)
          try {
            window.localStorage.setItem(AUTO_SNAPSHOT_DAY_KEY, day)
          } catch {
            // localStorage niet beschikbaar — geen fast-path, verder niets aan de hand.
          }
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
