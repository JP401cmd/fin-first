'use client'

import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, AlertTriangle, Check, X, RotateCcw, Save, LayoutTemplate, ChevronRight, Info, GripVertical, SlidersHorizontal } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'

import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { useToast } from '@/components/app/toast-provider'
import { BudgetIconPicker } from '@/components/app/budget-icon-picker'
import { BudgetDetailPane } from '@/components/app/budget-detail-pane'
import {
  type Budget,
  type BudgetWithChildren,
} from '@/lib/budget-data'
import { getCarriedAmount, formatPeriod, type BudgetRollover } from '@/lib/budget-rollover'
import {
  BUDGET_TEMPLATES,
  buildTemplateSeed,
  type BudgetTemplateId,
} from '@/lib/budget-templates/onboarding-presets'
import {
  computeBudgetPlanDiff,
  countDiff,
  isTempId,
  resolveActiveAmount,
  detailFieldsFromBudget,
  NEW_BUDGET_DETAIL_DEFAULTS,
  type BudgetAmountLite,
  type DraftBudget,
} from '@/lib/budget-plan-diff'
import { MaskedAmount } from '@/components/app/masked-amount'

type EditorView = 'tree' | 'detail' | 'template-pick' | 'template-preview' | 'template-confirm'

type BudgetType = Budget['budget_type']

const TYPE_ORDER: BudgetType[] = ['income', 'expense', 'savings', 'debt', 'archive']

const TYPE_LABEL: Record<BudgetType, string> = {
  income: 'Inkomsten',
  expense: 'Uitgaven',
  savings: 'Sparen',
  debt: 'Schulden',
  archive: 'Archief',
}

let tmpCounter = 0
function makeTmpId(): string {
  tmpCounter += 1
  return `tmp-${Date.now().toString(36)}-${tmpCounter}`
}

function budgetToDraft(b: Budget, amountForMonth: number | null): DraftBudget {
  return {
    id: b.id,
    parentId: b.parent_id ?? null,
    name: b.name,
    slug: b.slug,
    icon: b.icon ?? 'Circle',
    description: b.description ?? null,
    budgetType: b.budget_type,
    defaultLimit: Number(b.default_limit) || 0,
    isEssential: !!b.is_essential,
    sortOrder: b.sort_order ?? 0,
    interval: b.interval,
    rolloverType: b.rollover_type,
    amount: amountForMonth,
    ...detailFieldsFromBudget(b),
  }
}

function treeToDraft(
  tree: BudgetWithChildren[],
  amounts: BudgetAmountLite[],
  effectiveFrom: string,
): DraftBudget[] {
  const draft: DraftBudget[] = []
  for (const parent of tree) {
    draft.push(budgetToDraft(parent, resolveActiveAmount(parent.id, effectiveFrom, amounts)))
    for (const child of parent.children) {
      draft.push(budgetToDraft(child, resolveActiveAmount(child.id, effectiveFrom, amounts)))
    }
  }
  return draft
}

/** Group + sort a flat draft list for rendering. Returns sections per type. */
function groupForRender(draft: DraftBudget[]) {
  const byType: Record<BudgetType, DraftBudget[]> = {
    income: [], expense: [], savings: [], debt: [], archive: [],
  }
  for (const row of draft) byType[row.budgetType].push(row)

  return TYPE_ORDER.map((type) => {
    const rows = byType[type]
    const parents = rows.filter((r) => !r.parentId)
    const childrenBy: Record<string, DraftBudget[]> = {}
    for (const r of rows) {
      if (r.parentId) {
        (childrenBy[r.parentId] ||= []).push(r)
      }
    }
    parents.sort((a, b) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name))
    for (const id of Object.keys(childrenBy)) {
      childrenBy[id].sort((a, b) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name))
    }
    return { type, parents, childrenBy }
  })
}

