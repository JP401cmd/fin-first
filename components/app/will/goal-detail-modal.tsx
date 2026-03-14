'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, Check, ChevronDown, ChevronUp, Trash2, BarChart3, Users } from 'lucide-react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { createClient } from '@/lib/supabase/client'
import {
  type Goal, type GoalType, GOAL_TYPE_LABELS, GOAL_TYPE_META,
  computeGoalProgress, getGoalColorClasses, formatGoalValue,
} from '@/lib/goal-data'
import { computeSharePct, SPLIT_MODE_LABELS, type SplitMode } from '@/lib/household-data'
import { BudgetIcon, formatCurrency } from '@/components/app/budget-shared'
import { GoalForm } from '@/components/app/goal-form'
import { GoalProgressTimeline, buildGoalHistory } from '@/components/app/will/goal-progress-timeline'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { useDailyExpenseRate, eurToFreedomTime } from '@/components/app/freedom-time-label'

type HouseholdInfo = {
  householdId: string
  splitMode: SplitMode
  customSplitPct: number | null
  primaryPayerId: string | null
  myUserId: string
  myName: string
  partnerName: string
  mySharePct: number
}

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
  const [goalFilter, setGoalFilter] = useState<'all' | 'personal' | 'shared'>('all')
  const [householdInfo, setHouseholdInfo] = useState<HouseholdInfo | null>(null)

  const loadData = useCallback(async () => {
    const supabase = createClient()
    // Use the API for goals (includes shared household goals)
    const [goalsApiRes, assetsRes, debtsRes] = await Promise.all([
      fetch('/api/goals').then(r => r.ok ? r.json() : []),
      supabase.from('assets').select('id, name, current_value').eq('is_active', true),
      supabase.from('debts').select('id, name, current_balance').eq('is_active', true),
    ])

    const goalsData = (Array.isArray(goalsApiRes) ? goalsApiRes : []) as Goal[]
    const updatedGoals = goalsData.map((goal) => {
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

    if (assetsRes.data) setAssets(assetsRes.data as Asset[])
    if (debtsRes.data) setDebts(debtsRes.data as Debt[])

    // Fetch household info for per-partner breakdown on shared goals
    const hasAnyShared = updatedGoals.some(g => g.ownership === 'shared')
    if (hasAnyShared) {
      try {
        const statusRes = await fetch('/api/household/status')
        if (statusRes.ok) {
          const status = await statusRes.json()
          if (status.has_household && status.household) {
            const settingsRes = await fetch('/api/household/settings')
            const settings = settingsRes.ok ? await settingsRes.json() : {}
            const supabase2 = createClient()
            const { data: { user: me } } = await supabase2.auth.getUser()
            const myMember = (status.members ?? []).find((m: { is_current_user: boolean }) => m.is_current_user)
            const partnerMember = (status.members ?? []).find((m: { is_current_user: boolean }) => !m.is_current_user)
            const splitMode: SplitMode = settings.split_mode || 'equal'
            const mySharePct = computeSharePct(
              { splitMode, customSplitPct: settings.custom_split_pct ?? null, primaryPayerId: settings.primary_payer_id ?? null },
              me?.id ?? '',
            )
            setHouseholdInfo({
              householdId: status.household.id,
              splitMode,
              customSplitPct: settings.custom_split_pct ?? null,
              primaryPayerId: settings.primary_payer_id ?? null,
              myUserId: me?.id ?? '',
              myName: myMember?.full_name || 'Jij',
              partnerName: partnerMember?.full_name || 'Partner',
              mySharePct,
            })
          }
        }
      } catch {
        // Non-critical — proceed without household info
      }
    }

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
    setShowForm(false)
    setEditGoal(null)
    onGoalsChanged()
    onClose()
  }

  const hasSharedGoals = goals.some(g => g.ownership === 'shared')
  const filterFn = (g: Goal) =>
    goalFilter === 'all' ? true : goalFilter === 'shared' ? g.ownership === 'shared' : g.ownership !== 'shared'
  const activeGoals = goals.filter(g => !g.is_completed && filterFn(g))
  const completedGoals = goals.filter(g => g.is_completed && filterFn(g))

  return (
    <>
      <BottomSheet open={open} onClose={handleClose} title="Alle doelen" size="lg">
        {/* Sub-header */}
        <div className="flex items-center justify-between px-5 pb-3 pt-1">
          <p className="text-sm text-[var(--ink-3)]">
            {goals.length === 0
              ? 'Stel je eerste financiele doel en volg je voortgang.'
              : `${completedGoals.length} van ${goals.length} doelen bereikt`}
          </p>
          <button
            onClick={() => { setEditGoal(null); setShowForm(true) }}
            className="inline-flex items-center gap-2 rounded-lg bg-wil-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-wil-700"
          >
            <Plus className="h-4 w-4" />
            Nieuw doel
          </button>
        </div>

        {/* Filter tabs */}
        {hasSharedGoals && !loading && goals.length > 0 && (
          <div className="border-b border-[var(--border-ed)] px-5 py-2">
            <div className="flex gap-1 rounded-lg bg-[var(--subtle)] p-1">
              {([
                { key: 'all' as const, label: 'Alle' },
                { key: 'personal' as const, label: 'Persoonlijk' },
                { key: 'shared' as const, label: 'Gedeeld' },
              ]).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setGoalFilter(key)}
                  className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    goalFilter === key
                      ? 'bg-[var(--paper)] text-[var(--ink)] shadow-sm'
                      : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="p-5">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-wil-500 border-t-transparent" />
            </div>
          ) : goals.length === 0 ? (
            <div className="rounded-[var(--r-lg)] border border-dashed border-wil-300 bg-wil-50/50 p-8 text-center">
              <h3 className="text-lg font-bold text-[var(--ink)]">Geen doelen ingesteld</h3>
              <p className="mt-2 text-sm text-[var(--ink-3)]">
                Begin met het instellen van je eerste financiele doel. Koppel het aan je assets of schulden voor live voortgang.
              </p>
            </div>
          ) : (
            <>
              {/* Active goals */}
              {activeGoals.length > 0 && (
                <section>
                  <h3 className="mb-3 text-xs font-semibold tracking-[0.15em] text-[var(--ink-3)] uppercase">
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
                        onContributionAdded={() => { loadData(); onGoalsChanged() }}
                        householdInfo={householdInfo}
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
                    className="flex items-center gap-2 text-xs font-semibold tracking-[0.15em] text-[var(--ink-3)] uppercase hover:text-[var(--ink-2)]"
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
                          onContributionAdded={() => { loadData(); onGoalsChanged() }}
                          householdInfo={householdInfo}
                        />
                      ))}
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      </BottomSheet>

      {/* GoalForm sub-modal */}
      {showForm && (
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
      )}
    </>
  )
}

type GoalContribution = {
  id: string
  amount: number
  date: string
  notes: string | null
}

function GoalCard({
  goal,
  onEdit,
  onToggleComplete,
  onDelete,
  isConfirmingDelete,
  onCancelDelete,
  onContributionAdded,
  householdInfo,
}: {
  goal: Goal
  onEdit: () => void
  onToggleComplete: () => void
  onDelete: () => void
  isConfirmingDelete: boolean
  onCancelDelete: () => void
  onContributionAdded: () => void
  householdInfo: HouseholdInfo | null
}) {
  const { current, target, pct, onTrack, eta } = computeGoalProgress(goal)
  const colors = getGoalColorClasses(goal.color)
  const typeLabel = GOAL_TYPE_LABELS[goal.goal_type as GoalType] ?? goal.goal_type
  const goalType = goal.goal_type as GoalType
  const meta = GOAL_TYPE_META[goalType] ?? GOAL_TYPE_META.custom
  const isLinked = !!(goal.linked_asset_id || goal.linked_debt_id)
  const { ref: inViewRef, hasEntered } = useInViewAnimation({ threshold: 0.1, duration: 600, triggerDelay: 300 })
  const { dailyExpenseRate, source } = useDailyExpenseRate()
  const hasFreedomData = meta.freedomTimeRelevant && source === 'transactions' && dailyExpenseRate > 0
  const targetFreedom = hasFreedomData && target >= 100 ? eurToFreedomTime(target, dailyExpenseRate) : null
  const currentFreedom = hasFreedomData && current >= 100 ? eurToFreedomTime(current, dailyExpenseRate) : null
  const remainingFreedom = hasFreedomData && (target - current) >= 100 ? eurToFreedomTime(target - current, dailyExpenseRate) : null

  const [showContrib, setShowContrib] = useState(false)
  const [contributions, setContributions] = useState<GoalContribution[]>([])
  const [contribAmount, setContribAmount] = useState('')
  const [contribNotes, setContribNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [showTimeline, setShowTimeline] = useState(false)
  const [timelineHistory, setTimelineHistory] = useState<{ date: string; value: number; source?: string }[]>([])
  const [timelineLoading, setTimelineLoading] = useState(false)

  async function loadContributions() {
    const supabase = createClient()
    const { data } = await supabase
      .from('goal_contributions')
      .select('id, amount, date, notes')
      .eq('goal_id', goal.id)
      .order('date', { ascending: false })
      .limit(10)
    setContributions((data ?? []) as GoalContribution[])
  }

  async function loadTimeline() {
    setTimelineLoading(true)
    try {
      const supabase = createClient()
      // Load all contributions for this goal (not just latest 10)
      const { data: allContribs } = await supabase
        .from('goal_contributions')
        .select('amount, date')
        .eq('goal_id', goal.id)
        .order('date', { ascending: true })

      const contribs = (allContribs ?? []) as { amount: number; date: string }[]
      const history = buildGoalHistory(goal, contribs)
      setTimelineHistory(history)
    } catch {
      // Fallback: just show current value
      setTimelineHistory([
        { date: goal.created_at.split('T')[0], value: 0, source: 'initial' },
        { date: new Date().toISOString().split('T')[0], value: Number(goal.current_value), source: 'current' },
      ])
    }
    setTimelineLoading(false)
  }

  async function addContribution() {
    const amount = parseFloat(contribAmount)
    if (!amount || amount <= 0) return
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('goal_contributions').insert({
      user_id: user.id,
      goal_id: goal.id,
      amount,
      date: new Date().toISOString().split('T')[0],
      notes: contribNotes.trim() || null,
    })

    // Update goal current_value
    await supabase
      .from('goals')
      .update({
        current_value: Number(goal.current_value) + amount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', goal.id)

    setContribAmount('')
    setContribNotes('')
    setSaving(false)
    loadContributions()
    onContributionAdded()
  }

  return (
    <div
      className={`overflow-hidden rounded-[var(--r-lg)] border bg-[var(--paper)] ${
        goal.is_completed ? 'border-[var(--border-ed)] opacity-70' : `${colors.border}`
      }`}
    >
      <div className="flex items-start gap-3 p-4">
        {/* Complete checkbox */}
        <button
          onClick={onToggleComplete}
          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
            goal.is_completed
              ? 'border-emerald-500 bg-emerald-500 text-white'
              : `${colors.border} hover:bg-[var(--subtle)]`
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
            <h3 className={`font-medium ${goal.is_completed ? 'text-[var(--ink-3)] line-through' : 'text-[var(--ink)]'}`}>
              {goal.name}
            </h3>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${colors.bgLight} ${colors.text}`}>
              {typeLabel}
            </span>
            {goal.ownership === 'shared' && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-wil-50 px-2 py-0.5 text-[10px] font-medium text-wil-600">
                <Users className="h-2.5 w-2.5" /> Gedeeld
              </span>
            )}
            {!goal.is_completed && !onTrack && goal.target_date && (
              <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-600">
                Achterstand
              </span>
            )}
          </div>
          {goal.description && (
            <p className="mt-0.5 truncate text-xs text-[var(--ink-3)]">{goal.description}</p>
          )}

          {/* Progress bar */}
          <div className="mt-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-[var(--ink-2)]">
                {`${formatGoalValue(current, goalType, goal.custom_unit)} / ${formatGoalValue(target, goalType, goal.custom_unit)}`}
                {targetFreedom && (
                  <span className="ml-1.5 font-normal italic text-[var(--ink-3)]">
                    ≈ {currentFreedom ? currentFreedom.formatted : '0d'} / {targetFreedom.formatted} vrijheid
                  </span>
                )}
              </span>
              <span className="text-[var(--ink-3)]">
                {pct}%
                {eta && ` · ${eta}`}
              </span>
            </div>
            <div ref={inViewRef} className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-zinc-100">
              <div
                className={`h-full rounded-full ${
                  goal.is_completed ? 'bg-emerald-500' : colors.bar
                }`}
                style={{
                  width: hasEntered ? `${pct}%` : '0%',
                  transition: hasEntered ? 'width 500ms cubic-bezier(.22,1,.36,1)' : 'none',
                }}
              />
            </div>
            {/* Remaining freedom time */}
            {remainingFreedom && !goal.is_completed && (
              <p className="mt-1 text-[10px] italic text-[var(--ink-3)]">
                Nog {remainingFreedom.formatted} vrijheid te gaan
              </p>
            )}
          </div>

          {/* Per-partner contribution breakdown for shared goals */}
          {goal.ownership === 'shared' && householdInfo && !goal.is_completed && (
            <div className="mt-2.5 rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)]/50 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-3)]">
                  Bijdrage per partner
                </span>
                <span className="text-[10px] text-[var(--ink-4)]">
                  {SPLIT_MODE_LABELS[householdInfo.splitMode]}
                </span>
              </div>
              {/* My contribution */}
              <div className="space-y-1.5">
                {(() => {
                  const myExpected = target * householdInfo.mySharePct / 100
                  const partnerExpected = target * (100 - householdInfo.mySharePct) / 100
                  const myFreedom = hasFreedomData && myExpected >= 100 ? eurToFreedomTime(myExpected, dailyExpenseRate) : null
                  const partnerFreedom = hasFreedomData && partnerExpected >= 100 ? eurToFreedomTime(partnerExpected, dailyExpenseRate) : null
                  return (
                    <>
                      <div>
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="font-medium text-wil-600">{householdInfo.myName}</span>
                          <span className="text-[var(--ink-3)]">
                            {formatGoalValue(myExpected, goalType, goal.custom_unit)} verwacht
                            {myFreedom && (
                              <span className="ml-1 italic">≈ {myFreedom.formatted}</span>
                            )}
                          </span>
                        </div>
                        <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
                          <div
                            className="h-full rounded-full bg-wil-400 transition-all duration-500"
                            style={{ width: `${Math.min(100, target > 0 ? ((current * householdInfo.mySharePct / 100) / (target * householdInfo.mySharePct / 100)) * 100 : 0)}%` }}
                          />
                        </div>
                      </div>
                      {/* Partner contribution */}
                      <div>
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="font-medium text-horizon-600">{householdInfo.partnerName}</span>
                          <span className="text-[var(--ink-3)]">
                            {formatGoalValue(partnerExpected, goalType, goal.custom_unit)} verwacht
                            {partnerFreedom && (
                              <span className="ml-1 italic">≈ {partnerFreedom.formatted}</span>
                            )}
                          </span>
                        </div>
                        <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
                          <div
                            className="h-full rounded-full bg-horizon-400 transition-all duration-500"
                            style={{ width: `${Math.min(100, target > 0 ? ((current * (100 - householdInfo.mySharePct) / 100) / (target * (100 - householdInfo.mySharePct) / 100)) * 100 : 0)}%` }}
                          />
                        </div>
                      </div>
                    </>
                  )
                })()}
              </div>
            </div>
          )}

          {/* Linked entity info */}
          {isLinked && (
            <p className="mt-1.5 text-[10px] text-[var(--ink-3)]">
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
                className="rounded px-2 py-1 text-[10px] font-medium text-[var(--ink-3)] hover:bg-zinc-100"
              >
                Annuleer
              </button>
            </div>
          ) : (
            <button
              onClick={onDelete}
              className="rounded p-1.5 text-[var(--ink-4)] hover:bg-red-50 hover:text-red-500"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Timeline chart section */}
      <div className="border-t border-[var(--border-ed)] px-4 py-2" data-testid={`goal-timeline-section-${goal.id}`}>
        <button
          onClick={(e) => {
            e.stopPropagation()
            if (!showTimeline) loadTimeline()
            setShowTimeline(v => !v)
          }}
          className="flex items-center gap-1 text-[10px] font-medium text-wil-600 hover:text-wil-700"
        >
          <BarChart3 className="h-3 w-3" />
          Voortgang over tijd
          {showTimeline ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>

        {showTimeline && (
          <div className="mt-2" onClick={(e) => e.stopPropagation()}>
            {timelineLoading ? (
              <div className="flex items-center justify-center py-4">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-wil-500 border-t-transparent" />
              </div>
            ) : (
              <GoalProgressTimeline goal={goal} history={timelineHistory} />
            )}
          </div>
        )}
      </div>

      {/* Contribution section — only for non-linked, non-completed goals */}
      {!isLinked && !goal.is_completed && (
        <div className="border-t border-[var(--border-ed)] px-4 py-2">
          <button
            onClick={(e) => {
              e.stopPropagation()
              if (!showContrib) loadContributions()
              setShowContrib(v => !v)
            }}
            className="flex items-center gap-1 text-[10px] font-medium text-wil-600 hover:text-wil-700"
          >
            <Plus className="h-3 w-3" />
            Bijdrage registreren
            {showContrib ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>

          {showContrib && (
            <div className="mt-2 space-y-2" onClick={(e) => e.stopPropagation()}>
              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder={meta.unit === 'EUR' || meta.unit === 'EUR/mnd' ? 'Bedrag' : 'Waarde'}
                  value={contribAmount}
                  onChange={(e) => setContribAmount(e.target.value)}
                  className="w-28 rounded-lg border border-[var(--border-ed)] px-2 py-1.5 text-xs text-[var(--ink)] outline-none focus:border-wil-500"
                  min="0"
                  step="0.01"
                />
                <input
                  type="text"
                  placeholder="Notitie (optioneel)"
                  value={contribNotes}
                  onChange={(e) => setContribNotes(e.target.value)}
                  className="flex-1 rounded-lg border border-[var(--border-ed)] px-2 py-1.5 text-xs text-[var(--ink)] outline-none focus:border-wil-500"
                />
                <button
                  onClick={addContribution}
                  disabled={saving || !contribAmount}
                  className="rounded-lg bg-wil-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-wil-700 disabled:opacity-50"
                >
                  {saving ? '...' : '+'}
                </button>
              </div>

              {contributions.length > 0 && (
                <div className="max-h-24 space-y-1 overflow-y-auto">
                  {contributions.map((c) => (
                    <div key={c.id} className="flex items-center justify-between rounded px-1 py-0.5 text-[10px] hover:bg-[var(--subtle)]">
                      <span className="text-[var(--ink-3)]">
                        {new Date(c.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                        {c.notes && <span className="ml-1 text-[var(--ink-3)]">· {c.notes}</span>}
                      </span>
                      <span className="font-medium text-emerald-600">+{formatCurrency(Number(c.amount))}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
