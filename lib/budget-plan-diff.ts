import type { Budget, BudgetWithChildren } from '@/lib/budget-data'

/** Minimal amount row shape — created_at and id aren't needed for diffing. */
export type BudgetAmountLite = {
  budget_id: string
  effective_from: string
  amount: number
}

export type DraftBudget = {
  /** Existing UUID, or a client-generated temp id prefixed with "tmp-". */
  id: string
  /** Existing UUID, "tmp-..." for a not-yet-saved parent, or null for a top-level row. */
  parentId: string | null
  name: string
  slug: string | null
  icon: string
  description: string | null
  budgetType: Budget['budget_type']
  defaultLimit: number
  isEssential: boolean
  sortOrder: number
  interval: Budget['interval']
  rolloverType: Budget['rollover_type']
  /**
   * Intended monthly amount for the editor's active month. Null = leave amount
   * untouched. If the draft row is new, null means "fall back to default_limit"
   * and no amount row is written.
   */
  amount: number | null
  // ── Detail-velden ──────────────────────────────────────────────
  // Bewerkt in het detail-subscherm. Reizen door dezelfde diff + atomische
  // save_budget_plan-RPC als de structuurvelden hierboven, zodat boom- én
  // detailwijzigingen in één "Opslaan" landen (geen tweede save-model).
  // ownership/household + koppeling aan een los `goals`-record blijven bewust
  // op het directe-write-pad (zie BudgetForm).
  priorityScore: number
  limitType: Budget['limit_type']
  alertThreshold: number
  isInflationIndexed: boolean
  goalType: string | null
  goalAmount: number | null
  goalDate: string | null
  goalFrequency: string | null
}

/** De acht detail-velden van een DraftBudget, los herbruikbaar. */
export type DraftDetailFields = Pick<
  DraftBudget,
  | 'priorityScore'
  | 'limitType'
  | 'alertThreshold'
  | 'isInflationIndexed'
  | 'goalType'
  | 'goalAmount'
  | 'goalDate'
  | 'goalFrequency'
>

/** Detail-veld-defaults voor een nieuw (leeg) budget — gelijk aan de
 *  COALESCE-defaults in de save_budget_plan-RPC (priority 3, alert 80, soft). */
export const NEW_BUDGET_DETAIL_DEFAULTS: DraftDetailFields = {
  priorityScore: 3,
  limitType: 'soft',
  alertThreshold: 80,
  isInflationIndexed: false,
  goalType: null,
  goalAmount: null,
  goalDate: null,
  goalFrequency: null,
}

/** Detail-velden uit een opgeslagen Budget overnemen in een draft. */
export function detailFieldsFromBudget(b: Budget): DraftDetailFields {
  return {
    priorityScore: b.priority_score ?? 3,
    limitType: b.limit_type ?? 'soft',
    alertThreshold: b.alert_threshold ?? 80,
    isInflationIndexed: !!b.is_inflation_indexed,
    goalType: b.goal_type ?? null,
    goalAmount: b.goal_amount ?? null,
    goalDate: b.goal_date ?? null,
    goalFrequency: b.goal_frequency ?? null,
  }
}

export type BudgetInsert = {
  client_id: string
  parent_client_id: string | null
  parent_id: string | null
  name: string
  slug: string | null
  icon: string
  description: string | null
  budget_type: Budget['budget_type']
  default_limit: number
  is_essential: boolean
  sort_order: number
  interval: Budget['interval']
  rollover_type: Budget['rollover_type']
  // Detail-velden (zie DraftBudget)
  priority_score: number
  limit_type: Budget['limit_type']
  alert_threshold: number
  is_inflation_indexed: boolean
  goal_type: string | null
  goal_amount: number | null
  goal_date: string | null
  goal_frequency: string | null
}

export type BudgetUpdate = {
  id: string
  name?: string
  icon?: string
  description?: string | null
  budget_type?: Budget['budget_type']
  default_limit?: number
  is_essential?: boolean
  parent_id?: string | null
  sort_order?: number
  interval?: Budget['interval']
  rollover_type?: Budget['rollover_type']
  // Detail-velden (zie DraftBudget)
  priority_score?: number
  limit_type?: Budget['limit_type']
  alert_threshold?: number
  is_inflation_indexed?: boolean
  goal_type?: string | null
  goal_amount?: number | null
  goal_date?: string | null
  goal_frequency?: string | null
}

export type BudgetAmountUpsert = {
  /** Either an existing budget UUID or a client_id matching an insert entry. */
  budget_id: string
  effective_from: string
  amount: number
}

export type BudgetPlanDiff = {
  to_insert: BudgetInsert[]
  to_update: BudgetUpdate[]
  to_delete: string[]
  amounts: BudgetAmountUpsert[]
}

const TMP_PREFIX = 'tmp-'

export function isTempId(id: string): boolean {
  return id.startsWith(TMP_PREFIX)
}

/** Pick the active amount override for a budget on a given effective date. */
export function resolveActiveAmount(
  budgetId: string,
  effectiveFrom: string,
  amounts: BudgetAmountLite[],
): number | null {
  const applicable = amounts
    .filter((a) => a.budget_id === budgetId && a.effective_from <= effectiveFrom)
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from))
  return applicable.length > 0 ? Number(applicable[0].amount) : null
}

function flattenOriginal(tree: BudgetWithChildren[]): Map<string, Budget> {
  const map = new Map<string, Budget>()
  for (const parent of tree) {
    map.set(parent.id, parent)
    for (const child of parent.children) map.set(child.id, child)
  }
  return map
}

