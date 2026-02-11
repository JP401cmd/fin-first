import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { FinnAvatar } from '@/components/app/avatars'
import {
  type RecommendationType,
  RECOMMENDATION_TYPE_LABELS,
} from '@/lib/recommendation-data'
import { computeGoalProgress, getGoalColorClasses, type Goal } from '@/lib/goal-data'
import {
  CheckCircle, Sparkles, Target, Flame, ArrowRight, Info,
  AlertTriangle, Clock, TrendingDown,
} from 'lucide-react'

export default async function WillPage() {
  const supabase = await createClient()

  const [
    { data: actions },
    { data: pendingRecs },
    { data: feedback },
    { data: activeGoals },
    { count: completedGoalCount },
    { count: totalGoalCount },
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
  ])

  const allActions = actions ?? []
  const allPendingRecs = pendingRecs ?? []
  const allFeedback = feedback ?? []
  const goals = (activeGoals ?? []) as Goal[]

  // --- Calculations ---

  const completedActions = allActions.filter(a => a.status === 'completed')
  const openActions = allActions.filter(a => a.status === 'open' || a.status === 'postponed')
  const totalActions = allActions.length

  // Total freedom days won from completed actions
  const totalFreedomDaysWon = completedActions.reduce(
    (sum, a) => sum + (Number(a.freedom_days_impact) || 0), 0
  )

  // Open potential: freedom days from open actions + pending recommendations
  const openActionDays = openActions.reduce(
    (sum, a) => sum + (Number(a.freedom_days_impact) || 0), 0
  )
  const pendingRecDays = allPendingRecs.reduce(
    (sum, r) => sum + (Number(r.freedom_days_per_year) || 0), 0
  )
  const openPotential = openActionDays + pendingRecDays

  // Completion ratio
  const completionRatio = totalActions > 0
    ? Math.round((completedActions.length / totalActions) * 100)
    : 0

  // Decision speed: average days between created_at and completed_at
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

  // Goal progress average
  const goalProgresses = goals.map(g => computeGoalProgress(g))
  const avgGoalProgress = goalProgresses.length > 0
    ? Math.round(goalProgresses.reduce((s, g) => s + g.pct, 0) / goalProgresses.length)
    : 0

  // Willpower score
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

  const offTrackGoals = goals.filter((g, i) => goalProgresses[i] && !goalProgresses[i].onTrack)

  // --- Impact by recommendation type ---
  const impactByType: Record<string, number> = {}
  for (const a of completedActions) {
    const days = Number(a.freedom_days_impact) || 0
    if (days <= 0) continue
    const recArr = a.recommendation as unknown as { recommendation_type: string }[] | null
    const rec = recArr?.[0] ?? null
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

  // Quick link counts
  const openActionCount = allActions.filter(a => a.status === 'open').length
  const pendingRecCount = allPendingRecs.filter(r => r.status === 'pending').length

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* === Hero: Jouw Wilskracht in Actie === */}
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

      {/* === KPI Stat Cards === */}
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
            <KpiTooltip text="Gemiddelde voortgang over al je actieve financiële doelen." />
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

      {/* === Alerts === */}
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
                href="/will/actions"
                color="red"
              />
            )}
            {reactivatedRecs.length > 0 && (
              <AlertBanner
                icon={<Clock className="h-4 w-4 text-amber-500" />}
                message={`${reactivatedRecs.length} uitgestelde ${reactivatedRecs.length === 1 ? 'suggestie' : 'suggesties'} weer beschikbaar`}
                href="/will/optimization"
                color="amber"
              />
            )}
            {offTrackGoals.length > 0 && (
              <AlertBanner
                icon={<TrendingDown className="h-4 w-4 text-purple-500" />}
                message={`${offTrackGoals.length} ${offTrackGoals.length === 1 ? 'doel loopt' : 'doelen lopen'} achter op schema`}
                href="/will/goals"
                color="purple"
              />
            )}
          </div>
        </section>
      )}

      {/* === Quick Links === */}
      <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <QuickLink
          href="/will/actions"
          title="Open Acties"
          value={`${openActionCount} acties`}
          subtitle="wachten op actie"
        />
        <QuickLink
          href="/will/optimization"
          title="Suggesties"
          value={`${pendingRecCount} nieuw`}
          subtitle="aanbevelingen beschikbaar"
        />
        <QuickLink
          href="/will/goals"
          title="Doelen"
          value={`${completedGoalCount ?? 0}/${totalGoalCount ?? 0}`}
          subtitle="doelen bereikt"
        />
      </section>

      {/* === Impact Chart: Beslissingspatronen === */}
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
              Nog geen acties afgerond. Ga naar{' '}
              <Link href="/will/optimization" className="font-medium text-teal-600 hover:underline">
                Optimalisatie
              </Link>{' '}
              om je eerste suggesties te ontvangen.
            </p>
          </div>
        )}
      </section>

      {/* === Goal Summary === */}
      <section className="mt-10">
        <div className="mb-5">
          <h2 className="text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">
            Doelvoortgang
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Je actieve financiële doelen
          </p>
        </div>

        {goals.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <div className="divide-y divide-zinc-100">
              {goals.map((goal, i) => (
                <GoalSummaryRow
                  key={goal.id}
                  goal={goal}
                  progress={goalProgresses[i]}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center">
            <p className="text-sm text-zinc-500">
              Nog geen doelen ingesteld.{' '}
              <Link href="/will/goals" className="font-medium text-teal-600 hover:underline">
                Stel je eerste doel in
              </Link>
            </p>
          </div>
        )}
      </section>
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

function QuickLink({
  href,
  title,
  value,
  subtitle,
}: {
  href: string
  title: string
  value: string
  subtitle: string
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 transition-colors hover:border-teal-200 hover:bg-teal-50/30"
    >
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-zinc-500">{title}</p>
        <p className="text-lg font-bold text-zinc-900">{value}</p>
        <p className="text-xs text-zinc-400">{subtitle}</p>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-zinc-300 group-hover:text-teal-500" />
    </Link>
  )
}

function AlertBanner({
  icon,
  message,
  href,
  color,
}: {
  icon: React.ReactNode
  message: string
  href: string
  color: 'red' | 'amber' | 'purple'
}) {
  const borderClass = color === 'red' ? 'border-red-200 bg-red-50/50' : color === 'amber' ? 'border-amber-200 bg-amber-50/50' : 'border-purple-200 bg-purple-50/50'
  const textClass = color === 'red' ? 'text-red-700' : color === 'amber' ? 'text-amber-700' : 'text-purple-700'

  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-lg border p-3 transition-colors hover:opacity-80 ${borderClass}`}
    >
      {icon}
      <span className={`flex-1 text-sm font-medium ${textClass}`}>{message}</span>
      <ArrowRight className={`h-4 w-4 ${textClass} opacity-50`} />
    </Link>
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
}: {
  goal: Goal
  progress: { current: number; target: number; pct: number; onTrack: boolean; eta: string | null }
}) {
  const colors = getGoalColorClasses(goal.color)

  return (
    <div className="flex items-center gap-4 px-5 py-4">
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
    </div>
  )
}
