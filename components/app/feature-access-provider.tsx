'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'
import type { FeatureAccessData, FeatureAccessMap } from '@/lib/compute-feature-access'
import { UNIFIED_FEATURES, isPhaseSufficient, type PhaseId } from '@/lib/feature-registry'
import { PhaseTransitionModal } from '@/components/app/phase-transition-modal'

type FeatureAccessContextValue = FeatureAccessData & {
  needsActivation: boolean
  /** Feature IDs newly unlocked by a phase transition (for spotlight animations) */
  newlyUnlockedFeatures: string[]
  /** Refresh feature prefs after user toggle */
  refreshFeaturePrefs: (prefs: Record<string, boolean>) => void
  /** Optimistically clear needsActivation after successful activation */
  clearActivation: () => void
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
    needsActivation: false,
    newlyUnlockedFeatures: [],
    refreshFeaturePrefs: () => {},
    clearActivation: () => {},
  }
  return ctx
}

export function FeatureAccessProvider({
  data,
  phaseTransition,
  needsActivation,
  children,
}: {
  data: FeatureAccessData
  phaseTransition?: { oldPhase: string; newPhase: string } | null
  needsActivation?: boolean
  children: ReactNode
}) {
  const [showTransitionModal, setShowTransitionModal] = useState(!!phaseTransition)
  const [featureOverrides, setFeatureOverrides] = useState<FeatureAccessMap>(data.features)
  const [activationCleared, setActivationCleared] = useState(false)

  // Compute newly unlocked features when there's a phase transition
  const newlyUnlockedFeatures = phaseTransition
    ? UNIFIED_FEATURES
        .filter(f => {
          const wasDefault = isPhaseSufficient(phaseTransition.oldPhase as PhaseId, f.defaultPhase)
          const isDefault = isPhaseSufficient(phaseTransition.newPhase as PhaseId, f.defaultPhase)
          return isDefault && !wasDefault
        })
        .map(f => f.id)
    : []

  // Allow optimistic refresh after user toggles
  function refreshFeaturePrefs(prefs: Record<string, boolean>) {
    setFeatureOverrides(prev => {
      const next = { ...prev }
      for (const [id, enabled] of Object.entries(prefs)) {
        if (next[id]) {
          next[id] = { ...next[id], accessible: enabled, reason: enabled ? 'accessible' : 'user_disabled' }
        }
      }
      return next
    })
  }

  function clearActivation() {
    setActivationCleared(true)
  }

  const contextValue: FeatureAccessContextValue = {
    ...data,
    features: featureOverrides,
    needsActivation: activationCleared ? false : !!needsActivation,
    newlyUnlockedFeatures,
    refreshFeaturePrefs,
    clearActivation,
  }

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
