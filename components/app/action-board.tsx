'use client'

import { useState, useEffect } from 'react'
import { Plus, Users, CheckCircle } from 'lucide-react'
import { ActionCard } from '@/components/app/action-card'
import { ActionForm } from '@/components/app/action-form'
import { ActionListModal } from '@/components/app/action-list-modal'
import { useFreedomDaysAnimation } from '@/components/app/freedom-days-animation'
import { useToast } from '@/components/app/toast-provider'
import type { Action, ActionStatus } from '@/lib/recommendation-data'
import type { CancellationMetadata } from '@/lib/cancellation-types'
import { Kicker } from '@/components/editorial'

const MAX_VISIBLE = 5

type ActionBoardProps = {
  initialActions: Action[]
  onCancellationOpen?: (metadata: CancellationMetadata) => void
  /** Partner info for assignment — null if no household */
  partnerInfo?: { partnerId: string; partnerName: string } | null
  /** Current user ID for distinguishing own vs partner-assigned actions */
  currentUserId?: string | null
  /** Increment to trigger showing the add form from parent */
  addTrigger?: number
  /** Called after any mutation so parent can refresh server data */
  onDataChanged?: () => void
}

export function ActionBoard({ initialActions, onCancellationOpen, partnerInfo, currentUserId, addTrigger, onDataChanged }: ActionBoardProps) {
  const [actions, setActions] = useState<Action[]>(initialActions)
  useEffect(() => { setActions(initialActions) }, [initialActions])
  const [showForm, setShowForm] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const { triggerAnimation } = useFreedomDaysAnimation()
  const { addToast } = useToast()

  // Allow parent to trigger showing the add form via counter prop
  useEffect(() => {
    if (addTrigger && addTrigger > 0) {
      setShowForm(true)
    }
  }, [addTrigger])

  async function handleAssign(actionId: string, partnerId: string | null) {
    let res: Response
    try {
      res = await fetch(`/api/ai/actions/${actionId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partner_id: partnerId }),
      })
    } catch {
      addToast({ type: 'error', title: 'Toewijzen mislukt', message: 'De actie toewijzen is niet gelukt — probeer het opnieuw.' })
      return
    }
    if (!res.ok) {
      addToast({ type: 'error', title: 'Toewijzen mislukt', message: 'De actie toewijzen is niet gelukt — probeer het opnieuw.' })
      return
    }
    const data = await res.json()
    setActions((prev) =>
      prev.map((a) =>
        a.id === actionId
          ? {
              ...a,
              assigned_to: data.assigned_to,
              assigned_by: data.assigned_by,
              assigned_by_name: data.assigned_by_name,
              assigned_to_name: partnerId ? (partnerInfo?.partnerName ?? 'Partner') : null,
            }
          : a
      )
    )
  }

  // Separate own actions from partner-assigned actions
  const isPartnerAssigned = (a: Action) =>
    currentUserId && a.assigned_to === currentUserId && a.user_id !== currentUserId

  const ownActions = actions.filter((a) => !isPartnerAssigned(a))
  const partnerAssignedActions = actions.filter((a) => isPartnerAssigned(a))

  const openActions = ownActions
    .filter((a) => a.status === 'open')
    .sort((a, b) => (b.priority_score || 0) - (a.priority_score || 0) || a.sort_order - b.sort_order)

  const postponedActions = ownActions.filter((a) => a.status === 'postponed')
  const completedActions = ownActions.filter((a) => a.status === 'completed')
  const rejectedActions = ownActions.filter((a) => a.status === 'rejected')

  const partnerOpenActions = partnerAssignedActions
    .filter((a) => a.status === 'open')
    .sort((a, b) => (b.priority_score || 0) - (a.priority_score || 0) || a.sort_order - b.sort_order)

  // Block view: open + postponed own actions, max 5
  const activeActions = [...openActions, ...postponedActions]
  const visibleOpen = activeActions.slice(0, MAX_VISIBLE)
  const totalOpen = openActions.length + postponedActions.length + partnerOpenActions.length

  async function handleStatusChange(id: string, status: ActionStatus, data?: Record<string, unknown>) {
    let res: Response
    try {
      res = await fetch(`/api/ai/actions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, ...data }),
      })
    } catch (err) {
      console.error('[ActionBoard] Fetch failed:', err)
      addToast({ type: 'error', title: 'Bijwerken mislukt', message: 'De actie bijwerken is niet gelukt — probeer het opnieuw.' })
      return
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error(`[ActionBoard] PATCH /api/ai/actions/${id} → ${res.status}:`, text)
      addToast({ type: 'error', title: 'Bijwerken mislukt', message: 'De actie bijwerken is niet gelukt — probeer het opnieuw.' })
      return
    }

    setActions((prev) =>
      prev.map((a) => {
        if (a.id !== id) return a
        const now = new Date().toISOString()
        const updates: Partial<Action> = { status, status_changed_at: now }
        if (status === 'completed') updates.completed_at = now
        if (status === 'postponed' && data?.postpone_weeks) {
          const d = new Date()
          d.setDate(d.getDate() + (data.postpone_weeks as number) * 7)
          updates.postponed_until = d.toISOString().split('T')[0]
          updates.postpone_weeks = data.postpone_weeks as number
        }
        if (status === 'rejected') updates.rejection_reason = (data?.rejection_reason as string) || null
        if (status === 'open') {
          updates.postpone_weeks = null
          updates.postponed_until = null
        }
        return { ...a, ...updates }
      })
    )

    if (status === 'completed') {
      const completedAction = actions.find((a) => a.id === id)
      const freedomDays = completedAction?.freedom_days_impact || 0
      if (freedomDays > 0) {
        triggerAnimation(freedomDays)
      }
    }

    onDataChanged?.()
  }

  async function handleUpdateAction(id: string, data: Record<string, unknown>) {
    let res: Response
    try {
      res = await fetch(`/api/ai/actions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
    } catch {
      addToast({ type: 'error', title: 'Opslaan mislukt', message: 'De wijziging opslaan is niet gelukt — probeer het opnieuw.' })
      return
    }

    if (!res.ok) {
      addToast({ type: 'error', title: 'Opslaan mislukt', message: 'De wijziging opslaan is niet gelukt — probeer het opnieuw.' })
      return
    }

    const { action: updated } = await res.json()
    setActions((prev) =>
      prev.map((a) => (a.id === id ? { ...a, ...updated } : a))
    )
  }

  async function handleCreateAction(data: {
    title: string
    description?: string
    freedom_days_impact: number
    euro_impact_monthly?: number
    due_date?: string
    priority_score?: number
  }) {
    let res: Response
    try {
      res = await fetch('/api/ai/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
    } catch {
      addToast({ type: 'error', title: 'Aanmaken mislukt', message: 'De actie aanmaken is niet gelukt — probeer het opnieuw.' })
      return
    }

    if (!res.ok) {
      addToast({ type: 'error', title: 'Aanmaken mislukt', message: 'De actie aanmaken is niet gelukt — probeer het opnieuw.' })
      return
    }

    const { action } = await res.json()
    setActions((prev) => [{ ...action, source: 'manual', recommendation: null }, ...prev])
    setShowForm(false)
    onDataChanged?.()
  }

  const cardProps = {
    onStatusChange: handleStatusChange,
    onUpdate: handleUpdateAction,
    onCancellationOpen,
    partnerInfo,
    onAssign: handleAssign,
  }

  const hasAnyActions = actions.length > 0

  // --- Empty state (no actions at all) ---
  if (!hasAnyActions && !showForm) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center text-center py-12 px-4 max-w-md mx-auto">
          <Kicker className="mb-3">Acties</Kicker>
          <h3
            className="font-bold leading-tight text-[20px] sm:text-[24px]"
            style={{ fontFamily: 'var(--font-playfair, serif)' }}
          >
            Zet je eerste{' '}
            <em
              className="font-normal italic"
              style={{ color: 'var(--module-active-700)' }}
            >
              stap
            </em>
          </h3>
          <p
            className="mt-3 italic text-[14px] text-[var(--ink-2)] max-w-prose"
            style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
          >
            Acties zijn concrete stappen richting financiële vrijheid — maak er zelf een aan, of accepteer een tip van Fin.
          </p>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="mt-6 inline-flex items-center gap-1.5 bg-[var(--ink)] text-[var(--paper)] px-4 py-2.5 text-xs font-semibold hover:bg-[var(--ink-2)] min-h-[44px] rounded-[var(--r)]"
          >
            <Plus className="h-4 w-4" /> Eerste actie toevoegen
          </button>
        </div>
      </div>
    )
  }

  // --- Filled state (block view) ---
  return (
    <div className="space-y-4">
      {/* Inline form */}
      {showForm && (
        <ActionForm onSubmit={handleCreateAction} onCancel={() => setShowForm(false)} />
      )}

      {/* Compact action list (max 5 open + postponed) */}
      {visibleOpen.length > 0 ? (
        <div className="space-y-2">
          {visibleOpen.map((action) => (
            <ActionCard key={action.id} action={action} {...cardProps} compact />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center text-center py-12 px-4 max-w-md mx-auto">
          <Kicker className="mb-3">Acties</Kicker>
          <h3
            className="font-bold leading-tight text-[20px] sm:text-[24px]"
            style={{ fontFamily: 'var(--font-playfair, serif)' }}
          >
            Alles{' '}
            <em
              className="font-normal italic"
              style={{ color: 'var(--module-active-700)' }}
            >
              afgerond
            </em>
          </h3>
          <p
            className="mt-3 italic text-[14px] text-[var(--ink-2)] max-w-prose"
            style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
          >
            {completedActions.length > 0
              ? `${completedActions.length} actie${completedActions.length !== 1 ? 's' : ''} afgerond — goed bezig. Voeg een nieuwe actie toe of accepteer een tip van Fin.`
              : 'Geen openstaande acties. Voeg een nieuwe actie toe of accepteer een tip van Fin.'}
          </p>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="mt-6 inline-flex items-center gap-1.5 bg-[var(--ink)] text-[var(--paper)] px-4 py-2.5 text-xs font-semibold hover:bg-[var(--ink-2)] min-h-[44px] rounded-[var(--r)]"
          >
            <Plus className="h-4 w-4" /> Nieuwe actie toevoegen
          </button>
        </div>
      )}

      {/* Partner-assigned preview */}
      {partnerOpenActions.length > 0 && visibleOpen.length < MAX_VISIBLE && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-3)]">
            <Users className="h-3 w-3" />
            Van {partnerInfo?.partnerName ?? 'partner'}
          </div>
          {partnerOpenActions.slice(0, MAX_VISIBLE - visibleOpen.length).map((action) => (
            <ActionCard key={action.id} action={action} {...cardProps} isPartnerAssigned compact />
          ))}
        </div>
      )}

      {/* "Bekijk alle acties" — always visible */}
      <button
        type="button"
        onClick={() => setShowAll(true)}
        className="w-full rounded-[var(--r)] py-2 text-center text-xs font-medium text-wil-600 transition-colors hover:bg-wil-50"
      >
        {totalOpen > MAX_VISIBLE
          ? `Bekijk alle ${totalOpen} openstaande acties`
          : 'Alle acties bekijken'}
      </button>

      {/* ============ Modal ============ */}
      <ActionListModal
        open={showAll}
        onClose={() => setShowAll(false)}
        actions={actions}
        onStatusChange={handleStatusChange}
        onUpdate={handleUpdateAction}
        onCreateAction={handleCreateAction}
        onCancellationOpen={onCancellationOpen}
        partnerInfo={partnerInfo}
        onAssign={handleAssign}
        currentUserId={currentUserId}
        isPartnerAssigned={(a) => isPartnerAssigned(a) as boolean}
      />
    </div>
  )
}
