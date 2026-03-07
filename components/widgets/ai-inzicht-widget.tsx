import { WidgetShell } from './widget-shell'
import { WidgetEmpty } from './widget-empty'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData } from './widget-renderer'
import { Sparkles } from 'lucide-react'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

const MODULE_COLORS: Record<string, string> = {
  kern: 'bg-amber-100 text-amber-700',
  wil: 'bg-teal-100 text-teal-700',
  horizon: 'bg-purple-100 text-purple-700',
}

export function AiInzichtWidget({ size, data, href }: Props) {
  const { aiInsights } = data

  if (aiInsights.length === 0) {
    return (
      <WidgetShell module="cross" size={size} kicker="AI Inzicht" href={href}>
        <WidgetEmpty icon={Sparkles} message="Voeg financiele gegevens toe voor AI-inzichten." />
      </WidgetShell>
    )
  }

  const latest = aiInsights[0]

  if (size === 'quarter') {
    return (
      <WidgetShell module="cross" size={size} kicker="AI Inzicht" href={href}>
        <p className="text-sm text-[var(--ink-2)] line-clamp-3 leading-relaxed">
          {latest.text}
        </p>
      </WidgetShell>
    )
  }

  const shown = size === 'half' ? aiInsights.slice(0, 2) : aiInsights.slice(0, 4)

  return (
    <WidgetShell module="cross" size={size} kicker="AI Inzicht" href={href}>
      <ul className="space-y-3">
        {shown.map(insight => (
          <li key={insight.id} className="flex items-start gap-2">
            <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${MODULE_COLORS[insight.module] ?? 'bg-gray-100 text-gray-600'}`}>
              {insight.module}
            </span>
            <p className="text-sm text-[var(--ink-2)] leading-relaxed line-clamp-2">
              {insight.text}
            </p>
          </li>
        ))}
      </ul>
    </WidgetShell>
  )
}
