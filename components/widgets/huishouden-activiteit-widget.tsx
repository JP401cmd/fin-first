'use client'

import { memo } from 'react'
import { WidgetShell } from './widget-shell'
import { WidgetEmpty } from './widget-empty'
import type { WidgetSize } from '@/lib/widget-catalog'
import { formatCurrency } from '@/lib/format'
import type { DashboardData } from './widget-renderer'
import { Users, ArrowRight } from 'lucide-react'
import { usePerspective } from '@/components/app/perspective-provider'
import Link from 'next/link'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
}

export const HuishoudenActiviteitWidget = memo(function HuishoudenActiviteitWidget({ size, data, href }: Props) {
  const { perspective, isHousehold } = usePerspective()

  const items = data.householdActivity ?? []

  // Solo users: hide widget completely (no empty state)
  if (!isHousehold) return null

  // Household user but not in household perspective or no data.
  // Two sub-states, both mapping to `variant="no-results"` per the design
  // bible — the active perspective acts as an effective filter, so the
  // absence of data is a filter-driven empty, not a first-use moment.
  if (perspective !== 'household' || items.length === 0) {
    const isPerspectiveMismatch = perspective !== 'household'
    return (
      <WidgetShell module="kern" size={size} kicker="Huishouden Activiteit" href={href}>
        <WidgetEmpty
          variant="no-results"
          icon={Users}
          description={isPerspectiveMismatch
            ? 'Schakel naar het huishouden-perspectief om activiteit te zien.'
            : 'Nog geen gedeelde transacties in dit perspectief.'}
        />
      </WidgetShell>
    )
  }

  // ── Mini size ───────────────────────────────────────────────
  if (size === 'mini') {
    return (
      <WidgetShell module="kern" size="mini" kicker="Huishouden Activiteit" href={href}>
        <p className="font-mono text-[15px] font-semibold tabular-nums text-[var(--ink)] leading-none truncate">
          {items.length} {items.length === 1 ? 'item' : 'items'}
        </p>
      </WidgetShell>
    )
  }

  // ── Quarter size ────────────────────────────────────────────
  if (size === 'quarter') {
    const preview = items.slice(0, 2)
    return (
      <WidgetShell module="kern" size={size} kicker="Huishouden Activiteit" href={href}>
        <p className="font-mono text-lg font-semibold tabular-nums text-[var(--ink)]">
          {items.length} {items.length === 1 ? 'item' : 'items'}
        </p>
        <div className="mt-1 space-y-1">
          {preview.map(item => (
            <div key={item.id} className="flex items-center justify-between gap-1">
              <span className="text-[11px] text-[var(--ink-3)] truncate">{item.description || 'Transactie'}</span>
              <span className="font-mono text-[11px] tabular-nums text-[var(--ink-2)] shrink-0">
                {formatCurrency(item.amount)}
              </span>
            </div>
          ))}
        </div>
      </WidgetShell>
    )
  }

  const maxItems = size === 'full' ? 15 : 10
  const displayed = items.slice(0, maxItems)
  const hasMore = items.length > maxItems

  return (
    <WidgetShell module="kern" size={size} kicker="Recente huishouden-activiteit" href={href}>
      <div className="space-y-1">
        {displayed.map(item => (
          <div
            key={item.id}
            className="flex items-center justify-between gap-2 py-1.5 border-b border-[var(--border-ed)] last:border-b-0"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                {/* Partner indicator */}
                <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold shrink-0 ${
                  item.isCurrentUser
                    ? 'bg-kern-100 text-kern-700'
                    : 'bg-wil-100 text-wil-700'
                }`}>
                  {item.partnerName.charAt(0).toUpperCase()}
                </span>
                <span className="text-sm text-[var(--ink)] truncate">
                  {item.description || 'Transactie'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5 pl-6">
                <span className="text-[10px] text-[var(--ink-4)]">{formatDateShort(item.date)}</span>
                {item.category && (
                  <>
                    <span className="text-[10px] text-[var(--ink-4)]">&middot;</span>
                    <span className="text-[10px] text-[var(--ink-3)]">{item.category}</span>
                  </>
                )}
                {item.ownership === 'shared' && (
                  <>
                    <span className="text-[10px] text-[var(--ink-4)]">&middot;</span>
                    <span className="text-[10px] text-wil-600 font-medium">gedeeld</span>
                  </>
                )}
              </div>
            </div>
            <span className={`font-mono tabular-nums text-sm shrink-0 ${
              item.amount < 0 ? 'text-[var(--ink)]' : 'text-positive'
            }`}>
              {formatCurrency(item.amount)}
            </span>
          </div>
        ))}
      </div>
      {hasMore && (
        <Link
          href="/core/assets/cash"
          className="mt-2 flex items-center justify-center gap-1 text-xs text-kern-600 hover:text-kern-700 font-medium"
        >
          Meer bekijken <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </WidgetShell>
  )
})
