'use client'

import { memo, type ReactNode } from 'react'
import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import { MaskedAmount } from '@/components/app/masked-amount'
import { Compass, Users, UserCheck } from 'lucide-react'
import type { DashboardData } from './widget-renderer'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { usePerspective } from '@/components/app/perspective-provider'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

export const VrijheidsvoortgangWidget = memo(function VrijheidsvoortgangWidget({ size, data, href }: Props) {
  // ── Perspective-aware FIRE source ──────────────────────────────
  // Only switch to household/partner display when the relevant FIRE field
  // actually exists in the persisted summary — otherwise stay personal
  // so the kicker never claims "Huishouden" over personal numbers.
  const { perspective, partnerName } = usePerspective()
  const isHouseholdView = perspective === 'household' && data.householdOverrides?.fireTarget != null
  const isPartnerView = perspective === 'partner' && data.partnerOverrides?.fireTarget != null
  const ov = isHouseholdView ? data.householdOverrides! : isPartnerView ? data.partnerOverrides! : null

  const { fireTarget, freedomPct, fireEligibleNetWorth, fireProjResult, simRequiredPortfolio } = data
  // Headline figures honour the active perspective; everything per-user
  // (growth/forecast/milestone dates) stays guarded below.
  const netWorth = ov?.netWorth ?? data.netWorth
  // Personal still prefers the sim-required portfolio; household/partner FIRE
  // targets come straight from the persisted summary so they match /toekomst.
  const effectiveFire = ov?.fireTarget ?? simRequiredPortfolio ?? fireTarget
  // Vrijheids-% = canonieke grondslag (ADR 0009). Eigen perspectief: data.freedomPct
  // (FIRE-eligible vermogen ÷ benodigde portfolio — huis gefilterd). Huishouden/
  // partner: ov.freedomPct (household-engine heeft bewust een eigen grondslag).
  // GEEN eigen som op vol netWorth meer; die toonde 100% terwijl de aftelling
  // nog jaren beweerde.
  const effectivePct = ov?.freedomPct ?? freedomPct
  // FIRE-eligible vermogen is de canonieke teller (zelfde grondslag als
  // effectivePct); milestone-datums leggen hun "bereikt"/restbedrag hierop zodat
  // ze niet tegenspreken met het percentage. Voor shared views gebruiken we het
  // ov-vermogen (de household-engine levert daar het eigen, consistente paar).
  const freedomEligibleNetWorth = ov?.netWorth ?? fireEligibleNetWorth
  const { ref: inViewRef, hasEntered } = useInViewAnimation({ duration: 700 })

  const baseKicker = 'Vrijheidsvoortgang'
  const kicker = isHouseholdView
    ? `${baseKicker} — Huishouden`
    : isPartnerView
      ? `${baseKicker} — ${partnerName ?? 'Partner'}`
      : baseKicker

  // Compute delta: change in freedom percentage vs previous month.
  // netWorthHistory is per-user only — never shown in household/partner view.
  // De historie is ruw (vol) netto vermogen; we schalen het met de huidige
  // housing-filter-ratio (FIRE-eligible / vol) zodat de delta op dezelfde
  // canonieke grondslag ligt als effectivePct en niet tegenspreekt.
  const housingFilterRatio = netWorth > 0 ? freedomEligibleNetWorth / netWorth : 1
  const prevMonthPct = (() => {
    if (isHouseholdView || isPartnerView) return null
    const hist = data.netWorthHistory
    if (!hist || hist.length < 2) return null
    const prevNw = hist[hist.length - 2].value * housingFilterRatio
    return effectiveFire > 0 ? Math.min((prevNw / effectiveFire) * 100, 100) : null
  })()
  const pctDelta = prevMonthPct !== null ? effectivePct - prevMonthPct : null

  // FIRE status copy derives from the personal simulation countdown; in
  // household/partner view we have no shared countdown, so fall back to a
  // neutral percentage-based label.
  const fireStatusLabel = (() => {
    if (isHouseholdView || isPartnerView) {
      return effectivePct >= 100 ? 'Bereikt!' : `${effectivePct.toFixed(0)}% van vrijheid`
    }
    const cd = data.simFireCountdown ?? fireProjResult
    return cd.fireDate === 'Bereikt!'
      ? 'Bereikt!'
      : cd.fireDate === 'Niet haalbaar'
        ? 'Verhoog capaciteit'
        : cd.fireDate
  })()

  // ── Mini-size: freedom percentage ────
  if (size === 'mini') {
    return (
      <WidgetShell module="cross" size="mini" kicker={kicker} href={href}>
        <p className="font-mono text-[15px] font-semibold tabular-nums text-[var(--ink)] leading-none truncate">
          {effectivePct.toFixed(1)}%
        </p>
      </WidgetShell>
    )
  }

  // ── Quarter-size: big percentage + compact progress bar + FIRE date ────
  if (size === 'quarter') {
    return (
      <WidgetShell module="cross" size={size} kicker={kicker} href={href}>
        <div ref={inViewRef}>
          {(isHouseholdView || isPartnerView) && (
            <div className="mb-1 flex items-center gap-1 text-[10px] text-horizon-600">
              {isPartnerView ? <UserCheck className="h-3 w-3" /> : <Users className="h-3 w-3" />}
              {isPartnerView ? (partnerName ?? 'Partner') : 'Huishouden'}
            </div>
          )}
          <div className="flex items-center gap-1.5 mb-1">
            <Compass className="h-3 w-3 text-horizon-600 shrink-0" />
            <p className="font-mono text-lg font-semibold tabular-nums text-[var(--ink)]">
              {effectivePct.toFixed(1)}%
            </p>
          </div>
          <div className="h-[3px] w-full overflow-hidden rounded-full bg-[var(--subtle)] border border-[var(--border-ed)] mb-1">
            <div
              className="h-full rounded-full bg-gradient-to-r from-horizon-400 to-horizon-600"
              style={{
                width: hasEntered ? `${Math.min(effectivePct, 100)}%` : '0%',
                transition: hasEntered ? 'width 700ms cubic-bezier(.22,1,.36,1)' : 'none',
              }}
            />
          </div>
          <p className="text-[10px] text-[var(--ink-3)] truncate">
            {fireStatusLabel}
          </p>
        </div>
      </WidgetShell>
    )
  }

  // ── Half-size: horizontal layout — left percentage, right progress + amounts ────
  if (size === 'half') {
    return (
      <WidgetShell module="cross" size={size} kicker={kicker} href={href}>
        <div ref={inViewRef} className="flex gap-3 h-full">
          <div className="flex-1 min-w-0 flex flex-col justify-center">
            {(isHouseholdView || isPartnerView) && (
              <div className="mb-1 flex items-center gap-1 text-[10px] text-horizon-600">
                {isPartnerView ? <UserCheck className="h-3 w-3" /> : <Users className="h-3 w-3" />}
                {isPartnerView ? (partnerName ?? 'Partner') : 'Huishouden'}
              </div>
            )}
            <div className="flex items-center gap-1.5 mb-0.5">
              <Compass className="h-3.5 w-3.5 text-horizon-600 shrink-0" />
              <p className="font-mono text-2xl font-semibold tabular-nums text-[var(--ink)]">
                {effectivePct.toFixed(1)}%
              </p>
            </div>
            {pctDelta !== null && (
              <span className={`text-[11px] font-mono tabular-nums ${pctDelta >= 0 ? 'text-positive' : 'text-negative'}`}>
                {pctDelta >= 0 ? '+' : ''}{pctDelta.toFixed(1)}% deze mnd
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
            {/* Progress bar */}
            <div className="h-[4px] w-full overflow-hidden rounded-full bg-[var(--subtle)] border border-[var(--border-ed)]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-horizon-400 to-horizon-600"
                style={{
                  width: hasEntered ? `${Math.min(effectivePct, 100)}%` : '0%',
                  transition: hasEntered ? 'width 700ms cubic-bezier(.22,1,.36,1)' : 'none',
                }}
              />
            </div>
            <p className="text-[10px] text-[var(--ink-3)]">
              <MaskedAmount value={netWorth} tone="ink" /> / <MaskedAmount value={effectiveFire} tone="ink" />
            </p>
            <p className="text-[10px] text-[var(--ink-4)]">
              {fireStatusLabel}
            </p>
          </div>
        </div>
      </WidgetShell>
    )
  }

  // ── Full-size: ring + bedragen + groei ────
  // Het mijlpaal-datumlijstje is hier bewust verwijderd (widgetreview): die rol
  // ligt exclusief bij de Vrijheidsmijlpalen-widget, die de canonieke motor
  // (data.freedomMilestones, lib/freedom-milestones.ts) consumeert. Dit widget
  // toont "waar sta ik nu + hoe snel groei ik": ring, bedragen en groei/mnd.
  const milestones = [25, 50, 75, 100] as const

  // Monthly growth rate from netWorthHistory — per-user only, so it is
  // suppressed in shared views.
  // Geschaald met de housing-filter-ratio zodat groei én restbedrag op de
  // FIRE-eligible grondslag liggen (consistent met effectivePct).
  const monthlyGrowthRate = (() => {
    if (isHouseholdView || isPartnerView) return null
    const hist = data.netWorthHistory
    if (!hist || hist.length < 2) return null
    const oldest = hist[0].value
    const newest = hist[hist.length - 1].value
    const months = hist.length - 1
    if (oldest <= 0 || months <= 0) return null
    return ((newest - oldest) / months) * housingFilterRatio
  })()

  // Restbedrag tot volledige vrijheid — zelfde canonieke paar als effectivePct
  // (FIRE-eligible vermogen vs. doelportfolio), puur presentationeel.
  const remainingToFullFreedom = Math.max(effectiveFire - freedomEligibleNetWorth, 0)

  // SVG donut ring — geometrie in vaste viewBox-eenheden; de wéérgave-grootte
  // is responsive (kleiner op mobiel, groter op desktop) zodat de ring het
  // volle canvas benut en gecentreerd blijft (widgetreview: "rondje groter +
  // hele canvas"). De ring schaalt via de viewBox, het %-centrum blijft via
  // absolute inset-0 gecentreerd ongeacht de pixelgrootte.
  const RING_VIEW = 160
  const RING_STROKE = 13
  const RING_RADIUS = (RING_VIEW - RING_STROKE) / 2
  const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS
  const fillLength = (Math.min(effectivePct, 100) / 100) * RING_CIRCUMFERENCE

  // Bedrag-cellen als volle-breedte strip onderaan (i.p.v. rechter kolom) — dat
  // centreert de ring en vult het canvas. Aantal cellen (1–3) bepaalt de
  // grid-kolommen; groei/restbedrag blijven onder dezelfde voorwaarden verborgen.
  const statItems: { label: string; value: ReactNode; sub?: ReactNode }[] = [
    {
      label: 'Vermogen',
      value: <MaskedAmount value={netWorth} tone="ink" className="text-[13px] font-medium" />,
      sub: (
        <>
          van <MaskedAmount value={effectiveFire} tone="ink" className="text-[10px]" />
          {simRequiredPortfolio ? ' (sim)' : ''}
        </>
      ),
    },
  ]
  if (monthlyGrowthRate !== null) {
    statItems.push({
      label: 'Groei',
      value: (
        <>
          <MaskedAmount value={monthlyGrowthRate} tone="ink" className="text-[13px] font-medium" />
          /mnd
        </>
      ),
    })
  }
  if (effectivePct < 100 && remainingToFullFreedom > 0) {
    statItems.push({
      label: 'Nog te gaan',
      value: <MaskedAmount value={remainingToFullFreedom} tone="ink" className="text-[13px] font-medium" />,
    })
  }

  return (
    <WidgetShell module="cross" size={size} kicker={kicker} href={href}>
      <div ref={inViewRef} className="flex h-full flex-col">
        {(isHouseholdView || isPartnerView) && (
          <div className="mb-1 flex shrink-0 items-center justify-center gap-1 text-[11px] text-horizon-600">
            {isPartnerView ? <UserCheck className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
            {isPartnerView ? (partnerName ?? 'Partner') : 'Gecombineerd huishouden'}
          </div>
        )}

        {/* Donut ring — gecentreerd, vult de resterende hoogte van het canvas */}
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <div className="relative h-[148px] w-[148px] sm:h-[188px] sm:w-[188px]">
            <svg viewBox={`0 0 ${RING_VIEW} ${RING_VIEW}`} className="h-full w-full">
              <defs>
                <linearGradient id="freedom-ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="var(--horizon-400)" />
                  <stop offset="100%" stopColor="var(--horizon-600)" />
                </linearGradient>
              </defs>
              {/* Background track */}
              <circle
                cx={RING_VIEW / 2}
                cy={RING_VIEW / 2}
                r={RING_RADIUS}
                fill="none"
                stroke="var(--subtle)"
                strokeWidth={RING_STROKE}
              />
              {/* Progress arc */}
              <circle
                cx={RING_VIEW / 2}
                cy={RING_VIEW / 2}
                r={RING_RADIUS}
                fill="none"
                stroke="url(#freedom-ring-grad)"
                strokeWidth={RING_STROKE}
                strokeLinecap="round"
                strokeDasharray={`${RING_CIRCUMFERENCE}`}
                strokeDashoffset={hasEntered ? RING_CIRCUMFERENCE - fillLength : RING_CIRCUMFERENCE}
                transform={`rotate(-90 ${RING_VIEW / 2} ${RING_VIEW / 2})`}
                style={{ transition: hasEntered ? 'stroke-dashoffset 700ms cubic-bezier(.22,1,.36,1)' : 'none' }}
              />
              {/* Milestone dots on the ring */}
              {milestones.map(m => {
                const angle = ((m / 100) * 360) - 90
                const rad = (angle * Math.PI) / 180
                const dotX = RING_VIEW / 2 + RING_RADIUS * Math.cos(rad)
                const dotY = RING_VIEW / 2 + RING_RADIUS * Math.sin(rad)
                return (
                  <circle
                    key={m}
                    cx={dotX}
                    cy={dotY}
                    r={3.5}
                    fill={effectivePct >= m ? 'var(--horizon-700)' : 'var(--ink-4)'}
                  />
                )
              })}
            </svg>
            {/* Center percentage */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-mono text-2xl sm:text-3xl font-bold tabular-nums text-[var(--ink)] leading-none">
                {effectivePct.toFixed(1)}%
              </span>
              {pctDelta !== null && (
                <span className={`mt-1 text-[11px] font-mono tabular-nums ${pctDelta >= 0 ? 'text-positive' : 'text-negative'}`}>
                  {pctDelta >= 0 ? '+' : ''}{pctDelta.toFixed(1)}%
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Bedrag-strip — volle breedte, gecentreerd; vult de canvas-bodem */}
        <div
          className="mt-2 grid shrink-0 gap-2 border-t border-[var(--border-ed)] pt-2.5"
          style={{ gridTemplateColumns: `repeat(${statItems.length}, minmax(0, 1fr))` }}
        >
          {statItems.map(item => (
            <div key={item.label} className="min-w-0 text-center">
              <p className="text-[9px] uppercase tracking-[0.08em] text-[var(--ink-4)]">{item.label}</p>
              <p className="truncate text-[var(--ink-2)]">{item.value}</p>
              {item.sub && <p className="truncate text-[10px] text-[var(--ink-4)]">{item.sub}</p>}
            </div>
          ))}
        </div>

        <p className="mt-2 shrink-0 text-center font-serif italic text-[11px] text-[var(--ink-3)]">
          {(() => {
            // Shared views have no per-user countdown date — use a neutral
            // percentage framing rather than a faked personal projection.
            if (isHouseholdView || isPartnerView) {
              return effectivePct >= 100
                ? 'Volledige vrijheid bereikt!'
                : `${effectivePct.toFixed(0)}% van volledige vrijheid`
            }
            const cd = data.simFireCountdown ?? fireProjResult
            return cd.fireDate === 'Bereikt!'
              ? 'Volledige vrijheid bereikt!'
              : cd.fireDate === 'Niet haalbaar'
                ? 'Verhoog spaarcapaciteit'
                : `Vrijheid: ${cd.fireDate}`
          })()}
        </p>
      </div>
    </WidgetShell>
  )
})
