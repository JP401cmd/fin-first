'use client'

import { WidgetShell } from './widget-shell'
import { WidgetEmpty } from './widget-empty'
import type { WidgetSize } from '@/lib/widget-catalog'
import { formatCurrency, calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'
import type { DashboardData } from './widget-renderer'
import { ArrowUpDown, TrendingUp, ShoppingCart, PiggyBank, CreditCard } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

// ── Category config — reuses BUDGET_TYPE_CONFIGS color pattern from budgetten-widget ──

interface CashFlowCategory {
  key:        'income' | 'expense' | 'savings' | 'debt'
  label:      string
  icon:       LucideIcon
  iconBg:     string
  iconText:   string
  labelText:  string
  barFillVar: string
}

const CATEGORIES: CashFlowCategory[] = [
  {
    key: 'income', label: 'Inkomen', icon: TrendingUp,
    iconBg: 'bg-income-50', iconText: 'text-income-600',
    labelText: 'text-income-700', barFillVar: 'var(--color-income-400)',
  },
  {
    key: 'expense', label: 'Uitgaven', icon: ShoppingCart,
    iconBg: 'bg-expense-50', iconText: 'text-expense-600',
    labelText: 'text-expense-700', barFillVar: 'var(--color-expense-400)',
  },
  {
    key: 'savings', label: 'Sparen', icon: PiggyBank,
    iconBg: 'bg-savings-50', iconText: 'text-savings-600',
    labelText: 'text-savings-700', barFillVar: 'var(--color-savings-400)',
  },
  {
    key: 'debt', label: 'Schulden', icon: CreditCard,
    iconBg: 'bg-debt-50', iconText: 'text-debt-600',
    labelText: 'text-debt-700', barFillVar: 'var(--color-debt-400)',
  },
]

// ── Category row with mini progress bar ──

interface CategoryRowProps {
  config: CashFlowCategory
  spent: number
  limit: number
  dailyExp: number
  hasEntered: boolean
}

function CategoryRow({ config, spent, limit, dailyExp, hasEntered }: CategoryRowProps) {
  const { icon: Icon, label, iconBg, iconText, labelText, barFillVar } = config
  const hasData = limit > 0
  const pct = hasData ? Math.min((spent / limit) * 100, 100) : 0

  // Freedom time for this category's spent amount
  const freedomTime = dailyExp > 0 && spent > 0
    ? calculateFreedomTime(spent, dailyExp)
    : null
  const freedomStr = freedomTime ? formatFreedomTimeString(freedomTime, 'short') : null

  return (
    <div className="space-y-1">
      {/* Icon + label + amount + freedom time */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[var(--r-sm)] ${iconBg}`}>
            <Icon className={iconText} size={9} strokeWidth={2} />
          </div>
          <span className={`text-[10px] font-bold uppercase tracking-[0.09em] ${hasData ? labelText : 'text-[var(--ink-3)]'}`}>
            {label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono tabular-nums text-xs text-[var(--ink)]">
            {formatCurrency(spent)}
          </span>
          {freedomStr && (
            <span className="font-serif italic text-[10px] text-[var(--ink-4)]">
              {freedomStr}
            </span>
          )}
        </div>
      </div>

      {/* Mini progress bar */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--border-ed)]">
        <div
          className="h-full rounded-full"
          style={{
            width: hasEntered ? `${pct}%` : '0%',
            backgroundColor: hasData ? barFillVar : 'transparent',
            transition: hasEntered ? 'width 500ms cubic-bezier(.22,1,.36,1)' : 'none',
          }}
        />
      </div>
    </div>
  )
}

// ── Comparison bar chart: this month vs previous month ──

interface ComparisonBarProps {
  label: string
  current: number
  previous: number
  color: string
  hasEntered: boolean
}

function ComparisonBar({ label, current, previous, color, hasEntered }: ComparisonBarProps) {
  const maxVal = Math.max(current, previous, 1)
  const currentPct = (current / maxVal) * 100
  const previousPct = (previous / maxVal) * 100
  const delta = previous > 0 ? ((current - previous) / previous) * 100 : 0

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">{label}</span>
        {previous > 0 && (
          <span className={`text-[10px] font-mono tabular-nums ${delta > 0 ? 'text-red-500' : delta < 0 ? 'text-emerald-600' : 'text-[var(--ink-4)]'}`}>
            {delta > 0 ? '+' : ''}{Math.round(delta)}%
          </span>
        )}
      </div>
      <div className="flex gap-1 items-end h-5">
        {/* This month */}
        <div className="flex-1 flex items-end h-full">
          <div
            className="w-full rounded-sm"
            style={{
              height: hasEntered ? `${currentPct}%` : '0%',
              backgroundColor: color,
              transition: hasEntered ? 'height 500ms cubic-bezier(.22,1,.36,1)' : 'none',
              minHeight: current > 0 ? '2px' : '0',
            }}
          />
        </div>
        {/* Previous month */}
        <div className="flex-1 flex items-end h-full">
          <div
            className="w-full rounded-sm opacity-40"
            style={{
              height: hasEntered ? `${previousPct}%` : '0%',
              backgroundColor: color,
              transition: hasEntered ? 'height 500ms cubic-bezier(.22,1,.36,1) 100ms' : 'none',
              minHeight: previous > 0 ? '2px' : '0',
            }}
          />
        </div>
      </div>
      <div className="flex gap-1 text-[9px] text-[var(--ink-4)]">
        <span className="flex-1 text-center font-mono tabular-nums">{formatCurrency(current)}</span>
        <span className="flex-1 text-center font-mono tabular-nums">{formatCurrency(previous)}</span>
      </div>
    </div>
  )
}

// ── Main widget ──

export function CashFlowWidget({ size, data, href }: Props) {
  const { monthlyIncome, monthlyExpenses, budgetTotals, prevMonthIncome, prevMonthExpenses } = data
  const cashFlow = monthlyIncome - monthlyExpenses
  const isPositive = cashFlow >= 0
  const { ref: inViewRef, hasEntered } = useInViewAnimation({ duration: 600 })

  if (monthlyIncome === 0 && monthlyExpenses === 0) {
    return (
      <WidgetShell module="kern" size={size} kicker="Cashflow Maand" href={href}>
        <WidgetEmpty icon={ArrowUpDown} message="Importeer transacties om je maandelijkse cashflow te zien." />
      </WidgetShell>
    )
  }

  const dailyExp = monthlyExpenses / 30
  const freedomDays = dailyExp > 0 && Math.abs(cashFlow) > 0
    ? Math.round(Math.abs(cashFlow) / dailyExp)
    : null
  const freedomTime = dailyExp > 0 && Math.abs(cashFlow) > 0
    ? calculateFreedomTime(Math.abs(cashFlow), dailyExp)
    : null
  const freedomStr = freedomTime ? formatFreedomTimeString(freedomTime, 'short') : null

  // ── Quarter-size: compact cashflow amount + freedom days label ──
  if (size === 'quarter') {
    return (
      <WidgetShell module="kern" size={size} kicker="Cashflow Maand" href={href}>
        <p className={`font-mono text-lg font-semibold tabular-nums ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
          {isPositive ? '+' : ''}{formatCurrency(cashFlow)}
        </p>
        {freedomDays !== null && (
          <p className="mt-1 font-serif italic text-[11px] text-[var(--ink-3)]">
            {isPositive
              ? `+${freedomDays}d vrijheid opgebouwd`
              : `${freedomDays}d vrijheid ingeleverd`}
          </p>
        )}
      </WidgetShell>
    )
  }

  // ── Half-size: income/expense breakdown ──
  if (size === 'half') {
    return (
      <WidgetShell module="kern" size={size} kicker="Cashflow Maand" href={href}>
        <p className={`font-mono text-2xl font-semibold tabular-nums ${isPositive ? 'text-[var(--ink)]' : 'text-red-600'}`}>
          {isPositive ? '+' : ''}{formatCurrency(cashFlow)}
        </p>
        {freedomStr && (
          <p className="mt-0.5 font-serif italic text-[12px] text-[var(--ink-3)]">
            {isPositive ? `+${freedomStr} vrijheid opgebouwd` : `${freedomStr} vrijheid ingeleverd`}
          </p>
        )}
        <div className="mt-2 space-y-1">
          <div className="flex justify-between text-xs text-[var(--ink-3)]">
            <span>Inkomsten</span>
            <span className="font-mono tabular-nums text-emerald-700">+{formatCurrency(monthlyIncome)}</span>
          </div>
          <div className="flex justify-between text-xs text-[var(--ink-3)]">
            <span>Uitgaven</span>
            <span className="font-mono tabular-nums text-red-600">-{formatCurrency(monthlyExpenses)}</span>
          </div>
        </div>
      </WidgetShell>
    )
  }

  // ── Full-size: categories + comparison + freedom time ──

  const prevCashFlow = prevMonthIncome - prevMonthExpenses
  const hasPrevMonth = prevMonthIncome > 0 || prevMonthExpenses > 0

  return (
    <WidgetShell module="kern" size={size} kicker="Cashflow Maand" href={href}>
      <div ref={inViewRef}>
        {/* ── Netto cashflow hero ── */}
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
              Netto cashflow
            </p>
            <p className={`font-mono tabular-nums text-2xl font-semibold ${isPositive ? 'text-[var(--ink)]' : 'text-red-600'}`}>
              {isPositive ? '+' : ''}{formatCurrency(cashFlow)}
            </p>
          </div>
          {freedomStr && (
            <p className="font-serif italic text-[12px] text-[var(--ink-3)]">
              {isPositive ? `+${freedomStr} vrijheid` : `${freedomStr} ingeleverd`}
            </p>
          )}
        </div>

        {/* ── 4 budget categories with mini progress bars ── */}
        <div className="mt-4 border-t border-dashed border-[var(--border-ed)]" />
        <div className="mt-3 flex flex-col gap-2.5">
          {CATEGORIES.map((config) => {
            const typeData = budgetTotals[config.key]
            return (
              <CategoryRow
                key={config.key}
                config={config}
                spent={typeData.spent}
                limit={typeData.limit}
                dailyExp={dailyExp}
                hasEntered={hasEntered}
              />
            )
          })}
        </div>

        {/* ── Previous month comparison barchart ── */}
        {hasPrevMonth && (
          <>
            <div className="mt-4 border-t border-dashed border-[var(--border-ed)]" />
            <div className="mt-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)] mb-2">
                Vergelijking vorige maand
              </p>
              <div className="grid grid-cols-3 gap-3">
                <ComparisonBar
                  label="Inkomen"
                  current={monthlyIncome}
                  previous={prevMonthIncome}
                  color="var(--color-income-400)"
                  hasEntered={hasEntered}
                />
                <ComparisonBar
                  label="Uitgaven"
                  current={monthlyExpenses}
                  previous={prevMonthExpenses}
                  color="var(--color-expense-400)"
                  hasEntered={hasEntered}
                />
                <ComparisonBar
                  label="Netto"
                  current={Math.max(cashFlow, 0)}
                  previous={Math.max(prevCashFlow, 0)}
                  color="var(--color-savings-400)"
                  hasEntered={hasEntered}
                />
              </div>
              {/* Legend */}
              <div className="mt-1.5 flex items-center justify-center gap-3 text-[9px] text-[var(--ink-4)]">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-sm bg-[var(--ink-3)]" /> Deze maand
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-sm bg-[var(--ink-3)] opacity-40" /> Vorige maand
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </WidgetShell>
  )
}
