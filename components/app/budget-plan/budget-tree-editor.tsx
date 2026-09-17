'use client'

import { Plus, Trash2, AlertTriangle, GripVertical, SlidersHorizontal } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useMemo, type ReactNode } from 'react'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { ModalFooter } from '@/components/app/modal-footer'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { BudgetIconPicker } from '@/components/app/budget-icon-picker'
import { BudgetDetailPane } from '@/components/app/budget-detail-pane'
import { MaskedAmount } from '@/components/app/masked-amount'
import { tapTargetClass } from '@/components/editorial/tap-target'
import { isTempId, type DraftBudget } from '@/lib/budget-plan-diff'
import {
  EIGEN_REKENING_UITLEG,
  TYPE_LABEL,
  groupForRender,
  isProtectedBudget,
  type BudgetType,
  type GroupedDraft,
} from '@/lib/budget-templates/template-draft'
import type { BudgetDraftState, PendingDelete } from './use-budget-draft'

type HeadingLevel = 'h2' | 'h3'

/**
 * De bewerkbare budgetboom zonder omlijsting: secties per type, sleepbare
 * hoofd- en deelbudgetten, het detail-subscherm en de verwijderbevestiging.
 * Verhuisd uit `budget-plan-editor-sheet.tsx` (sep 2026) zodat de plan-editor
 * in de app en de budgetstap in de onboarding dezelfde boom tonen.
 *
 * De state leeft in `useBudgetDraft` bij de host; opslaan ook.
 *
 * `deleteConfirm`: `inline` is de bestaande laag binnen de plan-sheet (die legt
 * 'm over zijn eigen scroll-content); `overlay` is een `ShellOverlay` voor een
 * host zonder omliggende sheet, zoals de onboarding.
 */
export function BudgetTreeEditor({
  state,
  monthlyAverages = {},
  onEditAdvanced,
  headingLevel = 'h3',
  deleteConfirm = 'inline',
  className,
}: {
  state: BudgetDraftState
  monthlyAverages?: Record<string, { avg: number; months: number }>
  onEditAdvanced?: (budgetId: string) => void
  headingLevel?: HeadingLevel
  deleteConfirm?: 'inline' | 'overlay'
  /** Wrapper-classes voor de boom (padding hoort bij de host). */
  className?: string
}) {
  const { draft, detailId } = state
  const grouped = useMemo(() => groupForRender(draft), [draft])

  // Sleep-sensoren: kleine afstand vóór activatie zodat tikken op de inputs
  // niet als drag wordt opgevat (de listeners zitten bovendien alléén op de
  // grip-handle). Keyboard-sensor voor toetsenbordherordening.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const detailRow = detailId ? draft.find((r) => r.id === detailId) ?? null : null

  let body: ReactNode
  if (detailRow) {
    const kids = draft.filter((r) => r.parentId === detailRow.id)
    const childSum = kids.reduce((s, k) => s + (k.amount ?? k.defaultLimit ?? 0), 0)
    const amountReadOnly = kids.length > 0
    const amountValue = amountReadOnly ? childSum : (detailRow.amount ?? detailRow.defaultLimit ?? 0)
    body = (
      <BudgetDetailPane
        row={detailRow}
        amountValue={amountValue}
        amountReadOnly={amountReadOnly}
        average={monthlyAverages[detailRow.id]}
        takenOver={state.takenOverIds.has(detailRow.id)}
        onUpdate={state.updateRow}
        onAmountInput={state.handleAmountInput}
        onTakeOver={state.handleTakeOver}
        onDelete={state.requestDelete}
        onBack={state.closeDetail}
        onEditAdvanced={onEditAdvanced}
      />
    )
  } else {
    body = (
      <div className={className}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={state.handleDragEnd}>
          <TreeSection
            grouped={grouped}
            headingLevel={headingLevel}
            onAddTopLevel={state.addTopLevel}
            onAddChild={state.addChildOf}
            onUpdate={state.updateRow}
            onAmountInput={state.handleAmountInput}
            onTakeOver={state.handleTakeOver}
            takenOverIds={state.takenOverIds}
            onOpenDetail={state.openDetail}
            monthlyAverages={monthlyAverages}
          />
        </DndContext>
      </div>
    )
  }

  return (
    <>
      {body}
      {deleteConfirm === 'inline' ? (
        state.pendingDelete && (
          <InlineDeleteConfirm
            pending={state.pendingDelete}
            onCancel={state.cancelDelete}
            onConfirm={state.confirmDelete}
          />
        )
      ) : (
        <ShellOverlay
          open={!!state.pendingDelete}
          onClose={state.cancelDelete}
          kind="confirm"
          destructive
          title="Budget verwijderen?"
          footer={
            <ModalFooter
              align="end"
              primary={{ label: 'Verwijderen', onClick: state.confirmDelete }}
              secondary={{ label: 'Annuleren', onClick: state.cancelDelete }}
            />
          }
        >
          <p className="p-6 text-sm leading-relaxed text-[var(--ink-2)]">
            {state.pendingDelete && <DeleteMessage pending={state.pendingDelete} />}
          </p>
        </ShellOverlay>
      )}
    </>
  )
}

