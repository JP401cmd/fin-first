'use client'

import { memo } from 'react'
import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData } from './widget-renderer'
import { CheckCircle2, Circle, Flag, Users, UserCheck } from 'lucide-react'
import { usePerspective } from '@/components/app/perspective-provider'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

const MILESTONES = [
  { pct: 25, label: 'Eerste kwartaal', desc: '1 dag op 4 gedekt' },
  { pct: 50, label: 'Halverwege', desc: 'Helft vrijheid bereikt' },
  { pct: 75, label: 'Finishstraight', desc: '3 van 4 dagen gedekt' },
  { pct: 100, label: 'Volledige vrijheid', desc: 'FIRE bereikt' },
]

function yearsToDate(years: number): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() + Math.floor(years))
  d.setMonth(d.getMonth() + Math.round((years % 1) * 12))
  return d.toLocaleDateString('nl-NL', { month: 'short', year: 'numeric' })
}

export const VrijheidsMijlpalenWidget = memo(function VrijheidsMijlpalenWidget({ size, data, href }: Props) {
  // ── Perspective-aware milestones ───────────────────────────────
  // Milestones are fractions of the FIRE target — override netWorth +
  // fireTarget only when the persisted FIRE summary exists.
  const { perspective, partnerName } = usePerspective()
  const isHouseholdView = perspective === 'household' && data.householdOverrides?.fireTarget != null
  const isPartnerView = perspective === 'partner' && data.partnerOverrides?.fireTarget != null
  const ov = isHouseholdView ? data.householdOverrides! : isPartnerView ? data.partnerOverrides! : null
  const isShared = isHouseholdView || isPartnerView

  const { freedomPct, fireTarget, fireEligibleNetWorth, fireProjResult, simRequiredPortfolio, simFireCountdown } = data
  const netWorth = ov?.netWorth ?? data.netWorth
  const effectiveFire = ov?.fireTarget ?? simRequiredPortfolio ?? fireTarget
  // Vrijheids-% = canonieke grondslag (ADR 0009). Eigen perspectief:
  // data.freedomPct (FIRE-eligible vermogen ÷ benodigde portfolio, huis
  // gefilterd). Huishouden/partner: ov.freedomPct (eigen household-grondslag).
  // GEEN eigen som op vol netWorth meer.
  const effectivePct = ov?.freedomPct ?? freedomPct
  // FIRE-eligible vermogen is de canonieke teller; mijlpaal-datums (target/
  // "bereikt") leggen hierop zodat ze met effectivePct overeenstemmen. Shared
  // views gebruiken het ov-vermogen (consistent paar uit de household-engine).
  const freedomEligibleNetWorth = ov?.netWorth ?? fireEligibleNetWorth

  // Monthly savings approximation using the personal countdown — used purely
  // to estimate milestone dates, which are per-user and therefore suppressed
  // in household/partner views (no shared savings cadence exists).
  const cd = simFireCountdown ?? fireProjResult
  const countdownYears = cd.countdownYears + cd.countdownMonths / 12
  const monthlySavingsApprox = !isShared && countdownYears > 0 && effectiveFire > 0
    ? (effectiveFire - freedomEligibleNetWorth) / (countdownYears * 12)
    : 0

  const getMilestoneDate = (targetPct: number): string | null => {
    if (isShared) return null // date projection is per-user only
    const targetAmount = effectiveFire * (targetPct / 100)
    if (freedomEligibleNetWorth >= targetAmount) return null // Already reached
    if (monthlySavingsApprox <= 0) return null
    const monthsNeeded = (targetAmount - freedomEligibleNetWorth) / monthlySavingsApprox
    return yearsToDate(monthsNeeded / 12)
  }

  const baseKicker = 'Vrijheidsmijlpalen'
  const kicker = isHouseholdView
    ? `${baseKicker} — Huishouden`
    : isPartnerView
      ? `${baseKicker} — ${partnerName ?? 'Partner'}`
      : baseKicker

  const activeMilestoneIdx = MILESTONES.findIndex(m => effectivePct < m.pct)
  const nextMilestone = activeMilestoneIdx >= 0 ? MILESTONES[activeMilestoneIdx] : null
  const nextDate = nextMilestone ? getMilestoneDate(nextMilestone.pct) : null

  // ── Mini-size: next milestone label or 'Bereikt!' ──────────
  if (size === 'mini') {
    const miniLabel = nextMilestone ? nextMilestone.label : 'Bereikt!'
    return (
      <WidgetShell module="horizon" size="mini" kicker={kicker} href={href}>
        <p className="text-[13px] font-semibold text-[var(--ink)] leading-none truncate">
          {miniLabel}
        </p>
      </WidgetShell>
    )
  }

  if (size === 'quarter') {
    const fullyFree = effectivePct >= 100
    return (
      <WidgetShell module="horizon" size={size} kicker={kicker} href={href}>
        {isShared && (
          <div className="mb-0.5 flex items-center gap-1 text-[10px] text-horizon-600">
            {isPartnerView ? <UserCheck className="h-3 w-3" /> : <Users className="h-3 w-3" />}
            {isPartnerView ? (partnerName ?? 'Partner') : 'Huishouden'}
          </div>
        )}
        <div className="mt-1 flex items-center gap-2">
          <Flag className="h-3.5 w-3.5 text-horizon-500 shrink-0" />
          <span className="font-mono text-lg font-semibold tabular-nums text-[var(--ink)]">
            {Math.round(effectivePct)}% vrijheid
          </span>
        </div>
        {fullyFree ? (
          <p className="text-[10px] text-horizon-600 font-medium mt-0.5">Volledige vrijheid bereikt!</p>
        ) : nextMilestone ? (
          <p className="text-[10px] text-[var(--ink-3)] mt-0.5 truncate">
            Volgende: {nextMilestone.pct}%{nextDate ? ` — ${nextDate}` : ''}
          </p>
        ) : null}
      </WidgetShell>
    )
  }

  return (
    <WidgetShell module="horizon" size={size} kicker={kicker} href={href}>
      {isShared && (
        <div className="mb-1 flex items-center gap-1 text-[11px] text-horizon-600">
          {isPartnerView ? <UserCheck className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
          {isPartnerView ? (partnerName ?? 'Partner') : 'Gecombineerd huishouden'}
        </div>
      )}
      <div className={`${size === 'half' ? 'space-y-1' : 'mt-1 space-y-1.5'}`}>
        {MILESTONES.map((m, i) => {
          const reached = effectivePct >= m.pct
          const isActive = i === activeMilestoneIdx
          const date = reached ? null : getMilestoneDate(m.pct)
          // Progress towards this milestone
          const milestonePct = Math.min((effectivePct / m.pct) * 100, 100)

          return (
            <div
              key={m.pct}
              className={`${isActive ? 'opacity-100' : reached ? 'opacity-60' : 'opacity-40'}`}
            >
              <div className="flex items-center gap-2">
                {/* Icon */}
                <div className="shrink-0">
                  {reached ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-horizon-600" />
                  ) : (
                    <Circle className={`h-3.5 w-3.5 ${isActive ? 'text-horizon-500' : 'text-[var(--border-md)]'}`} />
                  )}
                </div>

                {/* Label + date */}
                <div className="min-w-0 flex-1">
                  <p className={`text-[11px] font-medium leading-tight ${isActive ? 'text-[var(--ink)]' : 'text-[var(--ink-3)]'}`}>
                    {m.label}
                  </p>
                  {size === 'full' && (
                    <p className="text-[10px] text-[var(--ink-4)] leading-tight">{m.desc}</p>
                  )}
                </div>

                {/* Right: percentage or date */}
                <div className="shrink-0 text-right">
                  {reached ? (
                    <span className="text-[10px] font-semibold text-horizon-600 uppercase tracking-wide">Bereikt</span>
                  ) : date ? (
                    <span className="font-mono text-[10px] text-[var(--ink-3)]">{date}</span>
                  ) : (
                    <span className="font-mono text-[10px] text-[var(--ink-4)]">{m.pct}%</span>
                  )}
                </div>
              </div>

              {/* Progress bar (full-size only) */}
              {size === 'full' && (
                <div className="ml-5.5 mt-0.5 h-[3px] w-[calc(100%-22px)] overflow-hidden rounded-full bg-[var(--subtle)]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-horizon-400 to-horizon-600 transition-all duration-500"
                    style={{ width: `${reached ? 100 : milestonePct}%` }}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </WidgetShell>
  )
})
