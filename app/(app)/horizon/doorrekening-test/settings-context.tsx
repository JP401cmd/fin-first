'use client'

/**
 * Gedeelde instellingen voor de /horizon/doorrekening-test sub-pages.
 *
 * Leeft op layout-niveau zodat een wijziging op /overzicht direct door-
 * werkt naar /opbouw, /afbouw en /gebeurtenissen. Profile-defaults worden
 * server-side geresolved (parseFireStrategy) en als `defaults`-prop aan de
 * Provider meegegeven.
 */

import { createContext, useContext, useState, type ReactNode, type Dispatch, type SetStateAction } from 'react'
import type { FireEndStrategy } from '@/lib/fire-strategy'

// UI-keys (niet canoniek; mapping naar lib/withdrawal-strategy gebeurt in useDoorrekeningSim)
export type WithdrawalStrategy = 'swr' | 'guardrails' | 'vpw' | 'bucket'
export type DistributionStrategy = 'proportional' | 'cash_first' | 'lowest_return' | 'highest_return'
export type OutflowDistribution = 'proportional' | 'cash_first' | 'lowest_return_first'
export type WithdrawalOrder =
  | 'cash_first'
  | 'low_return_first'
  | 'own_home_last'
  | 'pro_rata'
  | 'highest_value_first'

export interface DoorrekeningSettings {
  endStrategy: FireEndStrategy
  endAge: number
  legacyAmount: number
  withdrawalStrategy: WithdrawalStrategy
  distributionStrategy: DistributionStrategy
  outflowDistribution: OutflowDistribution
  withdrawalOrder: WithdrawalOrder
  setEndStrategy: Dispatch<SetStateAction<FireEndStrategy>>
  setEndAge: Dispatch<SetStateAction<number>>
  setLegacyAmount: Dispatch<SetStateAction<number>>
  setWithdrawalStrategy: Dispatch<SetStateAction<WithdrawalStrategy>>
  setDistributionStrategy: Dispatch<SetStateAction<DistributionStrategy>>
  setOutflowDistribution: Dispatch<SetStateAction<OutflowDistribution>>
  setWithdrawalOrder: Dispatch<SetStateAction<WithdrawalOrder>>
  /** Profile-defaults zodat hasChanges / resetToDefaults zonder extra round-trip kunnen werken. */
  defaults: DoorrekeningDefaults
}

export interface DoorrekeningDefaults {
  endStrategy: FireEndStrategy
  endAge: number
  legacyAmount: number
}

const DoorrekeningSettingsContext = createContext<DoorrekeningSettings | null>(null)

interface ProviderProps {
  children: ReactNode
  defaults: DoorrekeningDefaults
}

export function DoorrekeningSettingsProvider({ children, defaults }: ProviderProps) {
  const [endStrategy, setEndStrategy] = useState<FireEndStrategy>(defaults.endStrategy)
  const [endAge, setEndAge] = useState<number>(defaults.endAge)
  const [legacyAmount, setLegacyAmount] = useState<number>(defaults.legacyAmount)
  const [withdrawalStrategy, setWithdrawalStrategy] = useState<WithdrawalStrategy>('swr')
  const [distributionStrategy, setDistributionStrategy] = useState<DistributionStrategy>('proportional')
  const [outflowDistribution, setOutflowDistribution] = useState<OutflowDistribution>('proportional')
  const [withdrawalOrder, setWithdrawalOrder] = useState<WithdrawalOrder>('cash_first')

  return (
    <DoorrekeningSettingsContext.Provider
      value={{
        endStrategy,
        endAge,
        legacyAmount,
        withdrawalStrategy,
        distributionStrategy,
        outflowDistribution,
        withdrawalOrder,
        setEndStrategy,
        setEndAge,
        setLegacyAmount,
        setWithdrawalStrategy,
        setDistributionStrategy,
        setOutflowDistribution,
        setWithdrawalOrder,
        defaults,
      }}
    >
      {children}
    </DoorrekeningSettingsContext.Provider>
  )
}

export function useDoorrekeningSettings(): DoorrekeningSettings {
  const ctx = useContext(DoorrekeningSettingsContext)
  if (!ctx) throw new Error('useDoorrekeningSettings must be used within DoorrekeningSettingsProvider')
  return ctx
}
