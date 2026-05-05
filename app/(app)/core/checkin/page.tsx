'use client'

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
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
  History,
  Sparkles,
  Lightbulb,
  Clock,
  AlertTriangle,
  AlertCircle,
  Landmark,
  CreditCard,
  Lock,
  Link2,
} from 'lucide-react'
import { formatMaskedCurrency, calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'

/**
 * Masked-aware currency formatter hook. Returns a stable callback that
 * yields either the masked placeholder or a formatted EUR string based on
 * the global privacy toggle. Used across the many sub-step components
 * below so each rendering site stays mechanical.
 */
function useFc() {
  const { masked } = useMaskedAmounts()
  return useCallback((v: number) => formatMaskedCurrency(v, masked), [masked])
}
import { createClient } from '@/lib/supabase/client'
import { upsertSingleBalanceSnapshot } from '@/lib/balance-snapshot'
import { BudgetIcon, isOverPositive, type BudgetType } from '@/components/app/budget-shared'
import {
  type Asset,
  type AssetType,
  ASSET_TYPE_LABELS,
  ASSET_TYPE_ICONS,
  ASSET_TYPE_COLORS,
} from '@/lib/asset-data'
import {
  type Debt,
  DEBT_TYPE_LABELS,
} from '@/lib/debt-data'

/* ── Step definitions ────────────────────────────────────────────────── */
const STEPS = [
  { key: 'terugblik',    label: 'Terugblik',    icon: Eye },
  { key: 'bezittingen',  label: 'Bezittingen',  icon: Landmark },
  { key: 'schulden',     label: 'Schulden',     icon: CreditCard },
  { key: 'doelen',       label: 'Doelen',       icon: Target },
  { key: 'budget',       label: 'Budget',       icon: Wallet },
  { key: 'vooruitblik',  label: 'Vooruitblik',  icon: TrendingUp },
  { key: 'reflectie',    label: 'Reflectie',    icon: MessageSquare },
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
  linked_asset_id: string | null
  linked_debt_id: string | null
}

interface BudgetSummary {
  id: string
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

interface Aandachtspunt {
  id: string
  type: 'budget_over' | 'unexpected_expense' | 'goal_overdue' | 'goal_behind'
  title: string
  description: string
  freedomDays?: number
  severity: 'high' | 'medium'
}

interface GesprekStarterData {
  id: string
  vraag: string
  context: string
  actie: string
  sentiment: 'positive' | 'neutral' | 'alert'
  vrijheidstijd?: string
}

const MONTH_NAMES = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
]

/* ── Main component ──────────────────────────────────────────────────── */
export default function CheckinPage() {
  return (
    <Suspense fallback={
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-wil-500" />
          <p className="text-sm text-[var(--ink-3)] font-serif italic">Check-in wordt geladen...</p>
        </div>
      </div>
    }>
      <CheckinPageContent />
    </Suspense>
  )
}

function CheckinPageContent() {
  const fc = useFc()
  const router = useRouter()
  const searchParams = useSearchParams()
  const readOnlyMonth = searchParams.get('month')
  const returnTo = searchParams.get('from') || '/will'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [readOnlySnapshot, setReadOnlySnapshot] = useState<any>(null)
  const [readOnlyLoading, setReadOnlyLoading] = useState(!!readOnlyMonth)

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
  const [gespreksstarters, setGespreksstarters] = useState<GesprekStarterData[]>([])
  const [aandachtspunten, setAandachtspunten] = useState<Aandachtspunt[]>([])

  // Revalue states
  const [assets, setAssets] = useState<Asset[]>([])
  const [debts, setDebts] = useState<Debt[]>([])
  const [assetNewValues, setAssetNewValues] = useState<Record<string, string>>({})
  const [debtNewValues, setDebtNewValues] = useState<Record<string, string>>({})
  const [goalNewValues, setGoalNewValues] = useState<Record<string, string>>({})
  const [holdingsMap, setHoldingsMap] = useState<Record<string, boolean>>({})
  const [assetsSaved, setAssetsSaved] = useState(false)
  const [debtsSaved, setDebtsSaved] = useState(false)
  const [goalsSaved, setGoalsSaved] = useState(false)
  const [budgetNewValues, setBudgetNewValues] = useState<Record<string, string>>({})
  const [budgetsSaved, setBudgetsSaved] = useState(false)

  const currentIdx = STEPS.findIndex(s => s.key === step)

  // ── Fetch read-only snapshot if month param is set ───────────────
  useEffect(() => {
    if (!readOnlyMonth) return
    async function fetchSnapshot() {
      try {
        const res = await fetch(`/api/checkin/save?month=${readOnlyMonth}`)
        if (res.ok) {
          const data = await res.json()
          if (data.found && data.snapshot) {
            setReadOnlySnapshot(data.snapshot)
          }
        }
      } catch { /* graceful */ }
      setReadOnlyLoading(false)
    }
    fetchSnapshot()
  }, [readOnlyMonth])

  // ── Fetch all data on mount ───────────────────────────────────────
  useEffect(() => {
    if (readOnlyMonth) { setLoading(false); return }
    async function loadData() {
      try {
        const supabase = createClient()

        const [overviewRes, goalsRes, budgetsRes, upcomingRes, previousRes, startersRes, aandachtspuntenRes, assetsResult, debtsResult] = await Promise.all([
          fetch('/api/checkin/overview'),
          fetch('/api/goals'),
          fetch('/api/checkin/budgets'),
          fetch('/api/checkin/upcoming'),
          fetch('/api/checkin/save'),
          fetch('/api/checkin/gespreksstarters'),
          fetch('/api/checkin/aandachtspunten'),
          supabase.from('assets').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
          supabase.from('debts').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
        ])

        if (overviewRes.ok) {
          const data = await overviewRes.json()
          setOverview(data)
        }
        if (goalsRes.ok) {
          const data = await goalsRes.json()
          setGoals(Array.isArray(data) ? data : data.goals || [])
          // Initialize goal new values
          const goalData: GoalSummary[] = Array.isArray(data) ? data : data.goals || []
          const gVals: Record<string, string> = {}
          for (const g of goalData) {
            if (!g.is_completed && !g.linked_asset_id && !g.linked_debt_id) {
              gVals[g.id] = String(Number(g.current_value))
            }
          }
          setGoalNewValues(gVals)
        }
        if (budgetsRes.ok) {
          const data = await budgetsRes.json()
          const budgetData: BudgetSummary[] = Array.isArray(data) ? data : data.budgets || []
          setBudgets(budgetData)
          const bVals: Record<string, string> = {}
          for (const b of budgetData) {
            if (b.budget_type === 'expense' && b.limit > 0) {
              bVals[b.id] = String(b.limit)
            }
          }
          setBudgetNewValues(bVals)
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
        if (startersRes.ok) {
          const data = await startersRes.json()
          if (data.starters && Array.isArray(data.starters)) {
            setGespreksstarters(data.starters)
          }
        }
        if (aandachtspuntenRes.ok) {
          const data = await aandachtspuntenRes.json()
          if (data.aandachtspunten && Array.isArray(data.aandachtspunten)) {
            setAandachtspunten(data.aandachtspunten)
          }
        }

        // Process assets
        if (!assetsResult.error && assetsResult.data) {
          const loadedAssets = assetsResult.data as Asset[]
          setAssets(loadedAssets)
          const aVals: Record<string, string> = {}
          for (const a of loadedAssets) {
            aVals[a.id] = String(Number(a.current_value))
          }
          setAssetNewValues(aVals)

          // Check holdings for all assets
          const holdingsChecks = await Promise.all(
            loadedAssets.map(async (a) => {
              try {
                const res = await fetch(`/api/assets/has-holdings?asset_id=${a.id}`)
                const data = await res.json()
                return { id: a.id, hasHoldings: data.has_holdings === true }
              } catch {
                return { id: a.id, hasHoldings: false }
              }
            })
          )
          const hMap: Record<string, boolean> = {}
          for (const h of holdingsChecks) {
            hMap[h.id] = h.hasHoldings
          }
          setHoldingsMap(hMap)
        }

        // Process debts
        if (!debtsResult.error && debtsResult.data) {
          const loadedDebts = debtsResult.data as Debt[]
          setDebts(loadedDebts)
          const dVals: Record<string, string> = {}
          for (const d of loadedDebts) {
            dVals[d.id] = String(Number(d.current_balance))
          }
          setDebtNewValues(dVals)
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
      // Save reflection + metrics snapshot with full details
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
          details: {
            netWorthChange: overview?.netWorthChange || 0,
            freedomDaysWon: overview?.freedomDaysWon || 0,
            prevMonthExpenses: overview?.prevMonthExpenses || 0,
            assets: assets.map(a => ({ name: a.name, type: a.asset_type, value: Number(a.current_value) })),
            debts: debts.map(d => ({ name: d.name, type: d.debt_type, balance: Number(d.current_balance) })),
            goals: goals.map(g => ({ name: g.name, current: g.current_value, target: g.target_value, completed: g.is_completed, icon: g.icon })),
            budgets: budgets.map(b => ({ name: b.name, icon: b.icon, limit: b.limit, spent: b.spent })),
          },
        }),
      })
      // Mark the month as completed
      await fetch('/api/monthly-checkin', { method: 'POST' })
      // Suppress the dashboard card immediately via sessionStorage
      // (the card checks this key on mount before fetching the API)
      const monthKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
      sessionStorage.setItem('checkin_dismissed', monthKey)
      // Navigate back to the page that started the check-in
      const allowedPaths = ['/identity', '/will']
      const dest = allowedPaths.includes(returnTo) ? returnTo : '/will'
      window.location.href = dest
    } catch {
      setSaving(false)
    }
  }, [reflection, overview, goals, assets, debts, budgets, returnTo])

  if (loading || readOnlyLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-wil-500" />
          <p className="text-sm text-[var(--ink-3)] font-serif italic">Check-in wordt geladen...</p>
        </div>
      </div>
    )
  }

  // ── Read-only snapshot view ─────────────────────────────────────
  if (readOnlyMonth) {
    const snap = readOnlySnapshot
    const [yearStr, monthStr] = readOnlyMonth.split('-')
    const monthIdx = parseInt(monthStr, 10) - 1
    const monthLabel = `${MONTH_NAMES[monthIdx]} ${yearStr}`

    return (
      <div className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
        {/* Header — editorial blueprint met kicker-streep */}
        <div className="mb-6 flex items-center gap-3">
          <Link
            href={returnTo}
            className="flex h-9 w-9 items-center justify-center rounded-[var(--r)] text-[var(--ink-3)] hover:text-[var(--ink)] hover:bg-[var(--subtle)] transition-colors"
            aria-label="Terug"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex-1">
            <div className="flex items-center gap-2.5 text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--module-active-700)] mb-1">
              <span
                aria-hidden
                className="inline-block w-5 h-px shrink-0"
                style={{ background: 'var(--module-active-500)' }}
              />
              <span>Geldcheck-in · Historisch</span>
            </div>
            <h1
              className="text-[20px] sm:text-[24px] font-black tracking-[-0.02em] leading-tight text-[var(--ink)] capitalize"
              style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
            >
              Check-in {monthLabel}
            </h1>
          </div>
          <span className="inline-flex items-center gap-1 rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--subtle)] px-2 py-1 text-[11px] font-medium text-[var(--ink-3)]">
            <Lock className="h-3 w-3" />
            Alleen lezen
          </span>
        </div>

        {!snap ? (
          <div className="card-editorial p-6 text-center">
            <p className="text-sm text-[var(--ink-3)]">Geen snapshot gevonden voor deze maand.</p>
            <Link href={returnTo} className="mt-3 inline-block text-sm font-medium text-kern-600 hover:text-kern-700">
              Terug
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {/* ── Overzicht ────────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-3">
              <div className="card-editorial p-4">
                <p className="label-editorial text-[var(--ink-3)] mb-1">Netto vermogen</p>
                <p className="text-lg font-mono tabular-nums font-semibold text-[var(--ink)]">
                  {fc(snap.metrics?.netWorth ?? 0)}
                </p>
                {snap.details?.netWorthChange != null && snap.details.netWorthChange !== 0 && (
                  <p className={`text-xs font-mono tabular-nums font-medium mt-0.5 ${snap.details.netWorthChange >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {snap.details.netWorthChange >= 0 ? '+' : ''}{fc(snap.details.netWorthChange)}
                  </p>
                )}
              </div>
              <div className="card-editorial p-4">
                <p className="label-editorial text-[var(--ink-3)] mb-1">Inkomen</p>
                <p className="text-lg font-mono tabular-nums font-semibold text-[var(--ink)]">
                  {fc(snap.metrics?.monthlyIncome ?? 0)}
                </p>
              </div>
              <div className="card-editorial p-4">
                <p className="label-editorial text-[var(--ink-3)] mb-1">Uitgaven</p>
                <p className="text-lg font-mono tabular-nums font-semibold text-[var(--ink)]">
                  {fc(snap.metrics?.monthlyExpenses ?? 0)}
                </p>
              </div>
              <div className="card-editorial p-4">
                <p className="label-editorial text-[var(--ink-3)] mb-1">Gespaard</p>
                <p className={`text-lg font-mono tabular-nums font-semibold ${(snap.metrics?.monthlySavings ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {fc(snap.metrics?.monthlySavings ?? 0)}
                </p>
              </div>
            </div>

            {/* Extra stats row */}
            <div className="card-editorial p-4">
              <div className="flex items-center gap-6 text-sm">
                {snap.details?.freedomDaysWon != null && snap.details.freedomDaysWon > 0 && (
                  <div>
                    <span className="label-editorial text-[var(--ink-3)]">Vrijheidsdagen</span>
                    <p className="font-mono tabular-nums font-semibold text-emerald-600">+{snap.details.freedomDaysWon}</p>
                  </div>
                )}
                <div>
                  <span className="label-editorial text-[var(--ink-3)]">Acties</span>
                  <p className="font-mono tabular-nums font-semibold text-[var(--ink)]">{snap.metrics?.completedActions ?? 0}</p>
                </div>
                <div>
                  <span className="label-editorial text-[var(--ink-3)]">Doelen</span>
                  <p className="font-mono tabular-nums font-semibold text-[var(--ink)]">{snap.metrics?.activeGoals ?? 0}</p>
                </div>
                {snap.metrics?.fireAge != null && (
                  <div>
                    <span className="label-editorial text-[var(--ink-3)]">FIRE-leeftijd</span>
                    <p className="font-mono tabular-nums font-semibold text-[var(--ink)]">{snap.metrics.fireAge} jaar</p>
                  </div>
                )}
              </div>
            </div>

            {/* ── Bezittingen ──────────────────────────────────────── */}
            {snap.details?.assets && snap.details.assets.length > 0 && (
              <div className="card-editorial p-4">
                <p className="label-editorial text-[var(--ink-3)] mb-3">Bezittingen</p>
                <div className="space-y-2">
                  {snap.details.assets.map((a: { name: string; type: string; value: number }, i: number) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[var(--ink)] truncate">{a.name}</p>
                        <p className="text-[11px] text-[var(--ink-3)]">{ASSET_TYPE_LABELS[a.type as AssetType] || a.type}</p>
                      </div>
                      <p className="text-sm font-mono tabular-nums font-semibold text-[var(--ink)] ml-3 shrink-0">
                        {fc(a.value)}
                      </p>
                    </div>
                  ))}
                  <div className="border-t border-[var(--border-ed)] pt-2 mt-2 flex items-center justify-between">
                    <p className="text-xs font-semibold text-[var(--ink-2)]">Totaal</p>
                    <p className="text-sm font-mono tabular-nums font-bold text-[var(--ink)]">
                      {fc(snap.details.assets.reduce((s: number, a: { value: number }) => s + a.value, 0))}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ── Schulden ─────────────────────────────────────────── */}
            {snap.details?.debts && snap.details.debts.length > 0 && (
              <div className="card-editorial p-4">
                <p className="label-editorial text-[var(--ink-3)] mb-3">Schulden</p>
                <div className="space-y-2">
                  {snap.details.debts.map((d: { name: string; type: string; balance: number }, i: number) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[var(--ink)] truncate">{d.name}</p>
                        <p className="text-[11px] text-[var(--ink-3)]">{DEBT_TYPE_LABELS[d.type as keyof typeof DEBT_TYPE_LABELS] || d.type}</p>
                      </div>
                      <p className="text-sm font-mono tabular-nums font-semibold text-red-500 ml-3 shrink-0">
                        {fc(d.balance)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Doelen ───────────────────────────────────────────── */}
            {snap.details?.goals && snap.details.goals.length > 0 && (
              <div className="card-editorial p-4">
                <p className="label-editorial text-[var(--ink-3)] mb-3">Doelen</p>
                <div className="space-y-2.5">
                  {snap.details.goals.map((g: { name: string; current: number; target: number; completed: boolean; icon?: string | null }, i: number) => {
                    const pct = g.target > 0 ? Math.min(100, (g.current / g.target) * 100) : 0
                    return (
                      <div key={i}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-[var(--ink)]">
                            {g.icon && <span className="mr-1">{g.icon}</span>}
                            {g.name}
                          </span>
                          <span className="text-xs font-mono tabular-nums text-[var(--ink-3)]">
                            {g.completed ? (
                              <span className="text-emerald-600 font-semibold">Voltooid</span>
                            ) : (
                              <>{fc(g.current)} / {fc(g.target)}</>
                            )}
                          </span>
                        </div>
                        {!g.completed && (
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--border-ed)]">
                            <div
                              className={`h-full rounded-full ${pct >= 100 ? 'bg-emerald-500' : 'bg-kern-400'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── Budgetten ────────────────────────────────────────── */}
            {snap.details?.budgets && snap.details.budgets.length > 0 && (
              <div className="card-editorial p-4">
                <p className="label-editorial text-[var(--ink-3)] mb-3">Budgetten</p>
                <div className="space-y-2.5">
                  {snap.details.budgets.map((b: { name: string; icon: string | null; limit: number; spent: number; budget_type?: string }, i: number) => {
                    const pct = b.limit > 0 ? Math.min(100, (b.spent / b.limit) * 100) : 0
                    const isOver = b.spent > b.limit
                    const overPos = isOver && b.budget_type ? isOverPositive(b.budget_type as BudgetType) : false
                    return (
                      <div key={i}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-[var(--ink)]">
                            {b.icon && <BudgetIcon name={b.icon} className="inline h-3.5 w-3.5 mr-1" />}
                            {b.name}
                          </span>
                          <span className={`text-xs font-mono tabular-nums ${isOver ? (overPos ? 'text-emerald-600 font-semibold' : 'text-red-500 font-semibold') : 'text-[var(--ink-3)]'}`}>
                            {fc(b.spent)} / {fc(b.limit)}
                          </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--border-ed)]">
                          <div
                            className={`h-full rounded-full ${isOver ? (overPos ? 'bg-emerald-500' : 'bg-red-500') : 'bg-emerald-500'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── Reflectie ────────────────────────────────────────── */}
            {snap.reflection && (
              <div className="card-editorial p-4">
                <p className="label-editorial text-[var(--ink-3)] mb-2">Reflectie</p>
                <p className="font-serif italic text-sm text-[var(--ink-2)] leading-relaxed">
                  &ldquo;{snap.reflection}&rdquo;
                </p>
              </div>
            )}

            {/* Saved date */}
            {snap.savedAt && (
              <p className="text-[11px] text-[var(--ink-4)] text-center">
                Opgeslagen op {new Date(snap.savedAt).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            )}
          </div>
        )}
      </div>
    )
  }

  const isLastStep = currentIdx === STEPS.length - 1

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
      {/* ── Header — editorial blueprint met kicker-streep ─────────── */}
      <div className="mb-6 flex items-center gap-3">
        <Link
          href={returnTo}
          className="flex h-9 w-9 items-center justify-center rounded-[var(--r)] text-[var(--ink-3)] hover:text-[var(--ink)] hover:bg-[var(--subtle)] transition-colors"
          aria-label="Terug"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <div className="flex items-center gap-2.5 text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--module-active-700)] mb-1">
            <span
              aria-hidden
              className="inline-block w-5 h-px shrink-0"
              style={{ background: 'var(--module-active-500)' }}
            />
            <span>Geldcheck-in</span>
          </div>
          <h1
            className="text-[20px] sm:text-[24px] font-black tracking-[-0.02em] leading-tight text-[var(--ink)]"
            style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
          >
            {overview?.monthLabel ? `Check-in ${overview.monthLabel}` : 'Maandelijkse check-in'}
          </h1>
        </div>
        <Link
          href="/core/checkin/historie"
          className="ml-auto flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-[var(--ink-3)] hover:text-[var(--ink)] hover:bg-[var(--subtle)] transition-colors"
          title="Vorige check-ins bekijken"
        >
          <History className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Historie</span>
        </Link>
      </div>

      {/* ── Step Progress ──────────────────────────────────────────── */}
      <CheckinStepProgress current={step} />

      {/* ── Aandachtspunten (shown at top of first step) ────────── */}
      {step === 'terugblik' && aandachtspunten.length > 0 && (
        <AandachtspuntenSection aandachtspunten={aandachtspunten} />
      )}

      {/* ── Step Content ───────────────────────────────────────────── */}
      <div className="mt-6">
        {step === 'terugblik' && <StepTerugblik overview={overview} previous={previous} />}
        {step === 'bezittingen' && (
          <StepBezittingen
            assets={assets}
            newValues={assetNewValues}
            setNewValues={setAssetNewValues}
            holdingsMap={holdingsMap}
            saved={assetsSaved}
            setSaved={setAssetsSaved}
          />
        )}
        {step === 'schulden' && (
          <StepSchulden
            debts={debts}
            setDebts={setDebts}
            newValues={debtNewValues}
            setNewValues={setDebtNewValues}
            saved={debtsSaved}
            setSaved={setDebtsSaved}
          />
        )}
        {step === 'doelen' && (
          <StepDoelen
            goals={goals}
            newValues={goalNewValues}
            setNewValues={setGoalNewValues}
            saved={goalsSaved}
            setSaved={setGoalsSaved}
          />
        )}
        {step === 'budget' && (
          <StepBudget
            budgets={budgets}
            newValues={budgetNewValues}
            setNewValues={setBudgetNewValues}
            saved={budgetsSaved}
            setSaved={setBudgetsSaved}
          />
        )}
        {step === 'vooruitblik' && <StepVooruitblik upcoming={upcoming} />}
        {step === 'reflectie' && (
          <StepReflectie
            reflection={reflection}
            setReflection={setReflection}
            overview={overview}
            goals={goals}
            budgets={budgets}
            previous={previous}
            gespreksstarters={gespreksstarters}
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
  const fc = useFc()
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
        <div className="flex items-center gap-2.5 text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--module-active-700)] mb-2">
          <span aria-hidden className="inline-block w-5 h-px shrink-0" style={{ background: 'var(--module-active-500)' }} />
          <span>Stap · Terugblik</span>
        </div>
        <h2
          className="text-[18px] sm:text-[20px] font-black tracking-[-0.02em] leading-tight text-[var(--ink)]"
          style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
        >
          Terugblik {overview.prevMonthLabel || 'afgelopen maand'}
        </h2>
        <p
          className="mt-2 italic text-[13px] text-[var(--ink-3)] leading-snug"
          style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
        >
          Hoe hebben je financi&euml;n zich afgelopen maand ontwikkeld?
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <MetricCard
          label="Netto vermogen"
          value={fc(overview.netWorth)}
          change={overview.netWorthChange}
          delta={netWorthDelta}
        />
        <MetricCard
          label="Inkomen"
          value={fc(overview.monthlyIncome)}
          delta={prevMetrics ? overview.monthlyIncome - prevMetrics.monthlyIncome : null}
        />
        <MetricCard
          label="Uitgaven"
          value={fc(overview.monthlyExpenses)}
          change={expenseChange}
          invertColor
          delta={prevMetrics ? overview.monthlyExpenses - prevMetrics.monthlyExpenses : null}
          deltaInverted
        />
        <MetricCard
          label="Gespaard"
          value={fc(overview.monthlySavings)}
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
                  {netWorthDelta >= 0 ? '+' : ''}{fc(netWorthDelta)}
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

/* ── Step 2: Bezittingen ─────────────────────────────────────────────── */
function StepBezittingen({
  assets,
  newValues,
  setNewValues,
  holdingsMap,
  saved,
  setSaved,
}: {
  assets: Asset[]
  newValues: Record<string, string>
  setNewValues: (v: Record<string, string>) => void
  holdingsMap: Record<string, boolean>
  saved: boolean
  setSaved: (v: boolean) => void
}) {
  const fc = useFc()
  const [savingAssets, setSavingAssets] = useState(false)

  // Group by asset_type
  const byType = useMemo(() => {
    const map: Partial<Record<AssetType, Asset[]>> = {}
    for (const type of Object.keys(ASSET_TYPE_LABELS) as AssetType[]) {
      const typeAssets = assets.filter(a => a.asset_type === type)
      if (typeAssets.length > 0) map[type] = typeAssets
    }
    return map
  }, [assets])

  const changedCount = useMemo(() => {
    let count = 0
    for (const a of assets) {
      if (holdingsMap[a.id]) continue
      const current = Number(a.current_value)
      const newVal = Number(newValues[a.id])
      if (!isNaN(newVal) && Math.abs(newVal - current) >= 0.01) count++
    }
    return count
  }, [assets, newValues, holdingsMap])

  function handleValueChange(id: string, value: string) {
    if (value !== '' && !/^-?\d*\.?\d*$/.test(value)) return
    setNewValues({ ...newValues, [id]: value })
  }

  async function handleSave() {
    if (changedCount === 0 || savingAssets) return
    setSavingAssets(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Niet ingelogd')

      const date = new Date().toISOString().split('T')[0]
      const changes: { asset: Asset; newValue: number }[] = []
      for (const asset of assets) {
        if (holdingsMap[asset.id]) continue
        const current = Number(asset.current_value)
        const newVal = Number(newValues[asset.id])
        if (isNaN(newVal) || Math.abs(newVal - current) < 0.01) continue
        changes.push({ asset, newValue: newVal })
      }

      // Upsert valuations
      const valuationRows = changes.map(({ asset, newValue }) => ({
        user_id: user.id,
        entity_type: 'asset' as const,
        entity_id: asset.id,
        valuation_date: date,
        value: newValue,
        notes: 'Check-in herwaardering',
      }))
      const { error: valError } = await supabase
        .from('valuations')
        .upsert(valuationRows, { onConflict: 'entity_id,valuation_date' })
      if (valError) throw valError

      // Update asset current_values
      await Promise.all(
        changes.map(({ asset, newValue }) =>
          supabase.from('assets').update({ current_value: newValue }).eq('id', asset.id)
        )
      )

      // Mirror naar balance_snapshots zodat de categorie-sparkline meebeweegt.
      await Promise.all(
        changes.map(({ asset, newValue }) =>
          upsertSingleBalanceSnapshot(supabase, user.id, date, {
            type: 'asset',
            id: asset.id,
            name: asset.name,
            subtype: asset.asset_type,
            balance: newValue,
            netWorthInclusionPct: asset.net_worth_inclusion_pct ?? 100,
          })
        )
      )

      setSaved(true)
    } catch {
      // silent — user can retry
    } finally {
      setSavingAssets(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="card-editorial p-5">
        <div className="flex items-center gap-2.5 text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--module-active-700)] mb-2">
          <span aria-hidden className="inline-block w-5 h-px shrink-0" style={{ background: 'var(--module-active-500)' }} />
          <span>Stap · Bezittingen</span>
        </div>
        <h2
          className="text-[18px] sm:text-[20px] font-black tracking-[-0.02em] leading-tight text-[var(--ink)]"
          style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
        >Bezittingen herwaarderen</h2>
        <p
          className="mt-2 italic text-[13px] text-[var(--ink-3)] leading-snug"
          style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
        >
          Werk de huidige waarden van je bezittingen bij.
        </p>
      </div>

      {assets.length === 0 ? (
        <div className="card-editorial p-5">
          <p className="text-sm text-[var(--ink-3)] font-serif italic">
            Nog geen bezittingen.{' '}
            <Link href="/core/assets" className="text-kern-600 hover:underline">Voeg bezittingen toe</Link>
          </p>
        </div>
      ) : (
        <>
          {(Object.entries(byType) as [AssetType, Asset[]][]).map(([type, typeAssets]) => (
            <div key={type}>
              <div className="flex items-center gap-2 pt-2 pb-1.5">
                <span style={{ color: ASSET_TYPE_COLORS[type] }}>
                  <BudgetIcon name={ASSET_TYPE_ICONS[type]} className="h-3.5 w-3.5" />
                </span>
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
                  {ASSET_TYPE_LABELS[type]}
                </h3>
              </div>
              <div className="space-y-2">
                {typeAssets.map(asset => {
                  const current = Number(asset.current_value)
                  const locked = holdingsMap[asset.id]
                  const newVal = Number(newValues[asset.id] || 0)
                  const delta = locked ? 0 : (isNaN(newVal) ? 0 : newVal - current)
                  const hasChanged = Math.abs(delta) >= 0.01

                  return (
                    <div
                      key={asset.id}
                      className={`card-editorial p-3 ${
                        locked ? 'opacity-60' : hasChanged ? 'border-kern-300' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-[var(--ink)] truncate">{asset.name}</p>
                          <p className="text-xs text-[var(--ink-3)] font-mono tabular-nums">
                            {fc(current)}
                          </p>
                        </div>
                        {locked ? (
                          <div className="flex items-center gap-1.5 text-[var(--ink-4)]">
                            <Lock className="h-3 w-3" />
                            <span className="text-[10px]">Holdings</span>
                          </div>
                        ) : (
                          <div className="w-28 shrink-0">
                            <div className="relative">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--ink-3)]">€</span>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={newValues[asset.id] ?? ''}
                                onChange={e => handleValueChange(asset.id, e.target.value)}
                                className="w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] pl-6 pr-2 py-1.5 text-sm font-mono tabular-nums text-[var(--ink)] focus:border-kern-400 focus:outline-none focus:ring-1 focus:ring-kern-400"
                              />
                            </div>
                          </div>
                        )}
                        {!locked && hasChanged && (
                          <span className={`text-xs font-mono tabular-nums font-medium shrink-0 ${
                            delta > 0 ? 'text-emerald-600' : 'text-red-500'
                          }`}>
                            {delta > 0 ? '+' : ''}{fc(delta)}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={changedCount === 0 || savingAssets || saved}
            className={`w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
              saved
                ? 'bg-emerald-600 text-white'
                : changedCount === 0
                  ? 'bg-[var(--subtle)] text-[var(--ink-4)] cursor-not-allowed'
                  : 'bg-kern-600 text-white hover:bg-kern-700'
            }`}
          >
            {savingAssets ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : saved ? (
              <>
                <Check className="h-4 w-4" />
                Opgeslagen
              </>
            ) : (
              changedCount > 0
                ? `${changedCount} bezitting${changedCount !== 1 ? 'en' : ''} opslaan`
                : 'Geen wijzigingen'
            )}
          </button>
        </>
      )}
    </div>
  )
}

/* ── Step 3: Schulden ───────────────────────────────────────────────── */
function StepSchulden({
  debts,
  setDebts,
  newValues,
  setNewValues,
  saved,
  setSaved,
}: {
  debts: Debt[]
  setDebts: (v: Debt[]) => void
  newValues: Record<string, string>
  setNewValues: (v: Record<string, string>) => void
  saved: boolean
  setSaved: (v: boolean) => void
}) {
  const fc = useFc()
  const [savingDebts, setSavingDebts] = useState(false)

  const changedCount = useMemo(() => {
    let count = 0
    for (const d of debts) {
      const current = Number(d.current_balance)
      const newVal = Number(newValues[d.id])
      if (!isNaN(newVal) && Math.abs(newVal - current) >= 0.01) count++
    }
    return count
  }, [debts, newValues])

  function handleValueChange(id: string, value: string) {
    if (value !== '' && !/^-?\d*\.?\d*$/.test(value)) return
    setNewValues({ ...newValues, [id]: value })
  }

  async function handleSave() {
    if (changedCount === 0 || savingDebts) return
    setSavingDebts(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Niet ingelogd')

      const date = new Date().toISOString().split('T')[0]
      const changes: { debt: Debt; newValue: number }[] = []
      for (const debt of debts) {
        const current = Number(debt.current_balance)
        const newVal = Number(newValues[debt.id])
        if (isNaN(newVal) || Math.abs(newVal - current) < 0.01) continue
        changes.push({ debt, newValue: newVal })
      }

      // Upsert valuations
      const valuationRows = changes.map(({ debt, newValue }) => ({
        user_id: user.id,
        entity_type: 'debt' as const,
        entity_id: debt.id,
        valuation_date: date,
        value: newValue,
        notes: 'Check-in herwaardering',
      }))
      const { error: valError } = await supabase
        .from('valuations')
        .upsert(valuationRows, { onConflict: 'entity_id,valuation_date' })
      if (valError) throw valError

      // Update debt current_balances + auto-deactivate if ≤ 0
      await Promise.all(
        changes.map(({ debt, newValue }) => {
          const updateData: Record<string, unknown> = { current_balance: newValue }
          if (newValue <= 0) updateData.is_active = false
          return supabase.from('debts').update(updateData).eq('id', debt.id)
        })
      )

      // Mirror naar balance_snapshots zodat de categorie-sparkline meebeweegt.
      await Promise.all(
        changes.map(({ debt, newValue }) =>
          upsertSingleBalanceSnapshot(supabase, user.id, date, {
            type: 'debt',
            id: debt.id,
            name: debt.name,
            subtype: debt.debt_type,
            balance: newValue,
            netWorthInclusionPct: debt.net_worth_inclusion_pct ?? 100,
          })
        )
      )

      // Remove deactivated debts from local state
      const deactivated = new Set(changes.filter(c => c.newValue <= 0).map(c => c.debt.id))
      if (deactivated.size > 0) {
        setDebts(debts.filter(d => !deactivated.has(d.id)))
      }

      setSaved(true)
    } catch {
      // silent — user can retry
    } finally {
      setSavingDebts(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="card-editorial p-5">
        <div className="flex items-center gap-2.5 text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--module-active-700)] mb-2">
          <span aria-hidden className="inline-block w-5 h-px shrink-0" style={{ background: 'var(--module-active-500)' }} />
          <span>Stap · Schulden</span>
        </div>
        <h2
          className="text-[18px] sm:text-[20px] font-black tracking-[-0.02em] leading-tight text-[var(--ink)]"
          style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
        >Schulden bijwerken</h2>
        <p
          className="mt-2 italic text-[13px] text-[var(--ink-3)] leading-snug"
          style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
        >
          Werk de actuele saldi van je schulden bij.
        </p>
      </div>

      {debts.length === 0 ? (
        <div className="card-editorial p-5">
          <p className="text-sm text-[var(--ink-3)] font-serif italic">
            Geen actieve schulden — goed bezig!
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {debts.map(debt => {
              const current = Number(debt.current_balance)
              const newVal = Number(newValues[debt.id] || 0)
              const delta = isNaN(newVal) ? 0 : newVal - current
              const hasChanged = Math.abs(delta) >= 0.01

              return (
                <div
                  key={debt.id}
                  className={`card-editorial p-3 ${hasChanged ? 'border-kern-300' : ''}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[var(--ink)] truncate">
                        {debt.name}
                      </p>
                      <p className="text-xs text-[var(--ink-3)]">
                        <span className="font-mono tabular-nums">{fc(current)}</span>
                        {' · '}
                        {DEBT_TYPE_LABELS[debt.debt_type]}
                      </p>
                    </div>
                    <div className="w-28 shrink-0">
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--ink-3)]">€</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={newValues[debt.id] ?? ''}
                          onChange={e => handleValueChange(debt.id, e.target.value)}
                          className="w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] pl-6 pr-2 py-1.5 text-sm font-mono tabular-nums text-[var(--ink)] focus:border-kern-400 focus:outline-none focus:ring-1 focus:ring-kern-400"
                        />
                      </div>
                    </div>
                    {hasChanged && (
                      <span className={`text-xs font-mono tabular-nums font-medium shrink-0 ${
                        delta < 0 ? 'text-emerald-600' : 'text-red-500'
                      }`}>
                        {delta > 0 ? '+' : ''}{fc(delta)}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={changedCount === 0 || savingDebts || saved}
            className={`w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
              saved
                ? 'bg-emerald-600 text-white'
                : changedCount === 0
                  ? 'bg-[var(--subtle)] text-[var(--ink-4)] cursor-not-allowed'
                  : 'bg-kern-600 text-white hover:bg-kern-700'
            }`}
          >
            {savingDebts ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : saved ? (
              <>
                <Check className="h-4 w-4" />
                Opgeslagen
              </>
            ) : (
              changedCount > 0
                ? `${changedCount} schuld${changedCount !== 1 ? 'en' : ''} opslaan`
                : 'Geen wijzigingen'
            )}
          </button>
        </>
      )}
    </div>
  )
}

/* ── Step 4: Doelen ─────────────────────────────────────────────────── */
function StepDoelen({
  goals,
  newValues,
  setNewValues,
  saved,
  setSaved,
}: {
  goals: GoalSummary[]
  newValues: Record<string, string>
  setNewValues: (v: Record<string, string>) => void
  saved: boolean
  setSaved: (v: boolean) => void
}) {
  const fc = useFc()
  const [savingGoals, setSavingGoals] = useState(false)
  const activeGoals = goals.filter(g => !g.is_completed)
  const completedGoals = goals.filter(g => g.is_completed)

  const changedCount = useMemo(() => {
    let count = 0
    for (const g of activeGoals) {
      if (g.linked_asset_id || g.linked_debt_id) continue
      const current = Number(g.current_value)
      const newVal = Number(newValues[g.id])
      if (!isNaN(newVal) && Math.abs(newVal - current) >= 0.01) count++
    }
    return count
  }, [activeGoals, newValues])

  function handleValueChange(id: string, value: string) {
    if (value !== '' && !/^-?\d*\.?\d*$/.test(value)) return
    setNewValues({ ...newValues, [id]: value })
  }

  async function handleSave() {
    if (changedCount === 0 || savingGoals) return
    setSavingGoals(true)
    try {
      const changes: { id: string; current_value: number }[] = []
      for (const g of activeGoals) {
        if (g.linked_asset_id || g.linked_debt_id) continue
        const current = Number(g.current_value)
        const newVal = Number(newValues[g.id])
        if (isNaN(newVal) || Math.abs(newVal - current) < 0.01) continue
        changes.push({ id: g.id, current_value: newVal })
      }

      // PATCH each changed goal
      await Promise.all(
        changes.map(({ id, current_value }) =>
          fetch('/api/goals', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, current_value }),
          })
        )
      )

      setSaved(true)
    } catch {
      // silent — user can retry
    } finally {
      setSavingGoals(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="card-editorial p-5">
        <div className="flex items-center gap-2.5 text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--module-active-700)] mb-2">
          <span aria-hidden className="inline-block w-5 h-px shrink-0" style={{ background: 'var(--module-active-500)' }} />
          <span>Stap · Doelen</span>
        </div>
        <h2
          className="text-[18px] sm:text-[20px] font-black tracking-[-0.02em] leading-tight text-[var(--ink)]"
          style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
        >Doelen bijwerken</h2>
        <p
          className="mt-2 italic text-[13px] text-[var(--ink-3)] leading-snug"
          style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
        >
          Werk de voortgang van je doelen bij.
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
            const isLinked = !!(goal.linked_asset_id || goal.linked_debt_id)
            const currentVal = isLinked ? goal.current_value : Number(newValues[goal.id] ?? goal.current_value)
            const pct = goal.target_value > 0 ? Math.min(100, (currentVal / goal.target_value) * 100) : 0
            const delta = isLinked ? 0 : currentVal - Number(goal.current_value)
            const hasChanged = Math.abs(delta) >= 0.01

            return (
              <div key={goal.id} className={`card-editorial p-4 ${hasChanged ? 'border-kern-300' : ''}`}>
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[var(--ink)] truncate">
                      {goal.icon && <span className="mr-1.5">{goal.icon}</span>}
                      {goal.name}
                    </p>
                    <p className="text-xs text-[var(--ink-3)] mt-0.5 font-mono tabular-nums">
                      {fc(goal.current_value)} / {fc(goal.target_value)}
                    </p>
                  </div>
                  {isLinked ? (
                    <div className="flex items-center gap-1.5 text-[var(--ink-4)]">
                      <Link2 className="h-3 w-3" />
                      <span className="text-[10px]">Auto-sync</span>
                    </div>
                  ) : (
                    <div className="w-28 shrink-0">
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--ink-3)]">€</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={newValues[goal.id] ?? ''}
                          onChange={e => handleValueChange(goal.id, e.target.value)}
                          className="w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] pl-6 pr-2 py-1.5 text-sm font-mono tabular-nums text-[var(--ink)] focus:border-kern-400 focus:outline-none focus:ring-1 focus:ring-kern-400"
                        />
                      </div>
                    </div>
                  )}
                  <span className="text-xs font-mono tabular-nums font-semibold text-[var(--ink-2)] shrink-0">
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

          {/* Save button */}
          {activeGoals.some(g => !g.linked_asset_id && !g.linked_debt_id) && (
            <button
              onClick={handleSave}
              disabled={changedCount === 0 || savingGoals || saved}
              className={`w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                saved
                  ? 'bg-emerald-600 text-white'
                  : changedCount === 0
                    ? 'bg-[var(--subtle)] text-[var(--ink-4)] cursor-not-allowed'
                    : 'bg-wil-600 text-white hover:bg-wil-700'
              }`}
            >
              {savingGoals ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : saved ? (
                <>
                  <Check className="h-4 w-4" />
                  Opgeslagen
                </>
              ) : (
                changedCount > 0
                  ? `${changedCount} doel${changedCount !== 1 ? 'en' : ''} opslaan`
                  : 'Geen wijzigingen'
              )}
            </button>
          )}
        </>
      )}
    </div>
  )
}

/* ── Step 5: Budget ──────────────────────────────────────────────────── */
function StepBudget({
  budgets,
  newValues,
  setNewValues,
  saved,
  setSaved,
}: {
  budgets: BudgetSummary[]
  newValues: Record<string, string>
  setNewValues: (v: Record<string, string>) => void
  saved: boolean
  setSaved: (v: boolean) => void
}) {
  const [savingBudgets, setSavingBudgets] = useState(false)
  const expenseBudgets = budgets.filter(b => b.budget_type === 'expense')
  // Groups based on original limit, not the edited value
  const overBudget = expenseBudgets.filter(b => b.limit > 0 && b.spent > b.limit)
  const underBudget = expenseBudgets.filter(b => b.limit > 0 && b.spent <= b.limit)

  const changedCount = useMemo(() => {
    let count = 0
    for (const b of expenseBudgets) {
      if (b.limit <= 0) continue
      const newVal = Number(newValues[b.id])
      if (!isNaN(newVal) && Math.abs(newVal - b.limit) >= 0.01) count++
    }
    return count
  }, [expenseBudgets, newValues])

  function handleValueChange(id: string, value: string) {
    if (value !== '' && !/^\d*[.,]?\d*$/.test(value)) return
    setNewValues({ ...newValues, [id]: value.replace(',', '.') })
    setSaved(false)
  }

  async function handleSave() {
    if (changedCount === 0 || savingBudgets) return
    setSavingBudgets(true)
    try {
      const supabase = createClient()
      const now = new Date()
      const effectiveDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

      for (const b of expenseBudgets) {
        const newVal = Number(newValues[b.id])
        if (isNaN(newVal) || Math.abs(newVal - b.limit) < 0.01) continue

        // Baseline protection: insert original limit for 2020-01-01 if no overrides exist yet
        const { data: existing } = await supabase
          .from('budget_amounts')
          .select('id')
          .eq('budget_id', b.id)
          .limit(1)

        if (!existing || existing.length === 0) {
          await supabase
            .from('budget_amounts')
            .insert({
              budget_id: b.id,
              effective_from: '2020-01-01',
              amount: Number(b.limit),
            })
        }

        // Delete + insert for current month
        await supabase
          .from('budget_amounts')
          .delete()
          .eq('budget_id', b.id)
          .eq('effective_from', effectiveDate)

        await supabase
          .from('budget_amounts')
          .insert({
            budget_id: b.id,
            effective_from: effectiveDate,
            amount: newVal,
          })
      }

      setSaved(true)
    } catch {
      // silent — user can retry
    } finally {
      setSavingBudgets(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="card-editorial p-5">
        <div className="flex items-center gap-2.5 text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--module-active-700)] mb-2">
          <span aria-hidden className="inline-block w-5 h-px shrink-0" style={{ background: 'var(--module-active-500)' }} />
          <span>Stap · Budget</span>
        </div>
        <h2
          className="text-[18px] sm:text-[20px] font-black tracking-[-0.02em] leading-tight text-[var(--ink)]"
          style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
        >
          Budget aanpassen
        </h2>
        <p
          className="mt-2 italic text-[13px] text-[var(--ink-3)] leading-snug"
          style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
        >
          Pas je budgetlimieten aan voor deze maand.
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
                <BudgetRow
                  key={b.id}
                  budget={b}
                  overBudget
                  editValue={newValues[b.id]}
                  onValueChange={handleValueChange}
                />
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
                <BudgetRow
                  key={b.id}
                  budget={b}
                  editValue={newValues[b.id]}
                  onValueChange={handleValueChange}
                />
              ))}
            </div>
          )}

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={changedCount === 0 || savingBudgets || saved}
            className={`w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
              saved
                ? 'bg-emerald-600 text-white'
                : changedCount === 0
                  ? 'bg-[var(--subtle)] text-[var(--ink-4)] cursor-not-allowed'
                  : 'bg-kern-600 text-white hover:bg-kern-700'
            }`}
          >
            {savingBudgets ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : saved ? (
              <>
                <Check className="h-4 w-4" />
                Opgeslagen
              </>
            ) : (
              changedCount > 0
                ? `${changedCount} budget${changedCount !== 1 ? 'ten' : ''} opslaan`
                : 'Geen wijzigingen'
            )}
          </button>
        </>
      )}
    </div>
  )
}

/* ── Step 6: Vooruitblik ─────────────────────────────────────────────── */
function StepVooruitblik({ upcoming }: { upcoming: UpcomingItem[] }) {
  const fc = useFc()
  return (
    <div className="space-y-4">
      <div className="card-editorial p-5">
        <div className="flex items-center gap-2.5 text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--module-active-700)] mb-2">
          <span aria-hidden className="inline-block w-5 h-px shrink-0" style={{ background: 'var(--module-active-500)' }} />
          <span>Stap · Vooruitblik</span>
        </div>
        <h2
          className="text-[18px] sm:text-[20px] font-black tracking-[-0.02em] leading-tight text-[var(--ink)]"
          style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
        >
          Vooruitblik
        </h2>
        <p
          className="mt-2 italic text-[13px] text-[var(--ink-3)] leading-snug"
          style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
        >
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
                {fc(item.amount)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Step 7: Reflectie ───────────────────────────────────────────────── */
function StepReflectie({
  reflection,
  setReflection,
  overview,
  goals,
  budgets,
  previous,
  gespreksstarters,
}: {
  reflection: string
  setReflection: (v: string) => void
  overview: CheckinOverview | null
  goals: GoalSummary[]
  budgets: BudgetSummary[]
  previous: PreviousSnapshot | null
  gespreksstarters: GesprekStarterData[]
}) {
  const fc = useFc()
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
        <div className="flex items-center gap-2.5 text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--module-active-700)] mb-2">
          <span aria-hidden className="inline-block w-5 h-px shrink-0" style={{ background: 'var(--module-active-500)' }} />
          <span>Stap · Reflectie</span>
        </div>
        <h2
          className="text-[18px] sm:text-[20px] font-black tracking-[-0.02em] leading-tight text-[var(--ink)]"
          style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
        >
          Reflectie
        </h2>
        <p
          className="mt-2 italic text-[13px] text-[var(--ink-3)] leading-snug"
          style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
        >
          Neem even een moment om te reflecteren op je financi&euml;le situatie.
        </p>
      </div>

      {/* Mini summary with freedom-time equivalents */}
      <div className="card-editorial p-4">
        <p className="text-xs font-medium text-[var(--ink-3)] uppercase tracking-wider mb-2">Samenvatting</p>
        <div className="space-y-1.5 text-sm text-[var(--ink-2)]">
          {overview && (
            <p>
              Je hebt deze maand <span className="font-mono tabular-nums font-medium">{fc(overview.monthlySavings)}</span> gespaard
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

      {/* Gespreksstarters */}
      {gespreksstarters.length > 0 && (
        <div className="card-editorial p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-wil-50">
              <Sparkles className="h-3.5 w-3.5 text-wil-600" />
            </div>
            <p className="text-xs font-medium text-wil-600 uppercase tracking-wider">
              Gespreksstarters
            </p>
          </div>
          <p className="text-xs text-[var(--ink-3)] leading-relaxed mb-3">
            Op basis van jullie financi&euml;le trends — bespreek samen:
          </p>
          <div className="space-y-3">
            {gespreksstarters.map(starter => (
              <GesprekStarterCard key={starter.id} starter={starter} />
            ))}
          </div>
        </div>
      )}

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

/* ── Shared: AandachtspuntenSection ──────────────────────────────────── */
function AandachtspuntenSection({ aandachtspunten }: { aandachtspunten: Aandachtspunt[] }) {
  return (
    <div className="mt-6 mb-2">
      <div className="card-editorial border-l-3 border-l-amber-400 p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-50">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
          </div>
          <p className="text-xs font-medium text-amber-700 uppercase tracking-wider">
            Aandachtspunten
          </p>
          <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-100 px-1.5 text-[10px] font-bold text-amber-700">
            {aandachtspunten.length}
          </span>
        </div>
        <div className="space-y-2.5">
          {aandachtspunten.map(punt => (
            <div
              key={punt.id}
              className={`rounded-lg p-3 ${
                punt.severity === 'high'
                  ? 'bg-red-50/60 border border-red-200/60'
                  : 'bg-amber-50/60 border border-amber-200/60'
              }`}
            >
              <div className="flex items-start gap-2">
                {punt.severity === 'high' ? (
                  <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium ${
                    punt.severity === 'high' ? 'text-red-800' : 'text-amber-800'
                  }`}>
                    {punt.title}
                  </p>
                  <p className="text-xs text-[var(--ink-3)] mt-0.5 leading-relaxed">
                    {punt.description}
                  </p>
                  {punt.freedomDays != null && punt.freedomDays > 0 && (
                    <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                      <Clock className="h-2.5 w-2.5" />
                      {punt.freedomDays} {punt.freedomDays === 1 ? 'vrijheidsdag' : 'vrijheidsdagen'} impact
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── Shared: GesprekStarterCard ──────────────────────────────────────── */
function GesprekStarterCard({ starter }: { starter: GesprekStarterData }) {
  const [expanded, setExpanded] = useState(false)

  const sentimentColor = {
    positive: 'border-l-emerald-400',
    neutral: 'border-l-wil-400',
    alert: 'border-l-amber-400',
  }[starter.sentiment]

  const sentimentBg = {
    positive: 'bg-emerald-50/50',
    neutral: 'bg-wil-50/50',
    alert: 'bg-amber-50/50',
  }[starter.sentiment]

  return (
    <div
      className={`rounded-lg border border-[var(--border-ed)] border-l-3 ${sentimentColor} ${sentimentBg} p-3 cursor-pointer transition-colors hover:bg-[var(--subtle)]`}
      onClick={() => setExpanded(v => !v)}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && setExpanded(v => !v)}
    >
      <p className="text-sm text-[var(--ink)] leading-relaxed">{starter.vraag}</p>
      {starter.vrijheidstijd && (
        <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-white/60 px-2 py-0.5 text-[10px] font-medium text-wil-700">
          <Clock className="h-2.5 w-2.5" />
          {starter.vrijheidstijd}
        </div>
      )}
      {expanded && (
        <div className="mt-2.5 space-y-2 border-t border-[var(--border-ed)] pt-2.5">
          <p className="text-[11px] text-[var(--ink-3)] leading-relaxed">
            <span className="font-medium text-[var(--ink-2)]">Data:</span> {starter.context}
          </p>
          <div className="flex items-start gap-1.5">
            <Lightbulb className="h-3 w-3 text-wil-500 mt-0.5 shrink-0" />
            <p className="text-[11px] text-wil-700 leading-relaxed font-medium">
              {starter.actie}
            </p>
          </div>
        </div>
      )}
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
  const fc = useFc()
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
          {delta! > 0 ? '+' : ''}{fc(delta!)} sinds check-in
        </p>
      )}
    </div>
  )
}

/* ── Shared: BudgetRow ───────────────────────────────────────────────── */
function BudgetRow({
  budget,
  overBudget,
  editValue,
  onValueChange,
}: {
  budget: BudgetSummary
  overBudget?: boolean
  editValue?: string
  onValueChange?: (id: string, value: string) => void
}) {
  const fc = useFc()
  const editedLimit = Number(editValue) || budget.limit
  const pct = editedLimit > 0 ? Math.min(120, (budget.spent / editedLimit) * 100) : 0
  const isOver = budget.spent > editedLimit
  const delta = editedLimit - budget.limit
  const hasChanged = Math.abs(delta) >= 0.01

  return (
    <div className={`card-editorial p-3 ${hasChanged ? 'border-kern-300' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-[var(--ink)] truncate">
          {budget.icon && <span className="mr-1">{budget.icon}</span>}
          {budget.name}
        </p>
        <p className="text-xs font-mono tabular-nums text-[var(--ink-2)] shrink-0">
          {fc(budget.spent)} / {fc(budget.limit)}
        </p>
      </div>
      {onValueChange && (
        <div className="mt-2 flex items-center gap-2">
          <div className="w-28 shrink-0">
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--ink-3)]">€</span>
              <input
                type="text"
                inputMode="decimal"
                value={editValue ?? ''}
                onChange={e => onValueChange(budget.id, e.target.value)}
                className="w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] pl-6 pr-2 py-1.5 text-sm font-mono tabular-nums text-[var(--ink)] focus:border-kern-400 focus:outline-none focus:ring-1 focus:ring-kern-400"
              />
            </div>
          </div>
          {hasChanged && (
            <span className={`text-xs font-mono tabular-nums font-medium ${delta > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {delta > 0 ? '+' : ''}{fc(delta)}
            </span>
          )}
        </div>
      )}
      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-[var(--border-ed)]">
        <div
          className={`h-full rounded-full transition-all ${isOver ? 'bg-red-500' : 'bg-emerald-500'}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  )
}
