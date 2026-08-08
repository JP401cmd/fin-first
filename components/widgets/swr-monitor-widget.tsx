'use client'

import { memo } from 'react'
import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData } from './widget-renderer'
import { computeEffectiveSwr } from '@/lib/fire-params'
import { SWR, NL_SWR } from '@/lib/constants'
import { Users, UserCheck } from 'lucide-react'
import { usePerspective } from '@/components/app/perspective-provider'
import { MaskedAmount } from '@/components/app/masked-amount'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

// Referentie-SWR's komen uit de canonieke bron (lib/constants.ts): SWR = Trinity
// Study 4%, NL_SWR = NL-standaard na Box 3 + inflatie (beweegt met het belastingjaar
// mee). Nooit lokaal hardcoden — "consume, don't recompute".

// euro-view: exempt (D12) — dit widget kent geen enkel PROJECTIE-bedrag. Alles
// wat hier in euro's staat is een grootheid van VANDAAG: `netWorth` (huidig
// vermogen), `monthlyExpenses` (huidige uitgaven) en het passieve inkomen dat
// daaruit volgt (`netWorth × SWR / 12`). Die staan per definitie al in huidige
// euro's; ze door een kernelfactor delen zou ze een tweede keer deflateren en
// een te laag bedrag tonen. De SWR, de multiplier en de onttrekkingsvoet zijn
// bovendien ratio's (klasse R) en deflateren sowieso nooit. Dit oppervlak
// verandert dus niet mee met de euro-weergave — bewust, niet vergeten.

function swrStatus(swr: number): { color: string; label: string; bg: string } {
  if (swr >= 0.04) return { color: 'text-positive', label: 'Veilig', bg: 'bg-positive/20' }
  if (swr >= 0.03) return { color: 'text-positive', label: 'Goed', bg: 'bg-positive/10' }
  if (swr >= 0.02) return { color: 'text-[var(--ink-2)]', label: 'Matig', bg: 'bg-[var(--subtle)]' }
  return { color: 'text-negative', label: 'Krap', bg: 'bg-negative/10' }
}

function formatPct(value: number, decimals = 2): string {
  return (value * 100).toFixed(decimals) + '%'
}

