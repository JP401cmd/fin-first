'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  CalendarCheck,
  Loader2,
  User,
  Users,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { formatCurrency, calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'

/* ── Types ─────────────────────────────────────────────────────────────── */
interface CheckinSnapshot {
  reflection: string
  monthKey: string
  savedAt: string
  userId: string
  userName: string | null
  householdId: string | null
  metrics: {
    netWorth: number
    monthlyIncome: number
    monthlyExpenses: number
    monthlySavings: number
    completedActions: number
    activeGoals: number
    fireAge: number | null
  }
}

const MONTH_NAMES = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
]

function formatMonthLabel(monthKey: string): string {
  if (!monthKey) return 'Onbekend'
  // monthKey can be either "maart 2026" or "2026-03"
  if (monthKey.includes('-')) {
    const [year, month] = monthKey.split('-')
    const monthIdx = parseInt(month, 10) - 1
    if (monthIdx >= 0 && monthIdx < 12) {
      return `${MONTH_NAMES[monthIdx]} ${year}`
    }
  }
  return monthKey
}

function formatDate(isoDate: string): string {
  try {
    const d = new Date(isoDate)
    return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return isoDate
  }
}

/* ── Main Page ─────────────────────────────────────────────────────────── */
export default function CheckinHistoriePage() {
  const [loading, setLoading] = useState(true)
  const [checkins, setCheckins] = useState<CheckinSnapshot[]>([])
  const [hasHousehold, setHasHousehold] = useState(false)
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/checkin/save?mode=history')
        if (res.ok) {
          const data = await res.json()
          setCheckins(data.checkins || [])
          setHasHousehold(data.hasHousehold || false)
        }
      } catch {
        // Graceful failure
      }
      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-wil-500" />
          <p className="text-sm text-[var(--ink-3)] font-serif italic">Historie wordt geladen...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/core/checkin"
          className="flex h-9 w-9 items-center justify-center rounded-[var(--r)] text-[var(--ink-3)] hover:text-[var(--ink)] hover:bg-[var(--subtle)] transition-colors"
          aria-label="Terug naar check-in"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <span className="label-editorial text-wil-600">Geldcheck-in</span>
          <h1 className="text-lg font-display font-semibold text-[var(--ink)] tracking-tight">
            Check-in historie
          </h1>
        </div>
      </div>

      {hasHousehold && (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-wil-50 px-4 py-2.5">
          <Users className="h-4 w-4 text-wil-600 shrink-0" />
          <p className="text-xs text-wil-700">
            Check-ins van jou en je partner worden hier samen getoond.
          </p>
        </div>
      )}

      {checkins.length === 0 ? (
        <div className="card-editorial p-6 text-center">
          <CalendarCheck className="h-10 w-10 text-[var(--ink-4)] mx-auto mb-3" />
          <p className="text-sm text-[var(--ink-3)] font-serif italic">
            Nog geen check-ins afgerond.
          </p>
          <Link
            href="/core/checkin"
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-wil-600 hover:text-wil-700"
          >
            Start je eerste check-in
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {checkins.map((checkin, idx) => (
            <CheckinHistoryCard
              key={`${checkin.userId}-${checkin.savedAt}`}
              checkin={checkin}
              isExpanded={expandedIdx === idx}
              onToggle={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
              previousCheckin={checkins[idx + 1] || null}
              hasHousehold={hasHousehold}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/* ── History Card ──────────────────────────────────────────────────────── */
function CheckinHistoryCard({
  checkin,
  isExpanded,
  onToggle,
  previousCheckin,
  hasHousehold,
}: {
  checkin: CheckinSnapshot
  isExpanded: boolean
  onToggle: () => void
  previousCheckin: CheckinSnapshot | null
  hasHousehold: boolean
}) {
  const { metrics } = checkin
  const dailyExpenses = metrics.monthlyExpenses > 0 ? metrics.monthlyExpenses / 30 : 0

  // Delta from previous
  const prevMetrics = previousCheckin?.metrics
  const netWorthDelta = prevMetrics ? metrics.netWorth - prevMetrics.netWorth : null
  const freedomGrowth = netWorthDelta && dailyExpenses > 0
    ? calculateFreedomTime(Math.abs(netWorthDelta), dailyExpenses)
    : null

  return (
    <div className="card-editorial overflow-hidden">
      {/* Collapsed header — always visible */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-[var(--subtle)] transition-colors"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--r)] bg-wil-50">
          <CalendarCheck className="h-4.5 w-4.5 text-wil-600" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-[var(--ink)] capitalize">
              {formatMonthLabel(checkin.monthKey)}
            </p>
            {hasHousehold && checkin.userName && (
              <span className="inline-flex items-center gap-1 rounded-full bg-wil-50 px-2 py-0.5 text-[10px] font-medium text-wil-700">
                <User className="h-2.5 w-2.5" />
                {checkin.userName}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-3 text-[10px] text-[var(--ink-3)]">
            <span className="font-mono tabular-nums">{formatCurrency(metrics.netWorth)}</span>
            {netWorthDelta !== null && netWorthDelta !== 0 && (
              <span className={`font-mono tabular-nums font-medium ${netWorthDelta >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {netWorthDelta >= 0 ? '+' : ''}{formatCurrency(netWorthDelta)}
              </span>
            )}
            <span>{formatDate(checkin.savedAt)}</span>
          </div>
        </div>

        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-[var(--ink-4)] shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-[var(--ink-4)] shrink-0" />
        )}
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-[var(--border-ed)] px-4 py-4 space-y-4">
          {/* Metrics grid */}
          <div className="grid grid-cols-2 gap-3">
            <MiniMetric label="Netto vermogen" value={formatCurrency(metrics.netWorth)} />
            <MiniMetric label="Inkomen" value={formatCurrency(metrics.monthlyIncome)} />
            <MiniMetric label="Uitgaven" value={formatCurrency(metrics.monthlyExpenses)} />
            <MiniMetric
              label="Gespaard"
              value={formatCurrency(metrics.monthlySavings)}
              positive={metrics.monthlySavings > 0}
            />
          </div>

          {/* Freedom time impact */}
          {freedomGrowth && !freedomGrowth.isInfinite && freedomGrowth.totalDays > 0 && (
            <div className="flex items-center gap-2 text-xs text-[var(--ink-2)]">
              {netWorthDelta! >= 0 ? (
                <TrendingUp className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              ) : (
                <TrendingDown className="h-3.5 w-3.5 text-red-500 shrink-0" />
              )}
              <span>
                {netWorthDelta! >= 0 ? '+' : '-'}{formatFreedomTimeString(freedomGrowth, 'short', false)} vrijheid
                t.o.v. vorige check-in
              </span>
            </div>
          )}

          {/* Extra stats */}
          <div className="flex flex-wrap gap-3 text-xs text-[var(--ink-3)]">
            {metrics.completedActions > 0 && (
              <span className="text-emerald-600 font-medium">
                {metrics.completedActions} {metrics.completedActions === 1 ? 'actie' : 'acties'} afgerond
              </span>
            )}
            {metrics.activeGoals > 0 && (
              <span>
                {metrics.activeGoals} actieve {metrics.activeGoals === 1 ? 'doel' : 'doelen'}
              </span>
            )}
            {metrics.fireAge != null && (
              <span>
                FIRE-leeftijd: <span className="font-mono tabular-nums font-medium">{metrics.fireAge}</span>
              </span>
            )}
          </div>

          {/* Reflection */}
          {checkin.reflection && (
            <div className="rounded-xl bg-[var(--subtle)] p-3">
              <p className="text-[10px] font-medium text-[var(--ink-3)] uppercase tracking-wider mb-1.5">
                Reflectie
              </p>
              <p className="text-sm text-[var(--ink-2)] font-serif italic leading-relaxed whitespace-pre-line">
                {checkin.reflection}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Mini Metric ───────────────────────────────────────────────────────── */
function MiniMetric({
  label,
  value,
  positive,
}: {
  label: string
  value: string
  positive?: boolean
}) {
  return (
    <div className="rounded-xl bg-[var(--subtle)] p-3">
      <p className="text-[10px] font-medium text-[var(--ink-3)] uppercase tracking-wider">{label}</p>
      <p className={`mt-0.5 text-sm font-mono tabular-nums font-semibold ${
        typeof positive === 'boolean'
          ? positive ? 'text-emerald-600' : 'text-red-500'
          : 'text-[var(--ink)]'
      }`}>
        {value}
      </p>
    </div>
  )
}
