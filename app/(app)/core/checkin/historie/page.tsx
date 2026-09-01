'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { PageOpening, PageInfoButton } from '@/components/editorial'
import {
  CalendarCheck,
  CalendarClock,
  Loader2,
  User,
  Users,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  ChevronRight,
  ArrowRight,
} from 'lucide-react'
import { useCallback } from 'react'
import { formatMaskedCurrency, calculateFreedomTime, formatFreedomTimeString, dailyExpenseRate } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { useModuleHex } from '@/components/app/module-color-provider'
import { ReportSparkline } from '@/app/(app)/rapportages/[id]/components/report-sparkline'
import { monthKeyFromDate, daysUntilNextCheckin, describeNextCheckin } from './cadence'
import { ReeksRegel } from './reeks-regel'

const PLAYFAIR = 'var(--font-playfair, Georgia, serif)'

/**
 * Masked-aware currency formatter hook. Returns a stable callback that
 * yields either the masked placeholder or a formatted EUR string based on
 * the global privacy toggle.
 */
function useFc() {
  const { masked } = useMaskedAmounts()
  return useCallback((v: number) => formatMaskedCurrency(v, masked), [masked])
}

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
  /** Afgevinkte maanden (`YYYY-MM`) — voedt de reeks-regel bovenin. */
  const [completedMonths, setCompletedMonths] = useState<string[]>([])

  useEffect(() => {
    async function load() {
      try {
        // Twee lezingen langs bestaande API-routes (toegestaan lazy client-read
        // pad): de snapshots én de afvinklijst waar de reeks uit volgt.
        // De reeks-fetch is versiering en mag de historie nooit blanken: een
        // rejectende tweede fetch zou via Promise.all de catch in springen
        // vóórdat de geslaagde historie-respons verwerkt is (review 1 sep).
        const [historyRes, monthlyRes] = await Promise.all([
          fetch('/api/checkin/save?mode=history'),
          fetch('/api/monthly-checkin').catch(() => null),
        ])
        if (historyRes.ok) {
          const data = await historyRes.json()
          setCheckins(data.checkins || [])
          setHasHousehold(data.hasHousehold || false)
        }
        if (monthlyRes?.ok) {
          const monthly = await monthlyRes.json()
          if (Array.isArray(monthly?.completedMonths)) {
            setCompletedMonths(monthly.completedMonths)
          }
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
    <div className="relative mx-auto max-w-2xl px-4 py-6 sm:py-10">
      <NavStackMeta title="Check-in historie" />
      <PageInfoButton
        className="absolute top-4 right-4 sm:right-6"
        description="Hier vind je al je maandelijkse geldcheck-ins terug — een tijdlijn van je vermogen, sparen en reflecties. Bovenaan zie je de trend en wanneer je volgende check-in klaarstaat; klik een maand open voor de details."
      />
      {/* Editorial pagina-opening */}
      <PageOpening
        className="mb-6"
        kicker="Geldcheck-in · Archief"
        titleBefore=""
        emphasis="Historie"
        titleAfter=" van je check-ins"
      />

      {/* Lopende reeks — rustige regel, verschijnt vanaf twee maanden op rij */}
      <ReeksRegel completedMonths={completedMonths} />

      {hasHousehold && (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-wil-50 px-4 py-2.5">
          <Users className="h-4 w-4 text-wil-600 shrink-0" />
          <p className="text-xs text-wil-700">
            Check-ins van jou en je partner worden hier samen getoond.
          </p>
        </div>
      )}

      {checkins.length === 0 ? (
        <CheckinEmptyState />
      ) : (
        <>
          {/* Additieve samenvatting boven de (ongewijzigde) historie —
              alleen bij ≥2 check-ins, zodat de trendlijn iets te zeggen heeft. */}
          {checkins.length >= 2 && (
            <CheckinSummary checkins={checkins} hasHousehold={hasHousehold} />
          )}
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
        </>
      )}
    </div>
  )
}

/* ── Empty state (0 check-ins) ─────────────────────────────────────────── */
/**
 * Krant-toon lege staat: kicker + serif-belofte + ink-CTA (empty-state-
 * drieluik). Vervangt de kale "icoon + 1 zin + link" — een eerste check-in
 * staat immers altijd klaar, dus nodigen we daar expliciet toe uit.
 */
function CheckinEmptyState() {
  return (
    <div className="card-editorial p-6 sm:p-8 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-[var(--r)] bg-wil-50">
        <CalendarCheck className="h-6 w-6 text-wil-600" />
      </div>
      <p className="text-[10px] uppercase tracking-[0.20em] font-mono text-wil-700 mb-3">
        Geldcheck-in
      </p>
      <p
        className="mx-auto max-w-[34ch] text-lg sm:text-xl italic leading-snug text-[var(--ink)]"
        style={{ fontFamily: PLAYFAIR }}
      >
        Je eerste check-in staat klaar — een maandelijks moment om je vrijheid
        in tijd te meten.
      </p>
      <Link
        href="/core/checkin"
        className="mt-5 inline-flex items-center gap-2 bg-[var(--ink)] text-[var(--paper)] px-5 py-2.5 text-sm font-semibold min-h-11 hover:opacity-80 transition-opacity"
      >
        Start je eerste check-in
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  )
}

/* ── Samenvatting (≥2 check-ins) ───────────────────────────────────────── */
/**
 * Compacte samenvatting boven de historie: mini-trendlijn van het netto
 * vermogen over de check-ins + een "volgende check-in"-teaser (afgeleid uit
 * de laatste check-in en de maandcadans, zie ./cadence).
 *
 * De trendlijn toont alleen solo: in een huishouden mengt de lijst de
 * snapshots van beide partners, en één vermogenslijn over twee grondslagen
 * zou misleiden. De cadans-teaser (maand-gebaseerd) is wél veilig te tonen.
 */
function CheckinSummary({
  checkins,
  hasHousehold,
}: {
  checkins: CheckinSnapshot[]
  hasHousehold: boolean
}) {
  const wilHex = useModuleHex('wil', 600)

  // Chronologisch oplopend voor de sparkline (lijst komt aflopend binnen).
  const chrono = [...checkins].sort(
    (a, b) => new Date(a.savedAt).getTime() - new Date(b.savedAt).getTime()
  )
  const latest = chrono[chrono.length - 1]
  const netWorthSeries = chrono.map((c) => c.metrics.netWorth)

  // Laatste check-in-maand uit savedAt (altijd aanwezig) → cadans-teaser.
  const lastMonthKey = monthKeyFromDate(new Date(latest.savedAt))
  const teaser = describeNextCheckin(daysUntilNextCheckin(lastMonthKey, new Date()))

  return (
    <div className="card-editorial p-4 sm:p-5 mb-4">
      <div className="mb-3 flex items-center justify-between">
        {/* wil-700 (niet --module-active): de rest van dit blok is wil-getint en
            de backing-route /core/checkin valt buiten de wil-route-override. */}
        <span className="text-[10px] uppercase tracking-[0.18em] font-mono text-wil-700">
          Jouw check-ins
        </span>
        <span className="font-mono tabular-nums text-xs text-[var(--ink-3)]">
          {checkins.length} totaal
        </span>
      </div>

      {!hasHousehold && netWorthSeries.length >= 2 && (
        <>
          <ReportSparkline
            values={netWorthSeries}
            color={wilHex}
            width={260}
            height={44}
            className="mb-1"
          />
          <p
            className="text-[11px] italic text-[var(--ink-3)]"
            style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
          >
            Netto vermogen over je check-ins — opgeslagen tijd die groeit.
          </p>
        </>
      )}

      {teaser && (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-wil-50 px-3 py-2">
          <CalendarClock className="h-4 w-4 shrink-0 text-wil-600" />
          <span className="flex-1 text-xs text-wil-700">{teaser}</span>
          <Link
            href="/core/checkin"
            className="shrink-0 text-xs font-medium text-wil-700 underline underline-offset-2 hover:text-wil-800"
          >
            Nieuwe check-in
          </Link>
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
  const fc = useFc()
  const { metrics } = checkin
  const dailyExpenses = dailyExpenseRate(metrics.monthlyExpenses)

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
            <span className="font-mono tabular-nums">{fc(metrics.netWorth)}</span>
            {netWorthDelta !== null && netWorthDelta !== 0 && (
              <span className={`font-mono tabular-nums font-medium ${netWorthDelta >= 0 ? 'text-positive' : 'text-negative'}`}>
                {netWorthDelta >= 0 ? '+' : ''}{fc(netWorthDelta)}
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
            <MiniMetric label="Netto vermogen" value={fc(metrics.netWorth)} />
            <MiniMetric label="Inkomen" value={fc(metrics.monthlyIncome)} />
            <MiniMetric label="Uitgaven" value={fc(metrics.monthlyExpenses)} />
            <MiniMetric
              label="Gespaard"
              value={fc(metrics.monthlySavings)}
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
      <p className="text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--module-active-700)]">{label}</p>
      <p
        className="mt-1 text-[18px] font-black leading-none tracking-[-0.02em] tabular-nums"
        style={{
          fontFamily: 'var(--font-playfair, Georgia, serif)',
          color: typeof positive === 'boolean'
            ? positive ? 'var(--positive)' : 'var(--negative)'
            : 'var(--ink)',
        }}
      >
        {value}
      </p>
    </div>
  )
}
