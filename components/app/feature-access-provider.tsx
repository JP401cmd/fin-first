'use client'

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { FeatureAccessData, FeatureAccessMap } from '@/lib/compute-feature-access'
import { UNIFIED_FEATURES, isPhaseSufficient, type PhaseId } from '@/lib/feature-registry'
import { PhaseTransitionModal } from '@/components/app/phase-transition-modal'
import { ALL_MODULES, isModuleActive, type ModuleId } from '@/lib/module-registry'

type FeatureAccessContextValue = FeatureAccessData & {
  /** Feature IDs newly unlocked by a phase transition (for spotlight animations) */
  newlyUnlockedFeatures: string[]
  /** Refresh feature prefs after user toggle */
  refreshFeaturePrefs: (prefs: Record<string, boolean>) => void
  /** Active module IDs for the current user */
  activeModules: ModuleId[]
  /** Update active modules client-side without page reload */
  refreshModules: (modules: ModuleId[]) => void
}

const FeatureAccessContext = createContext<FeatureAccessContextValue | null>(null)

export function useFeatureAccess(): FeatureAccessContextValue {
  const ctx = useContext(FeatureAccessContext)
  if (!ctx) return {
    features: {},
    phase: 'recovery',
    level: 0,
    tier: 'gratis',
    subscriptions: [],
    netWorth: 0,
    monthlyExpenses: 0,
    freedomPct: 0,
    newlyUnlockedFeatures: [],
    refreshFeaturePrefs: () => {},
    activeModules: [...ALL_MODULES],
    refreshModules: () => {},
  }
  return ctx
}

export function FeatureAccessProvider({
  data,
  phaseTransition,
  activeModules = [...ALL_MODULES],
  children,
}: {
  data: FeatureAccessData
  phaseTransition?: { oldPhase: string; newPhase: string } | null
  /** Active modules for the current user. Defaults to all modules (backward compat). */
  activeModules?: ModuleId[]
  children: ReactNode
}) {
  const [showTransitionModal, setShowTransitionModal] = useState(!!phaseTransition)
  const [featureOverrides, setFeatureOverrides] = useState<FeatureAccessMap>(data.features)

  // Compute newly unlocked features when there's a phase transition.
  // Memoized so consumers downstream don't see a fresh array on every parent render.
  const newlyUnlockedFeatures = useMemo<string[]>(
    () =>
      phaseTransition
        ? UNIFIED_FEATURES
            .filter(f => {
              const wasDefault = isPhaseSufficient(phaseTransition.oldPhase as PhaseId, f.defaultPhase)
              const isDefault = isPhaseSufficient(phaseTransition.newPhase as PhaseId, f.defaultPhase)
              return isDefault && !wasDefault
            })
            .map(f => f.id)
        : [],
    [phaseTransition],
  )

  // Allow optimistic refresh after user toggles
  const refreshFeaturePrefs = useCallback((prefs: Record<string, boolean>) => {
    setFeatureOverrides(prev => {
      const next = { ...prev }
      for (const [id, enabled] of Object.entries(prefs)) {
        if (next[id]) {
          next[id] = { ...next[id], accessible: enabled, reason: enabled ? 'accessible' : 'user_disabled' }
        }
      }
      return next
    })
  }, [])

  const [moduleOverrides, setModuleOverrides] = useState<ModuleId[]>(activeModules)

  /** Update active modules client-side without page reload */
  const refreshModules = useCallback((modules: ModuleId[]) => {
    setModuleOverrides(modules)
  }, [])

  // Stable context value — re-renders consumers only when something they
  // actually depend on changes (not on every parent re-render).
  const contextValue = useMemo<FeatureAccessContextValue>(
    () => ({
      ...data,
      features: featureOverrides,
      newlyUnlockedFeatures,
      refreshFeaturePrefs,
      activeModules: moduleOverrides,
      refreshModules,
    }),
    [data, featureOverrides, newlyUnlockedFeatures, refreshFeaturePrefs, moduleOverrides, refreshModules],
  )

  return (
    <FeatureAccessContext.Provider value={contextValue}>
      {children}
      {showTransitionModal && phaseTransition && (
        <PhaseTransitionModal
          oldPhase={phaseTransition.oldPhase}
          newPhase={phaseTransition.newPhase}
          onClose={() => setShowTransitionModal(false)}
        />
      )}
    </FeatureAccessContext.Provider>
  )
}

/**
 * Focused hook for module access. Returns only module-related data,
 * abstracting away legacy sovereignty fields.
 */
export function useModuleAccess() {
  const ctx = useFeatureAccess()
  return {
    activeModules: ctx.activeModules,
    subscriptions: ctx.subscriptions,
    isModuleActive: (id: ModuleId) => isModuleActive(ctx.activeModules, id),
    refreshModules: ctx.refreshModules,
  }
}
