'use client'

import { memo } from 'react'
import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import { Compass, Users, UserCheck } from 'lucide-react'
import type { DashboardData } from './widget-renderer'
import { NL_SWR } from '@/lib/horizon-data'
import { usePerspective } from '@/components/app/perspective-provider'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

export const FirePrognoseWidget = memo(function FirePrognoseWidget({ size, data, href }: Props) {
  // ── Perspective-aware FIRE countdown ───────────────────────────
  // Only adopt household/partner figures when the persisted summary
  // actually carries a FIRE target, otherwise stay personal.
  const { perspective, partnerName } = usePerspective()
  const isHouseholdView = perspective === 'household' && data.householdOverrides?.fireTarget != null
  const isPartnerView = perspective === 'partner' && data.partnerOverrides?.fireTarget != null
  const ov = isHouseholdView ? data.householdOverrides! : isPartnerView ? data.partnerOverrides! : null
  const isShared = isHouseholdView || isPartnerView

  const { fireProjResult, freedomPct, fireAgeFractional, simFireCountdown } = data
  const personalCd = simFireCountdown ?? fireProjResult

  // Effective freedom percentage + fractional FIRE age honour the perspective.
  const effectivePct = ov?.freedomPct ?? freedomPct
  const effectiveFireAgeFractional = isShared
    ? (ov?.fireAgeFractional ?? (ov?.fireAge != null ? ov.fireAge : null))
    : fireAgeFractional

  // Countdown: personal reads the sim countdown object; shared views derive
  // years/months from the persisted countdownDays so they match /toekomst.
  const sharedCountdownDays = ov?.countdownDays ?? null
  const sharedYears = sharedCountdownDays != null ? Math.floor(sharedCountdownDays / 365) : 0
  const sharedMonths = sharedCountdownDays != null
    ? Math.round((sharedCountdownDays % 365) / 30)
    : 0

  const countdownYears = isShared ? sharedYears : personalCd.countdownYears
  const countdownMonths = isShared ? sharedMonths : personalCd.countdownMonths

  // Reached / not-feasible state. In shared views we infer from the scalar
  // overrides: 100%+ → reached; a missing/zero countdown with <100% → unknown
  // (treated as "not feasible" so we never invent a date).
  const isReached = isShared
    ? effectivePct >= 100
    : personalCd.fireDate === 'Bereikt!'
  const isNotFeasible = isShared
    ? (!isReached && sharedCountdownDays == null)
    : personalCd.fireDate === 'Niet haalbaar'

  const baseKicker = 'FIRE Prognose'
  const kicker = isHouseholdView
    ? `${baseKicker} — Huishouden`
    : isPartnerView
      ? `${baseKicker} — ${partnerName ?? 'Partner'}`
      : baseKicker

  // ── Mini-size: FIRE age number or status badge ──────────────
  if (size === 'mini') {
    const fireAge = effectiveFireAgeFractional != null ? Math.round(effectiveFireAgeFractional) : null
    const miniLabel = isReached
      ? 'Bereikt!'
      : isNotFeasible
        ? '—'
        : fireAge != null
          ? `${fireAge}j`
          : isShared
            ? `${countdownYears}j ${countdownMonths}m`
            : personalCd.fireDate
    return (
      <WidgetShell module="horizon" size="mini" kicker={kicker} href={href}>
        <p className="font-mono text-[15px] font-semibold tabular-nums text-[var(--ink)] leading-none truncate">
          {miniLabel}
        </p>
      </WidgetShell>
    )
  }

  // ── Quarter-size: compact countdown + FIRE leeftijd ─────────
  if (size === 'quarter') {
    return (
      <WidgetShell module="horizon" size={size} kicker={kicker} href={href}>
        <div>
          {isShared && (
            <div className="mb-1 flex items-center gap-1 text-[10px] text-horizon-600">
              {isPartnerView ? <UserCheck className="h-3 w-3" /> : <Users className="h-3 w-3" />}
              {isPartnerView ? (partnerName ?? 'Partner') : 'Huishouden'}
            </div>
          )}
          {isReached ? (
            <>
              <div className="flex items-center gap-1.5">
                <Compass className="h-4 w-4 text-horizon-600" />
                <p className="font-mono text-lg font-semibold text-horizon-600">Bereikt! ðŸŽ‰</p>
              </div>
            </>
          ) : isNotFeasible ? (
            <>
              <div className="flex items-center gap-1.5">
                <Compass className="h-4 w-4 text-[var(--ink-3)]" />
                <p className="font-mono text-lg font-semibold text-[var(--ink-3)]">—</p>
              </div>
              <p className="mt-0.5 text-[11px] text-[var(--ink-4)]">Niet haalbaar</p>
            </>
          ) : (
            <>
              <p className="font-mono text-lg font-semibold tabular-nums text-[var(--ink)]">
                {countdownYears}j {countdownMonths}m
              </p>
              {effectiveFireAgeFractional != null && (
                <p className="mt-0.5 text-[11px] text-horizon-600">
                  Leeftijd {effectiveFireAgeFractional.toFixed(1)}
                </p>
              )}
              {/* Mini progress bar */}
              <div className="mt-1.5 h-[3px] w-full overflow-hidden rounded-full bg-[var(--subtle)] border border-[var(--border-ed)]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-horizon-400 to-horizon-600"
                  style={{ width: `${Math.min(effectivePct, 100)}%` }}
                />
              </div>
            </>
          )}
        </div>
      </WidgetShell>
    )
  }

  // ── Half-size: horizontal layout — left countdown, right progress ──
  if (size === 'half') {
    return (
      <WidgetShell module="horizon" size={size} kicker={kicker} href={href}>
        <div className="flex flex-col h-full">
          {isShared && (
            <div className="mb-1 flex items-center gap-1 text-[10px] text-horizon-600">
              {isPartnerView ? <UserCheck className="h-3 w-3" /> : <Users className="h-3 w-3" />}
              {isPartnerView ? (partnerName ?? 'Partner') : 'Huishouden'}
            </div>
          )}
          <div className="flex gap-3 flex-1 min-h-0">
            <div className="flex-1 min-w-0 flex flex-col justify-center">
              <div className="flex items-center gap-2 mb-1">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-horizon-50">
                  <Compass className="h-3.5 w-3.5 text-horizon-600" />
                </div>
                {isReached ? (
                  <p className="font-mono text-lg font-semibold text-horizon-600">Bereikt! ðŸŽ‰</p>
                ) : isNotFeasible ? (
                  <p className="font-mono text-lg font-semibold text-[var(--ink-3)]">—</p>
                ) : (
                  <p className="font-mono text-lg font-semibold tabular-nums text-[var(--ink)]">
                    {countdownYears}j {countdownMonths}m
                  </p>
                )}
              </div>
              {!isReached && !isNotFeasible && effectiveFireAgeFractional != null && (
                <p className="text-[11px] text-[var(--ink-3)]">
                  Leeftijd <span className="font-mono font-semibold text-horizon-600">{effectiveFireAgeFractional.toFixed(1)}</span>
                </p>
              )}
              {isNotFeasible && (
                <p className="text-[11px] text-[var(--ink-3)]">Verhoog spaarcapaciteit</p>
              )}
            </div>
            <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
              <div>
                <div className="flex justify-between text-[10px] text-[var(--ink-3)] mb-0.5">
                  <span>Voortgang FIRE</span>
                  <span className="font-mono tabular-nums">{effectivePct.toFixed(1)}%</span>
                </div>
                <div className="h-[4px] w-full overflow-hidden rounded-full bg-[var(--subtle)] border border-[var(--border-ed)]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-horizon-400 to-horizon-600 transition-all duration-700"
                    style={{ width: `${Math.min(effectivePct, 100)}%` }}
                  />
                </div>
              </div>
              <p className="font-serif italic text-[10px] text-[var(--ink-3)]">
                NL FIRE-model ({(NL_SWR * 100).toFixed(2)}%)
              </p>
            </div>
          </div>
        </div>
      </WidgetShell>
    )
  }

  return (
    <WidgetShell module="horizon" size={size} kicker={kicker} href={href}>
      {isShared && (
        <div className="mb-1.5 flex items-center gap-1 text-[11px] text-horizon-600">
          {isPartnerView ? <UserCheck className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
          {isPartnerView ? (partnerName ?? 'Partner') : 'Gecombineerd huishouden'}
        </div>
      )}
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-horizon-50">
          <Compass className="h-4 w-4 text-horizon-600" />
        </div>
        <div className="min-w-0">
          {isReached ? (
            <p className="font-mono text-xl font-semibold text-horizon-600">Bereikt! ðŸŽ‰</p>
          ) : isNotFeasible ? (
            <>
              <p className="font-mono text-xl font-semibold text-[var(--ink)]">—</p>
              <p className="mt-1 text-xs text-[var(--ink-3)]">Verhoog je spaarcapaciteit</p>
            </>
          ) : (
            <>
              <p className="text-xs text-[var(--ink-3)] mb-0.5">Countdown naar vrijheid</p>
              <p className="font-mono text-xl font-semibold tabular-nums text-[var(--ink)]">
                {countdownYears}j {countdownMonths}m
              </p>
              {effectiveFireAgeFractional != null ? (
                <p className="mt-0.5 text-xs text-[var(--ink-3)]">
                  Vrijheidsleeftijd: <span className="font-mono font-semibold text-horizon-600">{effectiveFireAgeFractional.toFixed(1)}</span> jaar
                </p>
              ) : !isShared ? (
                <p className="mt-0.5 text-xs text-[var(--ink-3)]">
                  Verwacht: {personalCd.fireDate}
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>

      {/* AOW-integratie label + scenario (full-size only) */}
      {size === 'full' && !isReached && !isNotFeasible && (
        <div className="mt-2 space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[var(--ink-3)]">Scenario</span>
            <span className="font-mono tabular-nums text-[var(--ink-2)]">Verwacht rendement</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[var(--ink-3)]">AOW-integratie</span>
            <span className="font-mono tabular-nums text-[var(--ink-2)]">Inbegrepen bij 67j</span>
          </div>
        </div>
      )}

      {/* Mini vermogenspad for full-size — per-user simulation path only */}
      {size === 'full' && !isShared && data.simRows && data.simRows.length > 1 && (() => {
        const rows = data.simRows!
        const accRows = rows.filter(r => r.phase === 'accumulation')
        if (accRows.length < 2) return null
        const W = 240
        const H = 48 // compact: max 80px when rendered
        const pad = 4
        const maxVal = Math.max(...accRows.map(r => r.endPortfolio), 1)
        const minAge = accRows[0].age
        const maxAge = accRows[accRows.length - 1].age
        const ageSpan = maxAge - minAge || 1
        const toX = (age: number) => pad + ((age - minAge) / ageSpan) * (W - pad * 2)
        const toY = (val: number) => H - pad - (Math.max(val, 0) / maxVal) * (H - pad * 2)
        const pathD = accRows.map((r, i) => `${i === 0 ? 'M' : 'L'}${toX(r.age).toFixed(1)},${toY(r.endPortfolio).toFixed(1)}`).join(' ')
        const areaD = pathD + ` L${toX(maxAge).toFixed(1)},${(H - pad).toFixed(1)} L${toX(minAge).toFixed(1)},${(H - pad).toFixed(1)} Z`
        const fireX = fireAgeFractional != null ? toX(fireAgeFractional) : null
        const fireY = fireAgeFractional != null ? toY(accRows.at(-1)?.endPortfolio ?? 0) : null

        return (
          <div className="mt-4">
            <svg
              width="100%"
              viewBox={`0 0 ${W} ${H}`}
              className="overflow-visible"
              aria-label="Mini vermogenspad"
            >
              <defs>
                <linearGradient id="fire-mini-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-horizon-500)" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="var(--color-horizon-500)" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              {/* Area fill */}
              <path d={areaD} fill="url(#fire-mini-grad)" />
              {/* Line */}
              <path
                d={pathD}
                fill="none"
                stroke="var(--color-horizon-500)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* FIRE punt */}
              {fireX != null && fireY != null && (
                <circle
                  cx={fireX}
                  cy={fireY}
                  r="3"
                  fill="var(--color-horizon-600)"
                />
              )}
            </svg>
            <div className="flex items-center justify-between mt-0.5">
              <p className="text-[10px] text-[var(--ink-4)] font-mono">{minAge}j</p>
              {fireAgeFractional != null && (
                <p className="text-[10px] text-horizon-600 font-mono font-semibold">
                  FIRE {fireAgeFractional.toFixed(1)}j
                </p>
              )}
              <p className="text-[10px] text-[var(--ink-4)] font-mono">{maxAge}j</p>
            </div>
          </div>
        )
      })()}

      {/* Progress bar for full-size */}
      {size === 'full' && (
        <div className="mt-2">
          <div className="flex justify-between text-[10px] text-[var(--ink-3)] mb-0.5">
            <span>Voortgang FIRE</span>
            <span className="font-mono tabular-nums">{effectivePct.toFixed(1)}%</span>
          </div>
          <div className="h-[4px] w-full overflow-hidden rounded-full bg-[var(--subtle)] border border-[var(--border-ed)]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-horizon-400 to-horizon-600 transition-all duration-700"
              style={{ width: `${Math.min(effectivePct, 100)}%` }}
            />
          </div>
          <p className="mt-1 font-serif italic text-[11px] text-[var(--ink-3)]">
            NL FIRE-model ({(NL_SWR * 100).toFixed(2)}% opnameregel)
          </p>
        </div>
      )}
    </WidgetShell>
  )
})