export const SwrMonitorWidget = memo(function SwrMonitorWidget({ size, data, href }: Props) {
  // ── Perspective-aware withdrawal monitor ───────────────────────
  // Only adopt household/partner figures when the persisted FIRE summary
  // exists. The SWR *rate* itself derives from the user's return/inflation
  // parameters (universal), so only netWorth + expenses are overridden.
  const { perspective, partnerName } = usePerspective()
  const isHouseholdView = perspective === 'household' && data.householdOverrides?.fireTarget != null
  const isPartnerView = perspective === 'partner' && data.partnerOverrides?.fireTarget != null
  const ov = isHouseholdView ? data.householdOverrides! : isPartnerView ? data.partnerOverrides! : null
  const isShared = isHouseholdView || isPartnerView

  const { grossReturn, inflationRate } = data
  const netWorth = ov?.netWorth ?? data.netWorth
  const monthlyExpenses = ov?.monthlyExpenses ?? data.monthlyExpenses
  // Monthly passive income at the effective SWR (perspective-aware portfolio).
  const monthlyPassiveIncome = ov?.monthlyPassiveIncome ?? null

  // Effective SWR from user's parameters — single-sourced helper (lib/fire-params)
  const effectiveSwr = computeEffectiveSwr(grossReturn, inflationRate)

  // Actual withdrawal rate: what the user/household would withdraw per year
  const yearlyExpenses = monthlyExpenses * 12
  const actualWithdrawal = netWorth > 0 ? yearlyExpenses / netWorth : 0

  const status = swrStatus(effectiveSwr)

  // In-view fill-animatie (700ms bezier, 0% → doel; transition:none pre-entered).
  // De gauge-markers (Trinity/NL) blijven statisch; alleen de fill animeert.
  // Eén hook bovenaan; per render toont het widget precies één size, dus dezelfde
  // ref op elke size-track (half + full) is rules-of-hooks-veilig.
  const { ref: barRef, hasEntered } = useInViewAnimation({ duration: 700 })
  const barTransition = hasEntered ? 'width 700ms cubic-bezier(.22,1,.36,1)' : 'none'

  const baseKicker = 'SWR Monitor'
  const kicker = isHouseholdView
    ? `${baseKicker} — Huishouden`
    : isPartnerView
      ? `${baseKicker} — ${partnerName ?? 'Partner'}`
      : baseKicker

  // ── Mini: SWR percentage ──────────────────────────────────
  if (size === 'mini') {
    return (
      <WidgetShell module="horizon" size="mini" kicker={kicker} href={href}>
        <p className={`font-mono text-[15px] font-semibold tabular-nums leading-none truncate ${status.color}`}>
          {formatPct(effectiveSwr)}
        </p>
      </WidgetShell>
    )
  }

  // ── Quarter: SWR + status indicator ───────────────────────
  if (size === 'quarter') {
    return (
      <WidgetShell module="horizon" size={size} kicker={kicker} href={href}>
        {isShared && (
          <div className="mb-0.5 flex items-center gap-1 text-[10px] text-horizon-600">
            {isPartnerView ? <UserCheck className="h-3 w-3" /> : <Users className="h-3 w-3" />}
            {isPartnerView ? (partnerName ?? 'Partner') : 'Huishouden'}
          </div>
        )}
        <div className="flex items-center gap-2">
          <p className={`font-mono text-xl font-semibold tabular-nums ${status.color}`}>
            {formatPct(effectiveSwr)}
          </p>
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${status.bg} ${status.color}`}>
            {status.label}
          </span>
        </div>
        <p className="mt-1 text-[10px] text-[var(--ink-3)]">
          Safe Withdrawal Rate (na Box 3 + inflatie)
        </p>
      </WidgetShell>
    )
  }

  // ── Half: SWR + historical comparison + Trinity Study ref ─
  if (size === 'half') {
    // Visual gauge bar
    const gaugeMax = 0.06 // 6% scale
    const swrPct = Math.min(effectiveSwr / gaugeMax, 1) * 100
    const classicPct = (SWR / gaugeMax) * 100
    const nlSwrPct = (NL_SWR / gaugeMax) * 100

    return (
      <WidgetShell module="horizon" size={size} kicker={kicker} href={href}>
        {isShared && (
          <div className="mb-1 flex items-center gap-1 text-[10px] text-horizon-600">
            {isPartnerView ? <UserCheck className="h-3 w-3" /> : <Users className="h-3 w-3" />}
            {isPartnerView ? (partnerName ?? 'Partner') : 'Huishouden'}
          </div>
        )}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <p className={`font-mono text-lg font-semibold tabular-nums ${status.color}`}>
              {formatPct(effectiveSwr)}
            </p>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${status.bg} ${status.color}`}>
              {status.label}
            </span>
          </div>
        </div>

        {/* Gauge bar */}
        <div
          ref={barRef}
          className="relative h-2.5 w-full rounded-full bg-[var(--subtle)] overflow-visible mb-3"
          role="img"
          aria-label={`Veilige onttrekkingsvoet ${formatPct(effectiveSwr)}, status ${status.label}. Referenties: Trinity Study ${formatPct(SWR)}, NL standaard ${formatPct(NL_SWR)}.`}
        >
          <div
            className={`h-full rounded-full ${effectiveSwr >= 0.03 ? 'bg-positive' : effectiveSwr >= 0.02 ? 'bg-[var(--ink-3)]' : 'bg-negative'}`}
            style={{ width: hasEntered ? `${swrPct}%` : '0%', transition: barTransition }}
          />
          {/* Trinity Study marker */}
          <div
            className="absolute top-0 h-2.5 w-px bg-[var(--ink-3)]"
            style={{ left: `${classicPct}%` }}
            title={`Trinity Study ${formatPct(SWR)}`}
          />
          {/* NL SWR marker */}
          <div
            className="absolute top-0 h-2.5 w-px bg-horizon-400"
            style={{ left: `${nlSwrPct}%` }}
            title={`NL standaard ${formatPct(NL_SWR)}`}
          />
        </div>

        {/* Legend */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-[var(--ink-3)]" />
            <span className="text-[10px] text-[var(--ink-3)]">Trinity Study</span>
            <span className="font-mono text-[10px] tabular-nums text-[var(--ink-2)]">{formatPct(SWR)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-horizon-400" />
            <span className="text-[10px] text-[var(--ink-3)]">NL standaard</span>
            <span className="font-mono text-[10px] tabular-nums text-[var(--ink-2)]">{formatPct(NL_SWR)}</span>
          </div>
        </div>
      </WidgetShell>
    )
  }

  // ── Full: SWR + scenarios + impact ────────────────────────
  const gaugeMax = 0.06
  const swrPct = Math.min(effectiveSwr / gaugeMax, 1) * 100
  const classicPct = (SWR / gaugeMax) * 100
  const nlSwrPct = (NL_SWR / gaugeMax) * 100

  // FIRE multiplier = 1 / SWR
  const multiplier = 1 / effectiveSwr

  // Monthly passive income at the effective SWR. Shared views use the
  // persisted figure when available; otherwise derive from the
  // perspective-aware portfolio so it stays consistent across perspectives.
  const displayPassiveMonthly = monthlyPassiveIncome ?? (netWorth > 0 ? (netWorth * effectiveSwr) / 12 : 0)

  // Scenario: what if return changes ±1% — same single-sourced formula
  const swrOptimistic = computeEffectiveSwr(grossReturn + 0.01, inflationRate)
  const swrPessimistic = computeEffectiveSwr(grossReturn - 0.01, inflationRate)

  // Years until safe if currently over-withdrawing
  const withdrawalSafe = actualWithdrawal <= effectiveSwr

  return (
    <WidgetShell module="horizon" size={size} kicker={kicker} href={href}>
      <div className="space-y-2">
        {isShared && (
          <div className="flex items-center gap-1 text-[11px] text-horizon-600">
            {isPartnerView ? <UserCheck className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
            {isPartnerView ? (partnerName ?? 'Partner') : 'Gecombineerd huishouden'}
          </div>
        )}
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <p className={`font-mono text-lg font-semibold tabular-nums ${status.color}`}>
                {formatPct(effectiveSwr)}
              </p>
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${status.bg} ${status.color}`}>
                {status.label}
              </span>
            </div>
            <p className="text-[10px] text-[var(--ink-3)] mt-0.5">
              Veilige onttrekking na Box 3 + inflatie
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wide text-[var(--ink-3)]">Multiplier</p>
            <p className="font-mono text-sm font-semibold tabular-nums text-[var(--ink)]">
              {multiplier.toFixed(1)}×
            </p>
            <p className="text-[10px] text-[var(--ink-3)]">× jaaruitgaven aan vrijheid</p>
          </div>
        </div>

        {/* Gauge bar with markers */}
        <div
          ref={barRef}
          className="relative h-3 w-full rounded-full bg-[var(--subtle)] overflow-visible"
          role="img"
          aria-label={`Veilige onttrekkingsvoet ${formatPct(effectiveSwr)}, status ${status.label}. Referenties: Trinity Study ${formatPct(SWR)}, NL standaard ${formatPct(NL_SWR)}.`}
        >
          <div
            className={`h-full rounded-full ${effectiveSwr >= 0.03 ? 'bg-positive' : effectiveSwr >= 0.02 ? 'bg-[var(--ink-3)]' : 'bg-negative'}`}
            style={{ width: hasEntered ? `${swrPct}%` : '0%', transition: barTransition }}
          />
          <div
            className="absolute top-0 h-3 w-px bg-[var(--ink-3)]"
            style={{ left: `${classicPct}%` }}
            title={`Trinity Study ${formatPct(SWR)}`}
          />
          <div
            className="absolute top-0 h-3 w-px bg-horizon-400"
            style={{ left: `${nlSwrPct}%` }}
            title={`NL standaard ${formatPct(NL_SWR)}`}
          />
        </div>

        {/* Legend row */}
        <div className="flex items-center justify-between text-[10px]">
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-[var(--ink-3)]" />
            <span className="text-[var(--ink-3)]">Trinity <span className="font-mono tabular-nums">{formatPct(SWR)}</span></span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-horizon-400" />
            <span className="text-[var(--ink-3)]">NL standaard <span className="font-mono tabular-nums">{formatPct(NL_SWR)}</span></span>
          </div>
        </div>

        <div className="border-t border-dashed border-[var(--border-ed)]" />

        {/* Scenario comparison */}
        <div>
          <p className="text-[10px] uppercase tracking-wide text-[var(--ink-3)] mb-1.5">Rendement scenario&apos;s</p>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--ink-2)]">Pessimistisch ({formatPct(grossReturn - 0.01, 0)})</span>
              <span className={`font-mono text-xs tabular-nums ${swrPessimistic < 0.02 ? 'text-negative' : 'text-[var(--ink)]'}`}>
                {formatPct(swrPessimistic)} → {(1 / swrPessimistic).toFixed(1)}×
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--ink)]">Huidig ({formatPct(grossReturn, 0)})</span>
              <span className={`font-mono text-xs font-medium tabular-nums ${status.color}`}>
                {formatPct(effectiveSwr)} → {multiplier.toFixed(1)}×
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--ink-2)]">Optimistisch ({formatPct(grossReturn + 0.01, 0)})</span>
              <span className="font-mono text-xs tabular-nums text-positive">
                {formatPct(swrOptimistic)} → {(1 / swrOptimistic).toFixed(1)}×
              </span>
            </div>
          </div>
        </div>

        <div className="border-t border-dashed border-[var(--border-ed)]" />

        {/* Passief inkomen op SWR — perspectief-bewust portfolio */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-[var(--ink-3)]">Passief inkomen/mnd</p>
          <span className="font-mono text-sm font-semibold tabular-nums text-[var(--ink)]">
            {netWorth > 0
              ? <MaskedAmount value={displayPassiveMonthly} tone="horizon" className="text-sm font-semibold" />
              : '—'}
          </span>
        </div>

        {/* Current withdrawal check */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-[var(--ink-3)]">Huidige onttrekking</p>
          <div className="flex items-center gap-1.5">
            <span className={`font-mono text-sm tabular-nums ${withdrawalSafe ? 'text-positive' : 'text-negative'}`}>
              {netWorth > 0 ? formatPct(actualWithdrawal) : '—'}
            </span>
            {netWorth > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${withdrawalSafe ? 'bg-positive/10 text-positive' : 'bg-negative/10 text-negative'}`}>
                {withdrawalSafe ? '✓ OK' : '⚠ Te hoog'}
              </span>
            )}
          </div>
        </div>
      </div>
    </WidgetShell>
  )
})
