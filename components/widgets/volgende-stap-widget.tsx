import { WidgetShell } from './widget-shell'
import { WidgetEmpty } from './widget-empty'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData } from './widget-renderer'
import { ArrowRight } from 'lucide-react'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

export function VolgendeStapWidget({ size, data, href }: Props) {
  const { nextSteps } = data
  const active = nextSteps.filter(s => !s.dismissed)

  if (active.length === 0) {
    return (
      <WidgetShell module="wil" size={size} kicker="Volgende Stap" href={href}>
        <WidgetEmpty icon={ArrowRight} message="Je bent helemaal bij — geen openstaande stappen." />
      </WidgetShell>
    )
  }

  const first = active[0]

  if (size === 'quarter') {
    return (
      <WidgetShell module="wil" size={size} kicker="Volgende Stap" href={href}>
        <p className="text-sm font-medium text-[var(--ink)] line-clamp-2">{first.title}</p>
        {first.impact != null && first.impact > 0 && (
          <p className="mt-1 text-xs text-emerald-600 font-medium">+{first.impact}d vrijheid</p>
        )}
      </WidgetShell>
    )
  }

  const shown = size === 'half' ? active.slice(0, 2) : active.slice(0, 4)

  return (
    <WidgetShell module="wil" size={size} kicker="Volgende Stap" href={href}>
      <ul className="space-y-3">
        {shown.map(step => (
          <li key={step.key}>
            <p className="text-sm font-medium text-[var(--ink)]">{step.title}</p>
            <p className="mt-0.5 text-xs text-[var(--ink-3)] line-clamp-1">{step.description}</p>
            {step.impact != null && step.impact > 0 && (
              <p className="mt-0.5 font-serif italic text-[12px] text-emerald-600">
                +{step.impact} vrijheidsdagen
              </p>
            )}
          </li>
        ))}
      </ul>
    </WidgetShell>
  )
}
