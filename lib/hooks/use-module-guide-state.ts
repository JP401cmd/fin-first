'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import type { ModuleId } from '@/lib/module-registry'
import { DEFAULT_MODULE_GUIDE_STEPS } from '@/lib/briefing/module-guide-steps'

// ── Types ──────────────────────────────────────────────────────

export interface ModuleGuideProgress {
  completedSteps: string[]
  dismissedAt: string | null
}

export type ModuleGuideState = Record<string, ModuleGuideProgress>

// ── Hook ───────────────────────────────────────────────────────

/**
 * Hook that reads and mutates module_guide_state from the user's profile.
 * Provides toggleStep, dismissCard with optimistic updates + rollback on error.
 * Writes via PUT /api/module-guide/progress.
 */
export function useModuleGuideState(initialState?: ModuleGuideState) {
  const [state, setState] = useState<ModuleGuideState>(initialState ?? {})
  const [loading, setLoading] = useState(!initialState)
  const [error, setError] = useState<string | null>(null)
  const fetchedRef = useRef(false)

  // ── Fetch state from API on mount (if no initial state provided) ──

  useEffect(() => {
    if (initialState || fetchedRef.current) return
    fetchedRef.current = true

    async function fetchState() {
      try {
        const res = await fetch('/api/module-guide/progress')
        if (!res.ok) throw new Error('Failed to fetch')
        const data = await res.json()
        setState(data ?? {})
      } catch {
        setError('Kon voortgang niet laden')
      } finally {
        setLoading(false)
      }
    }

    fetchState()
  }, [initialState])

  // ── Send action to API ─────────────────────────────────────────

  const sendAction = useCallback(async (
    action: { moduleId: string; action: 'toggleStep' | 'dismiss'; stepKey?: string },
  ): Promise<ModuleGuideState | null> => {
    try {
      const res = await fetch('/api/module-guide/progress', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action),
      })
      if (!res.ok) throw new Error('Save failed')
      return await res.json()
    } catch {
      return null
    }
  }, [])

  // ── toggleStep ───────────────────────────────────────────────

  const toggleStep = useCallback(
    async (moduleId: ModuleId, stepKey: string) => {
      const prev = state
      const moduleProgress = state[moduleId] ?? { completedSteps: [], dismissedAt: null }
      const isComplete = moduleProgress.completedSteps.includes(stepKey)

      const updatedSteps = isComplete
        ? moduleProgress.completedSteps.filter((s) => s !== stepKey)
        : [...moduleProgress.completedSteps, stepKey]

      const newState: ModuleGuideState = {
        ...state,
        [moduleId]: { ...moduleProgress, completedSteps: updatedSteps },
      }

      // Optimistic update
      setState(newState)
      setError(null)

      const result = await sendAction({ moduleId, action: 'toggleStep', stepKey })
      if (!result) {
        setState(prev) // Rollback
        setError('Opslaan mislukt')
      } else {
        setState(result) // Sync with server state
      }
    },
    [state, sendAction],
  )

  // ── dismissCard ──────────────────────────────────────────────

  const dismissCard = useCallback(
    async (moduleId: ModuleId) => {
      const prev = state
      const moduleProgress = state[moduleId] ?? { completedSteps: [], dismissedAt: null }

      const newState: ModuleGuideState = {
        ...state,
        [moduleId]: { ...moduleProgress, dismissedAt: new Date().toISOString() },
      }

      // Optimistic update
      setState(newState)
      setError(null)

      const result = await sendAction({ moduleId, action: 'dismiss' })
      if (!result) {
        setState(prev) // Rollback
        setError('Opslaan mislukt')
      } else {
        setState(result) // Sync with server state
      }
    },
    [state, sendAction],
  )

  // ── Helpers ──────────────────────────────────────────────────

  /** Check if a specific step is completed */
  const isStepComplete = useCallback(
    (moduleId: ModuleId, stepKey: string): boolean => {
      return state[moduleId]?.completedSteps?.includes(stepKey) ?? false
    },
    [state],
  )

  /** Check if a module guide card should be visible (not dismissed and not all steps done) */
  const isCardVisible = useCallback(
    (moduleId: ModuleId): boolean => {
      const progress = state[moduleId]

      // If dismissed, not visible
      if (progress?.dismissedAt) return false

      // If all steps are completed, not visible
      const steps = DEFAULT_MODULE_GUIDE_STEPS[moduleId]
      if (steps && progress?.completedSteps) {
        const allDone = steps.every((s) => progress.completedSteps.includes(s.key))
        if (allDone) return false
      }

      return true
    },
    [state],
  )

  return {
    state,
    loading,
    error,
    toggleStep,
    dismissCard,
    isStepComplete,
    isCardVisible,
  }
}
