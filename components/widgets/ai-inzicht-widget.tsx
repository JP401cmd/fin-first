'use client'

import { WidgetShell } from './widget-shell'
import { WidgetEmpty } from './widget-empty'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData } from './widget-renderer'
import { Lightbulb, Sparkles } from 'lucide-react'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

const MODULE_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  kern:    { bg: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-700 dark:text-amber-400', dot: 'bg-amber-500' },
  wil:     { bg: 'bg-teal-50 dark:bg-teal-950/30', text: 'text-teal-700 dark:text-teal-400', dot: 'bg-teal-500' },
  horizon: { bg: 'bg-purple-50 dark:bg-purple-950/30', text: 'text-purple-700 dark:text-purple-400', dot: 'bg-purple-500' },
}

const MODULE_HREFS: Record<string, string> = {
  kern: '/core',
  wil: '/will',
  horizon: '/horizon',
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
  } catch {
    return ''
  }
}

export function AiInzichtWidget({ size, data, href }: Props) {
  const { aiInsights } = data

  if (aiInsights.length === 0) {
    return (
      <WidgetShell module="cross" size={size} kicker="AI Inzicht" href={href}>
        <WidgetEmpty icon={Sparkles} message="Gebruik de app om inzichten te genereren" />
      </WidgetShell>
    )
  }

  const latest = aiInsights[0]
  const colors = MODULE_COLORS[latest.module] ?? { bg: 'bg-gray-50', text: 'text-gray-600', dot: 'bg-gray-400' }

  // Quarter: lightbulb icon + 1-line tip (truncated) + module-color dot
  if (size === 'quarter') {
    return (
      <WidgetShell module="cross" size={size} kicker="AI Inzicht" href={href}>
        <div className="flex items-start gap-2">
          <div className="shrink-0 mt-0.5">
            <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
          </div>
          <p className="text-xs text-[var(--ink-2)] line-clamp-2 leading-relaxed flex-1">
            {latest.text}
          </p>
        </div>
        <div className="flex items-center gap-1.5 mt-1.5">
          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${colors.dot}`} />
          <span className={`text-[9px] ${colors.text}`}>{latest.module}</span>
        </div>
      </WidgetShell>
    )
  }

  // Half: latest AI insight fully written + source module badge + date
  if (size === 'half') {
    return (
      <WidgetShell module="cross" size={size} kicker="AI Inzicht" href={href}>
        <div className="space-y-2.5">
          <div className="flex items-start gap-2">
            <Lightbulb className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-sm text-[var(--ink-2)] leading-relaxed">
              {latest.text}
            </p>
          </div>
          <div className="flex items-center justify-between">
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${colors.bg} ${colors.text}`}>
              {latest.module}
            </span>
            <span className="text-[10px] text-[var(--ink-4)]">
              {formatDate(latest.createdAt)}
            </span>
          </div>
        </div>
      </WidgetShell>
    )
  }

  // Full: 2-3 recent insights as cards + per insight: text + module badge + link
  const shown = aiInsights.slice(0, 3)

  return (
    <WidgetShell module="cross" size={size} kicker="AI Inzicht" href={href}>
      <div className="space-y-3">
        {shown.map(insight => {
          const ic = MODULE_COLORS[insight.module] ?? { bg: 'bg-gray-50', text: 'text-gray-600', dot: 'bg-gray-400' }
          const moduleHref = MODULE_HREFS[insight.module]
          return (
            <div
              key={insight.id}
              className={`rounded-lg p-3 ${ic.bg} space-y-2`}
            >
              <div className="flex items-start gap-2">
                <Lightbulb className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${ic.text}`} />
                <p className="text-sm text-[var(--ink-2)] leading-relaxed">
                  {insight.text}
                </p>
              </div>
              <div className="flex items-center justify-between">
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${ic.text} bg-white/60 dark:bg-black/20`}>
                  {insight.module}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[var(--ink-4)]">
                    {formatDate(insight.createdAt)}
                  </span>
                  {moduleHref && (
                    <a
                      href={moduleHref}
                      className={`text-[10px] font-medium ${ic.text} hover:underline`}
                      onClick={e => e.stopPropagation()}
                    >
                      Bekijk &rarr;
                    </a>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </WidgetShell>
  )
}
