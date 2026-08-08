'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { STANDARD_GUIDE_MODULE_ID } from '@/lib/briefing/standard-guide-steps'

// ── Types ──────────────────────────────────────────────────────

interface ProgressEntry {
  completedSteps: string[]
  dismissedAt: string | null
}
type ProgressState = Record<string, ProgressEntry>

interface ProgressApiResponse {
  state: ProgressState
  hasOnboardingIntent?: boolean
  primaryGoalSlug?: string | null
}

// ── Hook ───────────────────────────────────────────────────────

/**
 * Hook voor het standaard-stappenplan op /will. Deelt het bestaande
 * /api/module-guide/progress endpoint en gebruikt `STANDARD_GUIDE_MODULE_ID`
 * (= 'standard:guide') als JSONB-key — parallel aan de `goal:<slug>` convention.
 *
 * LET OP (8 aug 2026): de zusterhook `useGoalGuideState` is verwijderd samen
 * met /beheer/doelen — die tak had nul UI-consumers. Deze hook heeft die
 * óók niet; hij staat op de nominatie voor dezelfde opruiming, maar viel
 * buiten de bevestigde scope van dat besluit.
 */
export function useStandardGuideState() {
  const [state, setState] = useState<ProgressState>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const fetchedRef = useRef(false)

  // ── Fetch state from API on mount ─────────────────────────────

  useEffect(() => {
    if (fetchedRef.current) return
    fetchedRef.current = true

    async function fetchState() {
      try {
        const res = await fetch('/api/module-guide/progress')
        if (!res.ok) throw new Error('Failed to fetch')
        const data = (await res.json()) as ProgressApiResponse
        setState(data?.state ?? {})
      } catch {
        setError('Kon voortgang niet laden')
      } finally {
        setLoading(false)
      }
    }

    fetchState()
  }, [])

  // ── Send action to API ─────────────────────────────────────────

  const sendAction = useCallback(
    async (action: {
      moduleId: string
      action: 'toggleStep' | 'dismiss'
      stepKey?: string
    }): Promise<ProgressState | null> => {
      try {
        const res = await fetch('/api/module-guide/progress', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(action),
        })
        if (!res.ok) throw new Error('Save failed')
        return (await res.json()) as ProgressState
      } catch {
        return null
      }
    },
    [],
  )

  // ── toggleStep ───────────────────────────────────────────────

  const toggleStep = useCallback(
    async (stepKey: string) => {
      const moduleId = STANDARD_GUIDE_MODULE_ID
      const prev = state
      const entry = state[moduleId] ?? { completedSteps: [], dismissedAt: null }
      const isComplete = entry.completedSteps.includes(stepKey)

      const updatedSteps = isComplete
        ? entry.completedSteps.filter((s) => s !== stepKey)
        : [...entry.completedSteps, stepKey]

      const newState: ProgressState = {
        ...state,
        [moduleId]: { ...entry, completedSteps: updatedSteps },
      }

      // Optimistic update
      setState(newState)
      setError(null)

      const result = await sendAction({ moduleId, action: 'toggleStep', stepKey })
      if (!result) {
        setState(prev) // Rollback
        setError('Opslaan mislukt')
      } else {
        setState(result)
      }
    },
    [state, sendAction],
  )

  // ── dismissCard ──────────────────────────────────────────────

  const dismissCard = useCallback(async () => {
    const moduleId = STANDARD_GUIDE_MODULE_ID
    const prev = state
    const entry = state[moduleId] ?? { completedSteps: [], dismissedAt: null }

    const newState: ProgressState = {
      ...state,
      [moduleId]: { ...entry, dismissedAt: new Date().toISOString() },
    }

    setState(newState)
    setError(null)

    const result = await sendAction({ moduleId, action: 'dismiss' })
    if (!result) {
      setState(prev)
      setError('Opslaan mislukt')
    } else {
      setState(result)
    }
  }, [state, sendAction])

  // ── Helpers ──────────────────────────────────────────────────

  /** Handmatig-afgevinkte step-keys voor de standaard-card. */
  const manuallyCompletedKeys = state[STANDARD_GUIDE_MODULE_ID]?.completedSteps ?? []

  /** Of de card is weggeklikt. Hij rendert nooit een dismiss-knop in de strook,
   *  maar deze helper is wel beschikbaar voor de celebration-flow. */
  const isCardDismissed = useCallback((): boolean => {
    return state[STANDARD_GUIDE_MODULE_ID]?.dismissedAt != null
  }, [state])

  return {
    state,
    manuallyCompletedKeys,
    loading,
    error,
    toggleStep,
    dismissCard,
    isCardDismissed,
  }
}
