// Gedeelde typen van /toekomst (ADR 0179 fase 1, stap 4).
//
// Samengevoegd uit de kopieën die stroom X1/X2/X3 naast hun bladeren zetten
// (`plan/types.ts`, `canvas/types.ts`, `overlays/types.ts`) en uit de lokale
// typen van `components/app/horizon/horizon-client.tsx` (`ActiveModal` r369,
// `HouseholdHeroData` r371–386 en de inline `useState<…>`-generieken, @ c1b4849eb).
// Eén definitie per vorm: de ouder en de bladeren wijzen allemaal hierheen, zodat
// de state-generiek en het prop-type niet stil uit elkaar kunnen lopen.

import type { SimResult, SimRow } from '@/lib/fire-simulation'
import type { LifeEvent } from '@/lib/horizon-data'
import type { HouseholdRetirementMethod } from '@/lib/household-projection'

/** Welke analyse-modal open staat (horizon-client r369). */
export type ActiveModal = null | 'scenarios' | 'simulations' | 'withdrawal' | 'backtesting' | 'strategie'

/** Household FIRE data shape (from /api/household/fire-projections) — horizon-client r371–386. */
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

/** State-generiek `householdMainLine` (horizon-client r632–639). */
export interface HouseholdMainLine {
  rows: SimRow[]
  fireAge: number | null
  fireAgeFractional: number | null
  currentAge: number | null
  /** Partner-AOW op de kijker-as uit de gecombineerde kernel-run (ADR 0168). */
  partnerAowAge: number | null
}

/** State-generiek `partnerLine` (horizon-client r643–648). */
export interface PartnerLine {
  rows: SimRow[]
  fireAge: number | null
  fireAgeFractional: number | null
  currentAge: number | null
}

/** State-generiek `chartMode` (horizon-client r794). */
export type ChartMode = 'vermogenspad' | 'vermogensopbouw'

/** State-generiek `ieViewMode` (horizon-client r793). */
export type IeViewMode = 'lines' | 'breakdown'

/** State-generiek `activeFaseModal` (horizon-client r755). */
export type ActiveFaseModal = 'opbouw' | 'overgang' | 'onttrekking' | null

/** State-generiek `strategieInitialTab` (horizon-client r753). */
export type StrategieInitialTab = 'eind' | 'onttrekking' | 'woning' | null

/** State-generiek `householdRetireInfo` (horizon-client r938–941). */
export type HouseholdRetireInfo = {
  candidates: { autoShared: number; sumPartners: number; custom: number | null }
  method: HouseholdRetirementMethod
} | null

/** State-generiek `eventPaneMode` (horizon-client r957). */
export type EventPaneMode = 'catalog' | 'view' | 'edit'

/** State-generiek `clusterSheet` (horizon-client r958). */
export type ClusterSheet = { events: LifeEvent[]; centerAge: number } | null

/** State-generiek `overlayEmphasis` (horizon-client r1040). */
export type OverlayEmphasis = 'accumulation' | 'withdrawal' | 'fire' | null

/**
 * Resultaattype van `viewReadoutData` (useMemo in horizon-client, gevoed door
 * `readoutData`). Al gedeflateerd aan de render-grens; het canvas rekent niet.
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

/**
 * Returnvorm van de `overgangData`-IIFE (horizon-client r2918–2953).
 * `nettoLiquideAtStart` is `number | undefined`: `startNettoLiquide` of
 * `nettoLiquideAtAge(…)`.
 */
export type OvergangData = {
  scenario: 'gap' | 'shortfall'
  start: number
  end: number
  fireAge: number
  aowAge: number
  yearlyExp: number
  yearlyAow: number
  portfolioAtStart: number
  nettoLiquideAtStart: number | undefined
  withdrawal: number
} | null

/** Returnvorm van de `onttrekkingData`-IIFE (horizon-client r2956–2975). */
export type OnttrekkingData = {
  start: number
  end: number
  startPortfolio: number
  nettoLiquideAtStart: number | undefined
  strategy: SimResult['strategy']
  targetEndPortfolio: number
  yearlyWithdrawal: number
  yearlyAow: number
} | null

/** De `erfgenamen`-memo (horizon-client r3453–3476). */
export type Erfgenamen = { relatie: 'kind' | 'partner' | 'overig'; fractie: number }[] | undefined
