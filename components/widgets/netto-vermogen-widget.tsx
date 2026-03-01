'use client'

import { useMemo } from 'react'
import { WidgetShell } from './widget-shell'
import { WidgetEmpty } from './widget-empty'
import type { WidgetSize } from '@/lib/widget-catalog'
import { formatCurrency, formatFreedomTimeString, calculateFreedomTime } from '@/lib/format'
import type { DashboardData } from './widget-renderer'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { Wallet } from 'lucide-react'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

const SVG_W = 200

export function NettoVermogenWidget({ size, data, href }: Props) {
  const { netWorth, monthlyExpenses, monthlyIncome, monthlyContributions, netWorthHistory } = data

  // Empty state: no assets or income data at all
  const isEmpty = netWorth === 0 && monthlyIncome === 0 && netWorthHistory.length === 0

  const dailyExp = monthlyExpenses / 30
  const freedomTime = dailyExp > 0 ? calculateFreedomTime(Math.abs(netWorth), dailyExp) : null
  const freedomStr = freedomTime ? formatFreedomTimeString(freedomTime, 'short') : null

  // SVG height varies by widget size: taller for full, compact for half
  const SVG_H = size === 'full' ? 48 : 36

  const { ref, hasEntered } = useInViewAnimation({ duration: 1000 })

  // Monthly growth rate for forecast: use 3-month trailing average if available,
  // otherwise fall back to monthlyContributions or (income - expenses)
  const monthlyGrowthRate = useMemo(() => {
    if (netWorthHistory.length >= 3) {
      const last = netWorthHistory.slice(-3)
      const totalChange = last[last.length - 1].value - last[0].value
      return totalChange / (last.length - 1)
    }
    if (monthlyContributions > 0) return monthlyContributions
    return monthlyIncome - monthlyExpenses
  }, [netWorthHistory, monthlyContributions, monthlyIncome, monthlyExpenses])

  const sparkline = useMemo(() => {
    // Build historical data ending at current net worth
    const histValues = netWorthHistory.map(h => h.value)
    const histData = [...histValues, netWorth]

    // Only show sparkline with at least 2 historical points
    if (histData.length < 2) return null

    // Build 6-month forecast from current net worth
    const forecastData: number[] = [netWorth]
    for (let i = 1; i <= 6; i++) {
      forecastData.push(netWorth + monthlyGrowthRate * i)
    }

    // Combined scale across both phases
    const allValues = [...histData, ...forecastData.slice(1)]
    const maxVal = Math.max(...allValues)
    const minVal = Math.min(...allValues, 0)
    const range = maxVal - minVal || 1

    const pad = { top: 5, bottom: 8, left: 0, right: 0 }
    const chartH = SVG_H - pad.top - pad.bottom
    const chartW = SVG_W - pad.left - pad.right

    // Total slots: hist points + 6 forecast points (they share the "now" point)
    const totalSlots = histData.length + 6
    const toX = (i: number) => pad.left + (i / (totalSlots - 1)) * chartW
    const toY = (v: number) => pad.top + chartH - ((v - minVal) / range) * chartH

    // Historical coordinates (index 0 … histData.length-1)
    const histPts = histData.map((v, i) => ({ x: toX(i), y: toY(v) }))

    // Forecast coordinates (index histData.length-1 … histData.length-1+6)
    const forecastStart = histData.length - 1
    const forecastPts = forecastData.map((v, i) => ({
      x: toX(forecastStart + i),
      y: toY(v),
    }))

    const makePath = (pts: { x: number; y: number }[]) =>
      pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ')

    const histPath = makePath(histPts)
    const forecastPath = makePath(forecastPts)
    const histFill =
      `${histPath} L ${histPts[histPts.length - 1].x.toFixed(2)} ${(pad.top + chartH).toFixed(2)}` +
      ` L ${histPts[0].x.toFixed(2)} ${(pad.top + chartH).toFixed(2)} Z`

    const currentX = histPts[histPts.length - 1].x
    const currentDotX = histPts[histPts.length - 1].x
    const currentDotY = histPts[histPts.length - 1].y

    return { histPath, forecastPath, histFill, currentX, currentDotX, currentDotY, pad, chartH }
  }, [netWorthHistory, netWorth, monthlyGrowthRate, SVG_H])

  // Show axis labels only for full-size widgets (half-size is too compact)
  const showAxisLabels = size === 'full' && sparkline !== null

  if (isEmpty) {
    return (
      <WidgetShell module="kern" size={size} kicker="Netto Vermogen" href={href}>
        <WidgetEmpty icon={Wallet} message="Voeg vermogen of bankrekeningen toe om je netto vermogen te zien." />
      </WidgetShell>
    )
  }

  return (
    <WidgetShell module="kern" size={size} kicker="Netto Vermogen" href={href}>
      <div ref={ref}>
        <p className="font-mono text-2xl font-semibold tabular-nums text-[var(--ink)]">
          {formatCurrency(netWorth)}
        </p>
        {freedomStr && (
          <p className="mt-1 font-serif italic text-[12px] text-[var(--ink-3)]">
            ≈ {freedomStr} vrijheid
          </p>
        )}

        {/* Sparkline — 12m historisch + 6m prognose */}
        {sparkline && (
          <div className="mt-3">
            <svg
              width="100%"
              viewBox={`0 0 ${SVG_W} ${SVG_H}`}
              preserveAspectRatio="none"
              style={{ display: 'block' }}
              aria-hidden="true"
            >
              {/* Fill under historical line */}
              <path
                d={sparkline.histFill}
                fill="var(--kern-t)"
                fillOpacity={hasEntered ? 0.08 : 0}
                style={{
                  transition: hasEntered ? 'fill-opacity 200ms ease-out 325ms' : 'none',
                }}
              />

              {/* Historical line — draws left-to-right */}
              <path
                d={sparkline.histPath}
                fill="none"
                stroke="var(--kern-t)"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={hasEntered ? undefined : 1}
                style={{
                  animation: hasEntered ? 'drawPath 500ms cubic-bezier(.22,1,.36,1) both' : 'none',
                }}
              />

              {/* Vertical divider at "now" — appears after historical line */}
              <line
                x1={sparkline.currentX}
                y1={sparkline.pad.top}
                x2={sparkline.currentX}
                y2={sparkline.pad.top + sparkline.chartH}
                stroke="var(--border-md)"
                strokeWidth={1}
                strokeDasharray="2 2"
                strokeOpacity={hasEntered ? 1 : 0}
                style={{
                  transition: hasEntered ? 'stroke-opacity 80ms ease-out 455ms' : 'none',
                }}
              />

              {/* Forecast line — fades in as dashed hor-t path */}
              <path
                d={sparkline.forecastPath}
                fill="none"
                stroke="var(--hor-t)"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="4 3"
                strokeOpacity={hasEntered ? 0.7 : 0}
                style={{
                  transition: hasEntered ? 'stroke-opacity 400ms ease-out 550ms' : 'none',
                }}
              />

              {/* Endpoint dot — current net worth position */}
              <circle
                cx={sparkline.currentDotX}
                cy={sparkline.currentDotY}
                r={3}
                fill="var(--kern-t)"
                opacity={hasEntered ? 1 : 0}
                style={{
                  transition: hasEntered ? 'opacity 80ms ease-out 500ms' : 'none',
                }}
              />
            </svg>

            {showAxisLabels && (
              <div className="flex justify-between mt-1">
                <span className="font-mono text-[9px] tabular-nums" style={{ color: 'var(--ink-4)' }}>
                  12m geleden
                </span>
                <span className="font-mono text-[9px] tabular-nums" style={{ color: 'var(--hor-t)' }}>
                  +6m prognose
                </span>
              </div>
            )}
          </div>
        )}

        <p className="mt-2 text-xs text-[var(--ink-3)]">
          Vermogen min schulden
        </p>
      </div>
    </WidgetShell>
  )
}