export function BudgetPlanEditorSheet({
  open,
  onClose,
  onSaved,
  onEditAdvanced,
  budgets,
  budgetAmounts,
  rollovers,
  totalIncome,
  monthDate,
  monthlyAverages = {},
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
  /** Escape-hatch vanuit het detail-subscherm voor eigendom/delen + koppelen
   *  aan een bestaand spaardoel. De parent (BudgetsClient) sluit de sheet en
   *  opent het uitgebreide BudgetForm-bewerkscherm (`?budget=<id>&edit=true`).
   *  Alleen aangeboden voor reeds opgeslagen budgetten. */
  onEditAdvanced?: (budgetId: string) => void
  budgets: BudgetWithChildren[]
  budgetAmounts: BudgetAmountLite[]
  rollovers: BudgetRollover[]
  totalIncome: number
  monthDate: Date
  monthlyAverages?: Record<string, { avg: number; months: number }>
}) {
  const effectiveFrom = useMemo(() => {
    return `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}-01`
  }, [monthDate])

  // Krantstijl-datum-label voor de editorial-kicker: "Mei 2026" / "Jan. 2026".
  const monthLabel = useMemo(() => {
    return monthDate.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })
  }, [monthDate])

  const [view, setView] = useState<EditorView>('tree')
  // Geselecteerd budget voor het detail-subscherm (view === 'detail').
  const [detailId, setDetailId] = useState<string | null>(null)
  const [draft, setDraft] = useState<DraftBudget[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // I-05: bevestiging bij niet-opgeslagen wijzigingen (vervangt window.confirm).
  // `message` = de context-copy, `onConfirm` = de door te zetten actie.
  const [discardConfirm, setDiscardConfirm] = useState<
    { message: string; onConfirm: () => void } | null
  >(null)
  // De X/Esc-route van BottomSheet speelt zijn exit-animatie al vóór onClose.
  // Kiest de gebruiker daarna "Annuleren" (dóór bewerken), dan is de sheet
  // visueel weg terwijl `open` true bleef — een key-bump remount haalt 'm
  // terug; de draft-state leeft in dít component en blijft dus intact.
  const [editorEpoch, setEditorEpoch] = useState(0)
  function keepEditing() {
    setDiscardConfirm(null)
    setEditorEpoch((e) => e + 1)
  }
  // IDs where the user clicked "Overnemen" in this session. We track the
  // click explicitly rather than inferring from value-equality, so a user
  // who manually types the same number isn't falsely marked "Overgenomen".
  // Cleared when the user edits the amount field afterwards.
  const [takenOverIds, setTakenOverIds] = useState<Set<string>>(new Set())

  // Delete confirmation
  const [pendingDelete, setPendingDelete] = useState<{ ids: string[]; name: string } | null>(null)

  // Template flow state
  const [selectedTemplate, setSelectedTemplate] = useState<BudgetTemplateId | null>(null)
  const [templateIncome, setTemplateIncome] = useState<number>(0)
  const [templateDraft, setTemplateDraft] = useState<DraftBudget[]>([])
  const [confirmText, setConfirmText] = useState('')

  const { addToast } = useToast()

  // Sleep-sensoren: kleine afstand vóór activatie zodat tikken op de inputs
  // niet als drag wordt opgevat (de listeners zitten bovendien alléén op de
  // grip-handle). Keyboard-sensor voor toetsenbordherordening.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // Reset state when sheet transitions from closed → open. Sibling prop
  // changes (budgets, amounts) are intentionally captured only at open-time
  // so the user's in-flight draft isn't wiped by a background refresh.
  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!open) return
    setDraft(treeToDraft(budgets, budgetAmounts, effectiveFrom))
    setView('tree')
    setSelectedTemplate(null)
    setTemplateIncome(Math.round(totalIncome) || 2500)
    setTemplateDraft([])
    setConfirmText('')
    setError(null)
    setPendingDelete(null)
    setTakenOverIds(new Set())
  }, [open])
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  // ── Derived ──────────────────────────────────────────────────
  const activeDraft = view === 'tree' ? draft : templateDraft
  const grouped = useMemo(() => groupForRender(activeDraft), [activeDraft])

  const totalCarry = useMemo(() => {
    const period = formatPeriod(monthDate)
    return activeDraft.reduce((sum, row) => {
      if (row.budgetType === 'income' || row.budgetType === 'archive') return sum
      const rolls = rollovers.filter((r) => r.budget_id === row.id)
      return sum + getCarriedAmount(rolls, period)
    }, 0)
  }, [activeDraft, rollovers, monthDate])

  const allocatedTotal = useMemo(() => {
    // Only rows without children contribute (children are the leaves)
    const parentIds = new Set(activeDraft.filter((r) => !r.parentId).map((r) => r.id))
    return activeDraft.reduce((sum, row) => {
      if (row.budgetType === 'income' || row.budgetType === 'archive') return sum
      const hasChildren = activeDraft.some((r) => r.parentId === row.id)
      if (parentIds.has(row.id) && hasChildren) return sum
      return sum + (row.amount ?? row.defaultLimit ?? 0)
    }, 0)
  }, [activeDraft])

  const incomeTotal = useMemo(() => {
    return activeDraft
      .filter((r) => r.budgetType === 'income' && !activeDraft.some((c) => c.parentId === r.id))
      .reduce((sum, r) => sum + (r.amount ?? r.defaultLimit ?? 0), 0)
  }, [activeDraft])

  const effectiveIncome = incomeTotal > 0 ? incomeTotal : totalIncome
  const teVerdelen = effectiveIncome - allocatedTotal - totalCarry

  const diff = useMemo(
    () => computeBudgetPlanDiff(budgets, draft, budgetAmounts, effectiveFrom),
    [budgets, draft, budgetAmounts, effectiveFrom],
  )
  const changes = countDiff(diff)

  // ── Tree mutations ────────────────────────────────────────────
  function updateRow(id: string, patch: Partial<DraftBudget>) {
    setDraft((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
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
    if (!row) return
    // If parent: collect children too
    const childIds = draft.filter((r) => r.parentId === id).map((r) => r.id)
    setPendingDelete({ ids: [id, ...childIds], name: row.name || 'Naamloos budget' })
  }

  function confirmDelete() {
    if (!pendingDelete) return
    // Sta je in het detail-subscherm van een budget dat zojuist is verwijderd,
    // keer dan terug naar de boom.
    if (detailId && pendingDelete.ids.includes(detailId)) {
      setView('tree')
      setDetailId(null)
    }
    setDraft((prev) => prev.filter((r) => !pendingDelete.ids.includes(r.id)))
    setPendingDelete(null)
  }

  function resetAll() {
    setDraft(treeToDraft(budgets, budgetAmounts, effectiveFrom))
  }

  // ── Herordenen ───────────────────────────────────────────────
  // Eén DndContext over de hele boom; per groep (top-level per type, of de
  // kinderen van één ouder) een eigen SortableContext. We herordenen alléén
  // binnen dezelfde groep en hernummeren `sortOrder` 0..n — de diff pikt dat
  // op als sort_order-update, de RPC bewaart het. Geen herouderen in v1.
  function groupKey(r: DraftBudget): string {
    return r.parentId ?? `top:${r.budgetType}`
  }

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

  // ── Template flow ────────────────────────────────────────────
  function openTemplatePicker() {
    setSelectedTemplate(null)
    setConfirmText('')
    setView('template-pick')
  }

  function selectTemplate(id: BudgetTemplateId) {
    const income = templateIncome || 2500
    setSelectedTemplate(id)
    setTemplateDraft(buildTemplateDraft(id, income))
    setView('template-preview')
  }

  /**
   * Bouw de template-draft uit de gedeelde, canonieke seed-builder
   * (`buildTemplateSeed`). De seed levert de volledige hiërarchie met de
   * canonieke slug, naam, icoon en `budget_type` per budget — de editor
   * verzint hier dus niets meer zelf (geen `${slug}-parent`, geen 'Circle',
   * geen type-gok). Childless hoofdbudgetten (minimalistisch) komen als parent
   * zónder children, met hun eigen `default_limit` als bedrag; de tree- en
   * preview-views rekenen daar correct mee (parent zonder kinderen = leaf).
   */
  function buildTemplateDraft(
    templateId: BudgetTemplateId,
    income: number,
  ): DraftBudget[] {
    const seed = buildTemplateSeed(templateId, income)
    const next: DraftBudget[] = []

    seed.forEach((parent, parentIdx) => {
      const parentId = makeTmpId()
      const children = parent.children ?? []
      next.push({
        id: parentId,
        parentId: null,
        name: parent.name,
        slug: parent.slug,
        icon: parent.icon,
        description: parent.description ?? null,
        budgetType: parent.budget_type,
        defaultLimit: parent.default_limit,
        isEssential: parent.is_essential,
        sortOrder: parent.sort_order ?? parentIdx,
        interval: 'monthly',
        rolloverType: 'reset',
        // Een hoofdbudget mét children leidt zijn bedrag af van de kinderen
        // (amount = null → de view toont de som). Een childless hoofdbudget
        // (minimalistisch) draagt zelf het bedrag.
        amount: children.length > 0 ? null : parent.default_limit,
        ...NEW_BUDGET_DETAIL_DEFAULTS,
      })
      children.forEach((child, idx) => {
        next.push({
          id: makeTmpId(),
          parentId,
          name: child.name,
          slug: child.slug,
          icon: child.icon,
          description: child.description ?? null,
          budgetType: parent.budget_type,
          defaultLimit: child.default_limit,
          isEssential: false,
          sortOrder: idx,
          interval: 'monthly',
          rolloverType: 'reset',
          amount: child.default_limit,
          ...NEW_BUDGET_DETAIL_DEFAULTS,
        })
      })
    })

    return next
  }

  function updateTemplateRow(id: string, patch: Partial<DraftBudget>) {
    setTemplateDraft((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  function onTemplateIncomeChange(income: number) {
    setTemplateIncome(income)
    if (!selectedTemplate) return
    setTemplateDraft(buildTemplateDraft(selectedTemplate, income || 2500))
  }

  function applyTemplateToDraft() {
    setDraft(templateDraft)
    setView('tree')
    setConfirmText('')
  }

  // ── Save ─────────────────────────────────────────────────────
  async function handleSave() {
    if (saving || changes === 0) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/budgets/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(diff),
      })
      const body = await res.json()
      if (!res.ok || body.error) {
        setError(body.error ?? 'Onbekende fout')
        setSaving(false)
        return
      }
      addToast({
        type: 'success',
        title: 'Je budgetplan is bijgewerkt',
        message: summarizeCounts(body.counts ?? {}),
      })
      setSaving(false)
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Netwerkfout')
      setSaving(false)
    }
  }

  function handleClose() {
    if (changes > 0) {
      setDiscardConfirm({
        message: 'Je hebt nog niet-opgeslagen wijzigingen. Sluit je dit scherm zonder ze op te slaan?',
        onConfirm: onClose,
      })
      return
    }
    onClose()
  }

  // Open het detail-subscherm voor één budget (bewerkt de draft live).
  function openDetail(id: string) {
    setDetailId(id)
    setView('detail')
  }

  // Escape-hatch: laat de parent het uitgebreide bewerkscherm openen voor
  // eigendom/koppeling. Waarschuwt eerst bij niet-opgeslagen wijzigingen,
  // want de parent sluit deze sheet (draft gaat dan verloren).
  function handleEditAdvanced(id: string) {
    if (!onEditAdvanced) return
    if (changes > 0) {
      setDiscardConfirm({
        message: 'Je hebt nog niet-opgeslagen plan-wijzigingen. Ga je naar het uitgebreide bewerkscherm zonder ze op te slaan?',
        onConfirm: () => onEditAdvanced(id),
      })
      return
    }
    onEditAdvanced(id)
  }

  // ── Render ────────────────────────────────────────────────────
  return (
    <>
    {/* `manageHistory={false}`: deze sheet is URL-gestuurd (`?planEditor=true`)
        en haalt die param bij sluiten zelf met `router.replace` weg. De centrale
        overlay-history zou een tweede claim op dezelfde entry leggen. */}
    <BottomSheet key={editorEpoch} open={open} onClose={handleClose} title="Plan bewerken" size="full" manageHistory={false}>
      {/* Editorial intro — kicker-met-streep + deck (italic Source Serif).
          BottomSheet levert al de Playfair-titel in zijn header-bar; deze
          intro geeft context (welke maand, wat je hier doet) zonder dubbele
          kop. Alleen op de tree-view — template-flows hebben hun eigen
          context-headers. */}
      {view === 'tree' && (
        <div className="border-b border-[var(--border-ed)] px-4 pb-3 pt-4 sm:px-6 sm:pt-5">
          <div className="flex items-center gap-2.5">
            <span className="inline-block h-px w-7 bg-[var(--module-active-500)]" aria-hidden />
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
              Budgetplan · {monthLabel}
            </span>
          </div>
          <p
            className="mt-2 max-w-[60ch] border-l-2 border-[var(--module-active-500)] pl-3 text-sm italic text-[var(--ink-2)]"
            style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
          >
            Pas bedragen en namen aan, wissel een icoon, sleep om te ordenen, of voeg een budget toe per type. Tik op een rij voor <em>details</em> (doeltype, prioriteit, rollover).
          </p>
        </div>
      )}

      {/* Toolbar */}
      {view === 'tree' && (
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border-ed)] bg-[var(--subtle)]/40 px-4 py-2.5 sm:px-6">
          <button
            type="button"
            onClick={openTemplatePicker}
            className="inline-flex items-center gap-1.5 rounded-[var(--r)] border border-[var(--border-md)] bg-[var(--paper)] px-3 py-1.5 text-xs font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]"
          >
            <LayoutTemplate className="h-3.5 w-3.5" />
            Template toepassen
          </button>
          <button
            type="button"
            onClick={resetAll}
            disabled={changes === 0}
            className="inline-flex items-center gap-1.5 rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-1.5 text-xs font-medium text-[var(--ink-3)] hover:text-[var(--ink-2)] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Wijzigingen terugdraaien
          </button>
        </div>
      )}

      {view === 'tree' && (
        <div className="px-4 pb-40 pt-4 sm:px-6">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <TreeSection
              grouped={grouped}
              onAddTopLevel={addTopLevel}
              onAddChild={addChildOf}
              onUpdate={updateRow}
              onAmountInput={handleAmountInput}
              onTakeOver={handleTakeOver}
              takenOverIds={takenOverIds}
              onOpenDetail={openDetail}
              monthlyAverages={monthlyAverages}
            />
          </DndContext>
        </div>
      )}

      {/* Detail-subscherm — bewerkt de geselecteerde draft-rij; "Opslaan"
          gebeurt nog steeds via de boom-footer (terug → Opslaan). */}
      {view === 'detail' && (() => {
        const row = detailId ? draft.find((r) => r.id === detailId) : null
        if (!row) return null
        const kids = draft.filter((r) => r.parentId === row.id)
        const childSum = kids.reduce((s, k) => s + (k.amount ?? k.defaultLimit ?? 0), 0)
        const amountReadOnly = kids.length > 0
        const amountValue = amountReadOnly ? childSum : (row.amount ?? row.defaultLimit ?? 0)
        return (
          <BudgetDetailPane
            row={row}
            amountValue={amountValue}
            amountReadOnly={amountReadOnly}
            average={monthlyAverages[row.id]}
            takenOver={takenOverIds.has(row.id)}
            onUpdate={updateRow}
            onAmountInput={handleAmountInput}
            onTakeOver={handleTakeOver}
            onDelete={requestDelete}
            onBack={() => { setView('tree'); setDetailId(null) }}
            onEditAdvanced={onEditAdvanced ? handleEditAdvanced : undefined}
          />
        )
      })()}

      {/* Template picker step */}
      {view === 'template-pick' && (
        <TemplatePicker
          templates={BUDGET_TEMPLATES}
          templateIncome={templateIncome}
          onIncomeChange={setTemplateIncome}
          onPick={selectTemplate}
          onBack={() => setView('tree')}
        />
      )}

      {/* Template preview step */}
      {view === 'template-preview' && selectedTemplate && (
        <TemplatePreview
          templateName={BUDGET_TEMPLATES.find((t) => t.id === selectedTemplate)?.name ?? ''}
          grouped={grouped}
          templateIncome={templateIncome}
          onIncomeChange={onTemplateIncomeChange}
          onUpdateAmount={(id, amount) => updateTemplateRow(id, { amount })}
          onNext={() => setView('template-confirm')}
          onBack={() => setView('template-pick')}
        />
      )}

      {/* Template confirm step */}
      {view === 'template-confirm' && selectedTemplate && (
        <TemplateConfirm
          templateName={BUDGET_TEMPLATES.find((t) => t.id === selectedTemplate)?.name ?? ''}
          confirmText={confirmText}
          onConfirmTextChange={setConfirmText}
          onConfirm={applyTemplateToDraft}
          onBack={() => setView('template-preview')}
          effectiveFrom={effectiveFrom}
        />
      )}

      {/* Footer: Te verdelen + save */}
      {view === 'tree' && (
        <div
          className="sticky bottom-0 left-0 right-0 border-t border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3 shadow-[0_-8px_16px_-8px_rgba(0,0,0,0.08)] sm:px-6"
          style={{ paddingBottom: 'calc(0.75rem + var(--mobile-nav-clearance))' }}
        >
          {error && (
            <div className="mb-2 flex items-start gap-2 rounded-[var(--r)] border border-red-200 bg-red-50 px-3 py-2" role="alert">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <div
              className={`flex-1 rounded-[var(--r)] border px-3 py-2 ${
                teVerdelen >= 0 ? 'border-positive/20 bg-positive/10' : 'border-negative/20 bg-negative/10'
              }`}
            >
              <p className={`text-[10px] font-semibold uppercase tracking-[0.08em] ${teVerdelen >= 0 ? 'text-positive' : 'text-negative'}`}>
                Te verdelen
              </p>
              <p className={`font-mono text-sm font-bold tabular-nums ${teVerdelen >= 0 ? 'text-positive' : 'text-negative'}`}>
                {teVerdelen >= 0 ? '' : '–'}{<MaskedAmount value={Math.abs(teVerdelen)} tone="wil" />}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="border border-[var(--ink)] bg-[var(--paper)] px-3 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--subtle)] min-h-[44px]"
                style={{ fontFamily: 'var(--font-inter, system-ui, sans-serif)' }}
              >
                Annuleren
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || changes === 0}
                className="inline-flex items-center gap-1.5 bg-[var(--ink)] px-4 py-2 text-sm font-medium text-[var(--paper)] hover:bg-[var(--ink-2)] disabled:cursor-not-allowed disabled:opacity-50 min-h-[44px]"
                style={{ fontFamily: 'var(--font-inter, system-ui, sans-serif)' }}
              >
                <Save className="h-4 w-4" />
                {saving ? 'Opslaan…' : changes > 0 ? `Opslaan — ${changes} wijziging${changes === 1 ? '' : 'en'}` : 'Geen wijzigingen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {pendingDelete && (
        <div
          className="absolute inset-0 z-10 flex items-end justify-center bg-[var(--scrim)] px-4 pb-6 sm:items-center sm:pb-0"
          role="dialog"
          aria-modal="true"
          onClick={() => setPendingDelete(null)}
        >
          <div
            className="w-full max-w-sm rounded-[var(--r-lg)] border border-[var(--border-md)] bg-[var(--paper)] p-4 shadow-[var(--s2)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-[var(--ink)]">Budget verwijderen?</p>
                <p className="mt-1 text-xs text-[var(--ink-3)]">
                  &ldquo;{pendingDelete.name}&rdquo; wordt verwijderd
                  {pendingDelete.ids.length > 1 && ` met ${pendingDelete.ids.length - 1} subbudget${pendingDelete.ids.length - 1 === 1 ? '' : 's'}`}.
                  Gekoppelde transacties blijven bestaan maar raken losgekoppeld van dit budget. Definitief pas bij opslaan.
                </p>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-1.5 text-xs font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]"
              >
                Annuleren
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="inline-flex items-center gap-1 rounded-[var(--r)] bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Verwijderen
              </button>
            </div>
          </div>
        </div>
      )}
    </BottomSheet>

    {/* I-05: bevestiging bij niet-opgeslagen wijzigingen — ShellOverlay
        kind="confirm" (focus-trap + Esc) i.p.v. de kale window.confirm.
        Sibling van de sheet (beide portalen naar body), zodat de confirm
        boven de sheet stapelt zonder de scroll-content te nesten. */}
    <ShellOverlay
      open={!!discardConfirm}
      onClose={keepEditing}
      kind="confirm"
      destructive
      title="Niet-opgeslagen wijzigingen"
    >
      <div className="p-6">
        <p className="text-sm leading-relaxed text-[var(--ink-2)]">
          {discardConfirm?.message}
        </p>
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={keepEditing}
            className="border border-[var(--border-ed)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]"
          >
            Annuleren
          </button>
          <button
            type="button"
            onClick={() => {
              const c = discardConfirm
              setDiscardConfirm(null)
              c?.onConfirm()
            }}
            className="bg-negative px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Sluiten zonder opslaan
          </button>
        </div>
      </div>
    </ShellOverlay>
    </>
  )
}