function buildUpdateDelta(draft: DraftBudget, original: Budget): BudgetUpdate | null {
  const delta: BudgetUpdate = { id: original.id }
  let changed = false

  if (draft.name !== original.name) { delta.name = draft.name; changed = true }
  if (draft.icon !== original.icon) { delta.icon = draft.icon; changed = true }
  if (draft.description !== (original.description ?? null)) {
    delta.description = draft.description
    changed = true
  }
  if (draft.budgetType !== original.budget_type) {
    delta.budget_type = draft.budgetType
    changed = true
  }
  if (Number(draft.defaultLimit) !== Number(original.default_limit)) {
    delta.default_limit = draft.defaultLimit
    changed = true
  }
  if (draft.isEssential !== original.is_essential) {
    delta.is_essential = draft.isEssential
    changed = true
  }
  const originalParent = original.parent_id ?? null
  const draftParent = draft.parentId && !isTempId(draft.parentId) ? draft.parentId : null
  if (draftParent !== originalParent) {
    delta.parent_id = draftParent
    changed = true
  }
  if (draft.sortOrder !== original.sort_order) {
    delta.sort_order = draft.sortOrder
    changed = true
  }
  if (draft.interval !== original.interval) {
    delta.interval = draft.interval
    changed = true
  }
  if (draft.rolloverType !== original.rollover_type) {
    delta.rollover_type = draft.rolloverType
    changed = true
  }

  // ── Detail-velden ──────────────────────────────────────────────
  if (Number(draft.priorityScore) !== Number(original.priority_score)) {
    delta.priority_score = draft.priorityScore
    changed = true
  }
  if (draft.limitType !== original.limit_type) {
    delta.limit_type = draft.limitType
    changed = true
  }
  if (Number(draft.alertThreshold) !== Number(original.alert_threshold)) {
    delta.alert_threshold = draft.alertThreshold
    changed = true
  }
  if (draft.isInflationIndexed !== original.is_inflation_indexed) {
    delta.is_inflation_indexed = draft.isInflationIndexed
    changed = true
  }
  if ((draft.goalType ?? null) !== (original.goal_type ?? null)) {
    delta.goal_type = draft.goalType
    changed = true
  }
  if (numOrNull(draft.goalAmount) !== numOrNull(original.goal_amount)) {
    delta.goal_amount = draft.goalAmount
    changed = true
  }
  if ((draft.goalDate ?? null) !== (original.goal_date ?? null)) {
    delta.goal_date = draft.goalDate
    changed = true
  }
  if ((draft.goalFrequency ?? null) !== (original.goal_frequency ?? null)) {
    delta.goal_frequency = draft.goalFrequency
    changed = true
  }

  return changed ? delta : null
}

/** Normalise an optional numeric to a comparable value (null stays null). */
function numOrNull(v: number | null | undefined): number | null {
  return v === null || v === undefined ? null : Number(v)
}

export function computeBudgetPlanDiff(
  originalTree: BudgetWithChildren[],
  draft: DraftBudget[],
  originalAmounts: BudgetAmountLite[],
  effectiveFrom: string,
): BudgetPlanDiff {
  const originals = flattenOriginal(originalTree)
  const draftIds = new Set<string>()

  const to_insert: BudgetInsert[] = []
  const to_update: BudgetUpdate[] = []
  const to_delete: string[] = []
  const amounts: BudgetAmountUpsert[] = []

  for (const row of draft) {
    draftIds.add(row.id)

    if (isTempId(row.id)) {
      const parentIsTmp = row.parentId !== null && isTempId(row.parentId)
      to_insert.push({
        client_id: row.id,
        parent_client_id: parentIsTmp ? row.parentId : null,
        parent_id: parentIsTmp ? null : row.parentId,
        name: row.name,
        slug: row.slug,
        icon: row.icon,
        description: row.description,
        budget_type: row.budgetType,
        default_limit: row.defaultLimit,
        is_essential: row.isEssential,
        sort_order: row.sortOrder,
        interval: row.interval,
        rollover_type: row.rolloverType,
        priority_score: row.priorityScore,
        limit_type: row.limitType,
        alert_threshold: row.alertThreshold,
        is_inflation_indexed: row.isInflationIndexed,
        goal_type: row.goalType,
        goal_amount: row.goalAmount,
        goal_date: row.goalDate,
        goal_frequency: row.goalFrequency,
      })
      if (row.amount !== null) {
        amounts.push({
          budget_id: row.id,
          effective_from: effectiveFrom,
          amount: row.amount,
        })
      }
      continue
    }

    const original = originals.get(row.id)
    if (!original) {
      // Draft references a UUID we don't know about — treat as a no-op rather
      // than an insert. The caller is expected to only send known ids.
      continue
    }

    const delta = buildUpdateDelta(row, original)
    if (delta) to_update.push(delta)

    if (row.amount !== null) {
      const activeAmount = resolveActiveAmount(row.id, effectiveFrom, originalAmounts)
      const same = activeAmount !== null && Number(activeAmount) === Number(row.amount)
      if (!same) {
        amounts.push({
          budget_id: row.id,
          effective_from: effectiveFrom,
          amount: row.amount,
        })
      }
    }
  }

  for (const original of originals.values()) {
    if (!draftIds.has(original.id)) to_delete.push(original.id)
  }

  return { to_insert, to_update, to_delete, amounts }
}

/** Total number of mutations in a diff — used to gate the save button. */
export function countDiff(diff: BudgetPlanDiff): number {
  return diff.to_insert.length + diff.to_update.length + diff.to_delete.length + diff.amounts.length
}

/** First day of the current month in ISO `YYYY-MM-DD`. */
export function firstOfCurrentMonth(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}-01`
}
