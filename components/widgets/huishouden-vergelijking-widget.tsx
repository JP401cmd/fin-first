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
  // MED-1 · Consume, don't recompute: het partnercijfer staat al canoniek in de
  // bundel (privacy-gegate via household_partner_totals). Val alleen terug op de
  // aftreksom als de partner-override onverhoopt ontbreekt.
  const partnerNetWorth = data.partnerOverrides?.netWorth ?? ho.netWorth - myNetWorth

  const myFreedom = dailyExp > 0 ? calculateFreedomTime(Math.abs(myNetWorth), dailyExp) : null
  const partnerFreedom = dailyExp > 0 ? calculateFreedomTime(Math.abs(partnerNetWorth), dailyExp) : null
  const combinedFreedom = dailyExp > 0 ? calculateFreedomTime(Math.abs(ho.netWorth), dailyExp) : null

  const myFreedomStr = myFreedom ? formatFreedomTimeString(myFreedom, 'short') : '—'
  const partnerFreedomStr = partnerFreedom ? formatFreedomTimeString(partnerFreedom, 'short') : '—'
  const combinedFreedomStr = combinedFreedom ? formatFreedomTimeString(combinedFreedom, 'short') : '—'

  const partnerLabel = partnerName ?? 'Partner'

  // MED-2 · Ratio-balk: clamp negatief vermogen naar 0 voor het aandeel. Tegengestelde
  // tekens (partner met netto schuld) mogen geen misleidend 50/50-beeld geven.
  const myShare = Math.max(0, myNetWorth)
  const partnerShare = Math.max(0, partnerNetWorth)
  const shareTotal = myShare + partnerShare
  const myPct = shareTotal > 0 ? Math.round((myShare / shareTotal) * 100) : 50
  const partnerPct = 100 - myPct
  const ratioAriaLabel = `Verhouding netto vermogen: jij ${myPct}%, ${partnerLabel} ${partnerPct}%`

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
    return (
      <WidgetShell module="kern" size={size} kicker="Huishouden" href={href}>
        <p className="text-[var(--ink)]">
          <MaskedAmount value={ho.netWorth} tone="kern" className="text-lg font-semibold" />
        </p>
        <div
          role="img"
          aria-label={ratioAriaLabel}
          className="mt-1.5 flex h-1.5 w-full overflow-hidden rounded-full bg-[var(--subtle)]"
        >
          <div className="h-full bg-kern-400" style={{ width: `${myPct}%` }} />
          <div className="h-full bg-wil-400" style={{ width: `${partnerPct}%` }} />
        </div>
        <div className="mt-1 flex items-center justify-between text-[11px] text-[var(--ink-3)]">
          <span>Jij <span className="font-mono tabular-nums">{myPct}%</span></span>
          <span>{partnerLabel} <span className="font-mono tabular-nums">{partnerPct}%</span></span>
        </div>
      </WidgetShell>
    )
  }

  // Bar widths (relative to combined) — negatief vermogen telt als 0 aandeel (MED-2).
  const myBarPct = shareTotal > 0 ? (myShare / shareTotal) * 100 : 50
  const partnerBarPct = shareTotal > 0 ? (partnerShare / shareTotal) * 100 : 50

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
              <span className="text-[11px] font-medium text-[var(--ink-2)]">{partnerLabel}</span>
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
        <div
          role="img"
          aria-label={ratioAriaLabel}
          className="flex h-2 w-full overflow-hidden rounded-full bg-[var(--subtle)]"
        >
          <div
            className="h-full bg-kern-400 transition-all duration-500"
            style={{ width: `${myBarPct}%` }}
          />
          <div
            className="h-full bg-wil-400 transition-all duration-500"
            style={{ width: `${partnerBarPct}%` }}
          />
        </div>

        {/* Full: bezittingen/schulden-uitsplitsing per partner + gecombineerd totaal.
            Benut het grotere canvas met context die half niet toont — alleen totalen,
            dus privacy-veilig. */}
        {size === 'full' && (
          <div className="space-y-1.5 border-t border-[var(--border-ed)] pt-2.5">
            <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 gap-y-1.5 text-[11px]">
              <span className="text-[var(--ink-3)]" aria-hidden />
              <span className="text-right font-medium text-[var(--ink-2)]">Jij</span>
              <span className="text-right font-medium text-[var(--ink-2)]">{partnerLabel}</span>

              <span className="text-[var(--ink-3)]">Bezittingen</span>
              <span className="text-right text-[var(--ink)]">
                <MaskedAmount value={data.totalAssets} tone="kern" className="tabular-nums" />
              </span>
              <span className="text-right text-[var(--ink)]">
                <MaskedAmount value={data.partnerOverrides?.totalAssets ?? 0} tone="kern" className="tabular-nums" />
              </span>

              <span className="text-[var(--ink-3)]">Schulden</span>
              <span className="text-right text-[var(--ink)]">
                <MaskedAmount value={data.totalDebts} tone="kern" className="tabular-nums" />
              </span>
              <span className="text-right text-[var(--ink)]">
                <MaskedAmount value={data.partnerOverrides?.totalDebts ?? 0} tone="kern" className="tabular-nums" />
              </span>
            </div>

            <div className="flex items-center justify-between border-t border-[var(--border-ed)] pt-2">
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
