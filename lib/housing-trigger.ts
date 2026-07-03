/**
 * housing-trigger — gedeelde TYPES voor de eigen-huis-strategie-preview.
 *
 * (Sinds de v2-verwijdering, FASE 6 stap 5A, is dit een types-only module.) De
 * simulatie-gebaseerde "wanneer nodig"-trigger draaide voorheen engine-meetruns
 * (`runSelectedProjection`) om het downsize-/opeethypotheek-verkoopmoment te bepalen.
 * De horizon-kernel bepaalt dat moment nu ZELF (`kernelHousingSale`, uit
 * `lib/horizon-kernel/bridge.ts`); de meetrun-machinerie is daarmee vervallen. Wat
 * blijft zijn de serialiseerbare types die de loaders/preview/UI delen.
 */

import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import type { Box3Method } from '@/lib/bucket-projection'
import type { SimCashflow } from '@/lib/fire-simulation'
import type { LifeEvent } from '@/lib/horizon-data'
import type { FireStrategyConfig } from '@/lib/fire-strategy'
import type { WithdrawalStrategyConfig } from '@/lib/withdrawal-strategy'
// Type-only (erased): de preview-bundel draagt de kernel-context die
// `computeConvergentieProjection` consumeert. Geen runtime-koppeling met de router.
import type { ConvergentieRawContext } from '@/lib/horizon-kernel/convergentie-router'
import type { HousingContext } from '@/lib/housing-strategy'

// ── Types ────────────────────────────────────────────────────

/**
 * Alles wat nodig is om een projectie-basis te bouwen, MINUS de housing-events zelf.
 * `assets`/`debts` ONgefilterd. `cashflows` zijn de kasstromen van de ECHTE life events.
 * (Serialiseerbare data-bundel; de loader stelt 'm samen voor de modal-preview.)
 */
export interface HousingTriggerSimBasis {
  assets: Asset[]
  debts: Debt[]
  currentAge: number
  /** Eind-leeftijd van de simulatie (na evt. pensioen-endAge-bump). */
  endAge: number
  yearlyExpenses: number
  annualSavings: number
  monthlyIncome: number
  grossReturn: number
  inflationRate: number
  box3Method: Box3Method
  cashflows: SimCashflow[]
  strategyConfig: FireStrategyConfig
  withdrawalStrategy: WithdrawalStrategyConfig
  /** Pensioen-modus: exogene FIRE-leeftijd. */
  forcedFireAge?: number
  hasPartner: boolean
  bankAccountCash?: number
}

export interface SimulatedDepletionResult {
  method: 'simulation'
  /** Geresolveerde trigger-leeftijd, geklemd op [currentAge, config.triggerAge]. */
  triggerAge: number
  /**
   * Waarom dit moment:
   *   - 'immediate': liquide zit nu al op/onder de drempel.
   *   - 'crossover': liquide kruist de drempel binnen de VOLLEDIGE horizon.
   *   - 'no_sale': het liquide pad raakt de drempel NOOIT — verkoop is niet nodig.
   */
  reason: 'immediate' | 'crossover' | 'no_sale'
  /** Liquide pad-waarde net vóór de trigger (einde voorgaand jaar). */
  liquidAtTrigger: number
  /** Verkoopkosten-buffer op de trigger-leeftijd (0 bij reverse_mortgage). */
  bufferAtTrigger: number
  /** Veiligheidsmarge-component (depletionThresholdYears × uitgaven, geïndexeerd). */
  marginAtTrigger: number
  /** Overwaarde op de trigger-leeftijd (geprojecteerde woningwaarde − hypotheek). */
  equityAtTrigger: number
  /** fireAge van de geconvergeerde run-mét-event (null = FIRE onbereikbaar/n.v.t.). */
  fireAgeUsed: number | null
  /** Aantal vaste-punt-iteraties (1..3). */
  iterations: number
  converged: boolean
  /** Compact liquide-pad voor UI-uitleg/preview (einde-jaar-waarden + drempel). */
  liquidPath: { age: number; liquid: number; buffer: number }[]
}

/**
 * Serialiseerbare bundel die de server-loader aan de Huis-strategie-modal meegeeft.
 * Sinds de v2-verwijdering routeert de preview kernel-native via `kernelRawContext`
 * (`lib/housing-preview.ts` → `computeConvergentieProjection`); `simBasis`/`context`/
 * `horizonEngineV2` blijven bewaard voor het weergave-/legacy-oppervlak van de modal.
 */
export interface HousingPreviewData {
  simBasis: HousingTriggerSimBasis
  context: HousingContext
  /**
   * (Legacy-veld — de v2-grootboek-engine bestaat niet meer.) Blijft in het contract
   * zodat de modal-bundel byte-identiek serialiseert; door de kernel-only preview
   * genegeerd.
   */
  horizonEngineV2?: boolean
  /** (Legacy-veld.) De preview draait onvoorwaardelijk kernel-native. */
  kernelConvergentieEnabled?: boolean
  /**
   * Rauwe kernel-context (basis-profiel + assets/debts/lifeEvents/aow/jaaruitgaven)
   * waaruit `computeConvergentieProjection` de kernel-invoer samenstelt. De preview
   * overschrijft per scenario alleen `profile.housing_strategy_config`.
   */
  kernelRawContext?: ConvergentieRawContext
}

export interface HousingScenarioResult {
  events: LifeEvent[]
  depletion: SimulatedDepletionResult | null
  /** Vrijheidsleeftijd (fractioneel) onder deze strategie-config; null = onbereikbaar. */
  fireAgeFractional: number | null
  fireReachable: boolean
}
