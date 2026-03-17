'use client'

import { memo } from 'react'
import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData } from './widget-renderer'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

const MONTH_LABELS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']

function monthAbbr(monthStr: string): string {
  const idx = parseInt(monthStr.split('-')[1], 10) - 1
  return MONTH_LABELS[idx] ?? monthStr.slice(5)
}

function isCurrentMonth(monthStr: string): boolean {
  const now = new Date()
  const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  return monthStr === current
}

function BarChart({
  months,
  compact = false,
}: {
  months: { month: string; days: number }[]
  compact?: boolean
}) {
  const maxDays = Math.max(...months.map((m) => m.days), 1)
  const barHeight = compact ? 48 : 80

  return (
    <div className="flex items-end gap-[3px] w-full" style={{ height: barHeight }}>
      {months.map((m) => {
        const current = isCurrentMonth(m.month)
        const pct = m.days / maxDays
        const minPx = m.days > 0 ? 3 : 1

        return (
          <div key={m.month} className="flex flex-col items-center flex-1 min-w-0 h-full justify-end">
            {/* Bar */}
            <div
              className={`w-full rounded-t-sm transition-all ${
                current ? 'bg-wil-600' : 'bg-wil-300'
              }`}
              style={{ height: Math.max(pct * (barHeight - (compact ? 14 : 18)), minPx) }}
            />
            {/* Month label */}
            {!compact && (
              <span
                className={`text-[9px] mt-1 leading-none ${
                  current ? 'font-semibold text-wil-700' : 'text-[var(--ink-4)]'
                }`}
              >
                {monthAbbr(m.month)}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

export const VrijheidsdagenMaandWidget = memo(function VrijheidsdagenMaandWidget({ size, data, href }: Props) {
  const months = data.freedomDaysMonthly ?? []

  // Find current month value
  const now = new Date()
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const currentEntry = months.find((m) => m.month === currentMonthKey)
  const currentDays = currentEntry ? Math.round(currentEntry.days) : 0

  // ── Empty state ──────────────────────────────────────────────
  if (months.length === 0) {
    return (
      <WidgetShell module="wil" size={size} kicker="Vrijheidsdagen/maand" href={href}>
        <div className="flex flex-col items-center justify-center h-full text-center">
          <p className="text-sm text-[var(--ink-3)]">Geen maanddata beschikbaar</p>
          <p className="font-serif italic text-[11px] text-[var(--ink-4)] mt-1">
            Data verschijnt na de eerste maand
          </p>
        </div>
      </WidgetShell>
    )
  }

  // ── Mini size ───────────────────────────────────────────────
  if (size === 'mini') {
    return (
      <WidgetShell module="wil" size="mini" kicker="Vrijheidsdagen/maand" href={href}>
        <p className="font-mono text-[15px] font-semibold tabular-nums text-[var(--ink)] leading-none truncate">
          {currentDays}d
        </p>
      </WidgetShell>
    )
  }

  // ── Quarter size: current month value only ───────────────────
  if (size === 'quarter') {
    return (
      <WidgetShell module="wil" size={size} kicker="Vrijheidsdagen/maand" href={href}>
        <p className="font-mono text-lg font-semibold tabular-nums text-[var(--ink)]">
          {currentDays}
          <span className="text-xs font-normal text-[var(--ink-3)]"> dagen</span>
        </p>
        <p className="mt-1 text-[11px] text-[var(--ink-4)]">deze maand</p>
        {months.length >= 3 && (
          <div className="mt-2">
            <BarChart months={months.slice(-6)} compact />
          </div>
        )}
      </WidgetShell>
    )
  }

  // ── Half size: headline + compact bar chart ──────────────────
  if (size === 'half') {
    return (
      <WidgetShell module="wil" size={size} kicker="Vrijheidsdagen/maand" href={href}>
        <div className="flex items-center gap-3 mb-2">
          <span className="font-mono text-lg font-semibold tabular-nums text-[var(--ink)]">
            {currentDays}
          </span>
          <span className="text-xs text-[var(--ink-3)]">dagen deze maand</span>
        </div>
        <BarChart months={months.slice(-8)} compact />
      </WidgetShell>
    )
  }

  // ── Full size: headline + full 12-month chart ────────────────
  const displayMonths = months.slice(-12)
  const totalYear = displayMonths.reduce((sum, m) => sum + m.days, 0)

  return (
    <WidgetShell module="wil" size={size} kicker="Vrijheidsdagen/maand" href={href}>
      {/* Summary row */}
      <div className="flex items-baseline gap-4 mb-3">
        <div>
          <span className="font-mono text-2xl font-semibold tabular-nums text-[var(--ink)]">
            {currentDays}
          </span>
          <span className="text-xs text-[var(--ink-3)] ml-1.5">dagen deze maand</span>
        </div>
        <div className="ml-auto text-right">
          <span className="font-mono text-sm tabular-nums text-[var(--ink-2)]">
            {Math.round(totalYear)}
          </span>
          <span className="text-[11px] text-[var(--ink-4)] ml-1">totaal afgelopen jaar</span>
        </div>
      </div>

      {/* Bar chart */}
      <BarChart months={displayMonths} />

      {/* Month labels for full view */}
      <div className="flex gap-[3px] w-full mt-0.5">
        {displayMonths.map((m) => {
          const current = isCurrentMonth(m.month)
          return (
            <div key={m.month} className="flex-1 min-w-0 text-center">
              <span
                className={`text-[9px] leading-none ${
                  current ? 'font-semibold text-wil-700' : 'text-[var(--ink-4)]'
                }`}
              >
                {monthAbbr(m.month)}
              </span>
            </div>
          )
        })}
      </div>

      {/* Trend footnote */}
      {displayMonths.length >= 2 && (
        <p className="mt-3 font-serif italic text-[11px] text-[var(--ink-3)]">
          {(() => {
            const recent = displayMonths.slice(-3)
            const older = displayMonths.slice(-6, -3)
            if (older.length === 0) return null
            const avgRecent = recent.reduce((s, m) => s + m.days, 0) / recent.length
            const avgOlder = older.reduce((s, m) => s + m.days, 0) / older.length
            if (avgRecent > avgOlder * 1.1) return 'Stijgende trend — je wint meer vrijheid per maand'
            if (avgRecent < avgOlder * 0.9) return 'Dalende trend — minder vrijheidsdagen recent'
            return 'Stabiel patroon de afgelopen maanden'
          })()}
        </p>
      )}
    </WidgetShell>
  )
})
