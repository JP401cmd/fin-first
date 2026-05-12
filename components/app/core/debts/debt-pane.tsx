'use client'

/**
 * Slide-in pane voor de individuele-schuld detail-flow op
 * `/core/debts/[type]`. Twee modi:
 *
 *  - **view** (read-only): toont `<DebtDetailModal embedded />`. Footer-knoppen
 *     komen van `<ShellOverlay kind="pane">` zelf — primary "Bewerken",
 *     secondary "Saldo bijwerken" (herwaardering). Verwijder-icon zit als
 *     header-action.
 *  - **edit** (form): toont `<DebtForm embedded onActionsChange={…} />`. De
 *     form publiceert save-state naar deze wrapper, die dan de primary CTA
 *     ("Opslaan"/"Toevoegen") in de pane-footer toont en secondary
 *     "Annuleren". Saldo bijwerken blijft bereikbaar als header-action zodat
 *     het in beide modi met één klik open is — UX-skill regel: kern-actie
 *     mag niet wegvallen achter een mode-switch.
 *
 * Volgt het pattern van `event-pane.tsx` (canonical referentie). Driewegregel:
 * `kind="pane"` voor de detail-overlay, `kind="sheet"` voor de
 * herwaardering-sub-overlay (single-form, "even iets snel doen").
 */

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Trash2 } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { ShellOverlay, type PaneAction } from '@/components/app/shell/shell-overlay'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/app/toast-provider'
import type { Debt } from '@/lib/debt-data'
import type { Asset } from '@/lib/asset-data'
import type { Valuation } from './debt-types'
import { DebtDetailModal } from './debt-detail-modal'
import { DebtForm, type DebtEditActionsState } from './debt-form'
import { ValuationModal as DebtValuationModal } from './debt-valuation-modal'

type DebtPaneMode = 'view' | 'edit'

interface DebtPaneProps {
  /** Wanneer null is de pane gesloten. */
  debt: Debt | null
  /** Laatst-geladen valuations voor de view-mode-charts. */
  valuations?: Valuation[]
  /** Alle assets — gebruikt door view (LTV / linked) én edit (linkable). */
  userAssets: Asset[]
  /** Alle (actieve) schulden — door edit-form gebruikt voor splits. */
  allDebts?: Debt[]
  /** Daily-expense-schatting voor de "vrijheid die je terugkoopt"-regel. */
  dailyExpenses?: number
  /** Sluit-callback. URL-state cleanup gebeurt in de parent. */
  onClose: () => void
  /**
   * Aangeroepen na save / herwaardering / delete. Parent moet zelf de
   * debts-lijst herladen (router.refresh of expliciete loader).
   */
  onChanged?: () => void
}

