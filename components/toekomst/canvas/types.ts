// Verplaatst uit components/app/horizon/horizon-client.tsx (typen, zie per type) @ c1b4849eb (fase 1, ADR 0179).
//
// Typen die vandaag alléén in horizon-client.tsx bestaan (lokale interface of
// inline `useState<…>`-generiek). De canvas-bladeren hebben ze nodig voor hun
// props; zolang de provider er niet is, staan ze hier als kopie.
// Integrator voegt samen in state/types.ts.

import type { SimRow } from '@/lib/fire-simulation'
import type { LifeEvent } from '@/lib/horizon-data'

/** Kopie van horizon-client r368 — integrator voegt samen in state/types.ts. */
export type ActiveModal = null | 'scenarios' | 'simulations' | 'withdrawal' | 'backtesting' | 'strategie'

/** Kopie van horizon-client r371–384 — integrator voegt samen in state/types.ts. */
export interface HouseholdHeroData {
  householdName: string
  fireAge: number | null
  fireTarget: number
  freedomPercentage: number
  countdownDays: number
  fireDate: string
  freedomYears: number
  freedomMonths: number
  savingsRate: number
  /** Jaarlijkse uitgave ná pensioen voor dit perspectief (huishouden = gecombineerd,
   *  methode-afhankelijk; partner = diens eigen bedrag). Voedt de "Na pensioen"-KPI. */
  retirementExpense: number
}

/** Kopie van de state-generiek horizon-client r632–639 (`householdMainLine`) — integrator voegt samen in state/types.ts. */
export interface HouseholdMainLine {
  rows: SimRow[]
  fireAge: number | null
  fireAgeFractional: number | null
  currentAge: number | null
  /** Partner-AOW op de kijker-as uit de gecombineerde kernel-run (ADR 0168). */
  partnerAowAge: number | null
}

/** Kopie van de state-generiek horizon-client r643–648 (`partnerLine`) — integrator voegt samen in state/types.ts. */
export interface PartnerLine {
  rows: SimRow[]
  fireAge: number | null
  fireAgeFractional: number | null
  currentAge: number | null
}

/** Kopie van de state-generiek horizon-client r794 (`chartMode`) — integrator voegt samen in state/types.ts. */
export type ChartMode = 'vermogenspad' | 'vermogensopbouw'

/** Kopie van de state-generiek horizon-client r793 (`ieViewMode`) — integrator voegt samen in state/types.ts. */
export type IeViewMode = 'lines' | 'breakdown'

/** Kopie van de state-generiek horizon-client r755 (`activeFaseModal`) — integrator voegt samen in state/types.ts. */
export type ActiveFaseModal = 'opbouw' | 'overgang' | 'onttrekking' | null

/** Kopie van de state-generiek horizon-client r957 (`eventPaneMode`) — integrator voegt samen in state/types.ts. */
export type EventPaneMode = 'catalog' | 'view' | 'edit'

/** Kopie van de state-generiek horizon-client r958 (`clusterSheet`) — integrator voegt samen in state/types.ts. */
export type ClusterSheet = { events: LifeEvent[]; centerAge: number } | null

/** Kopie van de state-generiek horizon-client r1040 (`overlayEmphasis`) — integrator voegt samen in state/types.ts. */
export type OverlayEmphasis = 'accumulation' | 'withdrawal' | 'fire' | null

/**
 * Kopie van het (afgeleide) resultaattype van `viewReadoutData` (useMemo
 * horizon-client r5510, gevoed door `readoutData`) — integrator voegt samen in
 * state/types.ts. Al gedeflateerd aan de render-grens; het canvas rekent niet.
 */
export interface ReadoutData {
  age: number
  year: number
  phaseLabel: string
  phaseColor: string
  netWorth: number
  netWorthMoment: string
  freedomTime: string
  monthlyLabel: string
  monthlyAmount: number
}
