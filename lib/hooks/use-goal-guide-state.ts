'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import type { GoalSlug } from '@/lib/goals/types'
import { isGoalSlug } from '@/lib/goals/catalog'
import {
  DEFAULT_GOAL_GUIDE_STEPS,
  goalProgressKey,
} from '@/lib/briefing/goal-guide-steps'

// ── Types ──────────────────────────────────────────────────────

interface ProgressEntry {
  completedSteps: string[]
  dismissedAt: string | null
}
type ProgressState = Record<string, ProgressEntry>

interface ProgressApiResponse {
  state: ProgressState
  hasOnboardingIntent: boolean
  primaryGoalSlug: string | null
  /** Multi-select doel-slugs uit onboarding fase 3 (mei 2026). Mag leeg zijn. */
  selectedGoalSlugs?: string[]
}

// ── Hook ───────────────────────────────────────────────────────

/**
 * Hook for the goal-guide-card on /will. Reuses the module-guide progress
 * API by encoding the goal-slug as `goal:<slug>` in the moduleId field —
 * goal-progress and module-progress live side-by-side in the same JSONB
 * column without colliding (different prefixes).
 *
 * Returns the user's primary goal slug if set; the consumer (e.g.
 * BriefingCardGrid) decides whether to render a goal-guide card.
 */
export function useGoalGuideState() {
  const [state, setState] = useState<ProgressState>({})
  // selectedGoalSlugs is de canonical bron sinds fase 3 (mei 2026): de
  // gebruiker mag meerdere doelen kiezen in onboarding-stap "doel" en de
  // strook op /will rendert per-slug een GoalStappenplanCard. primaryGoalSlug
  // blijft afgeleid als `selectedGoalSlugs[0] ?? null` voor backward-compat
  // met consumers als briefing-card-grid die nog op één slug leunen.
  const [selectedGoalSlugs, setSelectedGoalSlugs] = useState<GoalSlug[]>([])
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
        // Prefer de array uit fase-3 responses. Fallback: ouder server-deploy
        // dat alleen primaryGoalSlug stuurt — construeer single-item array
        // zodat één goal-kaart blijft renderen.
        const rawArray = Array.isArray(data?.selectedGoalSlugs) ? data.selectedGoalSlugs : null
        const filteredArray = rawArray
          ? rawArray.filter((s): s is GoalSlug => isGoalSlug(s))
          : null
        if (filteredArray && filteredArray.length > 0) {
          setSelectedGoalSlugs(filteredArray)
        } else {
          const primary = data?.primaryGoalSlug
          setSelectedGoalSlugs(isGoalSlug(primary) ? [primary] : [])
        }
      } catch {
        setError('Kon doelvoortgang niet laden')
      } finally {
        setLoading(false)
      }
    }

    fetchState()
  }, [])

  // Afgeleide primaryGoalSlug — eerste in de array of null. Bewust geen
  // aparte state-veld om out-of-sync te voorkomen.
  const primaryGoalSlug: GoalSlug | null = selectedGoalSlugs[0] ?? null

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
    async (slug: GoalSlug, stepKey: string) => {
      const moduleId = goalProgressKey(slug)
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

  const dismissCard = useCallback(
    async (slug: GoalSlug) => {
      const moduleId = goalProgressKey(slug)
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
    },
    [state, sendAction],
  )

  // ── Helpers ──────────────────────────────────────────────────

  /** Check of een specifieke stap voltooid is (alleen als ze in de huidige catalog staat) */
  const isStepComplete = useCallback(
    (slug: GoalSlug, stepKey: string): boolean => {
      const catalogSteps = DEFAULT_GOAL_GUIDE_STEPS[slug]
      if (!catalogSteps?.some((s) => s.key === stepKey)) return false
      const moduleId = goalProgressKey(slug)
      return state[moduleId]?.completedSteps?.includes(stepKey) ?? false
    },
    [state],
  )

  /** Of de goal-guide-card zichtbaar moet zijn (niet weggeklikt) */
  const isCardVisible = useCallback(
    (slug: GoalSlug): boolean => {
      const moduleId = goalProgressKey(slug)
      const entry = state[moduleId]
      if (entry?.dismissedAt) return false
      return true
    },
    [state],
  )

  /** Of alle stappen voor een doel voltooid zijn */
  const isAllComplete = useCallback(
    (slug: GoalSlug): boolean => {
      const steps = DEFAULT_GOAL_GUIDE_STEPS[slug]
      if (!steps || steps.length === 0) return false
      const moduleId = goalProgressKey(slug)
      const entry = state[moduleId]
      if (!entry) return false
      return steps.every((s) => entry.completedSteps.includes(s.key))
    },
    [state],
  )

  return {
    state,
    primaryGoalSlug,
    selectedGoalSlugs,
    loading,
    error,
    toggleStep,
    dismissCard,
    isStepComplete,
    isCardVisible,
    isAllComplete,
  }
}
