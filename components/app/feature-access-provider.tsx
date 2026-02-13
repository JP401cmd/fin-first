'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'
import type { FeatureAccessData } from '@/lib/compute-feature-access'
import { PhaseTransitionModal } from '@/components/app/phase-transition-modal'
import { ActivationButton } from '@/components/app/activation-button'

type FeatureAccessContextValue = FeatureAccessData & { needsActivation: boolean }

const FeatureAccessContext = createContext<FeatureAccessContextValue | null>(null)

export function useFeatureAccess(): FeatureAccessContextValue {
  const ctx = useContext(FeatureAccessContext)
  if (!ctx) return { features: {}, phase: 'recovery', level: 0, netWorth: 0, monthlyExpenses: 0, freedomPct: 0, needsActivation: false }
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

  const contextValue: FeatureAccessContextValue = {
    ...data,
    needsActivation: !!needsActivation,
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
      {needsActivation && !showTransitionModal && (
        <ActivationButton data={data} />
      )}
    </FeatureAccessContext.Provider>
  )
}
