'use client'

import { useState } from 'react'
import type { DragEndEvent } from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { NEW_BUDGET_DETAIL_DEFAULTS, type DraftBudget } from '@/lib/budget-plan-diff'
import { isProtectedBudget, makeTmpId, type BudgetType } from '@/lib/budget-templates/template-draft'

export type PendingDelete = { ids: string[]; name: string }

/**
 * Draft-state + mutaties van de budgetboom. Verhuisd uit
 * `budget-plan-editor-sheet.tsx` (sep 2026) zodat de plan-editor in de app en
 * de budgetstap in de onboarding dezelfde handlers delen. Het bewaren
 * (diff + POST) blijft bij de host: die kent het oorspronkelijke plan.
 *
 * Eigen rekening (`isProtectedBudget`) is hier niet te verwijderen — ook niet
 * via een hoofdbudget waar hij onder zou hangen.
 */
export function useBudgetDraft(initial: DraftBudget[] | (() => DraftBudget[]) = []) {
  const [draft, setDraft] = useState<DraftBudget[]>(initial)
  // Geselecteerd budget voor het detail-subscherm; null = de boom.
  const [detailId, setDetailId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)
  // IDs where the user clicked "Overnemen" in this session. We track the
  // click explicitly rather than inferring from value-equality, so a user
  // who manually types the same number isn't falsely marked "Overgenomen".
  // Cleared when the user edits the amount field afterwards.
  const [takenOverIds, setTakenOverIds] = useState<Set<string>>(new Set())

  /** Vervang de hele draft en zet de bewerk-state terug (openen, terugdraaien). */
  function reset(next: DraftBudget[]) {
    setDraft(next)
    setDetailId(null)
    setPendingDelete(null)
    setTakenOverIds(new Set())
  }

  function updateRow(id: string, patch: Partial<DraftBudget>) {
    setDraft((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r
        // De naam van een beschermde post ligt vast.
        if (isProtectedBudget(r) && patch.name !== undefined) {
          const { name: _ignored, ...rest } = patch
          void _ignored
          return { ...r, ...rest }
        }
        return { ...r, ...patch }
      }),
    )
  }

  // Amount changed via the numeric input field — treat as manual edit and
  // drop the "taken over" marker so the Overnemen affordance returns.
  function handleAmountInput(id: string, n: number) {
    updateRow(id, { amount: n })
    setTakenOverIds((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  // User clicked the "Overnemen" button — apply the average and mark the
  // row as taken-over. Stays marked until the amount is manually changed.
  function handleTakeOver(id: string, amount: number) {
    updateRow(id, { amount })
    setTakenOverIds((prev) => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }

  function addTopLevel(type: BudgetType) {
    setDraft((prev) => {
      const siblings = prev.filter((r) => !r.parentId && r.budgetType === type)
      const sortOrder = siblings.length > 0 ? Math.max(...siblings.map((s) => s.sortOrder)) + 1 : 0
      const row: DraftBudget = {
        id: makeTmpId(),
        parentId: null,
        name: '',
        slug: null,
        icon: 'Circle',
        description: null,
        budgetType: type,
        defaultLimit: 0,
        isEssential: type === 'income' || type === 'savings' || type === 'debt',
        sortOrder,
        interval: 'monthly',
        rolloverType: 'reset',
        amount: 0,
        ...NEW_BUDGET_DETAIL_DEFAULTS,
      }
      return [...prev, row]
    })
  }

  function addChildOf(parentId: string, parentType: BudgetType) {
    setDraft((prev) => {
      const siblings = prev.filter((r) => r.parentId === parentId)
      const sortOrder = siblings.length > 0 ? Math.max(...siblings.map((s) => s.sortOrder)) + 1 : 0
      const row: DraftBudget = {
        id: makeTmpId(),
        parentId,
        name: '',
        slug: null,
        icon: 'Circle',
        description: null,
        budgetType: parentType,
        defaultLimit: 0,
        isEssential: false,
        sortOrder,
        interval: 'monthly',
        rolloverType: 'reset',
        amount: 0,
        ...NEW_BUDGET_DETAIL_DEFAULTS,
      }
      return [...prev, row]
    })
  }

  function requestDelete(id: string) {
    const row = draft.find((r) => r.id === id)
    if (!row || isProtectedBudget(row)) return
    // If parent: collect children too
    const children = draft.filter((r) => r.parentId === id)
    if (children.some(isProtectedBudget)) return
    setPendingDelete({ ids: [id, ...children.map((r) => r.id)], name: row.name || 'Naamloos budget' })
  }

  function cancelDelete() {
    setPendingDelete(null)
  }

  function confirmDelete() {
    if (!pendingDelete) return
    // Sta je in het detail-subscherm van een budget dat zojuist is verwijderd,
    // keer dan terug naar de boom.
    if (detailId && pendingDelete.ids.includes(detailId)) {
      setDetailId(null)
    }
    setDraft((prev) => prev.filter((r) => isProtectedBudget(r) || !pendingDelete.ids.includes(r.id)))
    setPendingDelete(null)
  }

  // ── Herordenen ───────────────────────────────────────────────
  // Eén DndContext over de hele boom; per groep (top-level per type, of de
  // kinderen van één ouder) een eigen SortableContext. We herordenen alléén
  // binnen dezelfde groep en hernummeren `sortOrder` 0..n — de diff pikt dat
  // op als sort_order-update, de RPC bewaart het. Geen herouderen in v1.
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setDraft((prev) => {
      const a = prev.find((r) => r.id === active.id)
      const b = prev.find((r) => r.id === over.id)
      if (!a || !b || groupKey(a) !== groupKey(b)) return prev
      const key = groupKey(a)
      const group = prev
        .filter((r) => groupKey(r) === key)
        .sort((x, y) => (x.sortOrder - y.sortOrder) || x.name.localeCompare(y.name))
      const oldIndex = group.findIndex((r) => r.id === active.id)
      const newIndex = group.findIndex((r) => r.id === over.id)
      if (oldIndex < 0 || newIndex < 0) return prev
      const reordered = arrayMove(group, oldIndex, newIndex)
      const orderMap = new Map(reordered.map((r, i) => [r.id, i]))
      return prev.map((r) => (orderMap.has(r.id) ? { ...r, sortOrder: orderMap.get(r.id)! } : r))
    })
  }

  return {
    draft,
    reset,
    updateRow,
    handleAmountInput,
    handleTakeOver,
    takenOverIds,
    addTopLevel,
    addChildOf,
    pendingDelete,
    requestDelete,
    cancelDelete,
    confirmDelete,
    handleDragEnd,
    detailId,
    openDetail: (id: string) => setDetailId(id),
    closeDetail: () => setDetailId(null),
  }
}

export type BudgetDraftState = ReturnType<typeof useBudgetDraft>

function groupKey(r: DraftBudget): string {
  return r.parentId ?? `top:${r.budgetType}`
}
