import { memo } from 'react'
import { Sparkles } from 'lucide-react'
import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData } from './widget-renderer'

const WILLPOWER_LABELS: Record<string, string> = {
  A: 'uitstekend',
  B: 'sterk',
  C: 'groeiend',
  D: 'startend',
  E: 'begin je reis',
}

interface WilskrachtWidgetProps {
  size: WidgetSize
  data: DashboardData
  href?: string
}

export const WilskrachtWidget = memo(function WilskrachtWidget({ size, data, href }: WilskrachtWidgetProps) {
  const {
    willpowerScore,
    completionRatio,
    totalFreedomDaysWon,
    weeklyFreedomDaysWon,
    totalCompletedActions,
    totalActions,
  } = data

  const label = WILLPOWER_LABELS[willpowerScore] ?? ''

  // ── Mini-size: willpower score letter ────
  if (size === 'mini') {
    return (
      <WidgetShell module="wil" size="mini" kicker="Wilskracht" href={href}>
        <p className="font-mono text-[15px] font-semibold tabular-nums text-[var(--ink)] leading-none truncate">
          {willpowerScore} — {label}
        </p>
      </WidgetShell>
    )
  }

  if (size === 'quarter') {
    return (
      <WidgetShell module="wil" size={size} kicker="Wilskracht" href={href}>
        <div className="flex flex-col items-center justify-center h-full gap-1">
          <span className="font-display text-3xl font-bold text-[var(--ink)]">{willpowerScore}</span>
          <span className="text-[10px] text-[var(--ink-3)] font-serif italic">{label}</span>
          <div className="mt-1 h-1.5 w-full max-w-[80px] overflow-hidden rounded-full bg-wil-100">
            <div
              className="h-full rounded-full bg-wil-500 transition-all duration-700"
              style={{ width: `${Math.min(completionRatio, 100)}%` }}
            />
          </div>
        </div>
      </WidgetShell>
    )
  }

  if (size === 'half') {
    return (
      <WidgetShell module="wil" size={size} kicker="Wilskracht" href={href}>
        <div className="flex items-start gap-4">
          {/* Score */}
          <div className="flex flex-col items-center gap-0.5">
            <span className="font-display text-4xl font-bold text-[var(--ink)]">{willpowerScore}</span>
            <span className="text-[10px] text-[var(--ink-3)] font-serif italic">{label}</span>
          </div>
          {/* Stats */}
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-xl font-bold tabular-nums text-[var(--ink)]">
                +{totalFreedomDaysWon}
              </span>
              <span className="text-xs text-[var(--ink-3)]">vrijheidsdagen gewonnen</span>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <Sparkles className="h-3 w-3 text-wil-500 shrink-0" />
              <span className="text-xs text-wil-700">
                Deze week: +{weeklyFreedomDaysWon % 1 === 0 ? weeklyFreedomDaysWon : weeklyFreedomDaysWon.toFixed(1)}
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-wil-100">
              <div
                className="h-full rounded-full bg-wil-500 transition-all duration-700"
                style={{ width: `${Math.min(completionRatio, 100)}%` }}
              />
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-[var(--ink-4)]">
              <span>0%</span>
              <span className="font-mono tabular-nums">{completionRatio}% afgerond</span>
              <span>100%</span>
            </div>
          </div>
        </div>
      </WidgetShell>
    )
  }

  // Full size
  return (
    <WidgetShell module="wil" size={size} kicker="Wilskracht" href={href}>
      {/* Primary metric */}
      <div className="mb-2 flex items-baseline gap-2">
        <span className="font-display text-4xl font-bold text-[var(--ink)]">
          +{totalFreedomDaysWon}
        </span>
        <span className="text-sm text-[var(--ink-3)] font-serif italic">
          vrijheidsdagen gewonnen
        </span>
      </div>

      {/* Weekly badge */}
      <div className="mb-3 flex items-center gap-2">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-wil-50 px-2.5 py-1">
          <Sparkles className="h-3 w-3 text-wil-500" />
          <span className="text-xs font-medium text-wil-700">
            Deze week: +{weeklyFreedomDaysWon % 1 === 0 ? weeklyFreedomDaysWon : weeklyFreedomDaysWon.toFixed(1)}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-4">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-wil-100">
          <div
            className="h-full rounded-full bg-wil-500 transition-all duration-700"
            style={{ width: `${Math.min(completionRatio, 100)}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-[var(--ink-4)]">
          <span>0%</span>
          <span className="font-mono tabular-nums">{completionRatio}% afgerond</span>
          <span>100%</span>
        </div>
      </div>

      {/* Sub KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <p className="label-editorial text-[var(--ink-3)]">Acties voltooid</p>
          <p className="mt-0.5 font-mono text-lg font-bold tabular-nums text-[var(--ink)]">
            {totalCompletedActions}/{totalActions}
          </p>
        </div>
        <div>
          <p className="label-editorial text-[var(--ink-3)]">Wilskracht</p>
          <p className="mt-0.5 font-display text-lg font-bold text-[var(--ink)]">
            {willpowerScore}
          </p>
          <p className="text-[10px] text-[var(--ink-4)] font-serif italic">{label}</p>
        </div>
        <div>
          <p className="label-editorial text-[var(--ink-3)]">Open potentieel</p>
          <p className="mt-0.5 font-mono text-lg font-bold tabular-nums text-[var(--ink)]">
            +{data.totalFreedomDaysOpen}d
          </p>
        </div>
      </div>
    </WidgetShell>
  )
})
