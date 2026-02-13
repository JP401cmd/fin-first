'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { FinnAvatar } from '@/components/app/avatars'
import { RecommendationList } from '@/components/app/recommendation-list'
import { ActionBoard } from '@/components/app/action-board'
import { GoalDetailModal } from '@/components/app/will/goal-detail-modal'
import { GoalForm } from '@/components/app/goal-form'
import {
  type RecommendationType,
  RECOMMENDATION_TYPE_LABELS,
  type Recommendation,
  type Action,
} from '@/lib/recommendation-data'
import { computeGoalProgress, getGoalColorClasses, type Goal } from '@/lib/goal-data'
import {
  CheckCircle, Sparkles, Target, Flame, Info, Plus,
  AlertTriangle, Clock, TrendingDown, ArrowRight,
} from 'lucide-react'
import { NibudBenchmarkSection } from '@/components/app/will/nibud-benchmark'
import { FeatureGate } from '@/components/app/feature-gate'

type KpiData = {
  completedActions: { id: string; status: string; freedom_days_impact: number; source: string; completed_at: string | null; due_date: string | null; created_at: string; recommendation: { recommendation_type: string }[] | null }[]
  allActions: { id: string; status: string; freedom_days_impact: number; source: string; completed_at: string | null; due_date: string | null; created_at: string; recommendation: { recommendation_type: string }[] | null }[]
  openActions: { id: string; status: string; freedom_days_impact: number; due_date: string | null }[]
  allPendingRecs: { id: string; status: string; recommendation_type: string; freedom_days_per_year: number; decided_at: string | null; created_at: string }[]
  goals: Goal[]
  completedGoalCount: number
  totalGoalCount: number
  goalProgresses: { current: number; target: number; pct: number; onTrack: boolean; eta: string | null }[]
}

