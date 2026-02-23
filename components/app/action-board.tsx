'use client'

import { useState } from 'react'
import { Plus, ChevronDown, ChevronRight, Sparkles } from 'lucide-react'
import { ActionCard } from '@/components/app/action-card'
import { ActionForm } from '@/components/app/action-form'
import { useFreedomDaysAnimation } from '@/components/app/freedom-days-animation'
import type { Action, ActionStatus } from '@/lib/recommendation-data'
import type { CancellationMetadata } from '@/lib/cancellation-types'

type ActionBoardProps = {
  initialActions: Action[]
  onCancellationOpen?: (metadata: CancellationMetadata) => void
}

export function ActionBoard({ initialActions, onCancellationOpen }: ActionBoardProps) {
  const [actions, setActions] = useState<Action[]>(initialActions)
  const [showForm, setShowForm] = useState(false)
  const [showPostponed, setShowPostponed] = useState(false)
  const [showCompleted, setShowCompleted] = useState(false)
  const { triggerAnimation } = useFreedomDaysAnimation()

  const openActions = actions
    .filter((a) => a.status === 'open')
    .sort((a, b) => (b.priority_score || 0) - (a.priority_score || 0) || a.sort_order - b.sort_order)

  const postponedActions = actions.filter((a) => a.status === 'postponed')
  const completedActions = actions.filter((a) => a.status === 'completed')
  const rejectedActions = actions.filter((a) => a.status === 'rejected')

  const totalOpenDays = openActions.reduce((sum, a) => sum + (a.freedom_days_impact || 0), 0)
  const totalCompletedDays = completedActions.reduce((sum, a) => sum + (a.freedom_days_impact || 0), 0)

  async function handleStatusChange(id: string, status: ActionStatus, data?: Record<string, unknown>) {
    const res = await fetch(`/api/ai/actions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, ...data }),
    })

    if (!res.ok) return

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

  if (actions.length === 0 && !showForm) {
    return (
      <div className="rounded-[var(--r-lg)] border border-wil-200 bg-wil-50 p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-wil-100">
          <Sparkles className="h-6 w-6 text-wil-600" />
        </div>
        <h2 className="mb-2 text-xl font-bold text-[var(--ink)]">Nog geen acties</h2>
        <p className="mb-6 text-[var(--ink-3)]">
          Maak handmatig een actie aan of bekijk de suggesties hierboven.
        </p>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-wil-500 px-6 py-3 font-medium text-white transition-colors hover:bg-wil-600"
        >
          <Plus className="h-5 w-5" />
          Nieuwe actie
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* New action button / form */}
      {showForm ? (
        <ActionForm onSubmit={handleCreateAction} onCancel={() => setShowForm(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="flex w-full items-center justify-center gap-2 rounded-[var(--r-lg)] border-2 border-dashed border-wil-200 px-4 py-3 text-sm font-medium text-wil-600 transition-colors hover:border-wil-300 hover:bg-wil-50"
        >
          <Plus className="h-4 w-4" />
          Nieuwe actie
        </button>
      )}

      {/* Open actions */}
      {openActions.length > 0 && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--ink)]">
              Open ({openActions.length})
            </h3>
            {totalOpenDays > 0 && (
              <span className="rounded-full bg-wil-100 px-2.5 py-0.5 text-xs font-medium text-wil-700">
                {Math.round(totalOpenDays)} dagen potentieel
              </span>
            )}
          </div>
          <div className="space-y-2">
            {openActions.map((action) => (
              <ActionCard key={action.id} action={action} onStatusChange={handleStatusChange} onUpdate={handleUpdateAction} onCancellationOpen={onCancellationOpen} />
            ))}
          </div>
        </div>
      )}

      {/* Postponed actions */}
      {postponedActions.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowPostponed(!showPostponed)}
            className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-amber-600"
          >
            {showPostponed ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            Uitgesteld ({postponedActions.length})
          </button>
          {showPostponed && (
            <div className="space-y-2">
              {postponedActions.map((action) => (
                <ActionCard key={action.id} action={action} onStatusChange={handleStatusChange} onUpdate={handleUpdateAction} onCancellationOpen={onCancellationOpen} />
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
            className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-emerald-600"
          >
            {showCompleted ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            Afgerond ({completedActions.length})
            {totalCompletedDays > 0 && (
              <span className="ml-1 font-normal text-emerald-500">
                — {Math.round(totalCompletedDays)} dagen gewonnen
              </span>
            )}
          </button>
          {showCompleted && (
            <div className="space-y-2">
              {completedActions.map((action) => (
                <ActionCard key={action.id} action={action} onStatusChange={handleStatusChange} onUpdate={handleUpdateAction} onCancellationOpen={onCancellationOpen} />
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
