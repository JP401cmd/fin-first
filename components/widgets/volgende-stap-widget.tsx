import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData, NextStep } from './widget-renderer'
import { ArrowRight, CheckCircle2 } from 'lucide-react'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

function StepCard({ step }: { step: NextStep }) {
  return (
    <div className="rounded-[var(--r)] border border-[var(--border-ed)] p-2.5 group/step">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-[var(--ink)] line-clamp-1">
          {step.title}
        </p>
        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[var(--ink-4)] mt-0.5" />
      </div>
      <p className="mt-0.5 text-xs text-[var(--ink-3)] line-clamp-1">{step.description}</p>
      {step.impact != null && step.impact > 0 && (
        <p className="mt-1 font-serif italic text-[11px] text-emerald-600">
          +{step.impact} vrijheidsdagen
        </p>
      )}
    </div>
  )
}

export function VolgendeStapWidget({ size, data, href }: Props) {
  const { nextSteps } = data
  const active = nextSteps.filter(s => !s.dismissed)

  // ── Empty state ──────────────────────────────────────────────
  if (active.length === 0) {
    return (
      <WidgetShell module="wil" size={size} kicker="Volgende Stap" href={href}>
        <div className="flex flex-col items-center justify-center gap-2 py-4">
          <CheckCircle2 className="h-5 w-5 text-emerald-500" strokeWidth={1.5} />
          <p className="font-serif italic text-[13px] text-[var(--ink-3)] text-center leading-relaxed">
            Alles op orde — geen openstaande stappen
          </p>
        </div>
      </WidgetShell>
    )
  }

  const first = active[0]

  // ── Mini-size: short action label ──
  if (size === 'mini') {
    return (
      <WidgetShell module="wil" size="mini" kicker="Volgende Stap" href={href}>
        <p className="font-mono text-[15px] font-semibold tabular-nums text-[var(--ink)] leading-none truncate">
          {first.title}
        </p>
      </WidgetShell>
    )
  }

  // ── Quarter-size: icon + 1-line action text ──────────────────
  if (size === 'quarter') {
    return (
      <WidgetShell module="wil" size={size} kicker="Volgende Stap" href={href}>
        <div className="flex items-center gap-2">
          <ArrowRight className="h-4 w-4 text-wil-500 shrink-0" />
          <p className="text-sm font-medium text-[var(--ink)] line-clamp-1 flex-1">{first.title}</p>
        </div>
        {first.impact != null && first.impact > 0 && (
          <p className="mt-1 font-serif italic text-[11px] text-[var(--ink-3)]">+{first.impact}d vrijheid</p>
        )}
        {active.length > 1 && (
          <p className="mt-0.5 text-[10px] text-[var(--ink-4)]">
            +{active.length - 1} meer
          </p>
        )}
      </WidgetShell>
    )
  }

  // ── Half-size: compact for 1-row 160px height ──
  if (size === 'half') {
    const shown = active.slice(0, 2)

    return (
      <WidgetShell module="wil" size={size} kicker="Volgende Stap" href={href}>
        <ul className="space-y-1">
          {shown.map(step => (
            <li key={step.key} className="flex items-center gap-2 py-0.5">
              <ArrowRight className="h-3.5 w-3.5 text-wil-500 shrink-0" />
              <span className="flex-1 min-w-0 text-sm font-medium text-[var(--ink)] truncate">
                {step.title}
              </span>
              {step.impact != null && step.impact > 0 && (
                <span className="shrink-0 font-mono text-xs tabular-nums text-wil-700 bg-wil-50 rounded-full px-2 py-px">
                  +{step.impact}d
                </span>
              )}
            </li>
          ))}
        </ul>
        {active.length > 2 && (
          <p className="mt-0.5 text-[11px] text-[var(--ink-4)]">
            +{active.length - 2} andere {active.length - 2 === 1 ? 'stap' : 'stappen'}
          </p>
        )}
      </WidgetShell>
    )
  }

  // ── Full-size: top-4 steps as cards (336px height) ──
  const topSteps = active.slice(0, 4)

  return (
    <WidgetShell module="wil" size={size} kicker="Volgende Stap" href={href}>
      <div className="space-y-2">
        {topSteps.map(step => (
          <StepCard key={step.key} step={step} />
        ))}
      </div>
      {active.length > topSteps.length && (
        <p className="mt-2 text-xs text-[var(--ink-4)] text-center">
          +{active.length - topSteps.length} andere {active.length - topSteps.length === 1 ? 'stap' : 'stappen'}
        </p>
      )}
    </WidgetShell>
  )
}