export default function WillPage() {
  const [kpi, setKpi] = useState<KpiData | null>(null)
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [actions, setActions] = useState<Action[]>([])
  const [loading, setLoading] = useState(true)
  const [showGoalModal, setShowGoalModal] = useState(false)
  const [showGoalForm, setShowGoalForm] = useState(false)
  const [goalAssets, setGoalAssets] = useState<{ id: string; name: string; current_value: number }[]>([])
  const [goalDebts, setGoalDebts] = useState<{ id: string; name: string; current_balance: number }[]>([])
  const loadData = useCallback(async () => {
    const supabase = createClient()
    const today = new Date().toISOString().split('T')[0]

    const [
      actionsRes,
      pendingRecsRes,
      feedbackRes,
      activeGoalsRes,
      completedGoalCountRes,
      totalGoalCountRes,
      recsForListRes,
      actionsForBoardRes,
      assetsRes,
      debtsRes,
    ] = await Promise.all([
      supabase
        .from('actions')
        .select('id, status, freedom_days_impact, source, completed_at, due_date, created_at, recommendation:recommendations(recommendation_type)')
        .order('created_at', { ascending: false }),
      supabase
        .from('recommendations')
        .select('id, status, recommendation_type, freedom_days_per_year, decided_at, created_at')
        .in('status', ['pending', 'postponed']),
      supabase
        .from('recommendation_feedback')
        .select('id, feedback_type, recommendation_type, freedom_days_impact, created_at'),
      supabase
        .from('goals')
        .select('*')
        .eq('is_completed', false)
        .order('sort_order', { ascending: true })
        .limit(5),
      supabase
        .from('goals')
        .select('*', { count: 'exact', head: true })
        .eq('is_completed', true),
      supabase
        .from('goals')
        .select('*', { count: 'exact', head: true }),
      // For RecommendationList inline
      supabase
        .from('recommendations')
        .select('*')
        .or(`status.eq.pending,and(status.eq.postponed,postponed_until.lte.${today})`)
        .order('priority_score', { ascending: false })
        .order('created_at', { ascending: false }),
      // For ActionBoard inline
      supabase
        .from('actions')
        .select('*, recommendation:recommendations(title, recommendation_type)')
        .order('status', { ascending: true })
        .order('priority_score', { ascending: false })
        .order('sort_order', { ascending: true }),
      // For GoalForm
      supabase.from('assets').select('id, name, current_value').eq('is_active', true),
      supabase.from('debts').select('id, name, current_balance').eq('is_active', true),
    ])

    const allActions = (actionsRes.data ?? []) as KpiData['allActions']
    const allPendingRecs = (pendingRecsRes.data ?? []) as KpiData['allPendingRecs']
    const goals = (activeGoalsRes.data ?? []) as Goal[]
    const loadedAssets = (assetsRes.data ?? []) as { id: string; name: string; current_value: number }[]
    const loadedDebts = (debtsRes.data ?? []) as { id: string; name: string; current_balance: number }[]

    // Auto-link: override current_value from linked asset/debt
    for (const goal of goals) {
      if (goal.linked_asset_id) {
        const asset = loadedAssets.find(a => a.id === goal.linked_asset_id)
        if (asset) goal.current_value = Number(asset.current_value)
      } else if (goal.linked_debt_id) {
        const debt = loadedDebts.find(d => d.id === goal.linked_debt_id)
        if (debt) {
          // For debt payoff: progress = original target - remaining balance
          goal.current_value = Math.max(0, Number(goal.target_value) - Number(debt.current_balance))
        }
      }
    }

    const goalProgresses = goals.map(g => computeGoalProgress(g))

    setKpi({
      completedActions: allActions.filter(a => a.status === 'completed'),
      allActions,
      openActions: allActions.filter(a => a.status === 'open' || a.status === 'postponed'),
      allPendingRecs,
      goals,
      completedGoalCount: completedGoalCountRes.count ?? 0,
      totalGoalCount: totalGoalCountRes.count ?? 0,
      goalProgresses,
    })

    setRecommendations((recsForListRes.data as Recommendation[]) ?? [])
    setActions((actionsForBoardRes.data as Action[]) ?? [])
    setGoalAssets(loadedAssets)
    setGoalDebts(loadedDebts)
    setLoading(false)
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  function scrollToSection(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  if (loading || !kpi) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
        </div>
      </div>
    )
  }

  // --- Calculations ---
  const { completedActions, allActions, openActions, allPendingRecs, goals, completedGoalCount, totalGoalCount, goalProgresses } = kpi

  const totalFreedomDaysWon = completedActions.reduce(
    (sum, a) => sum + (Number(a.freedom_days_impact) || 0), 0
  )

  const openActionDays = openActions.reduce(
    (sum, a) => sum + (Number(a.freedom_days_impact) || 0), 0
  )
  const pendingRecDays = allPendingRecs.reduce(
    (sum, r) => sum + (Number(r.freedom_days_per_year) || 0), 0
  )
  const openPotential = openActionDays + pendingRecDays

  const totalActions = allActions.length
  const completionRatio = totalActions > 0
    ? Math.round((completedActions.length / totalActions) * 100)
    : 0

  const decisionDays: number[] = []
  for (const a of allActions) {
    if (a.status === 'completed' && a.completed_at) {
      const created = new Date(a.created_at).getTime()
      const decided = new Date(a.completed_at).getTime()
      const diff = Math.max(0, Math.round((decided - created) / (1000 * 60 * 60 * 24)))
      decisionDays.push(diff)
    }
  }
  const avgDecisionDays = decisionDays.length > 0
    ? Math.round(decisionDays.reduce((s, d) => s + d, 0) / decisionDays.length)
    : 0

  const avgGoalProgress = goalProgresses.length > 0
    ? Math.round(goalProgresses.reduce((s, g) => s + g.pct, 0) / goalProgresses.length)
    : 0

  function getWillpowerScore(ratio: number): string {
    if (ratio > 80) return 'A'
    if (ratio > 60) return 'B'
    if (ratio > 40) return 'C'
    if (ratio > 20) return 'D'
    return 'E'
  }
  const willpowerScore = getWillpowerScore(completionRatio)
  const willpowerLabel: Record<string, string> = {
    A: 'uitstekend — je voert uit',
    B: 'sterk — goed bezig',
    C: 'groeiend — momentum bouwt op',
    D: 'startend — eerste stappen gezet',
    E: 'begin je reis',
  }

  // --- Alerts ---
  const today = new Date().toISOString().split('T')[0]
  const overdueActions = openActions.filter(a => a.due_date && a.due_date < today)
  const reactivatedRecs = allPendingRecs.filter(
    r => r.status === 'postponed' && r.decided_at && r.decided_at <= today
  )
  const offTrackGoals = goals.filter((_g, i) => goalProgresses[i] && !goalProgresses[i].onTrack)

  // --- Impact by recommendation type ---
  const impactByType: Record<string, number> = {}
  for (const a of completedActions) {
    const days = Number(a.freedom_days_impact) || 0
    if (days <= 0) continue
    const rec = a.recommendation?.[0] ?? null
    const type = rec?.recommendation_type ?? 'manual'
    impactByType[type] = (impactByType[type] || 0) + days
  }

  const impactEntries = Object.entries(impactByType).sort((a, b) => b[1] - a[1])
  const maxImpact = impactEntries.length > 0 ? Math.max(...impactEntries.map(e => e[1])) : 0

  function getBarColor(type: string): string {
    const colors: Record<string, string> = {
      budget_optimization: '#14b8a6',
      asset_reallocation: '#f59e0b',
      debt_acceleration: '#ef4444',
      income_increase: '#10b981',
      savings_boost: '#a855f7',
      manual: '#71717a',
    }
    return colors[type] ?? '#71717a'
  }

  function getTypeLabel(type: string): string {
    if (type === 'manual') return 'Handmatig'
    return RECOMMENDATION_TYPE_LABELS[type as RecommendationType] ?? type
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* === 1. Hero: Jouw Wilskracht in Actie === */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-teal-950 via-teal-900 to-teal-950 p-8 text-white sm:p-10">
        <div className="pointer-events-none absolute -top-24 right-1/4 h-64 w-64 rounded-full bg-teal-500/10 blur-3xl" />

        <div className="relative">
          <div className="mb-6 flex items-center gap-3">
            <FinnAvatar size={40} />
            <p className="text-xs font-semibold tracking-[0.2em] text-teal-300/80 uppercase">
              Jouw wilskracht in actie
            </p>
          </div>

          <div className="mb-6">
            <span className="text-6xl font-bold tracking-tight sm:text-7xl">
              {totalFreedomDaysWon > 0 ? `+${totalFreedomDaysWon}` : '0'}
            </span>
            <span className="ml-3 text-lg text-teal-200/70">
              {totalFreedomDaysWon === 1 ? 'vrijheidsdag gewonnen' : 'vrijheidsdagen gewonnen'}
            </span>
          </div>

          {/* Progress bar: completion ratio */}
          <div className="mb-8">
            <div className="h-3 w-full overflow-hidden rounded-full bg-teal-950/60">
              <div
                className="h-full rounded-full bg-gradient-to-r from-teal-600 via-teal-400 to-teal-300 transition-all duration-1000"
                style={{ width: `${Math.min(completionRatio, 100)}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between text-xs text-teal-300/50">
              <span>0% acties voltooid</span>
              <span>{completionRatio}% afgerond</span>
              <span>100%</span>
            </div>
          </div>

          {/* Sub KPIs */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <div>
              <p className="text-xs font-medium text-teal-300/60 uppercase">Acties voltooid</p>
              <p className="mt-1 text-2xl font-bold">
                {completedActions.length} van {totalActions}
              </p>
              <p className="text-sm text-teal-200/50">bewuste keuzes gemaakt</p>
            </div>
            <div>
              <p className="text-xs font-medium text-teal-300/60 uppercase">Open potentieel</p>
              <p className="mt-1 text-2xl font-bold">
                +{openPotential} dagen
              </p>
              <p className="text-sm text-teal-200/50">nog te winnen</p>
            </div>
            <div>
              <p className="text-xs font-medium text-teal-300/60 uppercase">Beslissnelheid</p>
              <p className="mt-1 text-2xl font-bold">
                {decisionDays.length > 0 ? `${avgDecisionDays} dagen` : '-'}
              </p>
              <p className="text-sm text-teal-200/50">gem. tijd tot beslissing</p>
            </div>
          </div>
        </div>
      </section>

      {/* === 2. KPI Stat Cards === */}
      <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-50">
              <CheckCircle className="h-5 w-5 text-teal-600" />
            </div>
            <KpiTooltip text="Hoeveel acties je hebt afgerond. Elke actie brengt je dichter bij vrijheid." />
          </div>
          <p className="text-sm font-medium text-zinc-500">Voltooide Acties</p>
          <p className="mt-1 text-3xl font-bold text-zinc-900">
            {completedActions.length}/{totalActions}
          </p>
          <p className="mt-1 text-xs text-teal-600">
            {completionRatio}% afgerond
          </p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-50">
              <Sparkles className="h-5 w-5 text-teal-600" />
            </div>
            <KpiTooltip text="Vrijheidsdagen te winnen uit openstaande acties en aanbevelingen." />
          </div>
          <p className="text-sm font-medium text-zinc-500">Open Potentieel</p>
          <p className="mt-1 text-3xl font-bold text-zinc-900">
            +{openPotential} dagen
          </p>
          <p className="mt-1 text-xs text-zinc-400">wachtend op actie</p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-50">
              <Target className="h-5 w-5 text-teal-600" />
            </div>
            <KpiTooltip text="Gemiddelde voortgang over al je actieve financiele doelen." />
          </div>
          <p className="text-sm font-medium text-zinc-500">Doelvoortgang</p>
          <p className="mt-1 text-3xl font-bold text-zinc-900">
            {goals.length > 0 ? `${avgGoalProgress}%` : '-'}
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            {goals.length > 0 ? `over ${goals.length} actieve doelen` : 'geen actieve doelen'}
          </p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-50">
              <Flame className="h-5 w-5 text-teal-600" />
            </div>
            <KpiTooltip text="Hoe actief je bent in het nemen en afronden van beslissingen." />
          </div>
          <p className="text-sm font-medium text-zinc-500">Wilskrachtscore</p>
          <p className="mt-1 text-3xl font-bold text-teal-600">{willpowerScore}</p>
          <p className="mt-1 text-xs text-zinc-400">{willpowerLabel[willpowerScore]}</p>
        </div>
      </section>

      {/* === 3. Alerts === */}
      {(overdueActions.length > 0 || reactivatedRecs.length > 0 || offTrackGoals.length > 0) && (
        <section className="mt-8">
          <h2 className="mb-3 text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">
            Aandachtspunten
          </h2>
          <div className="space-y-2">
            {overdueActions.length > 0 && (
              <AlertBanner
                icon={<AlertTriangle className="h-4 w-4 text-red-500" />}
                message={`${overdueActions.length} ${overdueActions.length === 1 ? 'actie' : 'acties'} met verlopen deadline`}
                onClick={() => scrollToSection('section-acties')}
                color="red"
              />
            )}
            {reactivatedRecs.length > 0 && (
              <AlertBanner
                icon={<Clock className="h-4 w-4 text-amber-500" />}
                message={`${reactivatedRecs.length} uitgestelde ${reactivatedRecs.length === 1 ? 'suggestie' : 'suggesties'} weer beschikbaar`}
                onClick={() => scrollToSection('section-suggesties')}
                color="amber"
              />
            )}
            {offTrackGoals.length > 0 && (
              <AlertBanner
                icon={<TrendingDown className="h-4 w-4 text-purple-500" />}
                message={`${offTrackGoals.length} ${offTrackGoals.length === 1 ? 'doel loopt' : 'doelen lopen'} achter op schema`}
                onClick={() => scrollToSection('section-doelen')}
                color="purple"
              />
            )}
          </div>
        </section>
      )}

      {/* === 4. Suggesties (RecommendationList inline) === */}
      <section id="section-suggesties" className="mt-10 scroll-mt-8">
        <div className="mb-5">
          <h2 className="text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">
            Suggesties
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Ontdek verborgen vrijheidsdagen
          </p>
        </div>
        <RecommendationList initialRecommendations={recommendations} />
      </section>

      {/* === 5. Budget Gezondheidscheck (NIBUD) — compact card + modal === */}
      <FeatureGate featureId="nibud_benchmark">
        <section id="section-gezondheidscheck" className="mt-8 scroll-mt-8">
          <NibudBenchmarkSection />
        </section>
      </FeatureGate>

      {/* === 6. Acties (ActionBoard inline) === */}
      <section id="section-acties" className="mt-10 scroll-mt-8">
        <div className="mb-5">
          <h2 className="text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">
            Acties
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Concrete stappen die je vrijheid laten groeien
          </p>
        </div>
        <ActionBoard initialActions={actions} />
      </section>

      {/* === 6. Doelen (compact + modal) === */}
      <FeatureGate featureId="doelen_systeem">
      <section id="section-doelen" className="mt-10 scroll-mt-8">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">
              Doelvoortgang
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Je actieve financiele doelen
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowGoalForm(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-teal-200 px-3 py-1.5 text-sm font-medium text-teal-600 hover:bg-teal-50"
            >
              <Plus className="h-3.5 w-3.5" />
              Nieuw doel
            </button>
            {goals.length > 0 && (
              <button
                onClick={() => setShowGoalModal(true)}
                className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
              >
                Alle doelen bekijken
              </button>
            )}
          </div>
        </div>

        {goals.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <div className="divide-y divide-zinc-100">
              {goals.map((goal, i) => (
                <GoalSummaryRow
                  key={goal.id}
                  goal={goal}
                  progress={goalProgresses[i]}
                  onClick={() => setShowGoalModal(true)}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center">
            <p className="text-sm text-zinc-500">
              Nog geen doelen ingesteld. Klik op &quot;Nieuw doel&quot; om te starten.
            </p>
          </div>
        )}
      </section>
      </FeatureGate>

      {/* === 7. Beslissingspatronen === */}
      <FeatureGate featureId="beslissingspatronen">
      <section className="mt-10">
        <div className="mb-5">
          <h2 className="text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">
            Beslissingspatronen
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Vrijheidsdagen gewonnen per type actie
          </p>
        </div>

        {impactEntries.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white p-4 sm:p-6">
            <ImpactChart entries={impactEntries} maxImpact={maxImpact} getBarColor={getBarColor} getTypeLabel={getTypeLabel} />
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center">
            <p className="text-sm text-zinc-500">
              Nog geen acties afgerond. Scroll naar de{' '}
              <button onClick={() => scrollToSection('section-suggesties')} className="font-medium text-teal-600 hover:underline">
                suggesties
              </button>{' '}
              om je eerste voorstellen te ontvangen.
            </p>
          </div>
        )}
      </section>
      </FeatureGate>

      {/* === Modals === */}
      <FeatureGate featureId="doelen_systeem">
      <GoalDetailModal
        open={showGoalModal}
        onClose={() => setShowGoalModal(false)}
        onGoalsChanged={loadData}
      />

      {showGoalForm && (
        <GoalForm
          assets={goalAssets}
          debts={goalDebts}
          onClose={() => setShowGoalForm(false)}
          onSaved={() => {
            setShowGoalForm(false)
            loadData()
          }}
        />
      )}
      </FeatureGate>
    </div>
  )
}

// --- Inline helper components ---

function KpiTooltip({ text }: { text: string }) {
  return (
    <div className="group relative">
      <Info className="h-4 w-4 cursor-help text-zinc-300 transition-colors group-hover:text-teal-500" />
      <div className="pointer-events-none absolute right-0 z-10 mt-1 w-56 rounded-lg border border-zinc-200 bg-white p-3 text-xs leading-relaxed text-zinc-600 opacity-0 shadow-lg transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
        {text}
      </div>
    </div>
  )
}

function AlertBanner({
  icon,
  message,
  onClick,
  color,
}: {
  icon: React.ReactNode
  message: string
  onClick: () => void
  color: 'red' | 'amber' | 'purple'
}) {
  const borderClass = color === 'red' ? 'border-red-200 bg-red-50/50' : color === 'amber' ? 'border-amber-200 bg-amber-50/50' : 'border-purple-200 bg-purple-50/50'
  const textClass = color === 'red' ? 'text-red-700' : color === 'amber' ? 'text-amber-700' : 'text-purple-700'

  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:opacity-80 ${borderClass}`}
    >
      {icon}
      <span className={`flex-1 text-sm font-medium ${textClass}`}>{message}</span>
      <ArrowRight className={`h-4 w-4 ${textClass} opacity-50`} />
    </button>
  )
}

function ImpactChart({
  entries,
  maxImpact,
  getBarColor,
  getTypeLabel,
}: {
  entries: [string, number][]
  maxImpact: number
  getBarColor: (type: string) => string
  getTypeLabel: (type: string) => string
}) {
  const W = 600
  const barH = 28
  const gap = 8
  const labelW = 180
  const valueW = 60
  const chartW = W - labelW - valueW - 20
  const H = entries.length * (barH + gap) - gap + 20

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: Math.max(H, 100) }}>
      {entries.map(([type, days], i) => {
        const y = i * (barH + gap) + 10
        const barWidth = maxImpact > 0 ? (days / maxImpact) * chartW : 0
        const color = getBarColor(type)

        return (
          <g key={type}>
            <text
              x={labelW - 8}
              y={y + barH / 2 + 4}
              textAnchor="end"
              className="fill-zinc-600"
              style={{ fontSize: 12 }}
            >
              {getTypeLabel(type)}
            </text>
            <rect
              x={labelW}
              y={y + 4}
              width={Math.max(barWidth, 2)}
              height={barH - 8}
              rx={4}
              fill={color}
              opacity={0.85}
            />
            <text
              x={labelW + Math.max(barWidth, 2) + 8}
              y={y + barH / 2 + 4}
              className="fill-zinc-500"
              style={{ fontSize: 11, fontWeight: 600 }}
            >
              +{days}d
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function GoalSummaryRow({
  goal,
  progress,
  onClick,
}: {
  goal: Goal
  progress: { current: number; target: number; pct: number; onTrack: boolean; eta: string | null }
  onClick: () => void
}) {
  const colors = getGoalColorClasses(goal.color)

  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-zinc-50"
    >
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${colors.bgLight}`}>
        <span className="text-sm">{goal.icon}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <p className="truncate text-sm font-medium text-zinc-900">{goal.name}</p>
          <div className="ml-3 flex items-center gap-2">
            <span className="text-sm font-bold text-zinc-700">{progress.pct}%</span>
            {progress.eta && (
              <span className="text-xs text-zinc-400">{progress.eta}</span>
            )}
            {!progress.onTrack && goal.target_date && (
              <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-600">achter</span>
            )}
          </div>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
          <div
            className={`h-full rounded-full ${colors.bar} transition-all duration-500`}
            style={{ width: `${progress.pct}%` }}
          />
        </div>
      </div>
    </button>
  )
}
