'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, X, RotateCcw, Save, LayoutTemplate, ChevronRight, Info } from 'lucide-react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'

import { useToast } from '@/components/app/toast-provider'
import {
  type Budget,
  type BudgetWithChildren,
} from '@/lib/budget-data'
import { getCarriedAmount, formatPeriod, type BudgetRollover } from '@/lib/budget-rollover'
import {
  BUDGET_TEMPLATES,
  type BudgetTemplateId,
} from '@/lib/budget-templates/onboarding-presets'
import {
  TYPE_LABEL,
  buildTemplateDraft,
  computeTeVerdelen,
  groupForRender,
} from '@/lib/budget-templates/template-draft'
import {
  computeBudgetPlanDiff,
  countDiff,
  firstOfCurrentMonth,
  resolveActiveAmount,
  detailFieldsFromBudget,
  type BudgetAmountLite,
  type DraftBudget,
} from '@/lib/budget-plan-diff'
import { MaskedAmount } from '@/components/app/masked-amount'
import { BudgetTreeEditor } from '@/components/app/budget-plan/budget-tree-editor'
import { useBudgetDraft } from '@/components/app/budget-plan/use-budget-draft'

// De boom zelf (secties, rijen, detail-subscherm, verwijderbevestiging) woont
// in `components/app/budget-plan/budget-tree-editor.tsx`, de draft-state in
// `use-budget-draft.ts` — gedeeld met de budgetstap in de onboarding. Deze
// sheet levert de omlijsting, de template-flow en het opslaan.
type EditorView = 'tree' | 'template-pick' | 'template-preview' | 'template-confirm'

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
  const effectiveFrom = useMemo(() => firstOfCurrentMonth(monthDate), [monthDate])

  // Krantstijl-datum-label voor de editorial-kicker: "Mei 2026" / "Jan. 2026".
  const monthLabel = useMemo(() => {
    return monthDate.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })
  }, [monthDate])

  const [view, setView] = useState<EditorView>('tree')
  const draftState = useBudgetDraft()
  const { draft } = draftState
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
    draftState.reset(treeToDraft(budgets, budgetAmounts, effectiveFrom))
    setView('tree')
    setSelectedTemplate(null)
    setTemplateIncome(Math.round(totalIncome) || 2500)
    setTemplateDraft([])
    setConfirmText('')
    setError(null)
  }, [open])
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  // De boom (niet het detail-subscherm) is zichtbaar: intro, toolbar en footer.
  const treeVisible = view === 'tree' && !draftState.detailId

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

  const { teVerdelen } = useMemo(
    () => computeTeVerdelen(activeDraft, totalIncome, totalCarry),
    [activeDraft, totalIncome, totalCarry],
  )

  const diff = useMemo(
    () => computeBudgetPlanDiff(budgets, draft, budgetAmounts, effectiveFrom),
    [budgets, draft, budgetAmounts, effectiveFrom],
  )
  const changes = countDiff(diff)

  function resetAll() {
    draftState.reset(treeToDraft(budgets, budgetAmounts, effectiveFrom))
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

  function updateTemplateRow(id: string, patch: Partial<DraftBudget>) {
    setTemplateDraft((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  function onTemplateIncomeChange(income: number) {
    setTemplateIncome(income)
    if (!selectedTemplate) return
    setTemplateDraft(buildTemplateDraft(selectedTemplate, income || 2500))
  }

  function applyTemplateToDraft() {
    draftState.reset(templateDraft)
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

  // ── Footer ────────────────────────────────────────────────────
  // B-018/B-020: de plan-knoppen stonden in een `sticky`-blok ONDERIN de
  // scroll-content, met `--mobile-nav-clearance` als bodempadding. Twee
  // gevolgen op een 384px-viewport: (a) de rij "Te verdelen + Annuleren +
  // Opslaan — N wijzigingen" paste niet en duwde de knoppen buiten beeld,
  // (b) de nav-clearance reserveerde ruimte voor de zwevende nav-pill die
  // een open overlay juist verbergt (lib/overlay-signal.ts). Nu: de gedeelde
  // `footerSlot` van BottomSheet (niet-scrollend blok met bovenrand +
  // safe-area-padding) en één knop die "Terug" heet zolang er niets gewijzigd
  // is en "Opslaan" wordt zodra dat wél zo is (B-022-regel).
  const treeFooter = treeVisible ? (
    <div className="flex flex-col gap-2">
      {error && (
        <div className="flex items-start gap-2 rounded-[var(--r)] border border-red-200 bg-red-50 px-3 py-2" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}
      <div className="flex items-center gap-2">
        <div
          className={`min-w-0 flex-1 rounded-[var(--r)] border px-3 py-2 ${
            teVerdelen >= 0 ? 'border-positive/20 bg-positive/10' : 'border-negative/20 bg-negative/10'
          }`}
        >
          <p className={`text-[10px] font-semibold uppercase tracking-[0.08em] ${teVerdelen >= 0 ? 'text-positive' : 'text-negative'}`}>
            Te verdelen
          </p>
          <p className={`truncate font-mono text-sm font-bold tabular-nums ${teVerdelen >= 0 ? 'text-positive' : 'text-negative'}`}>
            {teVerdelen >= 0 ? '' : '–'}{<MaskedAmount value={Math.abs(teVerdelen)} tone="wil" />}
          </p>
        </div>
        {changes === 0 ? (
          <button
            type="button"
            onClick={handleClose}
            className="min-h-[44px] shrink-0 whitespace-nowrap border border-[var(--ink)] bg-[var(--paper)] px-4 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--subtle)]"
            style={{ fontFamily: 'var(--font-inter, system-ui, sans-serif)' }}
          >
            Terug
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 whitespace-nowrap bg-[var(--ink)] px-4 py-2 text-sm font-medium text-[var(--paper)] hover:bg-[var(--ink-2)] disabled:cursor-not-allowed disabled:opacity-50"
            style={{ fontFamily: 'var(--font-inter, system-ui, sans-serif)' }}
          >
            <Save className="h-4 w-4" />
            {saving ? 'Opslaan…' : `Opslaan — ${changes}`}
          </button>
        )}
      </div>
    </div>
  ) : undefined

  // ── Render ────────────────────────────────────────────────────
  return (
    <>
    {/* `manageHistory={false}`: deze sheet is URL-gestuurd (`?planEditor=true`)
        en haalt die param bij sluiten zelf met `router.replace` weg. De centrale
        overlay-history zou een tweede claim op dezelfde entry leggen. */}
    <BottomSheet key={editorEpoch} open={open} onClose={handleClose} title="Plan bewerken" size="full" manageHistory={false} footerSlot={treeFooter}>
      {/* Editorial intro — kicker-met-streep + deck (italic Source Serif).
          BottomSheet levert al de Playfair-titel in zijn header-bar; deze
          intro geeft context (welke maand, wat je hier doet) zonder dubbele
          kop. Alleen op de tree-view — template-flows hebben hun eigen
          context-headers. */}
      {treeVisible && (
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
      {treeVisible && (
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

      {/* Boom óf detail-subscherm (bewerkt de draft live; "Opslaan" gebeurt
          via de boom-footer) + de verwijderbevestiging. */}
      {view === 'tree' && (
        <BudgetTreeEditor
          state={draftState}
          monthlyAverages={monthlyAverages}
          onEditAdvanced={onEditAdvanced ? handleEditAdvanced : undefined}
          className="px-4 pb-8 pt-4 sm:px-6"
        />
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
        // B-020: géén `--mobile-nav-clearance` — een open overlay verbergt de
        // zwevende nav-pill (lib/overlay-signal.ts), dus die ruimte is dubbelop.
        // Alleen de iOS-safe-area blijft nodig.
        style={{ paddingBottom: 'calc(0.75rem + var(--safe-area-bottom, 0px))' }}
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
        // B-020: géén `--mobile-nav-clearance` — een open overlay verbergt de
        // zwevende nav-pill (lib/overlay-signal.ts), dus die ruimte is dubbelop.
        // Alleen de iOS-safe-area blijft nodig.
        style={{ paddingBottom: 'calc(0.75rem + var(--safe-area-bottom, 0px))' }}
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
