import { memo } from 'react'
import { WidgetShell } from './widget-shell'
import { WidgetEmpty } from './widget-empty'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData } from './widget-renderer'
import { formatCurrency } from '@/lib/format'
import { TrendingUp } from 'lucide-react'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

/** Dutch labels for investment asset types */
const ASSET_LABELS: Record<string, string> = {
  investment: 'Beleggingen',
  retirement: 'Pensioen',
  crypto: 'Crypto',
}

/** Investment-type asset categories */
const INVESTMENT_TYPES = ['investment', 'retirement', 'crypto']

/** Builds SVG sparkline path strings from net worth history data */
function buildSparklinePaths(
  history: { month: string; value: number }[],
  width: number,
  height: number,
) {
  if (history.length < 2) return null

  const values = history.map(h => h.value)
  const minVal = Math.min(...values)
  const maxVal = Math.max(...values)
  const range = maxVal - minVal || 1

  const points = values.map((v, i) => ({
    x: (i / (values.length - 1)) * width,
    y: height - ((v - minVal) / range) * height,
  }))

  const lineD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ')

  const fillD = lineD + ` L${width},${height} L0,${height} Z`

  return { lineD, fillD }
}

export const BeleggingsrendementWidget = memo(function BeleggingsrendementWidget({ size, data, href }: Props) {
  const investmentAssets = data.assetsByType.filter(a => INVESTMENT_TYPES.includes(a.type))
  const totalInvestmentValue = investmentAssets.reduce((s, a) => s + a.value, 0)
  const totalInvestmentCost = investmentAssets.reduce((s, a) => s + a.purchaseValue, 0)

  // Since-inception return
  const sinceInceptionReturn = totalInvestmentCost > 0
    ? ((totalInvestmentValue - totalInvestmentCost) / totalInvestmentCost) * 100
    : 0
  const sinceInceptionAbsolute = totalInvestmentValue - totalInvestmentCost

  // Expected annual return from profile
  const expectedReturn = (data.grossReturn || 0.07) * 100

  // Color based on positive/negative return
  const returnColor = sinceInceptionReturn >= 0 ? 'text-positive' : 'text-negative'
  const sparklineStroke = sinceInceptionReturn >= 0 ? 'var(--positive)' : 'var(--negative)'

  // Empty state: no investment assets at all
  if (investmentAssets.length === 0) {
    return (
      <WidgetShell module="kern" size={size} kicker="Rendement" href={href}>
        <WidgetEmpty icon={TrendingUp} message="Voeg beleggingen toe om je rendement te volgen." />
      </WidgetShell>
    )
  }

  // Format return sign prefix
  const signPrefix = sinceInceptionReturn >= 0 ? '+' : ''

  // ── Mini: since-inception return % ────────────────────────────
  if (size === 'mini') {
    return (
      <WidgetShell module="kern" size="mini" kicker="Rendement" href={href}>
        <p className={`font-mono text-[15px] font-semibold tabular-nums leading-none truncate ${returnColor}`}>
          {signPrefix}{sinceInceptionReturn.toFixed(1)}%
        </p>
      </WidgetShell>
    )
  }

  // ── Quarter: return % + absolute gain/loss ────────────────────
  if (size === 'quarter') {
    return (
      <WidgetShell module="kern" size={size} kicker="Beleggingsrendement" href={href}>
        <p className={`font-mono text-lg font-semibold tabular-nums ${returnColor}`}>
          {signPrefix}{sinceInceptionReturn.toFixed(1)}%
        </p>
        <p className="mt-0.5 text-xs text-[var(--ink-3)]">
          totaalrendement
        </p>
        <p className={`mt-1 font-mono text-xs tabular-nums ${returnColor}`}>
          {formatCurrency(sinceInceptionAbsolute)}
        </p>
      </WidgetShell>
    )
  }

  // ── Full: extended overview with per-asset-type breakdown ─────
  if (size === 'full') {
    const svgWidth = 300
    const svgHeight = 80
    const history = data.netWorthHistory ?? []
    const sparkline = buildSparklinePaths(history, svgWidth, svgHeight)

    return (
      <WidgetShell module="kern" size={size} kicker="Beleggingsrendement" href={href}>
        {/* Header: return % + absolute gain */}
        <div className="flex items-baseline gap-1.5">
          <p className={`font-mono text-2xl font-semibold tabular-nums ${returnColor}`}>
            {signPrefix}{sinceInceptionReturn.toFixed(1)}%
          </p>
        </div>
        <p className="mt-0.5 text-xs text-[var(--ink-3)]">
          totaalrendement &middot; {formatCurrency(sinceInceptionAbsolute)}
        </p>

        {/* Sparkline SVG */}
        {sparkline && (
          <div className="mt-3">
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              width="100%"
              className="overflow-visible"
              aria-hidden="true"
            >
              <path d={sparkline.fillD} fill={sparklineStroke} opacity={0.2} />
              <path d={sparkline.lineD} fill="none" stroke={sparklineStroke} strokeWidth={2} />
            </svg>
          </div>
        )}

        {/* Per-asset-type breakdown table */}
        <div className="mt-3">
          <p className="text-[10px] uppercase tracking-wide text-[var(--ink-4)] mb-1.5">
            Rendement per type
          </p>
          <div className="space-y-1">
            {investmentAssets.slice(0, 3).map(asset => {
              const gain = asset.value - asset.purchaseValue
              const pct = asset.purchaseValue > 0
                ? ((gain) / asset.purchaseValue) * 100
                : 0
              const rowColor = gain >= 0 ? 'text-positive' : 'text-negative'
              const label = ASSET_LABELS[asset.type] || asset.type

              return (
                <div key={asset.type} className="flex items-center justify-between text-xs">
                  <span className="text-[var(--ink-3)] w-24 truncate">{label}</span>
                  <span className="font-mono tabular-nums text-[var(--ink)]">
                    {formatCurrency(asset.value)}
                  </span>
                  <span className={`font-mono tabular-nums ${rowColor}`}>
                    {formatCurrency(gain)}
                  </span>
                  <span className={`font-mono tabular-nums w-14 text-right ${rowColor}`}>
                    {gain >= 0 ? '+' : ''}{pct.toFixed(1)}%
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Footer: expected return comparison */}
        <p className="mt-3 pt-2 border-t border-[var(--border-ed)] font-serif italic text-[11px] text-[var(--ink-3)]">
          Verwacht rendement: {expectedReturn.toFixed(1)}%/jaar
        </p>
      </WidgetShell>
    )
  }

  // ── Half: horizontal layout — left metric, right sparkline ─
  const svgWidth = 200
  const svgHeight = 60
  const history = data.netWorthHistory ?? []
  const sparkline = buildSparklinePaths(history, svgWidth, svgHeight)

  // Estimate actual annualized return from available history
  let estimatedActualReturn: number | null = null
  if (history.length >= 2) {
    const oldest = history[0].value
    const newest = history[history.length - 1].value
    const months = history.length - 1
    if (oldest > 0 && months > 0) {
      const totalGrowth = ((newest - oldest) / oldest) * 100
      estimatedActualReturn = totalGrowth * (12 / months)
    }
  }

  return (
    <WidgetShell module="kern" size={size} kicker="Beleggingsrendement" href={href}>
      <div className="flex gap-3 h-full">
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <p className={`font-mono text-xl font-semibold tabular-nums ${returnColor}`}>
            {signPrefix}{sinceInceptionReturn.toFixed(1)}%
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--ink-3)]">
            totaalrendement
          </p>
          <p className={`mt-0.5 font-mono text-[11px] tabular-nums ${returnColor}`}>
            {formatCurrency(sinceInceptionAbsolute)}
          </p>
          <div className="mt-1.5 space-y-0.5">
            <p className="font-serif italic text-[11px] text-[var(--ink-3)]">
              Verwacht: {expectedReturn.toFixed(1)}%/jr
            </p>
            {estimatedActualReturn != null && (
              <p className="font-serif italic text-[11px] text-[var(--ink-3)]">
                Werkelijk: ~{estimatedActualReturn.toFixed(1)}%
              </p>
            )}
          </div>
        </div>
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          {sparkline && (
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              width="100%"
              className="overflow-visible"
              aria-hidden="true"
            >
              <path d={sparkline.fillD} fill={sparklineStroke} opacity={0.2} />
              <path d={sparkline.lineD} fill="none" stroke={sparklineStroke} strokeWidth={2} />
            </svg>
          )}
        </div>
      </div>
    </WidgetShell>
  )
})
