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

  return changed ? delta : null
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
