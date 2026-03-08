'use client'

import { useState } from 'react'
import { Plus, ChevronDown, Users } from 'lucide-react'
import { ActionCard } from '@/components/app/action-card'
import { ActionForm } from '@/components/app/action-form'
import { useFreedomDaysAnimation } from '@/components/app/freedom-days-animation'
import type { Action, ActionStatus } from '@/lib/recommendation-data'
import type { CancellationMetadata } from '@/lib/cancellation-types'

type ActionBoardProps = {
  initialActions: Action[]
  onCancellationOpen?: (metadata: CancellationMetadata) => void
  /** Partner info for assignment — null if no household */
  partnerInfo?: { partnerId: string; partnerName: string } | null
  /** Current user ID for distinguishing own vs partner-assigned actions */
  currentUserId?: string | null
}

export function ActionBoard({ initialActions, onCancellationOpen, partnerInfo, currentUserId }: ActionBoardProps) {
  const [actions, setActions] = useState<Action[]>(initialActions)
  const [showForm, setShowForm] = useState(false)
  const [showOpen, setShowOpen] = useState(true)
  const [showPostponed, setShowPostponed] = useState(false)
  const [showCompleted, setShowCompleted] = useState(false)
  const [showPartnerCompleted, setShowPartnerCompleted] = useState(false)
  const { triggerAnimation } = useFreedomDaysAnimation()

  async function handleAssign(actionId: string, partnerId: string | null) {
    const res = await fetch(`/api/ai/actions/${actionId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partner_id: partnerId }),
    })
    if (!res.ok) return
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
  const partnerCompletedActions = partnerAssignedActions.filter((a) => a.status === 'completed')

  const totalOpenDays = openActions.reduce((sum, a) => sum + (a.freedom_days_impact || 0), 0)
  const totalPostponedDays = postponedActions.reduce((sum, a) => sum + (a.freedom_days_impact || 0), 0)
  const totalCompletedDays = completedActions.reduce((sum, a) => sum + (a.freedom_days_impact || 0), 0)
  const partnerOpenDays = partnerOpenActions.reduce((sum, a) => sum + (a.freedom_days_impact || 0), 0)

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
      return
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error(`[ActionBoard] PATCH /api/ai/actions/${id} → ${res.status}:`, text)
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
  }

  async function handleUpdateAction(id: string, data: Record<string, unknown>) {
    const res = await fetch(`/api/ai/actions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })

    if (!res.ok) return

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
    const res = await fetch('/api/ai/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })

    if (!res.ok) return

    const { action } = await res.json()
    setActions((prev) => [{ ...action, source: 'manual', recommendation: null }, ...prev])
    setShowForm(false)
  }

  if (ownActions.length === 0 && partnerAssignedActions.length === 0 && !showForm) {
    return (
      <div>
        <p className="text-sm font-serif italic text-[var(--ink-3)]">
          Nog geen acties — maak er een aan of accepteer een voorstel
        </p>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-wil-600 transition-colors hover:text-wil-700"
        >
          <Plus className="h-4 w-4" />
          Nieuwe actie
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* New action form (shown inline when active) */}
      {showForm && (
        <ActionForm onSubmit={handleCreateAction} onCancel={() => setShowForm(false)} />
      )}

      {/* Partner-assigned actions — "Van je partner" section */}
      {partnerAssignedActions.length > 0 && (
        <div>
          <div className="mb-3 flex items-center gap-2">
            <Users className="h-4 w-4 text-wil-600" />
            <h3 className="text-sm font-semibold text-[var(--ink)]">
              Van {partnerInfo?.partnerName ?? 'je partner'} ({partnerOpenActions.length})
            </h3>
            {partnerOpenDays > 0 && (
              <span className="rounded-full bg-wil-100 px-2.5 py-0.5 text-xs font-medium text-wil-700">
                {Math.round(partnerOpenDays)} dagen potentieel
              </span>
            )}
          </div>

          {/* Open partner-assigned actions */}
          {partnerOpenActions.length > 0 && (
            <div className="space-y-2">
              {partnerOpenActions.map((action) => (
                <ActionCard
                  key={action.id}
                  action={action}
                  onStatusChange={handleStatusChange}
                  onUpdate={handleUpdateAction}
                  onCancellationOpen={onCancellationOpen}
                  isPartnerAssigned
                />
              ))}
            </div>
          )}

          {/* Completed partner-assigned actions */}
          {partnerCompletedActions.length > 0 && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setShowPartnerCompleted(!showPartnerCompleted)}
                className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]"
              >
                <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${showPartnerCompleted ? 'rotate-0' : '-rotate-90'}`} />
                Afgerond ({partnerCompletedActions.length})
              </button>
              {showPartnerCompleted && (
                <div className="space-y-2">
                  {partnerCompletedActions.map((action) => (
                    <ActionCard
                      key={action.id}
                      action={action}
                      onStatusChange={handleStatusChange}
                      onUpdate={handleUpdateAction}
                      isPartnerAssigned
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Open actions */}
      {openActions.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowOpen(!showOpen)}
            className="mb-2 flex w-full items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]"
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${showOpen ? 'rotate-0' : '-rotate-90'}`} />
            Open ({openActions.length})
            {totalOpenDays > 0 && (
              <span className="ml-auto font-mono tabular-nums text-[10px] font-medium normal-case tracking-normal text-wil-700">
                {Math.round(totalOpenDays)}d potentieel
              </span>
            )}
          </button>
          {showOpen && (
            <div className="space-y-2">
              {openActions.map((action) => (
                <ActionCard key={action.id} action={action} onStatusChange={handleStatusChange} onUpdate={handleUpdateAction} onCancellationOpen={onCancellationOpen} partnerInfo={partnerInfo} onAssign={handleAssign} />
              ))}
              {/* Compact new action link */}
              {!showForm && (
                <button
                  type="button"
                  onClick={() => setShowForm(true)}
                  className="mt-1 text-sm text-wil-600 transition-colors hover:underline"
                >
                  + Nieuwe actie
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Compact new action link when no open actions */}
      {openActions.length === 0 && !showForm && (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="text-sm text-wil-600 transition-colors hover:underline"
        >
          + Nieuwe actie
        </button>
      )}

      {/* Postponed actions */}
      {postponedActions.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowPostponed(!showPostponed)}
            className="mb-2 flex w-full items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]"
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${showPostponed ? 'rotate-0' : '-rotate-90'}`} />
            Uitgesteld ({postponedActions.length})
            {totalPostponedDays > 0 && (
              <span className="ml-auto font-mono tabular-nums text-[10px] font-medium normal-case tracking-normal text-amber-600">
                {Math.round(totalPostponedDays)}d uitgesteld
              </span>
            )}
          </button>
          {showPostponed && (
            <div className="space-y-2">
              {postponedActions.map((action) => (
                <ActionCard key={action.id} action={action} onStatusChange={handleStatusChange} onUpdate={handleUpdateAction} onCancellationOpen={onCancellationOpen} partnerInfo={partnerInfo} onAssign={handleAssign} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Completed actions */}
      {completedActions.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowCompleted(!showCompleted)}
            className="mb-2 flex w-full items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]"
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${showCompleted ? 'rotate-0' : '-rotate-90'}`} />
            Afgerond ({completedActions.length})
            {totalCompletedDays > 0 && (
              <span className="ml-auto font-mono tabular-nums text-[10px] font-medium normal-case tracking-normal text-emerald-600">
                {Math.round(totalCompletedDays)}d gewonnen
              </span>
            )}
          </button>
          {showCompleted && (
            <div className="space-y-2">
              {completedActions.map((action) => (
                <ActionCard key={action.id} action={action} onStatusChange={handleStatusChange} onUpdate={handleUpdateAction} onCancellationOpen={onCancellationOpen} partnerInfo={partnerInfo} onAssign={handleAssign} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Rejected actions (always collapsed, subtle) */}
      {rejectedActions.length > 0 && (
        <div className="text-xs text-[var(--ink-3)]">
          {rejectedActions.length} {rejectedActions.length === 1 ? 'actie' : 'acties'} geweigerd
        </div>
      )}
    </div>
  )
}
