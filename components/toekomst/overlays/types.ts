// Verplaatst uit components/app/horizon/horizon-client.tsx r369, r753, r755, r937–941, r957–958, r2918–2975, r3453–3476 @ c1b4849eb (fase 1, ADR 0179).
//
// Typen die alleen in horizon-client bestonden (lokale `type`/`useState<…>`/IIFE-
// returnvormen). Kopie van horizon-client r369 e.v. — integrator voegt samen in
// state/types.ts (kaart §8 stap 4: `HouseholdHeroData`, `ActiveModal` → state/types.ts).
import type { LifeEvent } from '@/lib/horizon-data'
import type { SimResult } from '@/lib/fire-simulation'
import type { HouseholdRetirementMethod } from '@/lib/household-projection'

/** Kopie van horizon-client r369. */
export type ActiveModal = null | 'scenarios' | 'simulations' | 'withdrawal' | 'backtesting' | 'strategie'

/** Kopie van horizon-client r755 (`useState<…>` van `activeFaseModal`). */
export type ActiveFaseModal = 'opbouw' | 'overgang' | 'onttrekking' | null

/** Kopie van horizon-client r753 (`useState<…>` van `strategieInitialTab`). */
export type StrategieInitialTab = 'eind' | 'onttrekking' | 'woning' | null

/** Kopie van horizon-client r938–941 (`useState<…>` van `householdRetireInfo`). */
export type HouseholdRetireInfo = {
  candidates: { autoShared: number; sumPartners: number; custom: number | null }
  method: HouseholdRetirementMethod
} | null

/** Kopie van horizon-client r957 (`useState<…>` van `eventPaneMode`). */
export type EventPaneMode = 'catalog' | 'view' | 'edit'

/** Kopie van horizon-client r958 (`useState<…>` van `clusterSheet`). */
export type ClusterSheetState = { events: LifeEvent[]; centerAge: number } | null

/**
 * Kopie van de returnvorm van de `overgangData`-IIFE (horizon-client r2918–2953).
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

/** Kopie van de `erfgenamen`-memo (horizon-client r3453–3476). */
export type Erfgenamen = { relatie: 'kind' | 'partner' | 'overig'; fractie: number }[] | undefined

/** Kopie van de returnvorm van de `onttrekkingData`-IIFE (horizon-client r2956–2975). */
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