// ── Tree rendering ──────────────────────────────────────────────

function TreeSection({
  grouped,
  onAddTopLevel,
  onAddChild,
  onUpdate,
  onAmountInput,
  onTakeOver,
  takenOverIds,
  onOpenDetail,
  monthlyAverages,
}: {
  grouped: ReturnType<typeof groupForRender>
  onAddTopLevel: (t: BudgetType) => void
  onAddChild: (parentId: string, type: BudgetType) => void
  onUpdate: (id: string, patch: Partial<DraftBudget>) => void
  onAmountInput: (id: string, n: number) => void
  onTakeOver: (id: string, amount: number) => void
  takenOverIds: Set<string>
  onOpenDetail: (id: string) => void
  monthlyAverages: Record<string, { avg: number; months: number }>
}) {
  return (
    <div className="space-y-6">
      {grouped.map(({ type, parents, childrenBy }) => (
        <section key={type}>
          <header className="mb-3 flex items-center justify-between border-b border-[var(--ink)] pb-2">
            <div className="flex items-center gap-2.5">
              <span className="inline-block h-px w-7 bg-[var(--module-active-500)]" aria-hidden />
              <h3 className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--ink-3)]">
                {TYPE_LABEL[type]}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onAddTopLevel(type)}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--ink-3)] hover:text-[var(--ink)] min-h-[32px]"
            >
              <Plus className="h-3.5 w-3.5" />
              Hoofdbudget
            </button>
          </header>

          {type === 'archive' && parents.length > 0 && (
            <p className="mb-3 -mt-1 text-[11px] leading-relaxed text-[var(--ink-4)]">
              <span className="font-medium text-[var(--ink-3)]">Eigen rekening</span> wordt automatisch gevuld
              door transfer-herkenning (verschuivingen tussen je eigen rekeningen). Je stelt hier geen bedrag
              voor in — het telt nergens mee.
            </p>
          )}

          {parents.length === 0 && (
            <p className="py-3 text-xs italic text-[var(--ink-4)]">
              Nog geen {TYPE_LABEL[type].toLowerCase()}. Voeg een hoofdbudget toe.
            </p>
          )}

          <SortableContext items={parents.map((p) => p.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {parents.map((parent) => (
                <SortableParent
                  key={parent.id}
                  parent={parent}
                  kids={childrenBy[parent.id] ?? []}
                  onAddChild={onAddChild}
                  onUpdate={onUpdate}
                  onAmountInput={onAmountInput}
                  onTakeOver={onTakeOver}
                  takenOverIds={takenOverIds}
                  onOpenDetail={onOpenDetail}
                  monthlyAverages={monthlyAverages}
                />
              ))}
            </div>
          </SortableContext>
        </section>
      ))}
    </div>
  )
}

