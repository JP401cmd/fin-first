'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import type { ModuleId } from '@/lib/module-registry'
import { DEFAULT_MODULE_GUIDE_STEPS } from '@/lib/briefing/module-guide-steps'

// ── Disabled modules cache (shared across hook instances) ────
let _disabledModulesCache: Set<ModuleId> | null = null
let _disabledModulesFetchPromise: Promise<Set<ModuleId>> | null = null

async function fetchDisabledModules(): Promise<Set<ModuleId>> {
  if (_disabledModulesCache) return _disabledModulesCache
  if (_disabledModulesFetchPromise) return _disabledModulesFetchPromise

  _disabledModulesFetchPromise = (async () => {
    try {
      const res = await fetch('/api/module-guide/settings')
      if (!res.ok) return new Set<ModuleId>()
      const data = await res.json()
      const set = new Set<ModuleId>(data.disabledModules ?? [])
      _disabledModulesCache = set
      return set
    } catch {
      return new Set<ModuleId>()
    } finally {
      _disabledModulesFetchPromise = null
    }
  })()

  return _disabledModulesFetchPromise
}

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
  const [disabledModules, setDisabledModules] = useState<Set<ModuleId>>(new Set())
  const [hasOnboardingIntent, setHasOnboardingIntent] = useState(false)
  const fetchedRef = useRef(false)

  // ── Fetch state from API on mount (if no initial state provided) ──

  useEffect(() => {
    if (initialState || fetchedRef.current) return
    fetchedRef.current = true

    async function fetchState() {
      try {
        const [progressRes, disabled] = await Promise.all([
          fetch('/api/module-guide/progress'),
          fetchDisabledModules(),
        ])
        if (!progressRes.ok) throw new Error('Failed to fetch')
        const data = await progressRes.json()
        // Support both old shape (bare state object) and new shape ({ state, hasOnboardingIntent })
        if (data && typeof data === 'object' && 'state' in data) {
          setState(data.state ?? {})
          setHasOnboardingIntent(!!data.hasOnboardingIntent)
        } else {
          setState(data ?? {})
          setHasOnboardingIntent(false)
        }
        setDisabledModules(disabled)
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

  /**
   * Reconcile completedSteps against the current step catalog.
   * Filters out orphaned keys (from deleted steps) so they are never
   * counted or displayed. New catalog steps not in completedSteps
   * naturally appear as unchecked.
   */
  const getReconciledSteps = useCallback(
    (moduleId: ModuleId): string[] => {
      const catalogSteps = DEFAULT_MODULE_GUIDE_STEPS[moduleId]
      const progress = state[moduleId]
      if (!catalogSteps || !progress?.completedSteps) return []
      const catalogKeys = new Set(catalogSteps.map((s) => s.key))
      return progress.completedSteps.filter((key) => catalogKeys.has(key))
    },
    [state],
  )

  /** Check if a specific step is completed (only if step exists in current catalog) */
  const isStepComplete = useCallback(
    (moduleId: ModuleId, stepKey: string): boolean => {
      const catalogSteps = DEFAULT_MODULE_GUIDE_STEPS[moduleId]
      if (!catalogSteps?.some((s) => s.key === stepKey)) return false
      return state[moduleId]?.completedSteps?.includes(stepKey) ?? false
    },
    [state],
  )

  /** Check if a module guide card should be visible (not dismissed, not all steps done, and module not disabled) */
  const isCardVisible = useCallback(
    (moduleId: ModuleId): boolean => {
      // If module is disabled by admin, never show card
      if (disabledModules.has(moduleId)) return false

      const progress = state[moduleId]

      // If dismissed, not visible
      if (progress?.dismissedAt) return false

      // Note: we no longer hide cards when all steps are complete here.
      // The ModuleGuideCard component handles the completion celebration
      // and calls dismissCard() after the animation, which sets dismissedAt.

      return true
    },
    [state, disabledModules],
  )

  /** Check if all steps for a module are completed (against current catalog, ignoring orphaned keys) */
  const isAllComplete = useCallback(
    (moduleId: ModuleId): boolean => {
      const steps = DEFAULT_MODULE_GUIDE_STEPS[moduleId]
      if (!steps || steps.length === 0) return false
      const reconciled = getReconciledSteps(moduleId)
      return steps.every((s) => reconciled.includes(s.key))
    },
    [getReconciledSteps],
  )

  return {
    state,
    loading,
    error,
    hasOnboardingIntent,
    toggleStep,
    dismissCard,
    isStepComplete,
    isCardVisible,
    isAllComplete,
    getReconciledSteps,
  }
}
