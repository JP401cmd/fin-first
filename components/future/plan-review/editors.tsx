'use client'

/**
 * Editor-register van de plan-review (TPR-15, ADR 0142) — welke BESTAANDE editor-body
 * een stap in de wizard zelf instelbaar maakt.
 *
 * De wizard is een extra ingang naar bestaande instellingen, geen tweede formulier: elke
 * editor hier rendert dezelfde body als het bestaande scherm (Voorkeuren, uitgaven-pane,
 * …), met hetzelfde host-contract (`RegelEditActionsState` via `onActionsChange`) en
 * dezelfde schrijfroute. Verandert de body op het bestaande scherm, dan verandert hij
 * hier mee (meebeweeg-check, laag a).
 *
 * `Record<PlanReviewStap, …>`: een nieuwe stap krijgt pas een geldig register wanneer hij
 * een editor of een expliciete `null` heeft. `null` = nog niet inline (die stap verwijst
 * voorlopig naar het bestaande scherm); de fasering staat in
 * `docs/superpowers/plans/2026-09-13-tpr15-plan-review-inline.md`.
 */

import type { ComponentType } from 'react'
import type { PlanReviewStap } from '@/lib/plan-review/types'
import type { PlanReviewEditorContext } from '@/lib/plan-review/editor-context'
import { EindstrategieBody } from '@/components/future/regels/eindstrategie-body'
import type { RegelEditActionsState } from '@/components/future/regels/types'
import { UitgavenEditor } from './uitgaven-editor'
import { PottenEditor } from './potten-editor'
import { WoningEditor } from './woning-editor'

export interface PlanReviewEditorProps {
  context: PlanReviewEditorContext
  onActionsChange: (s: RegelEditActionsState) => void
  /**
   * Na een geslaagde write via de bestaande route — de wizard zet dan de markering.
   * `woonstrategieGeschreven` (stap 4): schreef deze save de woonstrategie? Alleen dan telt
   * de woning lokaal als ingesteld; een verkoopinstelling van een auto doet dat niet.
   * Zonder argument geldt de stap-default van de pane.
   */
  onSaved: (info?: { woonstrategieGeschreven?: boolean }) => void
}

/** De wizard sluit niet bij opslaan: de host beslist wat er daarna gebeurt. */
const blijfOpen = () => {}

function PlanEditor({ context, onActionsChange, onSaved }: PlanReviewEditorProps) {
  return (
    <EindstrategieBody
      simSnapshot={context.snapshot}
      fireStrategy={context.snapshot?.fireStrategy}
      firePlan={context.firePlan}
      onActionsChange={onActionsChange}
      onClose={blijfOpen}
      onSaved={onSaved}
    />
  )
}

export const PLAN_REVIEW_EDITORS: Record<PlanReviewStap, ComponentType<PlanReviewEditorProps> | null> = {
  plan: PlanEditor,
  uitgaven: UitgavenEditor,
  inkomsten: null,
  woning: WoningEditor,
  potten: PottenEditor,
}
