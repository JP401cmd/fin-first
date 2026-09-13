/**
 * Contract van `GET /api/plan-review/editor-context` (TPR-15) — wat de inline editors
 * van de plan-review nodig hebben. Alleen typen: gedeeld door de route en de pane.
 */

import type { RegelSimSnapshot } from '@/lib/future/regel-sim'
import type { FirePlan } from '@/lib/fire-strategy'
import type { PotRulesConfig } from '@/lib/pot-rules'
import type { WealthGroup } from '@/lib/wealth-composition'

export interface PlanReviewEditorContext {
  /** Client-veilig (`buildClientRegelSimSnapshot`); `null` = geen run → geen live effect. */
  snapshot: RegelSimSnapshot | null
  firePlan: FirePlan | null
  /** Stap 5 — de pot-regels zoals de Voorkeuren-pagina ze leest (`resolvePotRules`). */
  potRules: PotRulesConfig | null
  /** Stap 5 — saldo per vermogensgroep voor de illustratieve pot-flow (`buildPotBalances`). */
  potBalances: Record<WealthGroup, number> | null
}

export const PLAN_REVIEW_EDITOR_CONTEXT_URL = '/api/plan-review/editor-context'
