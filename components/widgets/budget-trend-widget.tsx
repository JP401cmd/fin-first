'use client'

import { WidgetShell } from './widget-shell'
import { WidgetEmpty } from './widget-empty'
import type { WidgetSize } from '@/lib/widget-catalog'
import { formatCurrency, calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'
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

function Sparkline({
  points,
  width,
  height,
  strokeColor,
  fillColor,
  limitValue,
  hasEntered,
}: {
  points: { month: string; value: number }[]
  width: number
  height: number
  strokeColor: string
  fillColor: string
  limitValue?: number
  hasEntered: boolean
}) {
  if (points.length < 2) return null

  const values = points.map(p => p.value)
  const allValues = limitValue != null ? [...values, limitValue] : values
  const max = Math.max(...allValues)
  const min = Math.min(0, ...allValues)
  const range = max - min || 1
  const pad = 2

  const toX = (i: number) => pad + (i / (points.length - 1)) * (width - pad * 2)
  const toY = (v: number) => height - pad - ((v - min) / range) * (height - pad * 2)

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(p.value).toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L${toX(points.length - 1).toFixed(1)},${height} L${toX(0).toFixed(1)},${height} Z`

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
    </svg>
  )
}

// ── Main component ───────────────────────────────────────────

export function BudgetTrendWidget({ budgetType, size, data, href }: Props) {
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
      ? (isUp ? 'text-emerald-600' : 'text-red-600')
      : 'text-[var(--ink)]'
    const trendArrow = momDelta != null ? (isUp ? '↑ ' : '↓ ') : ''

    return (
      <WidgetShell module="kern" size="mini" kicker={config.kicker} href={href}>
        <p className={`font-mono text-[15px] font-semibold tabular-nums leading-none truncate ${trendColor}`}>
          {trendArrow}{formatCurrency(current.value)}
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
            <span className="font-mono text-lg font-semibold tabular-nums text-[var(--ink)]">
              {formatCurrency(current.value)}
            </span>
          </div>

          {/* Trend indicator */}
          {momDelta != null && (
            <p className={`text-[11px] font-medium ${isUp ? 'text-emerald-600' : 'text-red-500'}`}>
              {isUp ? '↑' : '↓'} {Math.abs(momDelta).toFixed(0)}% vs vorige maand
            </p>
          )}

          {/* Mini sparkline */}
          {sparkData6.length >= 2 && (
            <div className="mt-auto">
              <Sparkline
                points={sparkData6}
                width={120}
                height={24}
                strokeColor={config.strokeColor}
                fillColor={config.fillColor}
                hasEntered={hasEntered}
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
            <span className="font-mono text-lg font-semibold tabular-nums text-[var(--ink)]">
              {formatCurrency(current.value)}
            </span>
            {momDelta != null && (
              <span className={`text-[11px] font-medium ${isUp ? 'text-emerald-600' : 'text-red-500'}`}>
                {isUp ? '↑' : '↓'} {Math.abs(momDelta).toFixed(0)}%
              </span>
            )}
          </div>

          {/* Sparkline */}
          {sparkData6.length >= 2 && (
            <div className="flex-1 min-h-0">
              <Sparkline
                points={sparkData6}
                width={200}
                height={40}
                strokeColor={config.strokeColor}
                fillColor={config.fillColor}
                hasEntered={hasEntered}
              />
            </div>
          )}

          {/* Monthly average */}
          <p className="font-serif italic text-[11px] text-[var(--ink-3)]">
            Gem. {formatCurrency(avg6m)}/maand
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
          <span className="font-mono text-xl font-semibold tabular-nums text-[var(--ink)]">
            {formatCurrency(current.value)}
          </span>
          {momDelta != null && (
            <span className={`text-xs font-medium ${isUp ? 'text-emerald-600' : 'text-red-500'}`}>
              {isUp ? '↑' : '↓'} {Math.abs(momDelta).toFixed(0)}% vs vorige maand
            </span>
          )}
        </div>

        {/* 12-month sparkline with budget reference line */}
        {sparkData12.length >= 2 && (
          <div className="flex-1 min-h-0">
            <Sparkline
              points={sparkData12}
              width={280}
              height={60}
              strokeColor={config.strokeColor}
              fillColor={config.fillColor}
              limitValue={budgetLimit > 0 ? budgetLimit : undefined}
              hasEntered={hasEntered}
            />
          </div>
        )}

        {/* Divider */}
        <div className="border-t border-dashed border-[var(--border-ed)]" />

        {/* Averages + freedom time */}
        <div className="flex items-end justify-between gap-2">
          <div className="space-y-0.5">
            <p className="text-[10px] text-[var(--ink-3)]">
              <span className="font-semibold">3m</span> {formatCurrency(avg3m)}
              <span className="mx-1.5 text-[var(--border-md)]">·</span>
              <span className="font-semibold">6m</span> {formatCurrency(avg6m)}
            </p>
            {budgetLimit > 0 && (
              <p className="text-[10px] text-[var(--ink-4)]">
                Budget: {formatCurrency(budgetLimit)}/maand
              </p>
            )}
          </div>
          {freedomStr && (
            <p className="font-serif italic text-[11px] text-[var(--ink-3)] text-right">
              ≈ {freedomStr}/maand
            </p>
          )}
        </div>
      </div>
    </WidgetShell>
  )
}