type RowCallbacks = {
  onUpdate: (id: string, patch: Partial<DraftBudget>) => void
  onAmountInput: (id: string, n: number) => void
  onTakeOver: (id: string, amount: number) => void
  takenOverIds: Set<string>
  onOpenDetail: (id: string) => void
  monthlyAverages: Record<string, { avg: number; months: number }>
}

/** Sleep-grip — gedeelde knop-stijl voor parent & child. */
function gripClass(extra = '') {
  return `inline-flex h-7 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-[var(--ink-4)] hover:text-[var(--ink-2)] active:cursor-grabbing ${extra}`
}

function SortableParent({
  parent,
  kids,
  onAddChild,
  onUpdate,
  onAmountInput,
  onTakeOver,
  takenOverIds,
  onOpenDetail,
  monthlyAverages,
}: { parent: DraftBudget; kids: DraftBudget[]; onAddChild: (parentId: string, type: BudgetType) => void } & RowCallbacks) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: parent.id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  const childSum = kids.reduce((s, k) => s + (k.amount ?? k.defaultLimit ?? 0), 0)
  const parentAmount = kids.length > 0 ? childSum : (parent.amount ?? parent.defaultLimit ?? 0)

  const handle = (
    <button ref={setActivatorNodeRef} type="button" aria-label="Versleep budget" {...attributes} {...listeners} className={gripClass()}>
      <GripVertical className="h-4 w-4" />
    </button>
  )

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] ${isDragging ? 'relative z-10 opacity-80 shadow-[var(--s2)]' : ''}`}
    >
      <Row
        row={parent}
        amountValue={parentAmount}
        amountReadOnly={kids.length > 0}
        onUpdate={onUpdate}
        onAmountInput={onAmountInput}
        onTakeOver={onTakeOver}
        takenOver={takenOverIds.has(parent.id)}
        onOpenDetail={onOpenDetail}
        indent={false}
        average={monthlyAverages[parent.id]}
        handle={handle}
      />

      {kids.length > 0 && (
        <div className="border-t border-[var(--border-ed)] bg-[var(--subtle)]/30">
          <SortableContext items={kids.map((k) => k.id)} strategy={verticalListSortingStrategy}>
            {kids.map((child) => (
              <SortableChild
                key={child.id}
                child={child}
                onUpdate={onUpdate}
                onAmountInput={onAmountInput}
                onTakeOver={onTakeOver}
                takenOverIds={takenOverIds}
                onOpenDetail={onOpenDetail}
                monthlyAverages={monthlyAverages}
              />
            ))}
          </SortableContext>
        </div>
      )}

      {/* Deelbudget toevoegen — duidelijke, volledige actie onder de groep
          i.p.v. een gedrongen icoontje per rij. */}
      {parent.budgetType !== 'archive' && (
        <button
          type="button"
          onClick={() => onAddChild(parent.id, parent.budgetType)}
          className="flex w-full items-center gap-1.5 border-t border-dashed border-[var(--border-ed)] px-3 py-2 pl-9 text-[11px] font-medium text-[var(--ink-3)] hover:bg-[var(--subtle)]/50 hover:text-kern-600 sm:pl-12"
        >
          <Plus className="h-3.5 w-3.5" />
          Deelbudget toevoegen
        </button>
      )}
    </div>
  )
}

function SortableChild({
  child,
  onUpdate,
  onAmountInput,
  onTakeOver,
  takenOverIds,
  onOpenDetail,
  monthlyAverages,
}: { child: DraftBudget } & RowCallbacks) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: child.id })
  const style = { transform: CSS.Transform.toString(transform), transition }

  const handle = (
    <button ref={setActivatorNodeRef} type="button" aria-label="Versleep deelbudget" {...attributes} {...listeners} className={gripClass()}>
      <GripVertical className="h-4 w-4" />
    </button>
  )

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? 'relative z-10 bg-[var(--paper)] opacity-80 shadow-[var(--s1)]' : ''}>
      <Row
        row={child}
        amountValue={child.amount ?? child.defaultLimit ?? 0}
        amountReadOnly={child.budgetType === 'archive'}
        onUpdate={onUpdate}
        onAmountInput={onAmountInput}
        onTakeOver={onTakeOver}
        takenOver={takenOverIds.has(child.id)}
        onOpenDetail={onOpenDetail}
        indent
        average={monthlyAverages[child.id]}
        handle={handle}
      />
    </div>
  )
}

function Row({
  row,
  amountValue,
  amountReadOnly,
  onUpdate,
  onAmountInput,
  onTakeOver,
  takenOver,
  onOpenDetail,
  indent,
  average,
  handle,
}: {
  row: DraftBudget
  amountValue: number
  amountReadOnly: boolean
  onUpdate: (id: string, patch: Partial<DraftBudget>) => void
  onAmountInput: (id: string, n: number) => void
  onTakeOver: (id: string, amount: number) => void
  takenOver: boolean
  onOpenDetail: (id: string) => void
  indent: boolean
  average?: { avg: number; months: number }
  handle?: React.ReactNode
}) {
  const { masked } = useMaskedAmounts()
  const amountInputId = `amount-${row.id}`

  // 12-month average is hidden for rows without historical data: unsaved
  // temp rows, archived budgets, and parents whose amount is derived from
  // their children.
  const showAverage =
    !!average &&
    average.months > 0 &&
    !isTempId(row.id) &&
    row.budgetType !== 'archive' &&
    !amountReadOnly

  const roundedAvg = average ? Math.round(average.avg) : 0
  const months = average?.months ?? 0
  const averageTitle = `Gemiddelde per maand, afgelopen ${months} maand${months === 1 ? '' : 'en'}`

  return (
    <div className={`px-3 py-2 ${indent ? 'pl-2 sm:pl-6' : ''}`}>
      <div className="flex items-center gap-1.5 sm:gap-2">
        {handle}
        {/* Budget-icoon — nu direct klikbaar (compacte icoon-kiezer). */}
        <BudgetIconPicker
          value={row.icon}
          onChange={(icon) => onUpdate(row.id, { icon })}
          size="sm"
          ariaLabel={`Icoon voor ${row.name || 'budget'}`}
        />
        <input
          type="text"
          value={row.name}
          onChange={(e) => onUpdate(row.id, { name: e.target.value })}
          placeholder={indent ? 'Naam deelbudget' : 'Naam hoofdbudget'}
          aria-label={`Naam ${indent ? 'deelbudget' : 'hoofdbudget'}`}
          className={`min-w-0 flex-1 bg-transparent text-sm text-[var(--ink)] placeholder:text-[var(--ink-4)] focus:outline-none ${isTempId(row.id) ? 'italic' : ''}`}
        />

        {/* Inline 12-month average + Overnemen — sits between the name
            input and the amount input. */}
        {showAverage && average && (
          <div className="hidden shrink-0 items-center gap-1.5 whitespace-nowrap mr-1 sm:flex">
            <span
              className="font-mono tabular-nums text-[11px] text-[var(--ink-3)]"
              title={averageTitle}
            >
              ⌀ {<MaskedAmount value={roundedAvg} tone="wil" />}
            </span>
            <span className="text-[var(--ink-4)]">·</span>
            {takenOver ? (
              <span className="text-[11px] text-[var(--ink-4)] cursor-default">Overgenomen</span>
            ) : (
              <button
                type="button"
                onClick={() => onTakeOver(row.id, roundedAvg)}
                aria-label={`Neem gemiddelde van ${formatMaskedCurrency(roundedAvg, masked)} over als budgetbedrag`}
                className="py-1 text-[11px] text-[var(--ink-2)] underline underline-offset-2 decoration-[var(--border-ed)] hover:text-[var(--ink)] hover:decoration-[var(--ink-2)] transition-colors duration-150"
              >
                Overnemen
              </button>
            )}
          </div>
        )}

        <div className="relative w-20 sm:w-28">
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 font-mono text-xs text-[var(--ink-3)]">€</span>
          <label htmlFor={amountInputId} className="sr-only">
            Bedrag voor {row.name || 'budget'}
          </label>
          {amountReadOnly ? (
            <span
              id={amountInputId}
              className="block w-full py-1.5 pl-6 pr-2 text-right font-mono text-sm tabular-nums text-[var(--ink-3)]"
              aria-label={`Totaal ${formatMaskedCurrency(amountValue, masked)}`}
            >
              {amountValue.toLocaleString('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </span>
          ) : (
            <input
              id={amountInputId}
              type="number"
              inputMode="decimal"
              min="0"
              step="1"
              value={amountValue}
              onChange={(e) => {
                const n = Number(e.target.value)
                onAmountInput(row.id, isNaN(n) ? 0 : n)
              }}
              className="w-full rounded-[var(--r)] border border-[var(--border-md)] py-1.5 pl-6 pr-2 text-right font-mono text-sm tabular-nums text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
            />
          )}
        </div>

        {/* Details — opent het detail-subscherm (doeltype, prioriteit,
            rollover, verwijderen, …). */}
        <button
          type="button"
          onClick={() => onOpenDetail(row.id)}
          aria-label={`Details van ${row.name || 'budget'}`}
          title="Details"
          className="inline-flex h-9 w-8 shrink-0 items-center justify-center rounded-[var(--r)] text-[var(--ink-3)] hover:bg-[var(--subtle)] hover:text-[var(--ink)]"
        >
          <SlidersHorizontal className="h-4 w-4" />
        </button>
      </div>

      {/* Mobile fallback (<640px): show the average mini-row below. */}
      {showAverage && average && (
        <div className="mt-1 flex items-center justify-end gap-1.5 sm:hidden" style={{ paddingRight: 'calc(5rem + 2.5rem)' }}>
          <span
            className="font-mono tabular-nums text-[11px] text-[var(--ink-3)]"
            title={averageTitle}
          >
            ⌀ {<MaskedAmount value={roundedAvg} tone="wil" />}
          </span>
          <span className="text-[var(--ink-4)]">·</span>
          {takenOver ? (
            <span className="text-[11px] text-[var(--ink-4)] cursor-default">Overgenomen</span>
          ) : (
            <button
              type="button"
              onClick={() => onTakeOver(row.id, roundedAvg)}
              aria-label={`Neem gemiddelde van ${formatMaskedCurrency(roundedAvg, masked)} over als budgetbedrag`}
              className="py-1 px-1 -my-1 -mx-1 text-[11px] text-[var(--ink-2)] underline underline-offset-2 decoration-[var(--border-ed)] hover:text-[var(--ink)] hover:decoration-[var(--ink-2)] transition-colors duration-150"
            >
              Overnemen
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Template flow components ────────────────────────────────────

function TemplatePicker({
  templates,
  templateIncome,
  onIncomeChange,
  onPick,
  onBack,
}: {
  templates: typeof BUDGET_TEMPLATES
  templateIncome: number
  onIncomeChange: (n: number) => void
  onPick: (id: BudgetTemplateId) => void
  onBack: () => void
}) {
  return (
    <div className="px-4 py-5 sm:px-6">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-1 text-xs text-[var(--ink-3)] hover:text-[var(--ink-2)]"
      >
        <X className="h-3.5 w-3.5" /> Terug naar tree
      </button>

      <h3 className="text-lg font-semibold text-[var(--ink)]">Kies een template</h3>
      <p className="mt-1 text-xs text-[var(--ink-3)]">
        Start met een kant-en-klare opzet. Je kunt bedragen straks aanpassen vóór je bevestigt.
      </p>

      <div className="mt-4">
        <label htmlFor="tpl-income" className="mb-1 block text-xs font-medium text-[var(--ink-2)]">
          Netto maandinkomen
        </label>
        <div className="relative w-40">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-[var(--ink-3)]">€</span>
          <input
            id="tpl-income"
            type="number"
            inputMode="decimal"
            min="0"
            step="50"
            value={templateIncome}
            onChange={(e) => onIncomeChange(Number(e.target.value) || 0)}
            className="w-full rounded-[var(--r)] border border-[var(--border-md)] py-2 pl-7 pr-3 font-mono text-sm tabular-nums text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
          />
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {templates.map((tpl) => {
          const Icon = tpl.icon
          return (
            <button
              key={tpl.id}
              type="button"
              onClick={() => onPick(tpl.id)}
              className="group flex w-full items-start gap-3 rounded-[var(--r-lg)] border-2 border-[var(--border-ed)] bg-[var(--paper)] p-4 text-left transition-all hover:border-kern-300 hover:shadow-md active:scale-[0.99] min-h-[72px]"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r)] bg-kern-50 group-hover:bg-kern-100">
                <Icon className="h-5 w-5 text-kern-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-3">
                  <h4 className="text-sm font-semibold text-[var(--ink)]">{tpl.name}</h4>
                  <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">{tpl.subtitle}</span>
                </div>
                <p className="mt-0.5 text-xs text-[var(--ink-3)]">{tpl.description}</p>
              </div>
              <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-[var(--ink-4)] group-hover:text-kern-600" />
            </button>
          )
        })}
      </div>
    </div>
  )
}

function TemplatePreview({
  templateName,
  grouped,
  templateIncome,
  onIncomeChange,
  onUpdateAmount,
  onNext,
  onBack,
}: {
  templateName: string
  grouped: ReturnType<typeof groupForRender>
  templateIncome: number
  onIncomeChange: (n: number) => void
  onUpdateAmount: (id: string, amount: number) => void
  onNext: () => void
  onBack: () => void
}) {
  return (
    <>
      <div className="px-4 py-5 sm:px-6">
        <button
          type="button"
          onClick={onBack}
          className="mb-4 inline-flex items-center gap-1 text-xs text-[var(--ink-3)] hover:text-[var(--ink-2)]"
        >
          <X className="h-3.5 w-3.5" /> Andere template kiezen
        </button>

        <h3 className="text-lg font-semibold text-[var(--ink)]">Preview: {templateName}</h3>
        <p className="mt-1 text-xs text-[var(--ink-3)]">
          Pas bedragen aan voordat je bevestigt. Bij &ldquo;Vervangen&rdquo; raak je je huidige plan kwijt vanaf deze maand.
        </p>

        <div className="mt-4 flex items-center gap-3">
          <label htmlFor="preview-income" className="text-xs font-medium text-[var(--ink-2)]">
            Netto maandinkomen
          </label>
          <div className="relative w-32">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-[var(--ink-3)]">€</span>
            <input
              id="preview-income"
              type="number"
              inputMode="decimal"
              min="0"
              step="50"
              value={templateIncome}
              onChange={(e) => onIncomeChange(Number(e.target.value) || 0)}
              className="w-full rounded-[var(--r)] border border-[var(--border-md)] py-1.5 pl-7 pr-3 font-mono text-sm tabular-nums text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
            />
          </div>
        </div>

        <div className="mt-6 space-y-5 pb-40">
          {grouped.map(({ type, parents, childrenBy }) => (
            parents.length > 0 && (
              <section key={type}>
                <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-4)]">
                  {TYPE_LABEL[type]}
                </h4>
                {parents.map((parent) => {
                  const kids = childrenBy[parent.id] ?? []
                  // Hoofdbudget zonder deelbudgetten (minimalistisch): je boekt
                  // er direct op, dus het bedrag is hier bewerkbaar in plaats
                  // van een afgeleide som.
                  const childless = kids.length === 0 && parent.budgetType !== 'income' && parent.budgetType !== 'archive'
                  return (
                    <div key={parent.id} className="mb-2 rounded-[var(--r)] border border-[var(--border-ed)]">
                      <div className="flex items-center justify-between gap-2 px-3 py-2">
                        <span className="min-w-0 flex-1 text-sm font-medium text-[var(--ink)]">{parent.name}</span>
                        {childless ? (
                          <div className="relative w-24 shrink-0">
                            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 font-mono text-xs text-[var(--ink-3)]">€</span>
                            <input
                              type="number"
                              inputMode="decimal"
                              min="0"
                              step="10"
                              value={parent.amount ?? parent.defaultLimit ?? 0}
                              onChange={(e) => onUpdateAmount(parent.id, Number(e.target.value) || 0)}
                              className="w-full rounded-[var(--r)] border border-[var(--border-md)] py-1 pl-5 pr-2 text-right font-mono text-xs tabular-nums text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
                              aria-label={`${parent.name} bedrag`}
                            />
                          </div>
                        ) : (
                          <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--ink-3)]">
                            {<MaskedAmount value={kids.reduce((s, k) => s + (k.amount ?? 0), 0)} tone="wil" />}
                          </span>
                        )}
                      </div>
                      {childless && (
                        <p className="border-t border-[var(--border-ed)] bg-[var(--subtle)]/30 px-3 py-1.5 text-[11px] text-[var(--ink-3)]">
                          Je boekt transacties direct op dit potje.
                        </p>
                      )}
                      {kids.map((child) => (
                        <div key={child.id} className="flex items-center gap-2 border-t border-[var(--border-ed)] bg-[var(--subtle)]/30 px-3 py-1.5 pl-6 sm:pl-10">
                          <span className="flex-1 text-xs text-[var(--ink-2)]">{child.name}</span>
                          <div className="relative w-24">
                            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 font-mono text-xs text-[var(--ink-3)]">€</span>
                            <input
                              type="number"
                              inputMode="decimal"
                              min="0"
                              step="10"
                              value={child.amount ?? 0}
                              onChange={(e) => onUpdateAmount(child.id, Number(e.target.value) || 0)}
                              className="w-full rounded-[var(--r)] border border-[var(--border-md)] py-1 pl-5 pr-2 text-right font-mono text-xs tabular-nums text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
                              aria-label={`${child.name} bedrag`}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </section>
            )
          ))}
        </div>
      </div>

      <div
        className="sticky bottom-0 left-0 right-0 border-t border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3 sm:px-6"
        style={{ paddingBottom: 'calc(0.75rem + var(--mobile-nav-clearance))' }}
      >
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onBack}
            className="rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)] min-h-[44px]"
          >
            Terug
          </button>
          <button
            type="button"
            onClick={onNext}
            className="inline-flex items-center gap-1.5 rounded-[var(--r)] bg-kern-600 px-4 py-2 text-sm font-medium text-white hover:bg-kern-700 min-h-[44px]"
          >
            Volgende
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  )
}

function TemplateConfirm({
  templateName,
  confirmText,
  onConfirmTextChange,
  onConfirm,
  onBack,
  effectiveFrom,
}: {
  templateName: string
  confirmText: string
  onConfirmTextChange: (s: string) => void
  onConfirm: () => void
  onBack: () => void
  effectiveFrom: string
}) {
  const ready = confirmText.trim().toUpperCase() === 'VERVANG'
  return (
    <>
      <div className="px-4 py-5 sm:px-6">
        <button
          type="button"
          onClick={onBack}
          className="mb-4 inline-flex items-center gap-1 text-xs text-[var(--ink-3)] hover:text-[var(--ink-2)]"
        >
          <X className="h-3.5 w-3.5" /> Terug naar preview
        </button>

        <div className="rounded-[var(--r-lg)] border-2 border-red-300 bg-red-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
            <div>
              <h3 className="text-sm font-semibold text-red-900">
                Dit vervangt je huidige budgetplan
              </h3>
              <p className="mt-1 text-xs text-red-800">
                Template <strong>{templateName}</strong> vervangt je huidige budgetten vanaf {effectiveFrom}.
                Historische bedragen (vóór deze maand) blijven behouden. Gekoppelde transacties blijven bestaan maar raken losgekoppeld van verwijderde budgets.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <label htmlFor="confirm-input" className="mb-1 block text-xs font-medium text-[var(--ink-2)]">
            Typ <strong className="font-mono">VERVANG</strong> om te bevestigen
          </label>
          <input
            id="confirm-input"
            type="text"
            value={confirmText}
            onChange={(e) => onConfirmTextChange(e.target.value)}
            className="w-48 rounded-[var(--r)] border border-[var(--border-md)] px-3 py-2 font-mono text-sm uppercase tracking-wider text-[var(--ink)] outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
            autoComplete="off"
            autoCapitalize="characters"
          />
          <p className="mt-2 flex items-center gap-1 text-[11px] text-[var(--ink-3)]">
            <Info className="h-3 w-3" />
            De template wordt pas écht opgeslagen wanneer je daarna op &ldquo;Opslaan&rdquo; klikt.
          </p>
        </div>
      </div>

      <div
        className="sticky bottom-0 left-0 right-0 border-t border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3 sm:px-6"
        style={{ paddingBottom: 'calc(0.75rem + var(--mobile-nav-clearance))' }}
      >
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onBack}
            className="rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)] min-h-[44px]"
          >
            Terug
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!ready}
            className="inline-flex items-center gap-1.5 rounded-[var(--r)] bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40 min-h-[44px]"
          >
            <Check className="h-4 w-4" />
            Vervangen
          </button>
        </div>
      </div>
    </>
  )
}

// ── Helpers ─────────────────────────────────────────────────────

function summarizeCounts(counts: Record<string, number>): string {
  const bits: string[] = []
  if (counts.inserted) bits.push(`${counts.inserted} toegevoegd`)
  if (counts.updated) bits.push(`${counts.updated} bijgewerkt`)
  if (counts.deleted) bits.push(`${counts.deleted} verwijderd`)
  if (counts.amounts_upserted) bits.push(`${counts.amounts_upserted} bedragen gezet`)
  return bits.join(' · ') || 'Plan is opgeslagen'
}
