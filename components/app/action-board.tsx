'use client'

import { useState, useEffect } from 'react'
import { Plus, ChevronDown, Users, CheckCircle } from 'lucide-react'
import { ActionCard } from '@/components/app/action-card'
import { ActionForm } from '@/components/app/action-form'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { useFreedomDaysAnimation } from '@/components/app/freedom-days-animation'
import type { Action, ActionStatus } from '@/lib/recommendation-data'
import type { CancellationMetadata } from '@/lib/cancellation-types'

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
}

export function ActionBoard({ initialActions, onCancellationOpen, partnerInfo, currentUserId, addTrigger }: ActionBoardProps) {
  const [actions, setActions] = useState<Action[]>(initialActions)
  useEffect(() => { setActions(initialActions) }, [initialActions])
  const [showForm, setShowForm] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [showModalCompleted, setShowModalCompleted] = useState(false)
  const [showModalRejected, setShowModalRejected] = useState(false)
  const { triggerAnimation } = useFreedomDaysAnimation()

  // Allow parent to trigger showing the add form via counter prop
  useEffect(() => {
    if (addTrigger && addTrigger > 0) {
      setShowForm(true)
    }
  }, [addTrigger])

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

  const totalOpenDays = openActions.reduce((sum, a) => sum + (a.freedom_days_impact || 0), 0)
  const totalCompletedDays = completedActions.reduce((sum, a) => sum + (a.freedom_days_impact || 0), 0)

  // All open (own + partner) sorted by impact for the modal
  const allOpenByImpact = [...openActions, ...postponedActions, ...partnerOpenActions]
    .sort((a, b) => (b.freedom_days_impact || 0) - (a.freedom_days_impact || 0))

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
        <div className="py-6 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-wil-50">
            <CheckCircle className="h-5 w-5 text-wil-400" />
          </div>
          <p className="mb-4 font-serif text-sm text-[var(--ink-3)]">
            Nog geen acties — maak er een aan of accepteer een voorstel.
          </p>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1.5 rounded-[var(--r)] border border-[var(--border-ed)] px-4 py-2 text-xs font-semibold text-[var(--ink-2)] transition-colors hover:border-[var(--border-md)] hover:bg-[var(--subtle)]"
          >
            <Plus className="h-3.5 w-3.5" />
            Nieuwe actie
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
        <p className="py-2 text-center text-xs text-[var(--ink-3)]">
          Geen openstaande acties{completedActions.length > 0 ? ` — ${completedActions.length} afgerond` : ''}
        </p>
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
      <BottomSheet
        open={showAll}
        onClose={() => { setShowAll(false); setShowModalCompleted(false); setShowModalRejected(false) }}
        title="Alle acties"
        size="lg"
      >
        <div className="px-5 pb-6 pt-2">
          {/* Summary strip */}
          <div className="mb-5 flex items-center gap-4 text-xs text-[var(--ink-3)]">
            <span><span className="font-mono tabular-nums font-semibold text-[var(--ink)]">{allOpenByImpact.length}</span> openstaand</span>
            {totalOpenDays > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-wil-50 px-2 py-0.5 font-mono tabular-nums text-[10px] font-medium text-wil-700">
                {Math.round(totalOpenDays)}d potentieel
              </span>
            )}
            {completedActions.length > 0 && (
              <span><span className="font-mono tabular-nums font-semibold text-emerald-600">{completedActions.length}</span> afgerond</span>
            )}
            {rejectedActions.length > 0 && (
              <span><span className="font-mono tabular-nums font-semibold text-[var(--ink-3)]">{rejectedActions.length}</span> afgewezen</span>
            )}
          </div>

          {/* New action button */}
          {!showForm && (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="mb-4 inline-flex items-center gap-1.5 rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-1.5 text-xs font-medium text-[var(--ink-2)] transition-colors hover:border-[var(--border-md)] hover:bg-[var(--subtle)]"
            >
              <Plus className="h-3.5 w-3.5" />
              Nieuwe actie
            </button>
          )}

          {showForm && (
            <div className="mb-4">
              <ActionForm onSubmit={handleCreateAction} onCancel={() => setShowForm(false)} />
            </div>
          )}

          {/* Open actions — sorted by impact */}
          {allOpenByImpact.length > 0 && (
            <div className="space-y-2">
              {allOpenByImpact.map((action) => (
                <ActionCard
                  key={action.id}
                  action={action}
                  {...cardProps}
                  isPartnerAssigned={isPartnerAssigned(action) as boolean}
                />
              ))}
            </div>
          )}

          {allOpenByImpact.length === 0 && (
            <div className="rounded-[var(--r)] border border-dashed border-[var(--border-md)] bg-[var(--subtle)] p-6 text-center">
              <p className="text-sm text-[var(--ink-3)]">Geen openstaande acties</p>
            </div>
          )}

          {/* Completed actions — collapsible */}
          {completedActions.length > 0 && (
            <div className="mt-6 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--subtle)]/30">
              <button
                type="button"
                onClick={() => setShowModalCompleted(!showModalCompleted)}
                className="flex w-full items-center gap-2 px-4 py-3 text-left"
              >
                <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--ink-3)] transition-transform duration-200 ${showModalCompleted ? 'rotate-0' : '-rotate-90'}`} />
                <span className="text-xs font-semibold text-[var(--ink-2)]">Afgerond</span>
                <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-emerald-50 px-1.5 font-mono text-[10px] font-bold tabular-nums text-emerald-700">
                  {completedActions.length}
                </span>
                {totalCompletedDays > 0 && (
                  <span className="ml-auto font-mono text-[10px] tabular-nums font-medium text-emerald-600">
                    {Math.round(totalCompletedDays)}d gewonnen
                  </span>
                )}
              </button>
              {showModalCompleted && (
                <div className="space-y-2 px-4 pb-4">
                  {completedActions.map((action) => (
                    <ActionCard key={action.id} action={action} {...cardProps} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Rejected actions — collapsible */}
          {rejectedActions.length > 0 && (
            <div className="mt-3 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--subtle)]/30">
              <button
                type="button"
                onClick={() => setShowModalRejected(!showModalRejected)}
                className="flex w-full items-center gap-2 px-4 py-3 text-left"
              >
                <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--ink-3)] transition-transform duration-200 ${showModalRejected ? 'rotate-0' : '-rotate-90'}`} />
                <span className="text-xs font-semibold text-[var(--ink-2)]">Afgewezen</span>
                <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-zinc-100 px-1.5 font-mono text-[10px] font-bold tabular-nums text-[var(--ink-3)]">
                  {rejectedActions.length}
                </span>
              </button>
              {showModalRejected && (
                <div className="space-y-2 px-4 pb-4">
                  {rejectedActions.map((action) => (
                    <ActionCard key={action.id} action={action} {...cardProps} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </BottomSheet>
    </div>
  )
}
