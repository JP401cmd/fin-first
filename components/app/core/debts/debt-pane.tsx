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
  /**
   * Auth-uid van de kijker, voor de eigenaar-guard op Bewerken/Verwijderen.
   * Optioneel omdat niet elke call-site 'm (nog) doorgeeft — zie `canMutate`
   * hieronder voor wat er dan gebeurt.
   */
  currentUserId?: string
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
  currentUserId,
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
      // De deeplink mag de eigenaar-guard NIET omzeilen. `canMutate` verderop
      // verbergt alleen de Bewerken-ingang; `?edit=1` zet de mode rechtstreeks
      // en landt dus buiten die ingang om alsnog in een werkend formulier — op
      // een rij die RLS daarna stil weigert (0 rijen, geen fout). Zelfde
      // conditie als `canMutate`, hier herhaald omdat die pas ná de vroege
      // return berekend kan worden.
      const mayEdit = !currentUserId || debt.user_id === currentUserId
      const wantsEdit = searchParams.get('edit') === '1'
      setMode(wantsEdit && mayEdit ? 'edit' : 'view')
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

  // Verwijderen loopt via `DELETE /api/debts/[id]` (ADR 0058: muteren gaat via
  // een API-route). De oude client-delete deed `.delete().eq('id', …)` zonder
  // eigenaarsfilter en zonder `.select()`; op een gedeelde schuld van de partner
  // blokkeerde RLS de verwijdering, maar 0 geraakte rijen levert `error: null` —
  // succes-toast, pane dicht, niets gebeurd. De route geeft daar nu een eerlijke
  // 404 op, en ruimt bovendien de waardehistorie op die de bevestigingstekst
  // hiernaast belooft.
  //
  // Bewust GEEN `router.refresh()` hier, anders dan in `asset-pane.tsx`: de
  // callers van deze pane doen dat zelf in hun `onChanged`. Samenvoegen zou een
  // dubbele refresh op de schuldenpagina geven.
  const handleDelete = useCallback(async () => {
    if (!debt) return
    setDeleting(true)
    const finishSuccessfully = () => {
      setConfirmDelete(false)
      onClose()
      onChanged?.()
    }
    try {
      const res = await fetch(`/api/debts/${debt.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        // Met de eigenaar-guard op de knop betekent 404 nog maar één ding: de
        // schuld bestond al niet meer (dubbele klik, ander tabblad). Geen fout
        // voor de gebruiker — opruimen en neutraal melden.
        if (res.status === 404) {
          addToast({
            type: 'info',
            title: `${debt.name} was al verwijderd`,
            message: 'Je overzicht is bijgewerkt.',
          })
          finishSuccessfully()
          return
        }
        // Tekst komt uit de server-veilige error-envelope (ADR 0044), nooit uit
        // een rauwe driver-/DB-melding.
        addToast({
          type: 'error',
          title: 'Verwijderen mislukt',
          message: typeof data?.error === 'string' ? data.error : 'Probeer het later opnieuw.',
        })
        return
      }
      addToast({
        type: 'success',
        title: `${debt.name} verwijderd`,
        message: 'De schuld is uit je overzicht verdwenen.',
      })
      finishSuccessfully()
    } catch {
      // Alleen netwerk-/parse-fouten komen hier; geen `e.message` in de UI.
      addToast({
        type: 'error',
        title: 'Verwijderen mislukt',
        message: 'Geen verbinding met de server. Probeer het opnieuw.',
      })
    } finally {
      setDeleting(false)
    }
  }, [debt, addToast, onClose, onChanged])

  if (!debt) return null

  // Eigenaar-guard voor de destructieve/mutatie-affordances. De conditie zit
  // bewust op `user_id` en niet op provenance: `deriveProvenance` geeft
  // 'gezamenlijk' voor élk `ownership === 'shared'`-item ongeacht eigenaar,
  // terwijl de UPDATE/DELETE-policies op `debts` strikt eigen-rij zijn
  // (`auth.uid() = user_id`). Een gedeelde schuld van de partner is dus wél
  // 'gezamenlijk' en tóch niet te bewerken of te verwijderen — een knop die per
  // definitie nooit kan slagen is een kapotte affordance.
  //
  // Zonder `currentUserId` valt de guard bewust OPEN: call-sites die de uid nog
  // niet doorgeven zouden anders de knop voor élke solo-gebruiker verbergen, en
  // dat is een grotere regressie dan de kapotte affordance. De route blijft in
  // dat geval het vangnet met een eerlijke 404.
  const canMutate = !currentUserId || debt.user_id === currentUserId

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
      : mode === 'view' && canMutate
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
  // beide modi bereikbaar is) en delete-icon in view-mode. Het delete-icon
  // verdwijnt zodra de rij niet van de kijker is (zie `canMutate`).
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
    ) : canMutate ? (
      <button
        type="button"
        onClick={() => setConfirmDelete(true)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-negative hover:bg-negative/10"
        aria-label="Schuld verwijderen"
        title="Verwijderen"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    ) : undefined

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
              className="border border-negative bg-negative px-4 py-3 text-sm font-semibold text-white hover:bg-negative/90 disabled:opacity-50"
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
