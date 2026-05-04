'use client'

import { memo } from 'react'
import { WidgetShell } from './widget-shell'
import { WidgetEmpty } from './widget-empty'
import type { WidgetSize } from '@/lib/widget-catalog'
import { calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'
import { MaskedAmount } from '@/components/app/masked-amount'
import type { DashboardData } from './widget-renderer'
import { TrendingUp, ShoppingCart, PiggyBank, CreditCard } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'

type BudgetType = 'income' | 'expense' | 'savings' | 'debt'

interface Props {
  budgetType: BudgetType
  size: WidgetSize
  data: DashboardData
  href?: string
}

interface TypeConfig {
  kicker: string
  icon: LucideIcon
  strokeColor: string
  fillColor: string
  iconBg: string
  iconText: string
  emptyMessage: string
}

const TYPE_CONFIGS: Record<BudgetType, TypeConfig> = {
  income: {
    kicker: 'Inkomentrend',
    icon: TrendingUp,
    strokeColor: 'var(--color-income-500)',
    fillColor: 'var(--color-income-100)',
    iconBg: 'bg-income-50',
    iconText: 'text-income-600',
    emptyMessage: 'Nog geen inkomsten geregistreerd.',
  },
  expense: {
    kicker: 'Uitgaventrend',
    icon: ShoppingCart,
    strokeColor: 'var(--color-expense-500)',
    fillColor: 'var(--color-expense-100)',
    iconBg: 'bg-expense-50',
    iconText: 'text-expense-600',
    emptyMessage: 'Nog geen uitgaven geregistreerd.',
  },
  savings: {
    kicker: 'Spaartrend',
    icon: PiggyBank,
    strokeColor: 'var(--color-savings-500)',
    fillColor: 'var(--color-savings-100)',
    iconBg: 'bg-savings-50',
    iconText: 'text-savings-600',
    emptyMessage: 'Nog geen spaartransacties geregistreerd.',
  },
  debt: {
    kicker: 'Schuldtrend',
    icon: CreditCard,
    strokeColor: 'var(--color-debt-500)',
    fillColor: 'var(--color-debt-100)',
    iconBg: 'bg-debt-50',
    iconText: 'text-debt-600',
    emptyMessage: 'Nog geen schuldaflossingen geregistreerd.',
  },
}

// ── Sparkline SVG ────────────────────────────────────────────

function formatCompact(v: number): string {
  if (v >= 10000) return `${(v / 1000).toFixed(0)}k`
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`.replace('.0k', 'k')
  return v.toFixed(0)
}

function Sparkline({
  points,
  width,
  height,
  strokeColor,
  fillColor,
  limitValue,
  hasEntered,
  showLabels = false,
}: {
  points: { month: string; value: number }[]
  width: number
  height: number
  strokeColor: string
  fillColor: string
  limitValue?: number
  hasEntered: boolean
  showLabels?: boolean
}) {
  if (points.length < 2) return null

  const values = points.map(p => p.value)
  const allValues = limitValue != null ? [...values, limitValue] : values
  const max = Math.max(...allValues)
  const min = Math.min(0, ...allValues)
  const range = max - min || 1
  const labelPadX = showLabels ? 28 : 0
  const pad = 2

  const toX = (i: number) => pad + (i / (points.length - 1)) * (width - pad * 2 - labelPadX)
  const toY = (v: number) => height - pad - ((v - min) / range) * (height - pad * 2)

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(p.value).toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L${toX(points.length - 1).toFixed(1)},${height} L${toX(0).toFixed(1)},${height} Z`

  const firstVal = points[0].value
  const lastVal = points[points.length - 1].value
  const fontSize = height >= 50 ? 8 : 7

  // Clamp label Y so it stays within the SVG bounds (min fontSize from top, max height - 2 from bottom)
  const firstY = toY(firstVal)
  const lastY = toY(lastVal)
  const startLabelY = Math.max(fontSize + 1, Math.min(firstY - 4, height - 2))
  // End label: position beside the line endpoint, clamped to bounds
  const endLabelY = Math.max(fontSize + 1, Math.min(lastY + 3, height - 2))

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} className="block">
      {/* Gradient fill under line */}
      <path
        d={areaPath}
        fill={fillColor}
        opacity={hasEntered ? 0.4 : 0}
        style={{ transition: 'opacity 600ms ease' }}
      />
      {/* Line */}
      <path
        d={linePath}
        fill="none"
        stroke={strokeColor}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={hasEntered ? 0 : 1}
        style={{ transition: 'stroke-dashoffset 800ms cubic-bezier(.22,1,.36,1)' }}
      />
      {/* Budget limit reference line */}
      {limitValue != null && limitValue > 0 && (
        <line
          x1={pad}
          y1={toY(limitValue)}
          x2={width - pad}
          y2={toY(limitValue)}
          stroke="var(--ink-4)"
          strokeWidth={0.75}
          strokeDasharray="3 2"
          opacity={hasEntered ? 0.5 : 0}
          style={{ transition: 'opacity 600ms ease 300ms' }}
        />
      )}
      {/* Start and end value labels */}
      {showLabels && hasEntered && (
        <>
          <text
            x={toX(0)}
            y={startLabelY}
            fontSize={fontSize}
            fill="var(--ink-3)"
            fontFamily="var(--font-mono)"
            textAnchor="start"
          >
            {formatCompact(firstVal)}
          </text>
          <text
            x={toX(points.length - 1) + 4}
            y={endLabelY}
            fontSize={fontSize}
            fill={strokeColor}
            fontFamily="var(--font-mono)"
            fontWeight={600}
            textAnchor="start"
          >
            {formatCompact(lastVal)}
          </text>
        </>
      )}
    </svg>
  )
}

