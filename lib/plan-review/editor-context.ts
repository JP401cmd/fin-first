/**
 * Contract van `GET /api/plan-review/editor-context` (TPR-15) — wat de inline editors
 * van de plan-review nodig hebben. Alleen typen: gedeeld door de route en de pane.
 */

import type { RegelSimSnapshot } from '@/lib/future/regel-sim'
import type { FirePlan } from '@/lib/fire-strategy'

export interface PlanReviewEditorContext {
  /** Client-veilig (`buildClientRegelSimSnapshot`); `null` = geen run → geen live effect. */
  snapshot: RegelSimSnapshot | null
  firePlan: FirePlan | null
}

export const PLAN_REVIEW_EDITOR_CONTEXT_URL = '/api/plan-review/editor-context'
