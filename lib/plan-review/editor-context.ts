/**
 * Contract van `GET /api/plan-review/editor-context` (TPR-15) — wat de inline editors
 * van de plan-review nodig hebben. Alleen typen: gedeeld door de route en de pane.
 */

import type { RegelSimSnapshot } from '@/lib/future/regel-sim'
import type { FirePlan } from '@/lib/fire-strategy'
import type { PotRulesConfig } from '@/lib/pot-rules'
import type { WealthGroup } from '@/lib/wealth-composition'
import type { AssetType } from '@/lib/asset-data'
import type { LifeEvent } from '@/lib/horizon-data'
import type { AowLeeftijdRow } from '@/lib/aow-leeftijd'
import type { StrategieEditorBasis } from '@/lib/horizon/strategie-editor-basis'
import type { Box3Method } from '@/lib/bucket-projection'

/** Eén eigen, niet-liquide bezitting met een verkoopinstelling (stap 4). */
export interface PlanReviewVastBezit {
  id: string
  name: string
  asset_type: AssetType
  current_value: number
  /** Rauwe JSONB; de editor leest 'm met `saleConfigToDraft` (NULL = `wanneer_nodig`). */
  sale_config: unknown
}

/** Stap 4 — "Je huis en ander vast bezit". */
export interface PlanReviewWoningContext {
  /** Een actieve eigen woning zichtbaar voor de gebruiker (zelfde feit als de voortgang). */
  heeftEigenHuis: boolean
  /** Staat er een expliciete `housing_strategy_config` op het profiel? */
  woonstrategieIngesteld: boolean
  /** Alleen EIGEN bezit (`user_id` = jij): alleen die rijen mag de schrijfroute wijzigen. */
  vastBezit: PlanReviewVastBezit[]
  /**
   * Actieve schulden voor "Aflossen bij verkoop": eigen + gedeelde in het huishouden, dezelfde
   * set als het bezittingenformulier en de schrijfroute (`lib/sale-config-debts.ts`).
   */
  schulden: { id: string; name: string }[]
}

/** Stap 3 — "Wat er binnenkomt": de eigen AOW-, werk- en pensioenrijen plus de formulierbasis. */
export interface PlanReviewInkomstenContext {
  /** Alleen EIGEN rijen (`loadEigenStrategieEvents`): alleen die wijzigt de schrijfroute. */
  aow: LifeEvent | null
  werk: LifeEvent | null
  pensioenen: LifeEvent[]
  aowRows: AowLeeftijdRow[]
  basis: StrategieEditorBasis
}

/** Laag 2 — één eigen bezitting met haar rendement. */
export interface PlanReviewLaag2Bezitting {
  id: string
  name: string
  asset_type: AssetType
  /**
   * PERCENT (7 = 7%), zoals opgeslagen. `null` = geen eigen aanname; de kern
   * rekent dan met `terugvalRendement` (ADR 0166).
   */
  expected_return: number | null
  /** `depreciation_rate > 0`: het rendement is dan per definitie 0 en niet hier in te stellen. */
  afschrijvend: boolean
}

/** Laag 2 — "Voor wie wil": de aannames onder het plan (TPR-15). */
export interface PlanReviewLaag2Context {
  /** Zoals de kern er nu mee rekent (`resolveFireParams` op de geshadowde profielrij): FRACTIE. */
  inflationRate: number
  /** Terugvalrendement voor een bezitting zonder eigen rendement: FRACTIE. */
  terugvalRendement: number
  box3Method: Box3Method
  /** Euro p.p. per jaar; `null` = de standaard van het rekenmodel. */
  box3HeffingvrijInkomen: number | null
  /** Alleen EIGEN actieve bezittingen (`user_id` = jij): alleen die wijzigt de schrijfroute. */
  bezittingen: PlanReviewLaag2Bezitting[]
  /**
   * Bezittingen in de rekenrun zonder eigen rendement — alleen daarop werkt het
   * terugvalrendement. Sinds migratie 20260919140000 (ADR 0166) kan dit er écht meer
   * dan 0 zijn: de kolom is nullable en de gebruiker kan "geen eigen rendement"
   * expliciet kiezen. Staat het op 0, dan zegt de wizard eerlijk dat dit getal zijn
   * plan nu niet verandert.
   */
  zonderEigenRendement: number
}

export interface PlanReviewEditorContext {
  /** Client-veilig (`buildClientRegelSimSnapshot`); `null` = geen run → geen live effect. */
  snapshot: RegelSimSnapshot | null
  firePlan: FirePlan | null
  /** Stap 5 — de pot-regels zoals de Voorkeuren-pagina ze leest (`resolvePotRules`). */
  potRules: PotRulesConfig | null
  /** Stap 5 — saldo per vermogensgroep voor de illustratieve pot-flow (`buildPotBalances`). */
  potBalances: Record<WealthGroup, number> | null
  /** Stap 4 — woonstrategie en verkoopinstellingen. */
  woning: PlanReviewWoningContext | null
  /** Stap 3 — AOW, werk en pensioen; `null` = niet geladen (alleen die editor meldt het). */
  inkomsten: PlanReviewInkomstenContext | null
  /** Laag 2 — markt-aannames, Box 3 en rendement per bezitting; `null` = niet geladen. */
  laag2: PlanReviewLaag2Context | null
}

export const PLAN_REVIEW_EDITOR_CONTEXT_URL = '/api/plan-review/editor-context'
