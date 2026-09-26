// Verplaatst uit components/app/horizon/horizon-client.tsx r369–386 @ c1b4849eb (fase 1, ADR 0179).
// Typen die tot nu toe alleen in horizon-client bestonden. Het zijn kopieën:
// de integrator voegt ze samen in components/toekomst/state/types.ts (kaart §8 stap 4)
// en haalt ze dan uit horizon-client weg.

// kopie van horizon-client r369 — integrator voegt samen in state/types.ts
export type ActiveModal = null | 'scenarios' | 'simulations' | 'withdrawal' | 'backtesting' | 'strategie'

// kopie van horizon-client r371–386 — integrator voegt samen in state/types.ts
// Household FIRE data shape (from /api/household/fire-projections)
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

