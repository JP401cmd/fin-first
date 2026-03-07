'use client'

import { WidgetShell } from './widget-shell'
import { WidgetEmpty } from './widget-empty'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData } from './widget-renderer'
import { Flame } from 'lucide-react'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

const STREAK_LABELS: Record<string, string> = {
  login: 'Login',
  budget: 'Budget',
  action: 'Actie',
}

const STREAK_DESCRIPTIONS: Record<string, string> = {
  login: 'Dagelijks inloggen',
  budget: 'Budget op schema',
  action: 'Acties afgerond',
}

/** Scale fire emojis based on streak length */
function fireEmoji(count: number): string {
  if (count >= 52) return '\u{1F525}\u{1F525}\u{1F525}\u{1F525}'
  if (count >= 26) return '\u{1F525}\u{1F525}\u{1F525}'
  if (count >= 12) return '\u{1F525}\u{1F525}'
  if (count >= 1) return '\u{1F525}'
  return ''
}

const MILESTONES = [
  { weeks: 4, label: '1 maand', icon: '\u{1F31F}' },
  { weeks: 12, label: '3 maanden', icon: '\u{1F3C5}' },
  { weeks: 26, label: 'Half jaar', icon: '\u{1F3C6}' },
  { weeks: 52, label: '1 jaar', icon: '\u{1F451}' },
]

export function StreaksWidget({ size, data, href }: Props) {
  const { ref, hasEntered } = useInViewAnimation({ duration: 600 })
  const { streaks } = data
  const bestStreak = streaks.length > 0
    ? streaks.reduce((a, b) => a.currentCount >= b.currentCount ? a : b)
    : null

  if (!bestStreak || streaks.every(s => s.currentCount === 0)) {
    return (
      <WidgetShell module="cross" size={size} kicker="Streaks" href={href}>
        <WidgetEmpty icon={Flame} message="Start je eerste streak!" />
      </WidgetShell>
    )
  }

  // Quarter: fire emoji + longest active streak + type label
  if (size === 'quarter') {
    return (
      <WidgetShell module="cross" size={size} kicker="Streaks" href={href}>
        <div className="flex items-center gap-1.5">
          <span className="text-base leading-none">{fireEmoji(bestStreak.currentCount)}</span>
          <p className="font-mono text-lg font-semibold tabular-nums text-[var(--ink)]">
            {bestStreak.currentCount}<span className="text-xs text-[var(--ink-3)]"> wk</span>
          </p>
        </div>
        <p className="mt-1 text-[10px] text-[var(--ink-3)]">{STREAK_LABELS[bestStreak.type] ?? bestStreak.type} streak</p>
      </WidgetShell>
    )
  }

  // Half: 3 streak-meters side by side
  if (size === 'half') {
    return (
      <WidgetShell module="cross" size={size} kicker="Streaks" href={href}>
        <div ref={ref} className="grid grid-cols-3 gap-3">
          {streaks.map(s => {
            const pct = s.longestCount > 0 ? Math.min(s.currentCount / s.longestCount, 1) : 0
            return (
              <div key={s.type} className="flex flex-col items-center text-center gap-1">
                <span className="text-sm leading-none">{fireEmoji(s.currentCount) || '\u{1F6AB}'}</span>
                <p className="font-mono text-lg font-semibold tabular-nums text-[var(--ink)] leading-tight">
                  {s.currentCount}
                </p>
                <p className="text-[10px] text-[var(--ink-3)]">{STREAK_LABELS[s.type] ?? s.type}</p>
                {/* Mini bar */}
                <div className="w-full h-1 rounded-full bg-[var(--subtle)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-amber-500 transition-all duration-500"
                    style={{ width: hasEntered ? `${pct * 100}%` : '0%' }}
                  />
                </div>
                <p className="text-[9px] text-[var(--ink-4)] font-mono tabular-nums">
                  record: {s.longestCount}
                </p>
              </div>
            )
          })}
        </div>
      </WidgetShell>
    )
  }

  // Full: 3 streaks expanded + milestones + records
  const overallLongest = streaks.reduce((a, b) => a.longestCount >= b.longestCount ? a : b)

  return (
    <WidgetShell module="cross" size={size} kicker="Streaks" href={href}>
      <div ref={ref} className="space-y-4">
        {/* 3 streak rows */}
        <div className="space-y-3">
          {streaks.map(s => {
            const pct = s.longestCount > 0 ? Math.min(s.currentCount / s.longestCount, 1) : 0
            return (
              <div key={s.type} className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm leading-none">{fireEmoji(s.currentCount) || '\u{26AA}'}</span>
                    <div>
                      <p className="text-xs font-medium text-[var(--ink)]">{STREAK_LABELS[s.type] ?? s.type}</p>
                      <p className="text-[10px] text-[var(--ink-4)]">{STREAK_DESCRIPTIONS[s.type] ?? ''}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-sm font-semibold tabular-nums text-[var(--ink)]">
                      {s.currentCount}<span className="text-[10px] text-[var(--ink-3)]"> wk</span>
                    </p>
                    <p className="text-[9px] text-[var(--ink-4)] font-mono tabular-nums">
                      record: {s.longestCount} wk
                    </p>
                  </div>
                </div>
                {/* Progress bar toward record */}
                <div className="h-1.5 rounded-full bg-[var(--subtle)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-amber-500 transition-all duration-500"
                    style={{ width: hasEntered ? `${pct * 100}%` : '0%' }}
                  />
                </div>
              </div>
            )
          })}
        </div>

        {/* Milestone badges */}
        <div className="border-t border-[var(--border-ed)] pt-3">
          <p className="text-[10px] text-[var(--ink-3)] uppercase tracking-wide mb-2">Streak Milestones</p>
          <div className="grid grid-cols-4 gap-2">
            {MILESTONES.map(m => {
              const reached = overallLongest.longestCount >= m.weeks
              return (
                <div
                  key={m.weeks}
                  className={`flex flex-col items-center text-center rounded-lg py-1.5 px-1 ${
                    reached
                      ? 'bg-amber-50 dark:bg-amber-950/30'
                      : 'bg-[var(--subtle)] opacity-50'
                  }`}
                >
                  <span className="text-base leading-none">{reached ? m.icon : '\u{1F512}'}</span>
                  <p className={`text-[10px] mt-1 font-medium ${reached ? 'text-amber-700 dark:text-amber-400' : 'text-[var(--ink-4)]'}`}>
                    {m.label}
                  </p>
                  <p className="text-[9px] text-[var(--ink-4)] font-mono tabular-nums">{m.weeks} wk</p>
                </div>
              )
            })}
          </div>
        </div>

        {/* Longest streak record */}
        <div className="flex items-center justify-between border-t border-[var(--border-ed)] pt-2">
          <p className="text-[10px] text-[var(--ink-3)]">Langste streak ooit</p>
          <p className="font-mono text-xs font-semibold tabular-nums text-amber-600 dark:text-amber-400">
            {overallLongest.longestCount} wk ({STREAK_LABELS[overallLongest.type] ?? overallLongest.type})
          </p>
        </div>
      </div>
    </WidgetShell>
  )
}
