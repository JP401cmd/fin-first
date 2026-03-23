import { memo } from 'react'
import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData } from './widget-renderer'
import { BOX3_DRAG } from '@/lib/constants'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

// Trinity Study classic SWR
const CLASSIC_SWR = 0.04
// NL SWR (default, pre-tax-adjusted)
const NL_SWR_DEFAULT = 0.02883

function swrStatus(swr: number): { color: string; label: string; bg: string } {
  if (swr >= 0.04) return { color: 'text-emerald-600', label: 'Veilig', bg: 'bg-emerald-100' }
  if (swr >= 0.03) return { color: 'text-emerald-600', label: 'Goed', bg: 'bg-emerald-50' }
  if (swr >= 0.02) return { color: 'text-amber-600', label: 'Matig', bg: 'bg-amber-50' }
  return { color: 'text-red-600', label: 'Krap', bg: 'bg-red-50' }
}

function formatPct(value: number, decimals = 2): string {
  return (value * 100).toFixed(decimals) + '%'
}

export const SwrMonitorWidget = memo(function SwrMonitorWidget({ size, data, href }: Props) {
  const { grossReturn, inflationRate, netWorth, monthlyExpenses, fireTarget } = data

  // Effective SWR from user's parameters
  const effectiveSwr = Math.max(0.001, grossReturn - BOX3_DRAG - inflationRate)

  // Actual withdrawal rate: what the user would withdraw per year
  const yearlyExpenses = monthlyExpenses * 12
  const actualWithdrawal = netWorth > 0 ? yearlyExpenses / netWorth : 0

  const status = swrStatus(effectiveSwr)

  // ── Mini: SWR percentage ──────────────────────────────────
  if (size === 'mini') {
    return (
      <WidgetShell module="horizon" size="mini" kicker="SWR Monitor" href={href}>
        <p className={`font-mono text-[15px] font-semibold tabular-nums leading-none truncate ${status.color}`}>
          {formatPct(effectiveSwr)}
        </p>
      </WidgetShell>
    )
  }

  // ── Quarter: SWR + status indicator ───────────────────────
  if (size === 'quarter') {
    return (
      <WidgetShell module="horizon" size={size} kicker="SWR Monitor" href={href}>
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
    const classicPct = (CLASSIC_SWR / gaugeMax) * 100
    const nlSwrPct = (NL_SWR_DEFAULT / gaugeMax) * 100

    return (
      <WidgetShell module="horizon" size={size} kicker="SWR Monitor" href={href}>
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
        <div className="relative h-2.5 w-full rounded-full bg-[var(--subtle)] overflow-visible mb-3">
          <div
            className={`h-full rounded-full ${effectiveSwr >= 0.03 ? 'bg-emerald-400' : effectiveSwr >= 0.02 ? 'bg-amber-400' : 'bg-red-400'}`}
            style={{ width: `${swrPct}%` }}
          />
          {/* Trinity Study marker */}
          <div
            className="absolute top-0 h-2.5 w-px bg-[var(--ink-3)]"
            style={{ left: `${classicPct}%` }}
            title="Trinity Study 4%"
          />
          {/* NL SWR marker */}
          <div
            className="absolute top-0 h-2.5 w-px bg-horizon-400"
            style={{ left: `${nlSwrPct}%` }}
            title="NL standaard 2.88%"
          />
        </div>

        {/* Legend */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-[var(--ink-3)]" />
            <span className="text-[10px] text-[var(--ink-3)]">Trinity Study</span>
            <span className="font-mono text-[10px] tabular-nums text-[var(--ink-2)]">{formatPct(CLASSIC_SWR)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-horizon-400" />
            <span className="text-[10px] text-[var(--ink-3)]">NL standaard</span>
            <span className="font-mono text-[10px] tabular-nums text-[var(--ink-2)]">{formatPct(NL_SWR_DEFAULT)}</span>
          </div>
        </div>
      </WidgetShell>
    )
  }

  // ── Full: SWR + scenarios + impact ────────────────────────
  const gaugeMax = 0.06
  const swrPct = Math.min(effectiveSwr / gaugeMax, 1) * 100
  const classicPct = (CLASSIC_SWR / gaugeMax) * 100
  const nlSwrPct = (NL_SWR_DEFAULT / gaugeMax) * 100

  // FIRE multiplier = 1 / SWR
  const multiplier = 1 / effectiveSwr

  // Scenario: what if return changes ±1%
  const swrOptimistic = Math.max(0.001, (grossReturn + 0.01) - BOX3_DRAG - inflationRate)
  const swrPessimistic = Math.max(0.001, (grossReturn - 0.01) - BOX3_DRAG - inflationRate)

  // Years until safe if currently over-withdrawing
  const withdrawalSafe = actualWithdrawal <= effectiveSwr

  return (
    <WidgetShell module="horizon" size={size} kicker="SWR Monitor" href={href}>
      <div className="space-y-2">
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
          </div>
        </div>

        {/* Gauge bar with markers */}
        <div className="relative h-3 w-full rounded-full bg-[var(--subtle)] overflow-visible">
          <div
            className={`h-full rounded-full ${effectiveSwr >= 0.03 ? 'bg-emerald-400' : effectiveSwr >= 0.02 ? 'bg-amber-400' : 'bg-red-400'}`}
            style={{ width: `${swrPct}%` }}
          />
          <div className="absolute top-0 h-3 w-px bg-[var(--ink-3)]" style={{ left: `${classicPct}%` }} />
          <div className="absolute top-0 h-3 w-px bg-horizon-400" style={{ left: `${nlSwrPct}%` }} />
        </div>

        {/* Legend row */}
        <div className="flex items-center justify-between text-[10px]">
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-[var(--ink-3)]" />
            <span className="text-[var(--ink-3)]">Trinity <span className="font-mono tabular-nums">{formatPct(CLASSIC_SWR)}</span></span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-horizon-400" />
            <span className="text-[var(--ink-3)]">NL standaard <span className="font-mono tabular-nums">{formatPct(NL_SWR_DEFAULT)}</span></span>
          </div>
        </div>

        <div className="border-t border-dashed border-[var(--border-ed)]" />

        {/* Scenario comparison */}
        <div>
          <p className="text-[10px] uppercase tracking-wide text-[var(--ink-3)] mb-1.5">Rendement scenario&apos;s</p>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--ink-2)]">Pessimistisch ({formatPct(grossReturn - 0.01, 0)})</span>
              <span className={`font-mono text-xs tabular-nums ${swrPessimistic < 0.02 ? 'text-red-600' : 'text-[var(--ink)]'}`}>
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
              <span className="font-mono text-xs tabular-nums text-emerald-600">
                {formatPct(swrOptimistic)} → {(1 / swrOptimistic).toFixed(1)}×
              </span>
            </div>
          </div>
        </div>

        <div className="border-t border-dashed border-[var(--border-ed)]" />

        {/* Current withdrawal check */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-[var(--ink-3)]">Huidige onttrekking</p>
          <div className="flex items-center gap-1.5">
            <span className={`font-mono text-sm tabular-nums ${withdrawalSafe ? 'text-emerald-600' : 'text-red-600'}`}>
              {netWorth > 0 ? formatPct(actualWithdrawal) : '—'}
            </span>
            {netWorth > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${withdrawalSafe ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                {withdrawalSafe ? '✓ OK' : '⚠ Te hoog'}
              </span>
            )}
          </div>
        </div>
      </div>
    </WidgetShell>
  )
})
