'use client'

import { useState, useMemo } from 'react'
import type { NetWorthSnapshot } from '@/lib/net-worth-data'
import { formatCurrency } from '@/components/app/budget-shared'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { ArrowRight, TrendingUp, TrendingDown, Minus, ChevronDown } from 'lucide-react'

/* ─── helpers ─── */

/** Group snapshots by month key (YYYY-MM) and pick the latest per month */
function groupByMonth(snapshots: NetWorthSnapshot[]): Map<string, NetWorthSnapshot> {
  const map = new Map<string, NetWorthSnapshot>()
  for (const s of snapshots) {
    const key = s.snapshot_date.slice(0, 7) // "YYYY-MM"
    const existing = map.get(key)
    // Keep the latest snapshot within the same month
    if (!existing || s.snapshot_date > existing.snapshot_date) {
      map.set(key, s)
    }
  }
  return map
}

/** Format a YYYY-MM key to Dutch month label */
function formatMonthLabel(key: string): string {
  const [year, month] = key.split('-').map(Number)
  const date = new Date(year, month - 1, 1)
  return date.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })
}

/** Format number with sign prefix */
function formatDelta(value: number, suffix?: string, masked = false): string {
  const prefix = value > 0 ? '+' : ''
  if (suffix) {
    return `${prefix}${value.toFixed(1)}${suffix}`
  }
  return `${prefix}${formatMaskedCurrency(value, masked)}`
}

/** Sovereignty level label mapping */
const sovereigntyLabels: Record<number, string> = {
  [-2]: 'Crisis',
  [-1]: 'Nood',
  0: 'Overleven',
  1: 'Basis',
  2: 'Stabiliteit',
  3: 'Groei',
  4: 'Momentum',
  5: 'Vrijheid',
  6: 'Meesterschap',
}

function getSovereigntyLabel(level: number | null | undefined): string {
  if (level == null) return '—'
  return sovereigntyLabels[level] ?? `Niveau ${level}`
}

/* ─── metric definition ─── */

type MetricConfig = {
  key: string
  label: string
  getValue: (s: NetWorthSnapshot) => number | null
  format: (v: number) => string
  formatDelta: (d: number) => string
  /** If true, a lower value is better (e.g. debts, fire_age) */
  invertColor?: boolean
  /** Custom display for value */
  customDisplay?: (s: NetWorthSnapshot) => string
}

const metrics: MetricConfig[] = [
  {
    key: 'net_worth',
    label: 'Netto vermogen',
    getValue: (s) => Number(s.net_worth),
    format: (v) => formatCurrency(v),
    formatDelta: (d) => formatDelta(d),
  },
  {
    key: 'total_assets',
    label: 'Totale bezittingen',
    getValue: (s) => Number(s.total_assets),
    format: (v) => formatCurrency(v),
    formatDelta: (d) => formatDelta(d),
  },
  {
    key: 'total_debts',
    label: 'Totale schulden',
    getValue: (s) => Number(s.total_debts),
    format: (v) => formatCurrency(v),
    formatDelta: (d) => formatDelta(d),
    invertColor: true,
  },
  {
    key: 'freedom_percentage',
    label: 'Vrijheid %',
    getValue: (s) => s.freedom_percentage ?? null,
    format: (v) => `${v.toFixed(1)}%`,
    formatDelta: (d) => formatDelta(d, '%'),
  },
  {
    key: 'fire_age',
    label: 'FIRE-leeftijd',
    getValue: (s) => s.fire_age ?? null,
    format: (v) => `${v.toFixed(1)} jaar`,
    formatDelta: (d) => `${d > 0 ? '+' : ''}${d.toFixed(1)} jaar`,
    invertColor: true, // lower FIRE age = better
  },
  {
    key: 'sovereignty_level',
    label: 'Soevereiniteitsniveau',
    getValue: (s) => s.sovereignty_level ?? null,
    format: (v) => `${v}`,
    formatDelta: (d) => `${d > 0 ? '+' : ''}${d}`,
    customDisplay: (s) => getSovereigntyLabel(s.sovereignty_level),
  },
  {
    key: 'savings_rate',
    label: 'Spaarquote',
    getValue: (s) => s.savings_rate ?? null,
    format: (v) => `${v.toFixed(1)}%`,
    formatDelta: (d) => formatDelta(d, '%'),
  },
  {
    key: 'resilience_score',
    label: 'Gezondheids-score',
    getValue: (s) => s.resilience_score ?? null,
    format: (v) => `${Math.round(v)}/100`,
    formatDelta: (d) => `${d > 0 ? '+' : ''}${Math.round(d)}`,
  },
]

