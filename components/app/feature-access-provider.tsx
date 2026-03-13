'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'
import type { FeatureAccessData } from '@/lib/compute-feature-access'
import { FEATURES, DEFAULT_MATRIX } from '@/lib/feature-phases'
import { PhaseTransitionModal } from '@/components/app/phase-transition-modal'

type FeatureAccessContextValue = FeatureAccessData & {
  needsActivation: boolean
  /** Feature IDs newly unlocked by a phase transition (for spotlight animations) */
  newlyUnlockedFeatures: string[]
}

const FeatureAccessContext = createContext<FeatureAccessContextValue | null>(null)

export function useFeatureAccess(): FeatureAccessContextValue {
  const ctx = useContext(FeatureAccessContext)
  if (!ctx) return { features: {}, phase: 'recovery', level: 0, netWorth: 0, monthlyExpenses: 0, freedomPct: 0, needsActivation: false, newlyUnlockedFeatures: [] }
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

  // Compute newly unlocked features when there's a phase transition
  const newlyUnlockedFeatures = phaseTransition
    ? FEATURES
        .filter(f => DEFAULT_MATRIX[f.id]?.[phaseTransition.newPhase] && !DEFAULT_MATRIX[f.id]?.[phaseTransition.oldPhase])
        .map(f => f.id)
    : []

  const contextValue: FeatureAccessContextValue = {
    ...data,
    needsActivation: !!needsActivation,
    newlyUnlockedFeatures,
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
