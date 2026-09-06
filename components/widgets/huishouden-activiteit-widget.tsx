'use client'

import { memo } from 'react'
import { WidgetShell } from './widget-shell'
import { WidgetEmpty } from './widget-empty'
import type { WidgetSize } from '@/lib/widget-catalog'
import { MaskedAmount } from '@/components/app/masked-amount'
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
              <span className="text-[var(--ink-2)] shrink-0">
                <MaskedAmount value={item.amount} tone="kern" className="text-[11px]" />
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
                {/* Persoon-indicator: stabiel, niet-accent onderscheid (solid = jij,
                    outline = partner). Bewust GEEN module-accenttokens (kern/wil): die
                    signaleren module-identiteit en schuiven mee bij herkleuren op
                    de uiterlijk-pagina, waardoor zelf/partner konden samenvallen. Eigenaarschap
                    wordt ook toegankelijk gemaakt via aria-label (kleur+initiaal alleen is
                    niet genoeg). */}
                <span
                  className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold shrink-0 ${
                    item.isCurrentUser
                      ? 'bg-[var(--ink)] text-[var(--paper)]'
                      : 'border border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-2)]'
                  }`}
                  aria-label={item.isCurrentUser ? 'Van jou' : `Van ${item.partnerName}`}
                >
                  <span aria-hidden="true">{item.partnerName.charAt(0).toUpperCase()}</span>
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
                {/* Geen losse 'gedeeld'-tag meer: de feed is nu volledig shared-only,
                    dus per rij zou het redundante ruis zijn (en het gebruikte een
                    module-accenttoken voor niet-module-semantiek). */}
              </div>
            </div>
            <span className={`shrink-0 ${
              item.amount < 0 ? 'text-[var(--ink)]' : 'text-positive'
            }`}>
              <MaskedAmount value={item.amount} tone="kern" className="text-sm" />
            </span>
          </div>
        ))}
      </div>
      {hasMore && (
        <Link
          href="/overzicht/budget/transacties"
          className="mt-2 flex items-center justify-center gap-1 text-xs text-kern-600 hover:text-kern-700 font-medium"
        >
          Meer bekijken <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </WidgetShell>
  )
})
