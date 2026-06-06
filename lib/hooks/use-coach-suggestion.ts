'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import {
  getFirstUndismissedSuggestion,
  DEFAULT_COACH_TIMING,
  type CoachSuggestion,
  type CoachDataGaps,
  type DeferredField,
  type CoachOverrides,
} from '@/lib/coach-suggestions'
import type { ModuleId } from '@/lib/module-registry'

const LEGACY_DISMISSED_KEY = 'trifinity_coach_bubble_dismissed'
const DISMISSED_SUGGESTIONS_KEY = 'trifinity_coach_dismissed_suggestions'

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
    const timer = setTimeout(() => setSuggestion(next), delayMs)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, dataGaps, deferredFields, overrides, activeModules, delayMs])

  const dismiss = useCallback(() => {
    dismissedThisMount.current = true
    setSuggestion((cur) => { if (cur) addDismissedKey(cur.key); return null })
  }, [])

  return { suggestion, dismiss }
}