/* ─── sub-components ─── */

function DeltaIndicator({ delta, invert }: { delta: number; invert?: boolean }) {
  if (delta === 0) {
    return (
      <div className="flex items-center gap-1 text-[var(--ink-3)]">
        <Minus className="h-3.5 w-3.5" />
        <span className="text-xs font-medium">Geen verschil</span>
      </div>
    )
  }
  const isPositive = invert ? delta < 0 : delta > 0
  return (
    <div className={`flex items-center gap-1 ${isPositive ? 'text-positive' : 'text-negative'}`}>
      {isPositive ? (
        <TrendingUp className="h-3.5 w-3.5" />
      ) : (
        <TrendingDown className="h-3.5 w-3.5" />
      )}
      <span className="text-xs font-semibold">
        {isPositive ? 'Verbetering' : 'Achteruitgang'}
      </span>
    </div>
  )
}

function MetricRow({
  metric,
  snapshotA,
  snapshotB,
}: {
  metric: MetricConfig
  snapshotA: NetWorthSnapshot
  snapshotB: NetWorthSnapshot
}) {
  const valA = metric.getValue(snapshotA)
  const valB = metric.getValue(snapshotB)

  // Skip if both are null (metric not available)
  if (valA === null && valB === null) return null

  const delta = valA !== null && valB !== null ? valB - valA : null
  const deltaColor =
    delta === null
      ? 'text-[var(--ink-3)]'
      : delta === 0
        ? 'text-[var(--ink-3)]'
        : (metric.invertColor ? delta < 0 : delta > 0)
          ? 'text-positive'
          : 'text-negative'

  const deltaBg =
    delta === null
      ? 'bg-[var(--subtle)]'
      : delta === 0
        ? 'bg-[var(--subtle)]'
        : (metric.invertColor ? delta < 0 : delta > 0)
          ? 'bg-positive/10'
          : 'bg-negative/10'

  return (
    <div
      className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-3 rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] p-4"
      data-testid={`metric-row-${metric.key}`}
    >
      {/* Snapshot A value */}
      <div className="text-center">
        <p className="text-lg font-bold text-zinc-800">
          {valA !== null
            ? (metric.customDisplay ? metric.customDisplay(snapshotA) : metric.format(valA))
            : '—'}
        </p>
      </div>

      {/* Arrow */}
      <div className="flex items-center justify-center">
        <ArrowRight className="h-4 w-4 text-[var(--ink-4)]" />
      </div>

      {/* Snapshot B value */}
      <div className="text-center">
        <p className="text-lg font-bold text-zinc-800">
          {valB !== null
            ? (metric.customDisplay ? metric.customDisplay(snapshotB) : metric.format(valB))
            : '—'}
        </p>
      </div>

      {/* Delta */}
      <div className={`flex flex-col items-center rounded-lg px-3 py-1.5 ${deltaBg}`}>
        {delta !== null ? (
          <>
            <span className={`text-sm font-bold ${deltaColor}`}>
              {metric.formatDelta(delta)}
            </span>
            <DeltaIndicator delta={delta} invert={metric.invertColor} />
          </>
        ) : (
          <span className="text-xs text-[var(--ink-3)]">—</span>
        )}
      </div>
    </div>
  )
}

/* ─── month selector ─── */

