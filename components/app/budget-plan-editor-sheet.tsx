'use client'

import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, AlertTriangle, Check, X, RotateCcw, Save, LayoutTemplate, ChevronRight, Info } from 'lucide-react'
import { BottomSheet } from '@/components/app/bottom-sheet'

import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { useToast } from '@/components/app/toast-provider'
import { BudgetIcon } from '@/components/app/budget-shared'
import {
  BUDGET_SLUGS,
  type Budget,
  type BudgetWithChildren,
} from '@/lib/budget-data'
import { getCarriedAmount, formatPeriod, type BudgetRollover } from '@/lib/budget-rollover'
import {
  BUDGET_TEMPLATES,
  buildTemplateAmounts,
  type BudgetTemplateId,
} from '@/components/onboarding/onboarding-budgets'
import {
  computeBudgetPlanDiff,
  countDiff,
  isTempId,
  resolveActiveAmount,
  type BudgetAmountLite,
  type DraftBudget,
} from '@/lib/budget-plan-diff'
import { MaskedAmount } from '@/components/app/masked-amount'

type EditorView = 'tree' | 'template-pick' | 'template-preview' | 'template-confirm'

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
  onRequestNewBudget,
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
  /** Aangeroepen vanuit de "+ Nieuw budget"-CTA in de toolbar. De parent
   *  (BudgetsClient) sluit de sheet en opent de uitgebreide BudgetForm-pane
   *  via `?newBudget=true`. Bij dirty-state geeft de sheet eerst een
   *  bevestigings-prompt. */
  onRequestNewBudget?: () => void
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
  const [draft, setDraft] = useState<DraftBudget[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
        amount: null,
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
    setDraft((prev) => prev.filter((r) => !pendingDelete.ids.includes(r.id)))
    setPendingDelete(null)
  }

  function resetAll() {
    setDraft(treeToDraft(budgets, budgetAmounts, effectiveFrom))
  }

  // ── Template flow ────────────────────────────────────────────
  function openTemplatePicker() {
    setSelectedTemplate(null)
    setConfirmText('')
    setView('template-pick')
  }

  function selectTemplate(id: BudgetTemplateId) {
    const tpl = BUDGET_TEMPLATES.find((t) => t.id === id)
    if (!tpl) return
    const income = templateIncome || 2500
    const amounts = buildTemplateAmounts(income, id)
    const next = buildTemplateDraft(tpl, amounts)
    setSelectedTemplate(id)
    setTemplateDraft(next)
    setView('template-preview')
  }

  function buildTemplateDraft(
    tpl: (typeof BUDGET_TEMPLATES)[number],
    amounts: Record<string, number>,
  ): DraftBudget[] {
    const next: DraftBudget[] = []

    // 1. Income parent + salaris child
    const inkomenId = makeTmpId()
    next.push({
      id: inkomenId, parentId: null, name: 'Inkomen',
      slug: BUDGET_SLUGS.INKOMEN, icon: 'Wallet', description: null,
      budgetType: 'income', defaultLimit: amounts[BUDGET_SLUGS.SALARIS_UITKERING] ?? templateIncome,
      isEssential: true, sortOrder: 0, interval: 'monthly', rolloverType: 'reset', amount: null,
    })
    next.push({
      id: makeTmpId(), parentId: inkomenId, name: 'Salaris & uitkering',
      slug: BUDGET_SLUGS.SALARIS_UITKERING, icon: 'Wallet', description: null,
      budgetType: 'income', defaultLimit: amounts[BUDGET_SLUGS.SALARIS_UITKERING] ?? templateIncome,
      isEssential: true, sortOrder: 0, interval: 'monthly', rolloverType: 'reset',
      amount: amounts[BUDGET_SLUGS.SALARIS_UITKERING] ?? templateIncome,
    })

    // 2. For each category in the template, create a parent and its child slugs
    tpl.categories.forEach((cat, catIdx) => {
      const parentId = makeTmpId()
      const parentType = inferCategoryType(cat.slugs)
      const parentTotal = cat.slugs.reduce((sum, s) => sum + (amounts[s] || 0), 0)
      next.push({
        id: parentId, parentId: null, name: cat.label,
        slug: cat.slugs[0] ? `${cat.slugs[0]}-parent` : null,
        icon: 'Circle', description: null,
        budgetType: parentType, defaultLimit: parentTotal,
        isEssential: parentType !== 'expense' || catIdx < 3,
        sortOrder: catIdx + 1,
        interval: 'monthly', rolloverType: 'reset', amount: null,
      })
      cat.slugs.forEach((slug, idx) => {
        const amt = amounts[slug] ?? 0
        next.push({
          id: makeTmpId(), parentId, name: nameForSlug(slug),
          slug, icon: 'Circle', description: null,
          budgetType: parentType, defaultLimit: amt, isEssential: false,
          sortOrder: idx, interval: 'monthly', rolloverType: 'reset',
          amount: amt,
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
    const tpl = BUDGET_TEMPLATES.find((t) => t.id === selectedTemplate)
    if (!tpl) return
    const amounts = buildTemplateAmounts(income || 2500, selectedTemplate)
    setTemplateDraft(buildTemplateDraft(tpl, amounts))
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
    if (changes > 0 && !confirm('Je hebt nog niet-opgeslagen wijzigingen. Sluiten zonder opslaan?')) return
    onClose()
  }

  function handleRequestNewBudget() {
    if (!onRequestNewBudget) return
    if (changes > 0 && !confirm('Je hebt nog niet-opgeslagen plan-wijzigingen. Doorgaan naar uitgebreid nieuw-budget formulier zonder opslaan?')) return
    onRequestNewBudget()
  }

  // ── Render ────────────────────────────────────────────────────
  return (
    <BottomSheet open={open} onClose={handleClose} title="Plan bewerken" size="full">
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
            Pas bedragen aan, voeg een rij toe per type, of klik op <em>Nieuw budget</em> voor de uitgebreide invoer met icoon, doeltype en prioriteit.
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

          {/* Uitgebreide create-flow — opent een pane met de volledige
              BudgetForm (icoon, prioriteit, doeltype, eigendoms-keuze, …).
              Onderscheidt zich visueel van de twee outline-knoppen via een
              solid ink-fill, en staat rechts uitgelijnd zodat de toolbar
              leest als "bulk-acties links · nieuwe entiteit rechts". */}
          {onRequestNewBudget && (
            <button
              type="button"
              onClick={handleRequestNewBudget}
              className="ml-auto inline-flex items-center gap-1.5 bg-[var(--ink)] px-3 text-xs font-medium leading-none text-[var(--paper)] hover:bg-[var(--ink-2)] min-h-[44px]"
              style={{ fontFamily: 'var(--font-inter, system-ui, sans-serif)' }}
            >
              <Plus className="h-3.5 w-3.5" />
              Nieuw budget
            </button>
          )}
        </div>
      )}

      {view === 'tree' && (
        <div className="px-4 pb-40 pt-4 sm:px-6">
          <TreeSection
            grouped={grouped}
            onAddTopLevel={addTopLevel}
            onAddChild={addChildOf}
            onUpdate={updateRow}
            onAmountInput={handleAmountInput}
            onTakeOver={handleTakeOver}
            takenOverIds={takenOverIds}
            onDelete={requestDelete}
            monthlyAverages={monthlyAverages}
          />
        </div>
      )}

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
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
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
          className="absolute inset-0 z-10 flex items-end justify-center bg-black/30 px-4 pb-6 sm:items-center sm:pb-0"
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
  onDelete,
  monthlyAverages,
}: {
  grouped: ReturnType<typeof groupForRender>
  onAddTopLevel: (t: BudgetType) => void
  onAddChild: (parentId: string, type: BudgetType) => void
  onUpdate: (id: string, patch: Partial<DraftBudget>) => void
  onAmountInput: (id: string, n: number) => void
  onTakeOver: (id: string, amount: number) => void
  takenOverIds: Set<string>
  onDelete: (id: string) => void
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

          {parents.length === 0 && (
            <p className="py-3 text-xs italic text-[var(--ink-4)]">
              Nog geen {TYPE_LABEL[type].toLowerCase()}. Voeg een hoofdbudget toe.
            </p>
          )}

          <div className="space-y-3">
            {parents.map((parent) => {
              const kids = childrenBy[parent.id] ?? []
              const childSum = kids.reduce((s, k) => s + (k.amount ?? k.defaultLimit ?? 0), 0)
              const parentAmount = kids.length > 0 ? childSum : (parent.amount ?? parent.defaultLimit ?? 0)
              return (
                <div key={parent.id} className="rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)]">
                  <Row
                    row={parent}
                    amountValue={parentAmount}
                    amountReadOnly={kids.length > 0}
                    onUpdate={onUpdate}
                    onAmountInput={onAmountInput}
                    onTakeOver={onTakeOver}
                    takenOver={takenOverIds.has(parent.id)}
                    onDelete={onDelete}
                    onAddSibling={() => onAddChild(parent.id, parent.budgetType)}
                    addLabel={kids.length > 0 ? 'Deelbudget' : 'Deelbudget'}
                    indent={false}
                    average={monthlyAverages[parent.id]}
                  />

                  {kids.length > 0 && (
                    <div className="border-t border-[var(--border-ed)] bg-[var(--subtle)]/30">
                      {kids.map((child) => (
                        <Row
                          key={child.id}
                          row={child}
                          amountValue={child.amount ?? child.defaultLimit ?? 0}
                          amountReadOnly={false}
                          onUpdate={onUpdate}
                          onAmountInput={onAmountInput}
                          onTakeOver={onTakeOver}
                          takenOver={takenOverIds.has(child.id)}
                          onDelete={onDelete}
                          onAddSibling={() => onAddChild(parent.id, parent.budgetType)}
                          addLabel="Sibling"
                          indent={true}
                          average={monthlyAverages[child.id]}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      ))}
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
  onDelete,
  onAddSibling,
  addLabel,
  indent,
  average,
}: {
  row: DraftBudget
  amountValue: number
  amountReadOnly: boolean
  onUpdate: (id: string, patch: Partial<DraftBudget>) => void
  onAmountInput: (id: string, n: number) => void
  onTakeOver: (id: string, amount: number) => void
  takenOver: boolean
  onDelete: (id: string) => void
  onAddSibling: () => void
  addLabel: string
  indent: boolean
  average?: { avg: number; months: number }
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
    <div className={`px-3 py-2 ${indent ? 'pl-6 sm:pl-10' : ''}`}>
      <div className="flex items-center gap-2">
        {/* Budget-icoon — visuele herkenning per rij. Klikbaar wijzigen
            niet in de planeditor (light-weight) — dat doet de uitgebreide
            form via "+ Nieuw budget" of de detail-edit-flow. Temp-rows
            tonen het default 'Circle'-icoon (uit makeTmpRow) zodat ook
            ongesaved rijen visueel passen in het ritme. */}
        <span
          className={`inline-flex h-7 w-7 shrink-0 items-center justify-center text-[var(--ink-2)] ${isTempId(row.id) ? 'text-[var(--ink-4)]' : ''}`}
          aria-hidden
        >
          <BudgetIcon name={row.icon} className="h-4 w-4" />
        </span>
        <input
          type="text"
          value={row.name}
          onChange={(e) => onUpdate(row.id, { name: e.target.value })}
          placeholder={indent ? 'Naam deelbudget' : 'Naam hoofdbudget'}
          aria-label={`Naam ${indent ? 'deelbudget' : 'hoofdbudget'}`}
          className={`min-w-0 flex-1 bg-transparent text-sm text-[var(--ink)] placeholder:text-[var(--ink-4)] focus:outline-none ${isTempId(row.id) ? 'italic' : ''}`}
        />

        {/* Inline 12-month average + Overnemen — sits between the name
            input and the amount input. `shrink-0` keeps it from being
            compressed; the extra `mr-1` plus the outer gap-2 yields ~12px
            visual breathing room to the € input so the two read as
            separate units. */}
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
                // py-1 preserves ~23-24px hit area even though the text is
                // 11px; no negative margins because we're in a flex row.
                className="py-1 text-[11px] text-[var(--ink-2)] underline underline-offset-2 decoration-[var(--border-ed)] hover:text-[var(--ink)] hover:decoration-[var(--ink-2)] transition-colors duration-150"
              >
                Overnemen
              </button>
            )}
          </div>
        )}

        <div className="relative w-24 sm:w-28">
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

        <button
          type="button"
          onClick={onAddSibling}
          aria-label={`${addLabel} toevoegen`}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--r)] text-[var(--ink-3)] hover:bg-[var(--subtle)] hover:text-kern-600"
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(row.id)}
          aria-label={`${row.name || 'budget'} verwijderen`}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--r)] text-[var(--ink-4)] hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Mobile fallback (<640px): show the mini-row below the input to
          avoid squeezing the name field under ~140px. Visible only on
          phones; the sm: inline version above hides this via sm:hidden. */}
      {showAverage && average && (
        <div className="mt-1 flex items-center justify-end gap-1.5 sm:hidden" style={{ paddingRight: 'calc(5.5rem + 1rem)' }}>
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
                  return (
                    <div key={parent.id} className="mb-2 rounded-[var(--r)] border border-[var(--border-ed)]">
                      <div className="flex items-center justify-between px-3 py-2">
                        <span className="text-sm font-medium text-[var(--ink)]">{parent.name}</span>
                        <span className="font-mono text-xs tabular-nums text-[var(--ink-3)]">
                          {<MaskedAmount value={kids.reduce((s, k) => s + (k.amount ?? 0), 0)} tone="wil" />}
                        </span>
                      </div>
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
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
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
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
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

function inferCategoryType(slugs: string[]): BudgetType {
  if (slugs.some((s) => s.includes('sparen') || s.includes('investeren'))) return 'savings'
  if (slugs.some((s) => s.includes('aflossing') || s.includes('schulden'))) return 'debt'
  return 'expense'
}

function nameForSlug(slug: string): string {
  const map: Record<string, string> = {
    [BUDGET_SLUGS.HUUR_HYPOTHEEK]: 'Huur/hypotheek',
    [BUDGET_SLUGS.GAS_WATER_LICHT]: 'Gas, water, licht',
    [BUDGET_SLUGS.VERZEKERINGEN_WONEN]: 'Verzekeringen',
    [BUDGET_SLUGS.GEMEENTELIJKE_LASTEN]: 'Gemeentelijke lasten',
    [BUDGET_SLUGS.BOODSCHAPPEN]: 'Boodschappen',
    [BUDGET_SLUGS.HUISHOUDEN_VERZORGING]: 'Huishouden & verzorging',
    [BUDGET_SLUGS.KINDEREN_SCHOOL]: 'Kinderen & school',
    [BUDGET_SLUGS.MEDISCHE_KOSTEN]: 'Medische kosten',
    [BUDGET_SLUGS.BRANDSTOF_OV]: 'Brandstof & OV',
    [BUDGET_SLUGS.AUTO_VASTE_LASTEN]: 'Auto vaste lasten',
    [BUDGET_SLUGS.AUTO_ONDERHOUD]: 'Auto onderhoud',
    [BUDGET_SLUGS.FIETS_DEELVERVOER]: 'Fiets & deelvervoer',
    [BUDGET_SLUGS.UIT_ETEN_HORECA]: 'Uit eten & horeca',
    [BUDGET_SLUGS.VRIJE_TIJD_SPORT]: 'Vrije tijd & sport',
    [BUDGET_SLUGS.VAKANTIE]: 'Vakantie',
    [BUDGET_SLUGS.KLEDING_OVERIGE]: 'Kleding & overige',
    [BUDGET_SLUGS.SPAREN_NOODBUFFER]: 'Noodbuffer',
    [BUDGET_SLUGS.INVESTEREN_FIRE]: 'Investeren / FIRE',
    [BUDGET_SLUGS.SCHULDEN_AFLOSSINGEN]: 'Aflossingen',
    [BUDGET_SLUGS.EXTRA_AFLOSSING_HYPOTHEEK]: 'Extra aflossing hypotheek',
  }
  return map[slug] ?? slug.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

function summarizeCounts(counts: Record<string, number>): string {
  const bits: string[] = []
  if (counts.inserted) bits.push(`${counts.inserted} toegevoegd`)
  if (counts.updated) bits.push(`${counts.updated} bijgewerkt`)
  if (counts.deleted) bits.push(`${counts.deleted} verwijderd`)
  if (counts.amounts_upserted) bits.push(`${counts.amounts_upserted} bedragen gezet`)
  return bits.join(' · ') || 'Plan is opgeslagen'
}
