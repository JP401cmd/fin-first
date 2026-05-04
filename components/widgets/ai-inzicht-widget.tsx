'use client'

import { memo } from 'react'
import { WidgetShell } from './widget-shell'
import { WidgetEmpty } from './widget-empty'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData } from './widget-renderer'
import { Lightbulb, Sparkles } from 'lucide-react'
import { AiPrivacyIndicator } from '@/components/app/ai-privacy-indicator'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

const MODULE_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  kern:    { bg: 'bg-[var(--subtle)]', text: 'text-kern-600',    dot: 'bg-kern-500' },
  wil:     { bg: 'bg-[var(--subtle)]', text: 'text-wil-600',     dot: 'bg-wil-500' },
  horizon: { bg: 'bg-[var(--subtle)]', text: 'text-horizon-600', dot: 'bg-horizon-500' },
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

export const AiInzichtWidget = memo(function AiInzichtWidget({ size, data, href }: Props) {
  const { aiInsights } = data

  if (aiInsights.length === 0) {
    return (
      <WidgetShell module="cross" size={size} kicker="AI Inzicht" href={href}>
        <WidgetEmpty icon={Sparkles} message="Gebruik de app om inzichten te genereren" />
      </WidgetShell>
    )
  }

  const latest = aiInsights[0]
  const colors = MODULE_COLORS[latest.module] ?? { bg: 'bg-[var(--subtle)]', text: 'text-[var(--ink-3)]', dot: 'bg-[var(--border-md)]' }

  // ── Mini: 'Nieuw' badge or latest insight module ──
  if (size === 'mini') {
    return (
      <WidgetShell module="cross" size="mini" kicker="AI Inzicht" href={href}>
        <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${colors.bg} ${colors.text}`}>
          Nieuw inzicht
        </span>
      </WidgetShell>
    )
  }

  // Quarter: lightbulb icon + 1-line tip (truncated) + module-color dot
  if (size === 'quarter') {
    return (
      <WidgetShell module="cross" size={size} kicker="AI Inzicht" href={href}>
        <div className="flex items-start gap-2">
          <div className="shrink-0 mt-0.5 flex items-center gap-1">
            <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
            <AiPrivacyIndicator size={11} />
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

  // ── Half: compact for 1-row 160px height ──
  if (size === 'half') {
    return (
      <WidgetShell module="cross" size={size} kicker="AI Inzicht" href={href}>
        <div className="space-y-1.5">
          <div className="flex items-start gap-2">
            <div className="shrink-0 mt-0.5 flex items-center gap-1">
              <Lightbulb className="h-4 w-4 text-amber-500" />
              <AiPrivacyIndicator size={12} />
            </div>
            <p className="text-sm text-[var(--ink-2)] leading-relaxed line-clamp-3">
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

  // Full: latest insight prominently + action suggestion + remaining count
  const remainingCount = aiInsights.length - 1
  const moduleHref = MODULE_HREFS[latest.module]
  const actionLabel = latest.module === 'kern'
    ? 'financiële basis'
    : latest.module === 'wil'
      ? 'acties en doelen'
      : 'toekomstplan'

  return (
    <WidgetShell module="cross" size={size} kicker="AI Inzicht" href={href}>
      <div className="flex flex-col h-full">
        <div className="flex justify-end -mt-1 -mb-1">
          <AiPrivacyIndicator size={13} />
        </div>

        {/* Latest insight — prominent card */}
        <div className={`rounded-lg p-3.5 ${colors.bg} space-y-2.5 mt-1`}>
          <div className="flex items-start gap-2">
            <Lightbulb className={`h-4 w-4 shrink-0 mt-0.5 ${colors.text}`} />
            <p className="text-sm text-[var(--ink-2)] leading-relaxed">
              {latest.text}
            </p>
          </div>
          <div className="flex items-center justify-between">
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${colors.text} bg-[var(--paper)]`}>
              {latest.module}
            </span>
            <span className="text-[10px] text-[var(--ink-4)]">
              {formatDate(latest.createdAt)}
            </span>
          </div>
        </div>

        {/* Action suggestion */}
        {moduleHref && (
          <p className={`mt-2.5 text-[11px] font-medium ${colors.text}`}>
            Bekijk je {actionLabel} &rarr;
          </p>
        )}

        {/* Remaining insights count */}
        {remainingCount > 0 && (
          <p className="mt-auto pt-2 text-[11px] text-[var(--ink-4)] font-mono tabular-nums">
            Nog {remainingCount} {remainingCount === 1 ? 'inzicht' : 'inzichten'}
          </p>
        )}
      </div>
    </WidgetShell>
  )
})
