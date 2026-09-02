'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ShellOverlay, type PaneAction } from '@/components/app/shell/shell-overlay'
import { createClient } from '@/lib/supabase/client'
import { isHousingStrategyEvent } from '@/lib/housing-strategy'
import {
  type LifeEvent,
  type FinancialInput,
  type FireProjection,
} from '@/lib/horizon-data'
import type { FireParams } from '@/lib/fire-params'
import type { FireStrategyConfig } from '@/lib/fire-strategy'
import type { WithdrawalStrategyConfig } from '@/lib/withdrawal-strategy'
import type { PreviewBaseline } from '@/lib/strategy-preview'
import { EventPaneCatalog } from './event-pane-catalog'
import { EventChatPane, type SuggestedLifeEventPayload } from './event-chat-pane'
import {
  EventPaneEdit,
  initFormState,
  type EditFormState,
  type EventEditActionsState,
} from './event-pane-edit'
import { setSharedAge } from '@/lib/horizon/event-pane-edit-form'
import { EventPaneView } from './event-pane-view'

export type EventPaneMode = 'catalog' | 'chat' | 'view' | 'edit'

interface Props {
  open: boolean
  onClose: () => void
  /** Welk event wordt getoond/bewerkt? null = nieuw event (catalog-mode). */
  editingId: string | null
  /** Initiele modus — 'catalog' bij nieuw, 'view' of 'edit' bij bestaand. */
  initialMode: EventPaneMode
  events: LifeEvent[]
  baselineInput: FinancialInput
  baselineFire: FireProjection | null
  fireParams: FireParams
  fireStrategy: FireStrategyConfig
  withdrawalStrategy: WithdrawalStrategyConfig
  endAge: number
  householdMode: boolean
  /**
   * Flag-bewuste, per-asset projectie-input (zelfde assemblage als de Tijdas-
   * grafiek) incl. optionele kernel-context. Wanneer gezet, draaien de
   * EventPaneView/Edit-delta-previews via `previewSimResult`
   * (→ computeConvergentieProjection) op DEZELFDE motor als de grafiek: kernel bij
   * convergentie-vlag aan, anders byte-identiek v2. Null → scalar-bridge-fallback.
   */
  previewBaseline: PreviewBaseline | null
  /** Callback na save of delete — horizon-client moet events herladen. */
  onChanged: () => void
}