export function DebtPane({
  debt,
  valuations,
  userAssets,
  allDebts,
  dailyExpenses = 0,
  onClose,
  onChanged,
}: DebtPaneProps) {
  const searchParams = useSearchParams()
  const { addToast } = useToast()
  const [mode, setMode] = useState<DebtPaneMode>('view')
  const [revaluationOpen, setRevaluationOpen] = useState(false)
  const [editActions, setEditActions] = useState<DebtEditActionsState | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Reset mode wanneer de geselecteerde debt wisselt. We lezen de
  // URL-modifier-key `edit` zodat de bewerk-knop op `<VermogenDebtCard>`
  // direct in edit-mode (`?debt=<id>&edit=1`) kan landen. Saldo bijwerken
  // (herwaardering) loopt NIET via deze pane — die actie opent direct de
  // ValuationModal in de caller-pagina.
  useEffect(() => {
    if (debt) {
      const wantsEdit = searchParams.get('edit') === '1'
      setMode(wantsEdit ? 'edit' : 'view')
    }
    setRevaluationOpen(false)
    setEditActions(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debt?.id])

  // Reset gepubliceerde save-state bij mode-wissel zodat view-mode geen
  // stale snapshot van een vorige edit-sessie toont.
  useEffect(() => {
    if (mode !== 'edit') setEditActions(null)
  }, [mode])

  // Stabiele callback voor child — anders trigger we elke render een
  // nieuwe identity, wat de useEffect in DebtForm onnodig zou herevalueren.
  const handleEditActionsChange = useCallback((next: DebtEditActionsState) => {
    setEditActions(next)
  }, [])

  const handleDelete = useCallback(async () => {
    if (!debt) return
    setDeleting(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.from('debts').delete().eq('id', debt.id)
      if (error) throw error
      addToast({
        type: 'success',
        title: `${debt.name} verwijderd`,
        message: 'De schuld is uit je overzicht verdwenen.',
      })
      setConfirmDelete(false)
      onClose()
      onChanged?.()
    } catch (e) {
      addToast({
        type: 'error',
        title: 'Verwijderen mislukt',
        message: e instanceof Error ? e.message : 'Onbekende fout',
      })
    } finally {
      setDeleting(false)
    }
  }, [debt, addToast, onClose, onChanged])

  if (!debt) return null

  const isOpen = debt !== null
  const title =
    mode === 'view'
      ? debt.name
      : `${debt.name} — bewerken`

  // Footer-acties per mode. Herwaarderen blijft in beide modi bereikbaar:
  // in view als secondary footer-knop, in edit als header-action icon.
  const primaryAction: PaneAction | undefined =
    mode === 'edit' && editActions
      ? {
          label: editActions.isEditing ? 'Opslaan' : 'Toevoegen',
          onClick: editActions.save,
          disabled: !editActions.canSave,
          loading: editActions.saving,
        }
      : mode === 'view'
        ? {
            label: 'Bewerken',
            onClick: () => setMode('edit'),
          }
        : undefined

  const secondaryAction: PaneAction | undefined =
    mode === 'edit'
      ? {
          label: 'Annuleren',
          onClick: () => setMode('view'),
        }
      : {
          label: 'Saldo bijwerken',
          onClick: () => setRevaluationOpen(true),
        }

  // Header-actions slot — herwaarderen-icon in edit-mode (zodat het in
  // beide modi bereikbaar is) en delete-icon in view-mode.
  const headerActions =
    mode === 'edit' ? (
      <button
        type="button"
        onClick={() => setRevaluationOpen(true)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--ink-3)] hover:bg-[var(--subtle)] hover:text-[var(--ink)]"
        aria-label="Saldo bijwerken"
        title="Saldo bijwerken"
      >
        <RefreshCw className="h-4 w-4" />
      </button>
    ) : (
      <button
        type="button"
        onClick={() => setConfirmDelete(true)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-red-600 hover:bg-red-50"
        aria-label="Schuld verwijderen"
        title="Verwijderen"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    )

  return (
    <>
      <ShellOverlay
        open={isOpen}
        onClose={onClose}
        kind="pane"
        title={title}
        actions={headerActions}
        primaryAction={primaryAction}
        secondaryAction={secondaryAction}
      >
        {mode === 'view' && (
          <DebtDetailModal
            debt={debt}
            valuations={valuations}
            userAssets={userAssets}
            dailyExpenses={dailyExpenses}
            onClose={onClose}
            onEdit={() => setMode('edit')}
            onRevalue={() => setRevaluationOpen(true)}
            onDelete={() => setConfirmDelete(true)}
            embedded
          />
        )}
        {mode === 'edit' && (
          <DebtForm
            debt={debt}
            userAssets={userAssets}
            allDebts={allDebts}
            onClose={() => setMode('view')}
            onSaved={() => {
              setMode('view')
              onChanged?.()
            }}
            embedded
            onActionsChange={handleEditActionsChange}
          />
        )}
      </ShellOverlay>

      {/* Herwaardering — sibling sheet (driewegregel: kind="sheet" voor
          single-form "even iets snel doen"). Bereikbaar uit beide modi. */}
      {revaluationOpen && (
        <DebtValuationModal
          entityId={debt.id}
          entityType="debt"
          entityName={debt.name}
          entitySubtype={debt.debt_type}
          netWorthInclusionPct={debt.net_worth_inclusion_pct ?? 100}
          currentValue={Number(debt.current_balance)}
          onClose={() => setRevaluationOpen(false)}
          onSaved={() => {
            setRevaluationOpen(false)
            onChanged?.()
            // Na herwaardering laten we de gebruiker terug in view-mode zodat
            // de bijgewerkte saldi in de detail-blocks zichtbaar worden.
            setMode('view')
          }}
        />
      )}

      {/* Delete-confirm — driewegregel kind="confirm". */}
      <ShellOverlay
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        kind="confirm"
        title="Schuld verwijderen?"
        destructive
      >
        <div className="space-y-4 p-5">
          <p className="font-serif text-base leading-relaxed text-[var(--ink-2)]">
            <strong className="text-[var(--ink)]">{debt.name}</strong> en alle
            bijbehorende waardehistorie en koppelingen worden definitief
            verwijderd. Deze actie kan niet ongedaan worden gemaakt.
          </p>
          <div className="flex flex-col-reverse gap-2 pt-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="border border-[var(--border-md)] bg-[var(--paper)] px-4 py-3 text-sm font-medium text-[var(--ink)] hover:bg-[var(--subtle)]"
              style={{ minHeight: 44 }}
            >
              Annuleren
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="border border-red-600 bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              style={{ minHeight: 44 }}
            >
              {deleting ? 'Verwijderen…' : 'Definitief verwijderen'}
            </button>
          </div>
        </div>
      </ShellOverlay>
    </>
  )
}
