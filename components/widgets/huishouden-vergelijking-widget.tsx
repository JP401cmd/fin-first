'use client'

import { memo } from 'react'
import { WidgetShell } from './widget-shell'
import { WidgetEmpty } from './widget-empty'
import type { WidgetSize } from '@/lib/widget-catalog'
import { calculateFreedomTime, formatFreedomTimeString, dailyExpenseRate } from '@/lib/format'
import { MaskedAmount } from '@/components/app/masked-amount'
import type { DashboardData } from './widget-renderer'
import { Users, User } from 'lucide-react'
import { usePerspective } from '@/components/app/perspective-provider'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

export const HuishoudenVergelijkingWidget = memo(function HuishoudenVergelijkingWidget({ size, data, href }: Props) {
  const { perspective, isHousehold, partnerName } = usePerspective()

  // Canoniek 12-mnd rolling dagtarief uit de bundel (KRUIS-20); fallback voor mocks.
  const dailyExp = data.dailyExpenseRate ?? dailyExpenseRate(data.monthlyExpenses)
  const ho = data.householdOverrides

  // Solo users: hide widget completely (no empty state)
  if (!isHousehold) return null

  // Household user but not in household perspective
  if (perspective !== 'household' || !ho) {
    return (
      <WidgetShell module="kern" size={size} kicker="Huishouden Vergelijking" href={href}>
        <WidgetEmpty
          icon={Users}
          message="Schakel naar het huishouden-perspectief om de vergelijking te zien."
        />
      </WidgetShell>
    )
  }

  // Compute per-partner values
  const myNetWorth = data.netWorth
  const partnerNetWorth = ho.netWorth - myNetWorth

  const myFreedom = dailyExp > 0 ? calculateFreedomTime(Math.abs(myNetWorth), dailyExp) : null
  const partnerFreedom = dailyExp > 0 ? calculateFreedomTime(Math.abs(partnerNetWorth), dailyExp) : null
  const combinedFreedom = dailyExp > 0 ? calculateFreedomTime(Math.abs(ho.netWorth), dailyExp) : null

  const myFreedomStr = myFreedom ? formatFreedomTimeString(myFreedom, 'short') : '—'
  const partnerFreedomStr = partnerFreedom ? formatFreedomTimeString(partnerFreedom, 'short') : '—'
  const combinedFreedomStr = combinedFreedom ? formatFreedomTimeString(combinedFreedom, 'short') : '—'

  // ── Mini size ───────────────────────────────────────────────
  if (size === 'mini') {
    return (
      <WidgetShell module="kern" size="mini" kicker="Huishouden Vergelijking" href={href}>
        <p className="text-[var(--ink)] leading-none truncate">
          <MaskedAmount value={ho.netWorth} tone="kern" className="text-[15px] font-semibold" />
        </p>
      </WidgetShell>
    )
  }

  // ── Quarter size: compact comparison with ratio bar ─────────
  if (size === 'quarter') {
    const totalAbs = Math.abs(myNetWorth) + Math.abs(partnerNetWorth)
    const myPct = totalAbs > 0 ? Math.round((Math.abs(myNetWorth) / totalAbs) * 100) : 50

    return (
      <WidgetShell module="kern" size={size} kicker="Huishouden" href={href}>
        <p className="text-[var(--ink)]">
          <MaskedAmount value={ho.netWorth} tone="kern" className="text-lg font-semibold" />
        </p>
        <div className="mt-1.5 flex h-1.5 w-full overflow-hidden rounded-full bg-[var(--subtle)]">
          <div className="h-full bg-kern-400" style={{ width: `${myPct}%` }} />
          <div className="h-full bg-wil-400" style={{ width: `${100 - myPct}%` }} />
        </div>
        <div className="mt-1 flex items-center justify-between text-[10px] text-[var(--ink-3)]">
          <span>Jij <span className="font-mono tabular-nums">{myPct}%</span></span>
          <span>{partnerName ?? 'Partner'} <span className="font-mono tabular-nums">{100 - myPct}%</span></span>
        </div>
      </WidgetShell>
    )
  }

  // Bar widths (relative to combined)
  const totalAbs = Math.abs(myNetWorth) + Math.abs(partnerNetWorth)
  const myBarPct = totalAbs > 0 ? (Math.abs(myNetWorth) / totalAbs) * 100 : 50
  const partnerBarPct = totalAbs > 0 ? (Math.abs(partnerNetWorth) / totalAbs) * 100 : 50

  return (
    <WidgetShell module="kern" size={size} kicker="Huishouden Vergelijking" href={href}>
      <div className="space-y-3">
        {/* Two-column comparison */}
        <div className="grid grid-cols-2 gap-3">
          {/* Partner 1: Me */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-kern-100">
                <User className="h-3 w-3 text-kern-600" />
              </div>
              <span className="text-[11px] font-medium text-[var(--ink-2)]">Jij</span>
            </div>
            <p className="text-[var(--ink)]">
              <MaskedAmount value={myNetWorth} tone="kern" className="text-base font-semibold" />
            </p>
            <p className="font-serif italic text-[11px] text-[var(--ink-3)]">
              ≈ {myFreedomStr}
            </p>
          </div>

          {/* Partner 2 */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-wil-100">
                <User className="h-3 w-3 text-wil-600" />
              </div>
              <span className="text-[11px] font-medium text-[var(--ink-2)]">{partnerName ?? 'Partner'}</span>
            </div>
            <p className="text-[var(--ink)]">
              <MaskedAmount value={partnerNetWorth} tone="kern" className="text-base font-semibold" />
            </p>
            <p className="font-serif italic text-[11px] text-[var(--ink-3)]">
              ≈ {partnerFreedomStr}
            </p>
          </div>
        </div>

        {/* Comparison bar */}
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-[var(--subtle)]">
          <div
            className="h-full bg-kern-400 transition-all duration-500"
            style={{ width: `${myBarPct}%` }}
          />
          <div
            className="h-full bg-wil-400 transition-all duration-500"
            style={{ width: `${partnerBarPct}%` }}
          />
        </div>

        {/* Combined total */}
        {size === 'full' && (
          <div className="border-t border-[var(--border-ed)] pt-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-[var(--ink-3)]" />
                <span className="text-[11px] text-[var(--ink-3)]">Gecombineerd</span>
              </div>
              <div className="text-right">
                <span className="text-[var(--ink)]">
                  <MaskedAmount value={ho.netWorth} tone="kern" className="text-sm font-semibold" />
                </span>
                <span className="ml-1.5 font-serif italic text-[11px] text-[var(--ink-3)]">
                  ≈ {combinedFreedomStr}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </WidgetShell>
  )
})
