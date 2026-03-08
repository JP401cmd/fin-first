'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck,
  TrendingUp,
  TrendingDown,
  Target,
  Wallet,
  Eye,
  MessageSquare,
  Check,
  Loader2,
  ChevronRight,
} from 'lucide-react'
import { formatCurrency, calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'

/* ── Step definitions ────────────────────────────────────────────────── */
const STEPS = [
  { key: 'terugblik',   label: 'Terugblik',   icon: Eye },
  { key: 'doelen',      label: 'Doelen',       icon: Target },
  { key: 'budget',      label: 'Budget',       icon: Wallet },
  { key: 'vooruitblik', label: 'Vooruitblik',  icon: TrendingUp },
  { key: 'reflectie',   label: 'Reflectie',    icon: MessageSquare },
] as const

type StepKey = (typeof STEPS)[number]['key']

/* ── Data types ──────────────────────────────────────────────────────── */
interface CheckinOverview {
  monthLabel: string
  prevMonthLabel: string
  netWorth: number
  netWorthChange: number
  monthlyIncome: number
  monthlyExpenses: number
  monthlySavings: number
  prevMonthExpenses: number
  completedActionsCount: number
  freedomDaysWon: number
  fireAge: number | null
}

interface PreviousSnapshot {
  metrics: {
    netWorth: number
    monthlyIncome: number
    monthlyExpenses: number
    monthlySavings: number
    completedActions: number
    activeGoals: number
    fireAge: number | null
  }
  savedAt: string
}

interface GoalSummary {
  id: string
  name: string
  current_value: number
  target_value: number
  icon: string | null
  color: string | null
  is_completed: boolean
}

interface BudgetSummary {
  name: string
  icon: string | null
  limit: number
  spent: number
  budget_type: string
}

interface UpcomingItem {
  name: string
  amount: number
  date: string
}

const MONTH_NAMES = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
]

