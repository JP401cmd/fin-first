'use client'

import { useEffect, useState, useCallback } from 'react'
import { X, Plus, Check, ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  type Goal, type GoalType, GOAL_TYPE_LABELS,
  computeGoalProgress, getGoalColorClasses,
} from '@/lib/goal-data'
import { BudgetIcon, formatCurrency } from '@/components/app/budget-shared'
import { GoalForm } from '@/components/app/goal-form'

type Asset = { id: string; name: string; current_value: number }
type Debt = { id: string; name: string; current_balance: number }

export function GoalDetailModal({
  open,
  onClose,
  onGoalsChanged,
}: {
  open: boolean
  onClose: () => void
  onGoalsChanged: () => void
}) {
  const [goals, setGoals] = useState<Goal[]>([])
  const [assets, setAssets] = useState<Asset[]>([])
  const [debts, setDebts] = useState<Debt[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editGoal, setEditGoal] = useState<Goal | null>(null)
  const [showCompleted, setShowCompleted] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    const supabase = createClient()
    const [goalsRes, assetsRes, debtsRes] = await Promise.all([
      supabase.from('goals').select('*').order('sort_order', { ascending: true }),
      supabase.from('assets').select('id, name, current_value').eq('is_active', true),
      supabase.from('debts').select('id, name, current_balance').eq('is_active', true),
    ])

    if (goalsRes.data) {
      const updatedGoals = (goalsRes.data as Goal[]).map((goal) => {
        if (goal.linked_asset_id && assetsRes.data) {
          const asset = (assetsRes.data as Asset[]).find(a => a.id === goal.linked_asset_id)
          if (asset) return { ...goal, current_value: Number(asset.current_value) }
        }
        if (goal.linked_debt_id && debtsRes.data) {
          const debt = (debtsRes.data as Debt[]).find(d => d.id === goal.linked_debt_id)
          if (debt) {
            const paid = Number(goal.target_value) - Number(debt.current_balance)
            return { ...goal, current_value: Math.max(0, paid) }
          }
        }
        return goal
      })
      setGoals(updatedGoals)
    }
    if (assetsRes.data) setAssets(assetsRes.data as Asset[])
    if (debtsRes.data) setDebts(debtsRes.data as Debt[])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (open) loadData()
  }, [open, loadData])

  async function toggleComplete(goal: Goal) {
    const supabase = createClient()
    const nowCompleted = !goal.is_completed
    await supabase
      .from('goals')
      .update({
        is_completed: nowCompleted,
        completed_at: nowCompleted ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', goal.id)
    loadData()
    onGoalsChanged()
  }

  async function deleteGoal(id: string) {
    const supabase = createClient()
    await supabase.from('goals').delete().eq('id', id)
    setConfirmDelete(null)
    loadData()
    onGoalsChanged()
  }

  function handleClose() {
    onGoalsChanged()
    onClose()
  }

  const activeGoals = goals.filter(g => !g.is_completed)
  const completedGoals = goals.filter(g => g.is_completed)

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-xl" style={{ maxHeight: '90vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Alle doelen</h2>
            <p className="text-sm text-zinc-500">
              {goals.length === 0
                ? 'Stel je eerste financiele doel en volg je voortgang.'
                : `${completedGoals.length} van ${goals.length} doelen bereikt`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setEditGoal(null); setShowForm(true) }}
              className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-700"
            >
              <Plus className="h-4 w-4" />
              Nieuw doel
            </button>
            <button
              onClick={handleClose}
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
            </div>
          ) : goals.length === 0 ? (
            <div className="rounded-xl border border-dashed border-teal-300 bg-teal-50/50 p-8 text-center">
              <h3 className="text-lg font-bold text-zinc-900">Geen doelen ingesteld</h3>
              <p className="mt-2 text-sm text-zinc-500">
                Begin met het instellen van je eerste financiele doel. Koppel het aan je assets of schulden voor live voortgang.
              </p>
            </div>
          ) : (
            <>
              {/* Active goals */}
              {activeGoals.length > 0 && (
                <section>
                  <h3 className="mb-3 text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">
                    Actief ({activeGoals.length})
                  </h3>
                  <div className="space-y-3">
                    {activeGoals.map((goal) => (
                      <GoalCard
                        key={goal.id}
                        goal={goal}
                        onEdit={() => { setEditGoal(goal); setShowForm(true) }}
                        onToggleComplete={() => toggleComplete(goal)}
                        onDelete={() => {
                          if (confirmDelete === goal.id) {
                            deleteGoal(goal.id)
                          } else {
                            setConfirmDelete(goal.id)
                          }
                        }}
                        isConfirmingDelete={confirmDelete === goal.id}
                        onCancelDelete={() => setConfirmDelete(null)}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Completed goals */}
              {completedGoals.length > 0 && (
                <section className="mt-6">
                  <button
                    onClick={() => setShowCompleted(v => !v)}
                    className="flex items-center gap-2 text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase hover:text-zinc-600"
                  >
                    {showCompleted ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    Voltooid ({completedGoals.length})
                  </button>
                  {showCompleted && (
                    <div className="mt-3 space-y-3">
                      {completedGoals.map((goal) => (
                        <GoalCard
                          key={goal.id}
                          goal={goal}
                          onEdit={() => { setEditGoal(goal); setShowForm(true) }}
                          onToggleComplete={() => toggleComplete(goal)}
                          onDelete={() => {
                            if (confirmDelete === goal.id) {
                              deleteGoal(goal.id)
                            } else {
                              setConfirmDelete(goal.id)
                            }
                          }}
                          isConfirmingDelete={confirmDelete === goal.id}
                          onCancelDelete={() => setConfirmDelete(null)}
                        />
                      ))}
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      </div>

      {/* GoalForm sub-modal */}
      {showForm && (
        <div className="z-[60]">
          <GoalForm
            goal={editGoal ?? undefined}
            assets={assets}
            debts={debts}
            onClose={() => { setShowForm(false); setEditGoal(null) }}
            onSaved={() => {
              setShowForm(false)
              setEditGoal(null)
              loadData()
              onGoalsChanged()
            }}
          />
        </div>
      )}
    </div>
  )
}

function GoalCard({
  goal,
  onEdit,
  onToggleComplete,
  onDelete,
  isConfirmingDelete,
  onCancelDelete,
}: {
  goal: Goal
  onEdit: () => void
  onToggleComplete: () => void
  onDelete: () => void
  isConfirmingDelete: boolean
  onCancelDelete: () => void
}) {
  const { current, target, pct, onTrack, eta } = computeGoalProgress(goal)
  const colors = getGoalColorClasses(goal.color)
  const typeLabel = GOAL_TYPE_LABELS[goal.goal_type as GoalType] ?? goal.goal_type
  const isFreedm = goal.goal_type === 'freedom_days'

  return (
    <div
      className={`overflow-hidden rounded-xl border bg-white ${
        goal.is_completed ? 'border-zinc-200 opacity-70' : `${colors.border}`
      }`}
    >
      <div className="flex items-start gap-3 p-4">
        {/* Complete checkbox */}
        <button
          onClick={onToggleComplete}
          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
            goal.is_completed
              ? 'border-emerald-500 bg-emerald-500 text-white'
              : `${colors.border} hover:bg-zinc-50`
          }`}
        >
          {goal.is_completed && <Check className="h-3.5 w-3.5" />}
        </button>

        {/* Icon */}
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${colors.bgLight}`}>
          <BudgetIcon name={goal.icon} className={`h-5 w-5 ${colors.text}`} />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1 cursor-pointer" onClick={onEdit}>
          <div className="flex items-center gap-2">
            <h3 className={`font-medium ${goal.is_completed ? 'text-zinc-500 line-through' : 'text-zinc-900'}`}>
              {goal.name}
            </h3>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${colors.bgLight} ${colors.text}`}>
              {typeLabel}
            </span>
            {!goal.is_completed && !onTrack && goal.target_date && (
              <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-600">
                Achterstand
              </span>
            )}
          </div>
          {goal.description && (
            <p className="mt-0.5 truncate text-xs text-zinc-500">{goal.description}</p>
          )}

          {/* Progress bar */}
          <div className="mt-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-zinc-700">
                {isFreedm
                  ? `${Math.round(current)} / ${Math.round(target)} dagen`
                  : `${formatCurrency(current)} / ${formatCurrency(target)}`}
              </span>
              <span className="text-zinc-500">
                {pct}%
                {eta && ` · ${eta}`}
              </span>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-zinc-100">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  goal.is_completed ? 'bg-emerald-500' : colors.bar
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {/* Linked entity info */}
          {(goal.linked_asset_id || goal.linked_debt_id) && (
            <p className="mt-1.5 text-[10px] text-zinc-400">
              Gekoppeld · waarde wordt automatisch bijgewerkt
            </p>
          )}
        </div>

        {/* Delete */}
        <div className="shrink-0">
          {isConfirmingDelete ? (
            <div className="flex items-center gap-1">
              <button
                onClick={onDelete}
                className="rounded bg-red-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-red-700"
              >
                Verwijder
              </button>
              <button
                onClick={onCancelDelete}
                className="rounded px-2 py-1 text-[10px] font-medium text-zinc-500 hover:bg-zinc-100"
              >
                Annuleer
              </button>
            </div>
          ) : (
            <button
              onClick={onDelete}
              className="rounded p-1.5 text-zinc-300 hover:bg-red-50 hover:text-red-500"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