function MonthSelector({
  monthKeys,
  selectedKey,
  onChange,
  label,
  testId,
}: {
  monthKeys: string[]
  selectedKey: string
  onChange: (key: string) => void
  label: string
  testId: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-[var(--ink-3)] uppercase tracking-wide">{label}</label>
      <div className="relative">
        <select
          value={selectedKey}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 pr-8 text-sm font-medium text-zinc-800 focus:border-kern-400 focus:outline-none focus:ring-2 focus:ring-kern-100"
          data-testid={testId}
        >
          {monthKeys.map(key => (
            <option key={key} value={key}>
              {formatMonthLabel(key)}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-3)]" />
      </div>
    </div>
  )
}

/* ─── main component ─── */

interface SnapshotComparisonViewProps {
  snapshots: NetWorthSnapshot[]
}

export function SnapshotComparisonView({ snapshots }: SnapshotComparisonViewProps) {
  const { masked } = useMaskedAmounts()
  const monthMap = useMemo(() => groupByMonth(snapshots), [snapshots])
  const monthKeys = useMemo(
    () => Array.from(monthMap.keys()).sort(),
    [monthMap]
  )

  // Default: compare second-to-last vs last month
  const [monthA, setMonthA] = useState(() =>
    monthKeys.length >= 2 ? monthKeys[monthKeys.length - 2] : monthKeys[0] ?? ''
  )
  const [monthB, setMonthB] = useState(() =>
    monthKeys.length >= 1 ? monthKeys[monthKeys.length - 1] : ''
  )

  if (monthKeys.length < 2) {
    return (
      <div className="rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)] p-6 text-center">
        <p className="text-sm text-[var(--ink-3)]">
          Vergelijking is beschikbaar zodra er minstens 2 maandelijkse snapshots zijn.
        </p>
      </div>
    )
  }

  const snapshotA = monthMap.get(monthA)
  const snapshotB = monthMap.get(monthB)

  if (!snapshotA || !snapshotB) {
    return (
      <div className="rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)] p-6 text-center">
        <p className="text-sm text-[var(--ink-3)]">Selecteer twee maanden om te vergelijken.</p>
      </div>
    )
  }

  // Count improvements vs regressions
  let improvements = 0
  let regressions = 0
  for (const metric of metrics) {
    const a = metric.getValue(snapshotA)
    const b = metric.getValue(snapshotB)
    if (a !== null && b !== null) {
      const delta = b - a
      if (delta !== 0) {
        const isImprovement = metric.invertColor ? delta < 0 : delta > 0
        if (isImprovement) improvements++
        else regressions++
      }
    }
  }

  return (
    <div data-testid="snapshot-comparison-view">
      {/* Month selectors */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <MonthSelector
          monthKeys={monthKeys}
          selectedKey={monthA}
          onChange={setMonthA}
          label="Maand A (eerder)"
          testId="snapshot-month-a"
        />
        <MonthSelector
          monthKeys={monthKeys}
          selectedKey={monthB}
          onChange={setMonthB}
          label="Maand B (later)"
          testId="snapshot-month-b"
        />
      </div>

      {/* Same month warning */}
      {monthA === monthB && (
        <div className="mb-4 rounded-lg border border-kern-200 bg-kern-50 p-3 text-center">
          <p className="text-sm text-kern-700">
            Je vergelijkt dezelfde maand. Kies twee verschillende maanden voor een zinvolle vergelijking.
          </p>
        </div>
      )}

      {/* Summary banner */}
      {monthA !== monthB && (
        <div className="mb-5 flex items-center justify-between rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)] px-4 py-3" data-testid="comparison-summary">
          <div className="flex items-center gap-4">
            {improvements > 0 && (
              <span className="flex items-center gap-1 text-sm font-semibold text-positive">
                <TrendingUp className="h-4 w-4" />
                {improvements} verbetering{improvements !== 1 ? 'en' : ''}
              </span>
            )}
            {regressions > 0 && (
              <span className="flex items-center gap-1 text-sm font-semibold text-negative">
                <TrendingDown className="h-4 w-4" />
                {regressions} achteruitgang{regressions !== 1 ? '' : ''}
              </span>
            )}
            {improvements === 0 && regressions === 0 && (
              <span className="flex items-center gap-1 text-sm font-medium text-[var(--ink-3)]">
                <Minus className="h-4 w-4" />
                Geen veranderingen
              </span>
            )}
          </div>
          <span className="text-xs text-[var(--ink-3)]">
            {formatMonthLabel(monthA)} → {formatMonthLabel(monthB)}
          </span>
        </div>
      )}

      {/* Metric headers */}
      <div className="mb-2 grid grid-cols-[1fr_auto_1fr_auto] items-center gap-3 px-4">
        <p className="text-center text-xs font-semibold text-[var(--ink-3)] uppercase tracking-wide">
          {formatMonthLabel(monthA)}
        </p>
        <div className="w-4" />
        <p className="text-center text-xs font-semibold text-[var(--ink-3)] uppercase tracking-wide">
          {formatMonthLabel(monthB)}
        </p>
        <p className="text-center text-xs font-semibold text-[var(--ink-3)] uppercase tracking-wide min-w-[80px]">
          Delta
        </p>
      </div>

      {/* Metric rows */}
      <div className="space-y-2">
        {metrics.map(metric => {
          // Check if metric has data in either snapshot
          const a = metric.getValue(snapshotA)
          const b = metric.getValue(snapshotB)
          if (a === null && b === null) return null

          return (
            <div key={metric.key}>
              <p className="mb-1 pl-1 text-xs font-medium text-[var(--ink-3)]">
                {metric.label}
              </p>
              <MetricRow
                metric={metric}
                snapshotA={snapshotA}
                snapshotB={snapshotB}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