/* ── Main component ──────────────────────────────────────────────────── */
export default function CheckinPage() {
  const router = useRouter()
  const [step, setStep] = useState<StepKey>('terugblik')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Data states
  const [overview, setOverview] = useState<CheckinOverview | null>(null)
  const [goals, setGoals] = useState<GoalSummary[]>([])
  const [budgets, setBudgets] = useState<BudgetSummary[]>([])
  const [upcoming, setUpcoming] = useState<UpcomingItem[]>([])
  const [reflection, setReflection] = useState('')
  const [previous, setPrevious] = useState<PreviousSnapshot | null>(null)

  const currentIdx = STEPS.findIndex(s => s.key === step)

  // ── Fetch all data on mount ───────────────────────────────────────
  useEffect(() => {
    async function loadData() {
      try {
        const [overviewRes, goalsRes, budgetsRes, upcomingRes, previousRes] = await Promise.all([
          fetch('/api/checkin/overview'),
          fetch('/api/goals'),
          fetch('/api/checkin/budgets'),
          fetch('/api/checkin/upcoming'),
          fetch('/api/checkin/save'),
        ])

        if (overviewRes.ok) {
          const data = await overviewRes.json()
          setOverview(data)
        }
        if (goalsRes.ok) {
          const data = await goalsRes.json()
          setGoals(Array.isArray(data) ? data : data.goals || [])
        }
        if (budgetsRes.ok) {
          const data = await budgetsRes.json()
          setBudgets(Array.isArray(data) ? data : data.budgets || [])
        }
        if (upcomingRes.ok) {
          const data = await upcomingRes.json()
          setUpcoming(Array.isArray(data) ? data : data.items || [])
        }
        if (previousRes.ok) {
          const data = await previousRes.json()
          if (data.hasPrevious && data.previous?.metrics) {
            setPrevious(data.previous)
          }
        }
      } catch {
        // Gracefully handle errors — show empty states
      }
      setLoading(false)
    }
    loadData()
  }, [])

  // ── Navigation ────────────────────────────────────────────────────
  const goNext = useCallback(() => {
    if (currentIdx < STEPS.length - 1) {
      setStep(STEPS[currentIdx + 1].key)
    }
  }, [currentIdx])

  const goPrev = useCallback(() => {
    if (currentIdx > 0) {
      setStep(STEPS[currentIdx - 1].key)
    }
  }, [currentIdx])

  // ── Complete check-in ─────────────────────────────────────────────
  const handleComplete = useCallback(async () => {
    setSaving(true)
    try {
      // Save reflection + metrics snapshot
      await fetch('/api/checkin/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reflection,
          monthKey: overview?.monthLabel,
          metrics: {
            netWorth: overview?.netWorth || 0,
            monthlyIncome: overview?.monthlyIncome || 0,
            monthlyExpenses: overview?.monthlyExpenses || 0,
            monthlySavings: overview?.monthlySavings || 0,
            completedActions: overview?.completedActionsCount || 0,
            activeGoals: goals.filter(g => !g.is_completed).length,
            fireAge: overview?.fireAge || null,
          },
        }),
      })
      // Mark the month as completed
      await fetch('/api/monthly-checkin', { method: 'POST' })
      // Suppress the dashboard card immediately via sessionStorage
      // (the card checks this key on mount before fetching the API)
      const monthKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
      sessionStorage.setItem('checkin_dismissed', monthKey)
      router.push('/dashboard')
    } catch {
      setSaving(false)
    }
  }, [reflection, overview, goals, router])

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-wil-500" />
          <p className="text-sm text-[var(--ink-3)] font-serif italic">Check-in wordt geladen...</p>
        </div>
      </div>
    )
  }

  const isLastStep = currentIdx === STEPS.length - 1

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/dashboard"
          className="flex h-9 w-9 items-center justify-center rounded-[var(--r)] text-[var(--ink-3)] hover:text-[var(--ink)] hover:bg-[var(--subtle)] transition-colors"
          aria-label="Terug naar dashboard"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <span className="label-editorial text-wil-600">Geldcheck-in</span>
          <h1 className="text-lg font-display font-semibold text-[var(--ink)] tracking-tight">
            {overview?.monthLabel ? `Check-in ${overview.monthLabel}` : 'Maandelijkse check-in'}
          </h1>
        </div>
      </div>

      {/* ── Step Progress ──────────────────────────────────────────── */}
      <CheckinStepProgress current={step} />

      {/* ── Step Content ───────────────────────────────────────────── */}
      <div className="mt-6">
        {step === 'terugblik' && <StepTerugblik overview={overview} previous={previous} />}
        {step === 'doelen' && <StepDoelen goals={goals} />}
        {step === 'budget' && <StepBudget budgets={budgets} />}
        {step === 'vooruitblik' && <StepVooruitblik upcoming={upcoming} />}
        {step === 'reflectie' && (
          <StepReflectie
            reflection={reflection}
            setReflection={setReflection}
            overview={overview}
            goals={goals}
            budgets={budgets}
            previous={previous}
          />
        )}
      </div>

      {/* ── Navigation buttons ─────────────────────────────────────── */}
      <div className="mt-8 flex items-center justify-between">
        <button
          type="button"
          onClick={goPrev}
          disabled={currentIdx === 0}
          className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Vorige
        </button>

        {isLastStep ? (
          <button
            type="button"
            onClick={handleComplete}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-wil-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-wil-700 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Check className="h-4 w-4" />
                Afronden
              </>
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={goNext}
            className="inline-flex items-center gap-1.5 rounded-lg bg-wil-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-wil-700"
          >
            Volgende
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

/* ── Step Progress Component ─────────────────────────────────────────── */
function CheckinStepProgress({ current }: { current: StepKey }) {
  const currentIdx = STEPS.findIndex(s => s.key === current)
  const progressPct = Math.round((currentIdx / (STEPS.length - 1)) * 100)

  return (
    <div className="w-full">
      <div className="mb-3 h-1 w-full overflow-hidden rounded-full bg-[var(--border-ed)]">
        <div
          className="h-full rounded-full bg-wil-500 transition-all duration-500"
          style={{ width: `${progressPct}%` }}
        />
      </div>
      <div className="flex items-center justify-between">
        {STEPS.map((s, i) => {
          const isDone = i < currentIdx
          const isActive = i === currentIdx
          const Icon = s.icon
          return (
            <div key={s.key} className="flex flex-col items-center gap-1">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
                  isDone
                    ? 'bg-wil-600 text-white'
                    : isActive
                      ? 'border-2 border-wil-600 text-wil-600'
                      : 'border border-[var(--border-ed)] text-[var(--ink-4)]'
                }`}
              >
                {isDone ? (
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                ) : (
                  <Icon className="h-3.5 w-3.5" />
                )}
              </div>
              <span
                className={`hidden text-[10px] font-medium sm:block ${
                  isActive ? 'text-wil-600' : isDone ? 'text-[var(--ink-2)]' : 'text-[var(--ink-4)]'
                }`}
              >
                {s.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Step 1: Terugblik ───────────────────────────────────────────────── */
function StepTerugblik({ overview, previous }: { overview: CheckinOverview | null; previous: PreviousSnapshot | null }) {
  if (!overview) {
    return (
      <div className="card-editorial p-6">
        <p className="text-sm text-[var(--ink-3)] font-serif italic">Nog geen gegevens beschikbaar voor deze maand.</p>
      </div>
    )
  }

  const expenseChange = overview.prevMonthExpenses > 0
    ? ((overview.monthlyExpenses - overview.prevMonthExpenses) / overview.prevMonthExpenses) * 100
    : 0

  // Compute deltas from previous check-in
  const prevMetrics = previous?.metrics
  const netWorthDelta = prevMetrics ? overview.netWorth - prevMetrics.netWorth : null
  const dailyExpenses = overview.monthlyExpenses > 0 ? overview.monthlyExpenses / 30 : 0

  // Freedom time for net worth growth
  const freedomGrowth = netWorthDelta && dailyExpenses > 0
    ? calculateFreedomTime(Math.abs(netWorthDelta), dailyExpenses)
    : null

  // FIRE age delta
  const fireAgeDelta = prevMetrics?.fireAge != null && overview.fireAge != null
    ? overview.fireAge - prevMetrics.fireAge
    : null

  return (
    <div className="space-y-4">
      <div className="card-editorial p-5">
        <h2 className="text-base font-display font-semibold text-[var(--ink)]">
          Terugblik {overview.prevMonthLabel || 'afgelopen maand'}
        </h2>
        <p className="mt-1 text-xs text-[var(--ink-3)] leading-relaxed">
          Hoe hebben je financi&euml;n zich afgelopen maand ontwikkeld?
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <MetricCard
          label="Netto vermogen"
          value={formatCurrency(overview.netWorth)}
          change={overview.netWorthChange}
          delta={netWorthDelta}
        />
        <MetricCard
          label="Inkomen"
          value={formatCurrency(overview.monthlyIncome)}
          delta={prevMetrics ? overview.monthlyIncome - prevMetrics.monthlyIncome : null}
        />
        <MetricCard
          label="Uitgaven"
          value={formatCurrency(overview.monthlyExpenses)}
          change={expenseChange}
          invertColor
          delta={prevMetrics ? overview.monthlyExpenses - prevMetrics.monthlyExpenses : null}
          deltaInverted
        />
        <MetricCard
          label="Gespaard"
          value={formatCurrency(overview.monthlySavings)}
          positive={overview.monthlySavings > 0}
          delta={prevMetrics ? overview.monthlySavings - prevMetrics.monthlySavings : null}
        />
      </div>

      {/* Delta summary from previous check-in */}
      {previous && (
        <div className="card-editorial p-4 border-l-3 border-wil-400">
          <p className="text-[10px] font-medium text-wil-600 uppercase tracking-wider mb-2">
            Sinds vorige check-in
          </p>
          <div className="space-y-1.5 text-sm text-[var(--ink-2)]">
            {netWorthDelta !== null && (
              <p>
                Vermogen: <span className={`font-mono tabular-nums font-medium ${netWorthDelta >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {netWorthDelta >= 0 ? '+' : ''}{formatCurrency(netWorthDelta)}
                </span>
                {freedomGrowth && !freedomGrowth.isInfinite && (
                  <span className="text-[var(--ink-3)] ml-1.5">
                    ({netWorthDelta >= 0 ? '+' : '-'}{formatFreedomTimeString(freedomGrowth, 'short', false)} vrijheid)
                  </span>
                )}
              </p>
            )}
            {overview.completedActionsCount > 0 && (
              <p>
                <span className="font-medium text-emerald-600">{overview.completedActionsCount} {overview.completedActionsCount === 1 ? 'actie' : 'acties'}</span> afgerond
                {overview.freedomDaysWon > 0 && (
                  <span className="text-[var(--ink-3)] ml-1.5">
                    (+{overview.freedomDaysWon} {overview.freedomDaysWon === 1 ? 'vrijheidsdag' : 'vrijheidsdagen'})
                  </span>
                )}
              </p>
            )}
            {fireAgeDelta !== null && fireAgeDelta !== 0 && (
              <p>
                FIRE-leeftijd: <span className={`font-mono tabular-nums font-medium ${fireAgeDelta <= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {fireAgeDelta > 0 ? '+' : ''}{fireAgeDelta} {Math.abs(fireAgeDelta) === 1 ? 'jaar' : 'jaar'}
                </span>
                <span className="text-[var(--ink-3)] ml-1.5">
                  ({fireAgeDelta <= 0 ? 'eerder vrij!' : 'later vrij'})
                </span>
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Step 2: Doelen ──────────────────────────────────────────────────── */
function StepDoelen({ goals }: { goals: GoalSummary[] }) {
  const activeGoals = goals.filter(g => !g.is_completed)
  const completedGoals = goals.filter(g => g.is_completed)

  return (
    <div className="space-y-4">
      <div className="card-editorial p-5">
        <h2 className="text-base font-display font-semibold text-[var(--ink)]">
          Doelen
        </h2>
        <p className="mt-1 text-xs text-[var(--ink-3)] leading-relaxed">
          Hoe staat het met je doelen?
        </p>
      </div>

      {activeGoals.length === 0 && completedGoals.length === 0 ? (
        <div className="card-editorial p-5">
          <p className="text-sm text-[var(--ink-3)] font-serif italic">
            Nog geen doelen ingesteld.{' '}
            <Link href="/will#doelen" className="text-wil-600 hover:underline">Stel je eerste doel in</Link>
          </p>
        </div>
      ) : (
        <>
          {activeGoals.map(goal => {
            const pct = goal.target_value > 0 ? Math.min(100, (goal.current_value / goal.target_value) * 100) : 0
            return (
              <div key={goal.id} className="card-editorial p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[var(--ink)] truncate">
                      {goal.icon && <span className="mr-1.5">{goal.icon}</span>}
                      {goal.name}
                    </p>
                    <p className="text-xs text-[var(--ink-3)] mt-0.5 font-mono tabular-nums">
                      {formatCurrency(goal.current_value)} / {formatCurrency(goal.target_value)}
                    </p>
                  </div>
                  <span className="text-xs font-mono tabular-nums font-semibold text-[var(--ink-2)]">
                    {Math.round(pct)}%
                  </span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--border-ed)]">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: goal.color || 'var(--ink)',
                    }}
                  />
                </div>
              </div>
            )
          })}

          {completedGoals.length > 0 && (
            <div className="card-editorial p-4">
              <p className="text-xs font-medium text-[var(--ink-3)] uppercase tracking-wider mb-2">
                Behaald
              </p>
              {completedGoals.map(goal => (
                <div key={goal.id} className="flex items-center gap-2 py-1">
                  <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  <span className="text-sm text-[var(--ink-2)] truncate">
                    {goal.icon && <span className="mr-1">{goal.icon}</span>}
                    {goal.name}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ── Step 3: Budget ──────────────────────────────────────────────────── */
function StepBudget({ budgets }: { budgets: BudgetSummary[] }) {
  const expenseBudgets = budgets.filter(b => b.budget_type === 'expense')
  const overBudget = expenseBudgets.filter(b => b.limit > 0 && b.spent > b.limit)
  const underBudget = expenseBudgets.filter(b => b.limit > 0 && b.spent <= b.limit)

  return (
    <div className="space-y-4">
      <div className="card-editorial p-5">
        <h2 className="text-base font-display font-semibold text-[var(--ink)]">
          Budget
        </h2>
        <p className="mt-1 text-xs text-[var(--ink-3)] leading-relaxed">
          Budget-status en eventuele afwijkingen deze maand.
        </p>
      </div>

      {expenseBudgets.length === 0 ? (
        <div className="card-editorial p-5">
          <p className="text-sm text-[var(--ink-3)] font-serif italic">
            Nog geen budgetten ingesteld.{' '}
            <Link href="/core/budgets" className="text-kern-600 hover:underline">Stel budgetten in</Link>
          </p>
        </div>
      ) : (
        <>
          {overBudget.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-red-600 uppercase tracking-wider flex items-center gap-1.5">
                <TrendingUp className="h-3 w-3" />
                Overschreden ({overBudget.length})
              </p>
              {overBudget.map(b => (
                <BudgetRow key={b.name} budget={b} overBudget />
              ))}
            </div>
          )}

          {underBudget.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-[var(--ink-3)] uppercase tracking-wider flex items-center gap-1.5">
                <TrendingDown className="h-3 w-3" />
                Binnen budget ({underBudget.length})
              </p>
              {underBudget.map(b => (
                <BudgetRow key={b.name} budget={b} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ── Step 4: Vooruitblik ─────────────────────────────────────────────── */
function StepVooruitblik({ upcoming }: { upcoming: UpcomingItem[] }) {
  return (
    <div className="space-y-4">
      <div className="card-editorial p-5">
        <h2 className="text-base font-display font-semibold text-[var(--ink)]">
          Vooruitblik
        </h2>
        <p className="mt-1 text-xs text-[var(--ink-3)] leading-relaxed">
          Verwachte uitgaven en inkomsten komende maand.
        </p>
      </div>

      {upcoming.length === 0 ? (
        <div className="card-editorial p-5">
          <p className="text-sm text-[var(--ink-3)] font-serif italic">
            Geen geplande uitgaven gevonden voor komende maand.
          </p>
          <p className="mt-2 text-xs text-[var(--ink-4)]">
            Terugkerende transacties verschijnen hier automatisch zodra er transactiegeschiedenis is.
          </p>
        </div>
      ) : (
        <div className="card-editorial divide-y divide-[var(--border-ed)]">
          {upcoming.map((item, i) => (
            <div key={i} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-[var(--ink)] truncate">{item.name}</p>
                {item.date && (
                  <p className="text-[10px] text-[var(--ink-4)] mt-0.5">{item.date}</p>
                )}
              </div>
              <span className={`text-sm font-mono tabular-nums font-medium ${
                item.amount < 0 ? 'text-[var(--ink)]' : 'text-emerald-600'
              }`}>
                {formatCurrency(item.amount)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Step 5: Reflectie ───────────────────────────────────────────────── */
function StepReflectie({
  reflection,
  setReflection,
  overview,
  goals,
  budgets,
  previous,
}: {
  reflection: string
  setReflection: (v: string) => void
  overview: CheckinOverview | null
  goals: GoalSummary[]
  budgets: BudgetSummary[]
  previous: PreviousSnapshot | null
}) {
  const overBudgetCount = budgets.filter(b => b.budget_type === 'expense' && b.limit > 0 && b.spent > b.limit).length
  const activeGoalCount = goals.filter(g => !g.is_completed).length
  const prevMetrics = previous?.metrics
  const dailyExpenses = overview && overview.monthlyExpenses > 0 ? overview.monthlyExpenses / 30 : 0

  // Compute freedom time for savings
  const savingsFreedom = overview && dailyExpenses > 0
    ? calculateFreedomTime(Math.abs(overview.monthlySavings), dailyExpenses)
    : null

  return (
    <div className="space-y-4">
      <div className="card-editorial p-5">
        <h2 className="text-base font-display font-semibold text-[var(--ink)]">
          Reflectie
        </h2>
        <p className="mt-1 text-xs text-[var(--ink-3)] leading-relaxed">
          Neem even een moment om te reflecteren op je financi&euml;le situatie.
        </p>
      </div>

      {/* Mini summary with freedom-time equivalents */}
      <div className="card-editorial p-4">
        <p className="text-xs font-medium text-[var(--ink-3)] uppercase tracking-wider mb-2">Samenvatting</p>
        <div className="space-y-1.5 text-sm text-[var(--ink-2)]">
          {overview && (
            <p>
              Je hebt deze maand <span className="font-mono tabular-nums font-medium">{formatCurrency(overview.monthlySavings)}</span> gespaard
              {savingsFreedom && !savingsFreedom.isInfinite && savingsFreedom.totalDays > 0 && (
                <span className="text-[var(--ink-3)]">
                  {' '}({overview.monthlySavings >= 0 ? '+' : '-'}{formatFreedomTimeString(savingsFreedom, 'short', true)} vrijheid)
                </span>
              )}.
            </p>
          )}
          {activeGoalCount > 0 && (
            <p>Je werkt aan <span className="font-medium">{activeGoalCount} {activeGoalCount === 1 ? 'doel' : 'doelen'}</span>.</p>
          )}
          {overview && overview.completedActionsCount > 0 && (
            <p className="text-emerald-600">
              <span className="font-medium">{overview.completedActionsCount} {overview.completedActionsCount === 1 ? 'actie' : 'acties'}</span> afgerond
              {overview.freedomDaysWon > 0 && (
                <span> (+{overview.freedomDaysWon} {overview.freedomDaysWon === 1 ? 'vrijheidsdag' : 'vrijheidsdagen'})</span>
              )}
            </p>
          )}
          {overBudgetCount > 0 && (
            <p className="text-amber-700">
              Let op: <span className="font-medium">{overBudgetCount} {overBudgetCount === 1 ? 'budget' : 'budgetten'}</span> overschreden.
            </p>
          )}
          {overview?.fireAge != null && (
            <p>
              Geschatte FIRE-leeftijd: <span className="font-mono tabular-nums font-medium">{overview.fireAge}</span>
              {prevMetrics?.fireAge != null && overview.fireAge !== prevMetrics.fireAge && (
                <span className={`ml-1.5 ${overview.fireAge <= prevMetrics.fireAge ? 'text-emerald-600' : 'text-red-500'}`}>
                  ({overview.fireAge < prevMetrics.fireAge ? overview.fireAge - prevMetrics.fireAge : '+' + (overview.fireAge - prevMetrics.fireAge)} jaar)
                </span>
              )}
            </p>
          )}
        </div>
      </div>

      {/* Open question */}
      <div>
        <label htmlFor="reflection" className="block text-sm font-medium text-[var(--ink-2)] mb-2">
          Hoe voel je je over je financi&euml;le situatie deze maand?
        </label>
        <textarea
          id="reflection"
          value={reflection}
          onChange={e => setReflection(e.target.value)}
          rows={4}
          className="w-full rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3 text-sm text-[var(--ink)] placeholder:text-[var(--ink-4)] focus:outline-none focus:ring-2 focus:ring-wil-300 resize-none font-serif"
          placeholder="Deel je gedachten, zorgen of plannen..."
        />
        <p className="mt-1 text-[10px] text-[var(--ink-4)]">
          Je reflectie wordt priv&eacute; opgeslagen bij deze check-in.
        </p>
      </div>
    </div>
  )
}

/* ── Shared: MetricCard ──────────────────────────────────────────────── */
function MetricCard({
  label,
  value,
  change,
  invertColor,
  positive,
  delta,
  deltaInverted,
}: {
  label: string
  value: string
  change?: number
  invertColor?: boolean
  positive?: boolean
  delta?: number | null
  deltaInverted?: boolean
}) {
  const showChange = typeof change === 'number' && change !== 0
  const isPositiveChange = invertColor ? change! < 0 : change! > 0
  const showDelta = typeof delta === 'number' && delta !== 0
  const isDeltaPositive = deltaInverted ? delta! < 0 : delta! > 0

  return (
    <div className="card-editorial p-4">
      <p className="text-[10px] font-medium text-[var(--ink-3)] uppercase tracking-wider">{label}</p>
      <p className="mt-1 text-lg font-mono tabular-nums font-semibold text-[var(--ink)]">{value}</p>
      {showChange && (
        <p className={`mt-0.5 text-[10px] font-medium ${isPositiveChange ? 'text-emerald-600' : 'text-red-500'}`}>
          {change! > 0 ? '+' : ''}{change!.toFixed(1)}% t.o.v. vorige maand
        </p>
      )}
      {typeof positive === 'boolean' && !showDelta && (
        <p className={`mt-0.5 text-[10px] font-medium ${positive ? 'text-emerald-600' : 'text-red-500'}`}>
          {positive ? 'Positief' : 'Negatief'}
        </p>
      )}
      {showDelta && (
        <p className={`mt-0.5 text-[10px] font-mono tabular-nums font-medium ${isDeltaPositive ? 'text-emerald-600' : 'text-red-500'}`}>
          {delta! > 0 ? '+' : ''}{formatCurrency(delta!)} sinds check-in
        </p>
      )}
    </div>
  )
}

/* ── Shared: BudgetRow ───────────────────────────────────────────────── */
function BudgetRow({ budget, overBudget }: { budget: BudgetSummary; overBudget?: boolean }) {
  const pct = budget.limit > 0 ? Math.min(120, (budget.spent / budget.limit) * 100) : 0

  return (
    <div className="card-editorial p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-[var(--ink)] truncate">
          {budget.icon && <span className="mr-1">{budget.icon}</span>}
          {budget.name}
        </p>
        <p className="text-xs font-mono tabular-nums text-[var(--ink-2)] shrink-0">
          {formatCurrency(budget.spent)} / {formatCurrency(budget.limit)}
        </p>
      </div>
      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-[var(--border-ed)]">
        <div
          className={`h-full rounded-full transition-all ${overBudget ? 'bg-red-500' : 'bg-emerald-500'}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  )
}