function DeleteMessage({ pending }: { pending: PendingDelete }) {
  return (
    <>
      &ldquo;{pending.name}&rdquo; wordt verwijderd
      {pending.ids.length > 1 && ` met ${pending.ids.length - 1} subbudget${pending.ids.length - 1 === 1 ? '' : 's'}`}.
      Gekoppelde transacties blijven bestaan maar raken losgekoppeld van dit budget. Definitief pas bij opslaan.
    </>
  )
}

function InlineDeleteConfirm({
  pending,
  onCancel,
  onConfirm,
}: {
  pending: PendingDelete
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div
      className="absolute inset-0 z-10 flex items-end justify-center bg-[var(--scrim)] px-4 pb-6 sm:items-center sm:pb-0"
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
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
              <DeleteMessage pending={pending} />
            </p>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-1.5 text-xs font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]"
          >
            Annuleren
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex items-center gap-1 rounded-[var(--r)] bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Verwijderen
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Tree rendering ──────────────────────────────────────────────

function TreeSection({
  grouped,
  headingLevel,
  onAddTopLevel,
  onAddChild,
  onUpdate,
  onAmountInput,
  onTakeOver,
  takenOverIds,
  onOpenDetail,
  monthlyAverages,
}: {
  grouped: GroupedDraft
  headingLevel: HeadingLevel
  onAddTopLevel: (t: BudgetType) => void
  onAddChild: (parentId: string, type: BudgetType) => void
} & RowCallbacks) {
  const Heading = headingLevel
  return (
    <div className="space-y-6">
      {grouped.map(({ type, parents, childrenBy }) => (
        <section key={type}>
          <header className="mb-3 flex items-center justify-between border-b border-[var(--ink)] pb-2">
            <div className="flex items-center gap-2.5">
              <span className="inline-block h-px w-7 bg-[var(--module-active-500)]" aria-hidden />
              <Heading className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--ink-3)]">
                {TYPE_LABEL[type]}
              </Heading>
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

          {type === 'archive' && parents.some(isProtectedBudget) && (
            <p className="mb-3 -mt-1 text-[11px] leading-relaxed text-[var(--ink-4)]">
              <span className="font-medium text-[var(--ink-3)]">Eigen rekening</span> — {EIGEN_REKENING_UITLEG}{' '}
              Je stelt hier geen bedrag voor in en de post is niet te verwijderen.
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
  const locked = isProtectedBudget(row)

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
          readOnly={locked}
          title={locked ? EIGEN_REKENING_UITLEG : undefined}
          placeholder={indent ? 'Naam deelbudget' : 'Naam hoofdbudget'}
          aria-label={`Naam ${indent ? 'deelbudget' : 'hoofdbudget'}`}
          className={`min-w-0 flex-1 bg-transparent text-sm text-[var(--ink)] placeholder:text-[var(--ink-4)] focus:outline-none ${isTempId(row.id) && !locked ? 'italic' : ''}`}
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
          className={`inline-flex h-9 w-8 shrink-0 items-center justify-center rounded-[var(--r)] text-[var(--ink-3)] hover:bg-[var(--subtle)] hover:text-[var(--ink)] ${tapTargetClass('extend-block')}`}
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
