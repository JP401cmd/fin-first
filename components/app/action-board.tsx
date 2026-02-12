'use client'

import { useState } from 'react'
import { Plus, ChevronDown, ChevronRight, Sparkles, Link as LinkIcon } from 'lucide-react'
import { ActionCard } from '@/components/app/action-card'
import { ActionForm } from '@/components/app/action-form'
import type { Action, ActionStatus } from '@/lib/recommendation-data'

type ActionBoardProps = {
  initialActions: Action[]
}

export function ActionBoard({ initialActions }: ActionBoardProps) {
  const [actions, setActions] = useState<Action[]>(initialActions)
  const [showForm, setShowForm] = useState(false)
  const [showPostponed, setShowPostponed] = useState(false)
  const [showCompleted, setShowCompleted] = useState(false)

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
      <div className="rounded-2xl border border-teal-200 bg-teal-50 p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-teal-100">
          <Sparkles className="h-6 w-6 text-teal-600" />
        </div>
        <h2 className="mb-2 text-xl font-bold text-zinc-900">Nog geen acties</h2>
        <p className="mb-6 text-zinc-500">
          Maak handmatig een actie aan of genereer suggesties op de{' '}
          <a href="/will/optimization" className="inline-flex items-center gap-1 text-teal-600 hover:underline">
            <LinkIcon className="h-3 w-3" /> Optimalisatie
          </a>{' '}
          pagina.
        </p>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-teal-500 px-6 py-3 font-medium text-white transition-colors hover:bg-teal-600"
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
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-teal-200 px-4 py-3 text-sm font-medium text-teal-600 transition-colors hover:border-teal-300 hover:bg-teal-50"
        >
          <Plus className="h-4 w-4" />
          Nieuwe actie
        </button>
      )}

      {/* Open actions */}
      {openActions.length > 0 && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-900">
              Open ({openActions.length})
            </h3>
            {totalOpenDays > 0 && (
              <span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-medium text-teal-700">
                {Math.round(totalOpenDays)} dagen potentieel
              </span>
            )}
          </div>
          <div className="space-y-2">
            {openActions.map((action) => (
              <ActionCard key={action.id} action={action} onStatusChange={handleStatusChange} onUpdate={handleUpdateAction} />
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
                <ActionCard key={action.id} action={action} onStatusChange={handleStatusChange} onUpdate={handleUpdateAction} />
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
                <ActionCard key={action.id} action={action} onStatusChange={handleStatusChange} onUpdate={handleUpdateAction} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Rejected actions (always collapsed, subtle) */}
      {rejectedActions.length > 0 && (
        <div className="text-xs text-zinc-400">
          {rejectedActions.length} {rejectedActions.length === 1 ? 'actie' : 'acties'} geweigerd
        </div>
      )}
    </div>
  )
}