export function EventPane({
  open,
  onClose,
  editingId,
  initialMode,
  events,
  baselineInput,
  baselineFire,
  fireParams,
  fireStrategy,
  withdrawalStrategy,
  endAge,
  householdMode,
  previewBaseline,
  onChanged,
}: Props) {
  const [mode, setMode] = useState<EventPaneMode>(initialMode)
  const router = useRouter()
  const [formState, setFormState] = useState<EditFormState | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // Save-state uit EventPaneEdit voor de pane-footer (alleen edit-mode).
  // null tot child publiceert; reset bij mode-switch zodat catalog/view geen
  // stale snapshot tonen.
  const [editActions, setEditActions] = useState<EventEditActionsState | null>(null)

  const editingEvent = useMemo(
    () => (editingId ? events.find(e => e.id === editingId) ?? null : null),
    [editingId, events],
  )

  // Sync mode wanneer props veranderen (bv. nav-event van extern).
  // Bewust: we re-initialiseren ALLEEN op trigger-changes (open/mode/id). Als
  // `editingEvent` of `baselineInput` daarna muteren willen we de form-state
  // NIET overschrijven — anders verliezen we user-edits zodra de events-lijst
  // herberekent of de baseline elders ververst. `editingEvent` is bovendien
  // afgeleid van `editingId` (zie useMemo hierboven), dus functioneel
  // afgedekt door de bestaande deps.
  useEffect(() => {
    if (!open) return
    setMode(initialMode)
    setSaveError(null)
    setEditActions(null)
    if (initialMode === 'edit' && editingEvent) {
      setFormState(initFormState(editingEvent.event_type, editingEvent, currentAge(baselineInput)))
    } else if (initialMode === 'edit' && !editingEvent) {
      setFormState(null)
    } else {
      setFormState(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialMode, editingId])

  // Reset gepubliceerde save-state bij mode-wissel binnen dezelfde open-sessie.
  useEffect(() => {
    if (mode !== 'edit') setEditActions(null)
  }, [mode])

  // Stabiele callback voor child — anders trigger we elke render een nieuwe
  // identity, wat de useEffect in EventPaneEdit onnodig zou herevalueren.
  const handleEditActionsChange = useCallback((next: EventEditActionsState) => {
    setEditActions(next)
  }, [])

  // Initialiseer form-state wanneer mode wisselt naar edit
  function handleSelectType(type: string) {
    setFormState(initFormState(type, null, currentAge(baselineInput)))
    setMode('edit')
  }

  function handleOpenChat() {
    setFormState(null)
    setMode('chat')
  }

  /**
   * Fin heeft via suggestLifeEvent-tool een voorstel gedaan. We vertalen de
   * payload naar een EditFormState en springen naar edit-mode zodat gebruiker
   * kan tweaken en opslaan. Bij accepteren is altijd één van de drie blokken
   * gevuld (anders had de tool geen impact-velden).
   */
  function handleAcceptSuggestion(payload: SuggestedLifeEventPayload) {
    const baseAge = currentAge(baselineInput)
    const initial = initFormState(payload.event_type, null, baseAge)
    // Override de catalog-defaults met de tool-output
    // setSharedAge spiegelt Fin's leeftijd óók naar de story-vraag, anders
    // wint het oude story-antwoord bij de eerstvolgende story-wijziging.
    const next: EditFormState = {
      ...setSharedAge(initial, payload.target_age ?? initial.shared_age),
      name: payload.name,
      oneTimeAmount: Math.abs(payload.one_time_cost),
      oneTimeDirection: payload.one_time_cost >= 0 ? 'expense' : 'income',
      tempEnabled: payload.duration_months > 0,
      tempAmount:
        payload.duration_months > 0
          ? Math.abs(payload.monthly_cost_change) || Math.abs(payload.monthly_income_change)
          : 0,
      tempDirection:
        payload.monthly_income_change !== 0 && payload.duration_months > 0 ? 'income' : 'expense',
      tempDurationYears:
        payload.duration_months > 0 ? Math.max(1, Math.round(payload.duration_months / 12)) : 5,
      tempIndexed: true,
      contEnabled:
        payload.duration_months === 0 &&
        (payload.monthly_cost_change !== 0 || payload.monthly_income_change !== 0),
      contAmount:
        payload.duration_months === 0
          ? Math.abs(payload.monthly_cost_change) || Math.abs(payload.monthly_income_change)
          : 0,
      contDirection:
        payload.monthly_income_change !== 0 && payload.duration_months === 0 ? 'income' : 'expense',
      contIndexed: true,
    }
    setFormState(next)
    setMode('edit')
  }

  function handleSwitchToEdit() {
    if (!editingEvent) return
    setFormState(initFormState(editingEvent.event_type, editingEvent, currentAge(baselineInput)))
    setMode('edit')
  }

  function handleBackToCatalog() {
    setFormState(null)
    setMode('catalog')
  }

  async function handleSave(draftEvent: LifeEvent) {
    setSaving(true)
    setSaveError(null)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Niet ingelogd')

      const payload = {
        user_id: user.id,
        name: draftEvent.name,
        event_type: draftEvent.event_type,
        target_age: draftEvent.target_age,
        target_date: draftEvent.target_date,
        one_time_cost: draftEvent.one_time_cost,
        monthly_cost_change: draftEvent.monthly_cost_change,
        monthly_income_change: draftEvent.monthly_income_change,
        duration_months: draftEvent.duration_months,
        is_indexed: draftEvent.is_indexed,
        icon: draftEvent.icon,
        is_active: true,
        metadata: draftEvent.metadata ?? {},
      }

      if (editingEvent) {
        const { error } = await supabase
          .from('life_events')
          .update(payload)
          .eq('id', editingEvent.id)
        if (error) throw error
      } else {
        const sortOrder = events.length
        const { error } = await supabase
          .from('life_events')
          .insert({ ...payload, sort_order: sortOrder })
        if (error) throw error
      }
      onChanged()
      onClose()
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Onbekende fout')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!editingEvent) return
    setSaving(true)
    setSaveError(null)
    try {
      const supabase = createClient()
      const { error } = await supabase.from('life_events').delete().eq('id', editingEvent.id)
      if (error) throw error
      onChanged()
      onClose()
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Onbekende fout')
    } finally {
      setSaving(false)
      setConfirmDelete(false)
    }
  }

  const title =
    mode === 'catalog'
      ? 'Levensgebeurtenis toevoegen'
      : mode === 'chat'
        ? 'Brainstormen met Fin'
        : mode === 'view'
          ? editingEvent?.name ?? 'Levensgebeurtenis'
          : editingEvent
            ? `${editingEvent.name} — bewerken`
            : 'Levensgebeurtenis toevoegen'

  // Pane-footer — alle action-knoppen (zowel edit als view) horen onderin
  // (UI/UX skill: "Geen inline action-knoppen — ALLE actie-knoppen in de
  // footer-bar"). Catalog-mode heeft geen footer; klik op tegel = direct
  // overgang naar edit en daar verschijnt de footer.
  // Virtuele housing-strategy events hebben geen DB-row — geen edit/delete.
  // In plaats daarvan: deeplink naar instellingen waar de strategie te
  // wijzigen is.
  const isHousingEvent = editingEvent != null && isHousingStrategyEvent(editingEvent)

  const primaryAction: PaneAction | undefined =
    mode === 'edit' && editActions
      ? {
          label: editActions.isEditing ? 'Opslaan' : 'Toevoegen',
          onClick: editActions.save,
          disabled: !editActions.canSave,
          loading: editActions.saving,
        }
      : mode === 'view' && editingEvent
        ? isHousingEvent
          ? {
              label: 'Beheer in instellingen',
              onClick: () => {
                onClose()
                router.push('/toekomst')
              },
            }
          : {
              label: 'Bewerken',
              onClick: handleSwitchToEdit,
            }
        : undefined
  const secondaryAction: PaneAction | undefined =
    mode === 'edit' && editActions
      ? {
          label: 'Annuleren',
          onClick: onClose,
        }
      : mode === 'view' && editingEvent && !isHousingEvent
        ? {
            label: 'Verwijderen',
            onClick: () => setConfirmDelete(true),
          }
        : undefined

  return (
    <>
      <ShellOverlay
        open={open}
        onClose={onClose}
        kind="pane" mobileBackCloses
        title={title}
        primaryAction={primaryAction}
        secondaryAction={secondaryAction}
      >
        {mode === 'catalog' && (
          <EventPaneCatalog
            onSelect={handleSelectType}
            onOpenChat={handleOpenChat}
            householdMode={householdMode}
          />
        )}
        {mode === 'chat' && (
          <EventChatPane events={events} onAcceptSuggestion={handleAcceptSuggestion} />
        )}
        {mode === 'view' && editingEvent && (
          <EventPaneView
            event={editingEvent}
            baselineEvents={events}
            baselineInput={baselineInput}
            fireParams={fireParams}
            fireStrategy={fireStrategy}
            withdrawalStrategy={withdrawalStrategy}
            endAge={endAge}
            previewBaseline={previewBaseline}
          />
        )}
        {mode === 'edit' && formState && (
          <EventPaneEdit
            state={formState}
            setState={setFormState}
            existingEvent={editingEvent}
            baselineEvents={events}
            baselineInput={baselineInput}
            baselineFire={baselineFire}
            fireParams={fireParams}
            fireStrategy={fireStrategy}
            withdrawalStrategy={withdrawalStrategy}
            endAge={endAge}
            previewBaseline={previewBaseline}
            saving={saving}
            saveError={saveError}
            onSave={handleSave}
            onDelete={() => setConfirmDelete(true)}
            onBackToCatalog={!editingEvent ? handleBackToCatalog : undefined}
            onActionsChange={handleEditActionsChange}
          />
        )}
      </ShellOverlay>

      {/* Delete confirm */}
      <ShellOverlay
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        kind="confirm"
        title="Verwijderen?"
        destructive
      >
        <div className="px-2 py-1">
          <p className="text-sm text-[var(--ink-2)] mb-4">
            Weet je zeker dat je <strong>{editingEvent?.name}</strong> wilt verwijderen?
            Deze gebeurtenis wordt uit je vrijheidspad verwijderd.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="px-4 py-2 rounded-lg text-sm text-[var(--ink-2)] hover:bg-[var(--subtle)]"
            >
              Annuleren
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-red-600 text-white font-semibold text-sm hover:bg-red-700 disabled:opacity-50"
              data-destructive
            >
              {saving ? 'Verwijderen…' : 'Verwijderen'}
            </button>
          </div>
        </div>
      </ShellOverlay>
    </>
  )
}

function currentAge(input: FinancialInput): number {
  if (!input.dateOfBirth) return 30
  const birth = new Date(input.dateOfBirth)
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const m = now.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--
  return Math.max(0, age)
}
