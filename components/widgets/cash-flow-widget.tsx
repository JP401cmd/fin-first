'use client'

import { memo } from 'react'
import { WidgetShell } from './widget-shell'
import { WidgetEmpty } from './widget-empty'
import type { WidgetSize } from '@/lib/widget-catalog'
import { calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'
import { MaskedAmount } from '@/components/app/masked-amount'
import type { DashboardData } from './widget-renderer'
import { ArrowUpDown, TrendingUp, ShoppingCart, PiggyBank, CreditCard, Users, UserCheck } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { usePerspective } from '@/components/app/perspective-provider'

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
    <div className="space-y-0.5">
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
          <span className="text-[var(--ink)]">
            <MaskedAmount value={spent} tone="kern" className="text-xs" />
          </span>
          {freedomStr && (
            <span className="font-serif italic text-[10px] text-[var(--ink-4)]">
              {freedomStr}
            </span>
          )}
        </div>
      </div>

      {/* Mini progress bar — compact */}
      <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--border-ed)]">
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
          <span className={`text-[10px] font-mono tabular-nums ${delta > 0 ? 'text-negative' : delta < 0 ? 'text-positive' : 'text-[var(--ink-4)]'}`}>
            {delta > 0 ? '+' : ''}{Math.round(delta)}%
          </span>
        )}
      </div>
      <div className="flex gap-1 items-end h-4">
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
        <span className="flex-1 text-center">
          <MaskedAmount value={current} tone="kern" className="text-[9px]" />
        </span>
        <span className="flex-1 text-center">
          <MaskedAmount value={previous} tone="kern" className="text-[9px]" />
        </span>
      </div>
    </div>
  )
}

// ── Main widget ──

