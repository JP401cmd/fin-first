'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import type { LeverageStatus } from '@/lib/leverage-status'

/**
 * PlanStatusProvider — deelt het plan-stoplicht (`loadPlanStatus`) met het
 * menupunt "De toekomst" in de zijbalk en de mobiele nav-sheet.
 *
 * Spiegel van `CashflowStatusProvider`: de provider bezit de waarde, een
 * `null`-renderende `<PlanStatusSeed>` levert de server-berekende status aan, de
 * consumers zijn puur. Geen client-fetch: de seed komt uit de app-layout, achter
 * een eigen `<Suspense>`, zodat de canonieke run de eerste paint en de navigatie
 * niet ophoudt (eigenaarskeuze 15 sep 2026: nagestreamd).
 *
 * Tot de seed er is, is de status `neutral` en tonen de menu's géén punt — liever
 * even niets dan een grijze flits die daarna rood wordt. Een perspectiefwissel
 * doet `router.refresh()`; die rendert de layout opnieuw en de seed levert de
 * nieuwe waarde. Bij uitloggen verdwijnt de (app)-layout en daarmee deze state.
 */

const PlanStatusContext = createContext<LeverageStatus>('neutral')
const PlanStatusSeedContext = createContext<((status: LeverageStatus) => void) | null>(null)

/** Veilig buiten de provider: `neutral` → geen punt. */
export function usePlanStatus(): LeverageStatus {
  return useContext(PlanStatusContext)
}

export function PlanStatusProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<LeverageStatus>('neutral')
  return (
    <PlanStatusContext.Provider value={status}>
      <PlanStatusSeedContext.Provider value={setStatus}>{children}</PlanStatusSeedContext.Provider>
    </PlanStatusContext.Provider>
  )
}

/** Registreert de server-berekende plan-status bij de provider. Rendert niets. */
export function PlanStatusSeed({ status }: { status: LeverageStatus }) {
  const register = useContext(PlanStatusSeedContext)
  useEffect(() => {
    register?.(status)
  }, [register, status])
  return null
}
