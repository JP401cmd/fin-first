import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData, NextStep } from './widget-renderer'
import { ArrowRight, CheckCircle2, ExternalLink } from 'lucide-react'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

function StepCard({ step }: { step: NextStep }) {
  return (
    <a
      href={step.href}
      className="block rounded-[var(--r)] border border-[var(--border-ed)] p-3 hover:border-wil-300 hover:bg-wil-50/30 transition-colors group"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-[var(--ink)] group-hover:text-wil-700 line-clamp-2">
          {step.title}
        </p>
        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-[var(--ink-4)] group-hover:text-wil-500 mt-0.5" />
      </div>
      <p className="mt-1 text-xs text-[var(--ink-3)] line-clamp-2">{step.description}</p>
      {step.impact != null && step.impact > 0 && (
        <p className="mt-1.5 font-serif italic text-[12px] text-emerald-600">
          +{step.impact} vrijheidsdagen
        </p>
      )}
    </a>
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

  // ── Quarter-size: icon + 1-line action text ──────────────────
  if (size === 'quarter') {
    return (
      <WidgetShell module="wil" size={size} kicker="Volgende Stap" href={href}>
        <div className="flex items-center gap-2">
          <ArrowRight className="h-4 w-4 text-wil-500 shrink-0" />
          <p className="text-sm font-medium text-[var(--ink)] line-clamp-1 flex-1">{first.title}</p>
        </div>
        {first.impact != null && first.impact > 0 && (
          <p className="mt-1 text-xs text-emerald-600 font-mono tabular-nums">+{first.impact}d vrijheid</p>
        )}
        {active.length > 1 && (
          <p className="mt-0.5 text-[10px] text-[var(--ink-4)]">
            +{active.length - 1} meer
          </p>
        )}
      </WidgetShell>
    )
  }

  // ── Half-size: 1-2 prioritized steps with description + impact + CTA link ──
  if (size === 'half') {
    const shown = active.slice(0, 2)

    return (
      <WidgetShell module="wil" size={size} kicker="Volgende Stap" href={href}>
        <ul className="space-y-3">
          {shown.map(step => (
            <li key={step.key} className="flex items-start gap-2">
              <ArrowRight className="h-3.5 w-3.5 text-wil-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <a href={step.href} className="text-sm font-medium text-[var(--ink)] hover:text-wil-700 transition-colors line-clamp-1">
                  {step.title}
                </a>
                <p className="mt-0.5 text-xs text-[var(--ink-3)] line-clamp-1">{step.description}</p>
                {step.impact != null && step.impact > 0 && (
                  <p className="mt-0.5 font-serif italic text-[12px] text-emerald-600">
                    +{step.impact} vrijheidsdagen
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
        {active.length > 2 && (
          <p className="mt-2 text-[11px] text-[var(--ink-4)]">
            +{active.length - 2} andere {active.length - 2 === 1 ? 'stap' : 'stappen'}
          </p>
        )}
      </WidgetShell>
    )
  }

  // ── Full-size: top-3 steps as cards with description + why + impact + link ──
  const topSteps = active.slice(0, 3)

  return (
    <WidgetShell module="wil" size={size} kicker="Volgende Stap" href={href}>
      <div className="space-y-2">
        {topSteps.map(step => (
          <StepCard key={step.key} step={step} />
        ))}
      </div>
      {active.length > 3 && (
        <p className="mt-3 text-xs text-[var(--ink-4)] text-center">
          +{active.length - 3} andere {active.length - 3 === 1 ? 'stap' : 'stappen'}
        </p>
      )}
    </WidgetShell>
  )
}
