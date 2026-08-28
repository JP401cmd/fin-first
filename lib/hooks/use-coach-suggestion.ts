'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import {
  getFirstUndismissedSuggestion,
  DEFAULT_COACH_TIMING,
  PATH_SUGGESTION_COOLDOWN_MS,
  type CoachSuggestion,
  type CoachDataGaps,
  type DeferredField,
  type CoachOverrides,
} from '@/lib/coach-suggestions'
import type { ModuleId } from '@/lib/module-registry'

const LEGACY_DISMISSED_KEY = 'trifinity_coach_bubble_dismissed'
const DISMISSED_SUGGESTIONS_KEY = 'trifinity_coach_dismissed_suggestions'
const LAST_DISMISSED_AT_KEY = 'trifinity_coach_last_dismissed_at'

/** Moment (epoch-ms) waarop de laatste melding gesloten werd; 0 = nooit. */
function getLastDismissedAt(): number {
  try {
    const raw = localStorage.getItem(LAST_DISMISSED_AT_KEY)
    return raw ? Number(raw) || 0 : 0
  } catch { return 0 }
}

function setLastDismissedAt(ts: number): void {
  try { localStorage.setItem(LAST_DISMISSED_AT_KEY, String(ts)) } catch { /* ignore */ }
}

function getDismissedKeys(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_SUGGESTIONS_KEY)
    if (raw) return new Set(JSON.parse(raw) as string[])
  } catch { /* corrupt — start fresh */ }
  return new Set()
}

function addDismissedKey(key: string): void {
  const dismissed = getDismissedKeys()
  dismissed.add(key)
  localStorage.setItem(DISMISSED_SUGGESTIONS_KEY, JSON.stringify([...dismissed]))
}

function migrateLegacyDismissal(): void {
  try {
    const legacy = localStorage.getItem(LEGACY_DISMISSED_KEY)
    if (legacy) { addDismissedKey('default'); localStorage.removeItem(LEGACY_DISMISSED_KEY) }
  } catch { /* ignore */ }
}

export type UseCoachSuggestionArgs = {
  dataGaps?: CoachDataGaps
  deferredFields?: DeferredField[]
  overrides?: CoachOverrides
  activeModules?: ModuleId[]
  delayMs?: number
}

export function useCoachSuggestion({
  dataGaps, deferredFields, overrides, activeModules,
  delayMs = DEFAULT_COACH_TIMING.delayMs,
}: UseCoachSuggestionArgs): { suggestion: CoachSuggestion | null; dismiss: () => void } {
  const pathname = usePathname()
  const [suggestion, setSuggestion] = useState<CoachSuggestion | null>(null)
  const dismissedThisMount = useRef(false)

  useEffect(() => {
    if (dismissedThisMount.current) return
    migrateLegacyDismissal()
    const dismissed = getDismissedKeys()
    const next = getFirstUndismissedSuggestion(
      dataGaps, pathname, dismissed, deferredFields, overrides, activeModules,
    )
    if (!next) return
    // Rustpauze na een gesloten melding: route-tips (`path_*`) staan per
    // pagina klaar, dus zonder pauze duwt elke navigatie meteen de volgende
    // omhoog. Data-gap- en uitgestelde-veld-tips blijven ongemoeid — die zijn
    // niet route-gebonden en herhalen zich dus niet bij het navigeren.
    if (
      next.key.startsWith('path_') &&
      Date.now() - getLastDismissedAt() < PATH_SUGGESTION_COOLDOWN_MS
    ) return
    const timer = setTimeout(() => setSuggestion(next), delayMs)
    return () => clearTimeout(timer)
   
  }, [pathname, dataGaps, deferredFields, overrides, activeModules, delayMs])

  const dismiss = useCallback(() => {
    dismissedThisMount.current = true
    setLastDismissedAt(Date.now())
    setSuggestion((cur) => { if (cur) addDismissedKey(cur.key); return null })
  }, [])

  return { suggestion, dismiss }
}