// ── Main component ───────────────────────────────────────────

export const BudgetTrendWidget = memo(function BudgetTrendWidget({ budgetType, size, data, href }: Props) {
  const config = TYPE_CONFIGS[budgetType]
  const history = data.budgetTypeHistory[budgetType]
  const { ref: inViewRef, hasEntered } = useInViewAnimation({ duration: 600 })
  const { icon: Icon } = config

  if (!history || history.length === 0) {
    return (
      <WidgetShell module="kern" size={size} kicker={config.kicker} href={href}>
        <WidgetEmpty icon={config.icon} message={config.emptyMessage} />
      </WidgetShell>
    )
  }

  // Current and previous month values
  const current = history[history.length - 1]
  const prev = history.length >= 2 ? history[history.length - 2] : null
  const momDelta = prev && prev.value > 0
    ? ((current.value - prev.value) / prev.value) * 100
    : null
  const isUp = momDelta != null && momDelta > 0

  // Budget limit for this type (for reference line in full)
  const budgetLimit = data.budgetTotals[budgetType].limit

  // Sparkline data slicing
  const sparkData6 = history.slice(-6)
  const sparkData12 = history.slice(-12)

  // Averages
  const avg = (arr: { value: number }[]) =>
    arr.length > 0 ? arr.reduce((s, p) => s + p.value, 0) / arr.length : 0
  const avg3m = avg(history.slice(-3))
  const avg6m = avg(history.slice(-6))

  // Freedom time for full size
  const dailyExp = data.monthlyExpenses / 30
  const monthAvg = avg(history)
  const freedomTime = dailyExp > 0 && monthAvg > 0
    ? calculateFreedomTime(monthAvg, dailyExp)
    : null
  const freedomStr = freedomTime ? formatFreedomTimeString(freedomTime, 'short') : null

  // ── Mini ─────────────────────────────────────────────────
  if (size === 'mini') {
    const trendColor = momDelta != null
      ? (isUp ? 'text-positive' : 'text-negative')
      : 'text-[var(--ink)]'
    const trendArrow = momDelta != null ? (isUp ? '↑ ' : '↓ ') : ''

    return (
      <WidgetShell module="kern" size="mini" kicker={config.kicker} href={href}>
        <p className={`leading-none truncate ${trendColor}`}>
          <span className="font-mono">{trendArrow}</span>
          <MaskedAmount value={current.value} tone="kern" className="text-[15px] font-semibold" />
        </p>
      </WidgetShell>
    )
  }

  // ── Quarter ────────────────────────────────────────────────
  if (size === 'quarter') {
    return (
      <WidgetShell module="kern" size={size} kicker={config.kicker} href={href}>
        <div ref={inViewRef} className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[var(--r-sm)] ${config.iconBg}`}>
              <Icon className={config.iconText} size={9} strokeWidth={2} />
            </div>
            <span className="text-[var(--ink)]">
              <MaskedAmount value={current.value} tone="kern" className="text-lg font-semibold" />
            </span>
          </div>

          {/* Trend indicator */}
          {momDelta != null && (
            <p className={`text-[11px] font-medium ${isUp ? 'text-positive' : 'text-negative'}`}>
              {isUp ? '↑' : '↓'} {Math.abs(momDelta).toFixed(0)}% vs vorige maand
            </p>
          )}

          {/* Mini sparkline */}
          {sparkData6.length >= 2 && (
            <div className="mt-auto">
              <Sparkline
                points={sparkData6}
                width={140}
                height={28}
                strokeColor={config.strokeColor}
                fillColor={config.fillColor}
                hasEntered={hasEntered}
                showLabels
              />
            </div>
          )}
        </div>
      </WidgetShell>
    )
  }

  // ── Half ───────────────────────────────────────────────────
  if (size === 'half') {
    return (
      <WidgetShell module="kern" size={size} kicker={config.kicker} href={href}>
        <div ref={inViewRef} className="flex flex-col gap-1.5 h-full">
          {/* Header: current + delta */}
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[var(--ink)]">
              <MaskedAmount value={current.value} tone="kern" className="text-lg font-semibold" />
            </span>
            {momDelta != null && (
              <span className={`text-[11px] font-medium ${isUp ? 'text-positive' : 'text-negative'}`}>
                {isUp ? '↑' : '↓'} {Math.abs(momDelta).toFixed(0)}%
              </span>
            )}
          </div>

          {/* Sparkline */}
          {sparkData6.length >= 2 && (
            <div className="flex-1 min-h-0">
              <Sparkline
                points={sparkData6}
                width={220}
                height={40}
                strokeColor={config.strokeColor}
                fillColor={config.fillColor}
                hasEntered={hasEntered}
                showLabels
              />
            </div>
          )}

          {/* Monthly average */}
          <p className="font-serif italic text-[11px] text-[var(--ink-3)]">
            Gem. <MaskedAmount value={avg6m} tone="kern" />/maand
          </p>
        </div>
      </WidgetShell>
    )
  }

  // ── Full ───────────────────────────────────────────────────
  return (
    <WidgetShell module="kern" size={size} kicker={config.kicker} href={href}>
      <div ref={inViewRef} className="flex flex-col gap-2 h-full">
        {/* Header: current + delta */}
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[var(--ink)]">
            <MaskedAmount value={current.value} tone="kern" className="text-xl font-semibold" />
          </span>
          {momDelta != null && (
            <span className={`text-xs font-medium ${isUp ? 'text-positive' : 'text-negative'}`}>
              {isUp ? '↑' : '↓'} {Math.abs(momDelta).toFixed(0)}% vs vorige maand
            </span>
          )}
        </div>

        {/* 12-month sparkline with budget reference line */}
        {sparkData12.length >= 2 && (
          <div className="flex-1 min-h-0">
            <Sparkline
              points={sparkData12}
              width={300}
              height={60}
              strokeColor={config.strokeColor}
              fillColor={config.fillColor}
              limitValue={budgetLimit > 0 ? budgetLimit : undefined}
              hasEntered={hasEntered}
              showLabels
            />
          </div>
        )}

        {/* Divider */}
        <div className="border-t border-dashed border-[var(--border-ed)]" />

        {/* Averages + freedom time */}
        <div className="flex items-end justify-between gap-2">
          <div className="space-y-0.5">
            <p className="text-[10px] text-[var(--ink-3)]">
              <span className="font-semibold">3m</span> <MaskedAmount value={avg3m} tone="kern" />
              <span className="mx-1.5 text-[var(--border-md)]">·</span>
              <span className="font-semibold">6m</span> <MaskedAmount value={avg6m} tone="kern" />
            </p>
            {budgetLimit > 0 && (
              <p className="text-[10px] text-[var(--ink-4)]">
                Budget: <MaskedAmount value={budgetLimit} tone="kern" />/maand
              </p>
            )}
          </div>
          {freedomStr && (
            <p className="font-serif italic text-[11px] text-[var(--ink-3)] text-right">
              ‰ˆ {freedomStr}/maand
            </p>
          )}
        </div>
      </div>
    </WidgetShell>
  )
})