export const CashFlowWidget = memo(function CashFlowWidget({ size, data, href }: Props) {
  const { perspective, partnerName } = usePerspective()
  const isHouseholdView = perspective === 'household' && data.householdOverrides != null
  const isPartnerView = perspective === 'partner' && data.partnerOverrides != null

  // Use perspective-appropriate data overrides for the headline cashflow metrics
  const overrides = isHouseholdView ? data.householdOverrides! : isPartnerView ? data.partnerOverrides! : null
  const monthlyIncome = overrides ? overrides.monthlyIncome : data.monthlyIncome
  const monthlyExpenses = overrides ? overrides.monthlyExpenses : data.monthlyExpenses
  const { budgetTotals, prevMonthIncome, prevMonthExpenses } = data
  const cashFlow = monthlyIncome - monthlyExpenses
  const isPositive = cashFlow >= 0
  const { ref: inViewRef, hasEntered } = useInViewAnimation({ duration: 600 })

  const kickerLabel = isHouseholdView
    ? 'Cashflow Maand — Huishouden'
    : isPartnerView
      ? `Cashflow Maand — ${partnerName ?? 'Partner'}`
      : 'Cashflow Maand'

  if (monthlyIncome === 0 && monthlyExpenses === 0) {
    return (
      <WidgetShell module="kern" size={size} kicker={kickerLabel} href={href}>
        <WidgetEmpty icon={ArrowUpDown} message="Importeer transacties om je maandelijkse cashflow te zien." />
      </WidgetShell>
    )
  }

  if (size === 'mini') {
    return (
      <WidgetShell module="kern" size="mini" kicker={kickerLabel} href={href}>
        <p className={`leading-none truncate ${isPositive ? 'text-positive' : 'text-negative'}`}>
          <MaskedAmount
            value={cashFlow}
            signPrefix={isPositive ? '+' : ''}
            tone="kern"
            className="text-[15px] font-semibold"
          />
        </p>
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
      <WidgetShell module="kern" size={size} kicker={kickerLabel} href={href}>
        {(isHouseholdView || isPartnerView) && (
          <div className="mb-1 flex items-center gap-1 text-[10px] text-kern-600">
            {isPartnerView ? <UserCheck className="h-3 w-3" /> : <Users className="h-3 w-3" />}
            {isPartnerView ? (partnerName ?? 'Partner') : 'Huishouden'}
          </div>
        )}
        <p className={isPositive ? 'text-positive' : 'text-negative'}>
          <MaskedAmount
            value={cashFlow}
            signPrefix={isPositive ? '+' : ''}
            tone="kern"
            className="text-lg font-semibold"
          />
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

  // ── Half-size: horizontal layout — left cashflow, right breakdown ──
  if (size === 'half') {
    return (
      <WidgetShell module="kern" size={size} kicker={kickerLabel} href={href}>
        <div className="flex gap-3 h-full">
          <div className="flex-1 min-w-0 flex flex-col justify-center">
            {(isHouseholdView || isPartnerView) && (
              <div className="mb-1 flex items-center gap-1 text-[10px] text-kern-600">
                {isPartnerView ? <UserCheck className="h-3 w-3" /> : <Users className="h-3 w-3" />}
                {isPartnerView ? (partnerName ?? 'Partner') : 'Huishouden'}
              </div>
            )}
            <p className={isPositive ? 'text-[var(--ink)]' : 'text-negative'}>
              <MaskedAmount
                value={cashFlow}
                signPrefix={isPositive ? '+' : ''}
                tone="kern"
                className="text-xl font-semibold"
              />
            </p>
            {freedomStr && (
              <p className="mt-0.5 font-serif italic text-[11px] text-[var(--ink-3)]">
                {isPositive ? `+${freedomStr} vrijheid` : `${freedomStr} ingeleverd`}
              </p>
            )}
          </div>
          <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
            <div className="flex justify-between text-[11px] text-[var(--ink-3)]">
              <span>Inkomsten</span>
              <span className="text-positive">
                <MaskedAmount value={monthlyIncome} signPrefix="+" tone="kern" />
              </span>
            </div>
            <div className="flex justify-between text-[11px] text-[var(--ink-3)]">
              <span>Uitgaven</span>
              <span className="text-negative">
                <MaskedAmount value={monthlyExpenses} signPrefix="-" tone="kern" />
              </span>
            </div>
            <div className="border-t border-dashed border-[var(--border-ed)] pt-1 flex justify-between text-[11px]">
              <span className="text-[var(--ink-3)]">Netto</span>
              <span className={isPositive ? 'text-positive' : 'text-negative'}>
                <MaskedAmount
                  value={cashFlow}
                  signPrefix={isPositive ? '+' : ''}
                  tone="kern"
                  className="font-medium"
                />
              </span>
            </div>
          </div>
        </div>
      </WidgetShell>
    )
  }

  // ── Full-size: categories + comparison + freedom time ──

  const prevCashFlow = prevMonthIncome - prevMonthExpenses
  // Vorige-maand vergelijking is per-gebruiker historie — alleen tonen in eigen perspectief
  const hasPrevMonth = !isHouseholdView && !isPartnerView && (prevMonthIncome > 0 || prevMonthExpenses > 0)

  return (
    <WidgetShell module="kern" size={size} kicker={kickerLabel} href={href}>
      <div ref={inViewRef}>
        {(isHouseholdView || isPartnerView) && (
          <div className="mb-1.5 flex items-center gap-1 text-[11px] text-kern-600">
            {isPartnerView ? <UserCheck className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
            {isPartnerView ? (partnerName ?? 'Partner') : 'Gecombineerd huishouden'}
          </div>
        )}
        {/* ── Netto cashflow hero ── */}
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
              Netto cashflow
            </p>
            <p className={isPositive ? 'text-[var(--ink)]' : 'text-negative'}>
              <MaskedAmount
                value={cashFlow}
                signPrefix={isPositive ? '+' : ''}
                tone="kern"
                className="text-2xl font-semibold"
              />
            </p>
          </div>
          {freedomStr && (
            <p className="font-serif italic text-[12px] text-[var(--ink-3)]">
              {isPositive ? `+${freedomStr} vrijheid` : `${freedomStr} ingeleverd`}
            </p>
          )}
        </div>

        {/* ── 4 budget categories with mini progress bars ── */}
        <div className="mt-3 border-t border-dashed border-[var(--border-ed)]" />
        <div className="mt-2 flex flex-col gap-1">
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

        {/* ── Income vs Expenses summary row ── */}
        <div className="mt-2 flex items-center justify-between rounded-[var(--r-sm)] bg-[var(--subtle)] px-2.5 py-1.5">
          <div className="flex items-center gap-3 text-[11px]">
            <span className="text-positive">
              <MaskedAmount value={monthlyIncome} signPrefix="+" tone="kern" />
            </span>
            <span className="text-[var(--ink-4)]">ˆ’</span>
            <span className="text-negative">
              <MaskedAmount value={monthlyExpenses} tone="kern" />
            </span>
          </div>
          <span className={isPositive ? 'text-positive' : 'text-negative'}>
            = <MaskedAmount
              value={cashFlow}
              signPrefix={isPositive ? '+' : ''}
              tone="kern"
              className="text-[11px] font-semibold"
            />
          </span>
        </div>

        {/* ── Previous month comparison barchart ── */}
        {hasPrevMonth && (
          <>
            <div className="mt-3 border-t border-dashed border-[var(--border-ed)]" />
            <div className="mt-2">
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
})
