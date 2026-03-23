'use client'

import { memo } from 'react'
import { WidgetShell } from './widget-shell'
import { WidgetEmpty } from './widget-empty'
import type { WidgetSize } from '@/lib/widget-catalog'
import { formatCurrency, calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'
import { isOverPositive, computeBarSegments } from '@/components/app/budget-shared'
import type { DashboardData } from './widget-renderer'
import { TrendingUp, ShoppingCart, PiggyBank, CreditCard, LayoutGrid, Sparkles } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

// ── Budget type configuratie — kleuren via CSS-variabelen van gebruikersinstelling ──

interface BudgetTypeConfig {
  key:        keyof DashboardData['budgetTotals']
  label:      string
  icon:       LucideIcon
  iconBg:     string   // Tailwind bg-{type}-50
  iconText:   string   // Tailwind text-{type}-600
  labelText:  string   // Tailwind text-{type}-700
  // Inline style waarden — CSS-variabelen zodat gebruikerskleur altijd klopt
  barFillVar: string   // var(--color-{type}-400)
  barWarnVar: string   // var(--color-{type}-600)
}

const BUDGET_TYPE_CONFIGS: BudgetTypeConfig[] = [
  {
    key:        'income',
    label:      'Inkomen',
    icon:       TrendingUp,
    iconBg:     'bg-income-50',
    iconText:   'text-income-600',
    labelText:  'text-income-700',
    barFillVar: 'var(--color-income-400)',
    barWarnVar: 'var(--color-income-600)',
  },
  {
    key:        'expense',
    label:      'Uitgaven',
    icon:       ShoppingCart,
    iconBg:     'bg-expense-50',
    iconText:   'text-expense-600',
    labelText:  'text-expense-700',
    barFillVar: 'var(--color-expense-400)',
    barWarnVar: 'var(--color-expense-600)',
  },
  {
    key:        'savings',
    label:      'Sparen',
    icon:       PiggyBank,
    iconBg:     'bg-savings-50',
    iconText:   'text-savings-600',
    labelText:  'text-savings-700',
    barFillVar: 'var(--color-savings-400)',
    barWarnVar: 'var(--color-savings-600)',
  },
  {
    key:        'debt',
    label:      'Schulden',
    icon:       CreditCard,
    iconBg:     'bg-debt-50',
    iconText:   'text-debt-600',
    labelText:  'text-debt-700',
    barFillVar: 'var(--color-debt-400)',
    barWarnVar: 'var(--color-debt-600)',
  },
]

function progressPct(spent: number, limit: number): number {
  if (limit <= 0) return 0
  return Math.min((spent / limit) * 100, 100)
}

// ── BudgetRow ─────────────────────────────────────────────────
//
// Structuur per rij (3 lagen):
//   1. [Icon]  TYPE LABEL
//   2. [══════════════════ bar ══════════════════]
//   3.  €spent besteed  ·  65%  ·  budget €limit

interface BudgetRowProps {
  config:     BudgetTypeConfig
  limit:      number
  spent:      number
  hasEntered: boolean
  trend?:     'up' | 'down' | 'flat' | null
}

function BudgetRow({ config, limit, spent, hasEntered, trend }: BudgetRowProps) {
  const { icon: Icon, label, iconBg, iconText, labelText, barFillVar, barWarnVar } = config
  const hasData    = limit > 0
  const pct        = progressPct(spent, limit)
  const overBudget = hasData && spent > limit
  const overPositive = isOverPositive(config.key as 'income' | 'expense' | 'savings' | 'debt')
  const pctLabel   = hasData ? `${Math.round(pct)}%` : '—'
  const seg = computeBarSegments(spent, limit, 80, { barHex: barFillVar, barHexWarn: barWarnVar }, overPositive)

  return (
    <div className="space-y-0.5">

      {/* Laag 1: icoon + type label + amount */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[var(--r-sm)] ${iconBg}`}>
            <Icon className={iconText} size={9} strokeWidth={2} />
          </div>
          <span className={`text-[10px] font-bold uppercase tracking-[0.09em] ${hasData ? labelText : 'text-[var(--ink-3)]'}`}>
            {label}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {trend && trend !== 'flat' && (
            <span className={`text-[10px] font-semibold ${
              config.key === 'expense' || config.key === 'debt'
                ? (trend === 'up' ? 'text-red-500' : 'text-emerald-600')
                : (trend === 'up' ? 'text-emerald-600' : 'text-red-500')
            }`}>
              {trend === 'up' ? '↑' : '↓'}
            </span>
          )}
          <span className={`font-mono tabular-nums text-[10px] ${overBudget ? (overPositive ? 'text-emerald-600 font-semibold' : 'text-red-500 font-semibold') : 'text-[var(--ink-3)]'}`}>
            {hasData ? `${formatCurrency(spent)} / ${formatCurrency(limit)}` : '—'}
          </span>
        </div>
      </div>

      {/* Laag 2: voortgangsbalk — compact */}
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-[var(--border-ed)]">
        {/* Fill 1 — normaal */}
        <div
          className="absolute inset-y-0 left-0 rounded-l-full"
          style={{
            width: hasEntered ? `${seg.normalPct}%` : '0%',
            backgroundColor: hasData ? seg.normalColor : 'transparent',
            transition: hasEntered ? 'width 500ms cubic-bezier(.22,1,.36,1)' : 'none',
          }}
        />
        {/* Fill 2 — waarschuwing */}
        {seg.warnPct > 0 && (
          <div
            className="absolute inset-y-0 rounded-r-full"
            style={{
              left: `${seg.warnLeft}%`,
              width: hasEntered ? `${seg.warnPct}%` : '0%',
              backgroundColor: seg.warnColor,
              transition: hasEntered ? 'width 500ms cubic-bezier(.22,1,.36,1) 30ms' : 'none',
            }}
          />
        )}
        {/* Extension */}
        {seg.extensionPct > 0 && (
          <div
            className="absolute inset-y-0 rounded-r-full"
            style={{
              left: `${seg.extensionLeft}%`,
              width: hasEntered ? `${seg.extensionPct}%` : '0%',
              backgroundColor: seg.extensionColor,
              opacity: 0.7,
              transition: hasEntered ? 'width 500ms cubic-bezier(.22,1,.36,1) 80ms' : 'none',
            }}
          />
        )}
      </div>

      {/* Laag 3: percentage indicator */}
      {hasData && (
        <div className="flex justify-end">
          <span className={`text-[9px] font-bold ${overBudget ? (overPositive ? 'text-emerald-500' : 'text-red-400') : 'text-[var(--ink-4)]'}`}>
            {pctLabel}
          </span>
        </div>
      )}

    </div>
  )
}

// ── Hoofd-component ────────────────────────────────────────────

export const BudgettenWidget = memo(function BudgettenWidget({ size, data, href }: Props) {
  const isFullSize       = size === 'full'
  const { budgetTotals, monthlyExpenses, budgetTypeHistory } = data
  const { ref: inViewRef, hasEntered } = useInViewAnimation({ duration: 600 })

  const hasAnyBudget = BUDGET_TYPE_CONFIGS.some(c => budgetTotals[c.key].limit > 0)

  if (!hasAnyBudget) {
    return (
      <WidgetShell module="kern" size={size} kicker="Budgetten" href={href}>
        <WidgetEmpty icon={LayoutGrid} message="Maak je eerste budget aan om je bestedingen te volgen." />
      </WidgetShell>
    )
  }

  if (size === 'mini') {
    const onTrackMini = BUDGET_TYPE_CONFIGS.filter(c => {
      const t = budgetTotals[c.key]
      return t.limit > 0 && (t.spent <= t.limit || isOverPositive(c.key as 'income' | 'expense' | 'savings' | 'debt'))
    }).length
    const configuredMini = BUDGET_TYPE_CONFIGS.filter(c => budgetTotals[c.key].limit > 0).length
    return (
      <WidgetShell module="kern" size="mini" kicker="Budgetten" href={href}>
        <p className="font-mono text-[15px] font-semibold tabular-nums text-[var(--ink)] leading-none truncate">
          {onTrackMini}/{configuredMini > 0 ? configuredMini : 4} op schema
        </p>
      </WidgetShell>
    )
  }

  // When user chose not to actively budget during onboarding, show activation hint
  if (!data.budgetingActive) {
    return (
      <WidgetShell module="kern" size={size} kicker="Budgetten" href={href}>
        <div className="flex flex-col items-center gap-2 py-2 text-center">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-50">
            <Sparkles className="text-amber-500" size={16} />
          </div>
          <p className="text-sm font-medium text-[var(--ink)]">
            Activeer budgetteren
          </p>
          <p className="text-[11px] leading-snug text-[var(--ink-3)]">
            Je hebt budgetten klaarstaan. Activeer ze om inzicht te krijgen in je bestedingen en vrijheid op te bouwen.
          </p>
          <a
            href="/core/budgets"
            className="mt-1 inline-flex items-center gap-1 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-100"
          >
            Bekijk budgetten
          </a>
        </div>
      </WidgetShell>
    )
  }

  // Budget health: how many of 4 types are on track (spent <= limit, or over limit for positive types)
  const onTrackCount = BUDGET_TYPE_CONFIGS.filter(c => {
    const t = budgetTotals[c.key]
    return t.limit > 0 && (t.spent <= t.limit || isOverPositive(c.key as 'income' | 'expense' | 'savings' | 'debt'))
  }).length
  const configuredCount = BUDGET_TYPE_CONFIGS.filter(c => budgetTotals[c.key].limit > 0).length

  // ── Quarter-size: budget health summary + mini 4-segment bar ──
  if (size === 'quarter') {
    return (
      <WidgetShell module="kern" size={size} kicker="Budgetten" href={href}>
        <p className="font-mono text-lg font-semibold tabular-nums text-[var(--ink)]">
          {onTrackCount}/{configuredCount > 0 ? configuredCount : 4} op schema
        </p>
        <p className="mt-1 font-serif italic text-[11px] text-[var(--ink-3)]">
          {onTrackCount === configuredCount && configuredCount > 0 ? 'Alle budgetten op koers' : 'Budgetten deze maand'}
        </p>
        {/* Mini 4-segment bar */}
        <div ref={inViewRef} className="mt-2 flex gap-0.5">
          {BUDGET_TYPE_CONFIGS.map((config) => {
            const t = budgetTotals[config.key]
            const hasData = t.limit > 0
            const onTrack = hasData && t.spent <= t.limit
            const overPos = hasData && !onTrack && isOverPositive(config.key as 'income' | 'expense' | 'savings' | 'debt')
            return (
              <div
                key={config.key}
                className="h-2 flex-1 rounded-sm"
                style={{
                  backgroundColor: !hasData
                    ? 'var(--border-ed)'
                    : (onTrack || overPos)
                      ? 'var(--color-emerald-500, #10b981)'
                      : 'var(--color-red-500, #ef4444)',
                  opacity: hasEntered ? 1 : 0.3,
                  transition: 'opacity 400ms ease',
                }}
              />
            )
          })}
        </div>
      </WidgetShell>
    )
  }

  const nettoBalans =
    budgetTotals.income.spent
    - budgetTotals.expense.spent
    - budgetTotals.savings.spent
    - budgetTotals.debt.spent

  const isNettoPositief = nettoBalans >= 0

  const dailyExp = monthlyExpenses / 30
  const freedomTime = dailyExp > 0 && Math.abs(nettoBalans) > 0
    ? calculateFreedomTime(Math.abs(nettoBalans), dailyExp)
    : null
  const freedomStr = freedomTime ? formatFreedomTimeString(freedomTime, 'short') : null

  // ── Half-size: horizontal layout — left 2 categories, right 2 categories ──
  if (size === 'half') {
    const halfConfigs = [BUDGET_TYPE_CONFIGS.slice(0, 2), BUDGET_TYPE_CONFIGS.slice(2)]
    return (
      <WidgetShell module="kern" size={size} kicker="Budgetten" href={href}>
        <div ref={inViewRef} className="flex gap-3 h-full">
          {halfConfigs.map((group, gi) => (
            <div key={gi} className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
              {group.map((config) => {
                const typeData = budgetTotals[config.key]
                const { icon: Icon, label, iconBg, iconText, labelText, barFillVar, barWarnVar } = config
                const hasData = typeData.limit > 0
                const pct = progressPct(typeData.spent, typeData.limit)
                const overBudget = hasData && typeData.spent > typeData.limit
                const overPos = isOverPositive(config.key as 'income' | 'expense' | 'savings' | 'debt')
                const isAboveThreshold = pct >= 80
                const fillColor = overBudget ? (overPos ? 'var(--color-emerald-500, #10b981)' : 'var(--color-red-500, #ef4444)') : isAboveThreshold ? barWarnVar : barFillVar

                return (
                  <div key={config.key}>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <div className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[var(--r-sm)] ${iconBg}`}>
                        <Icon className={iconText} size={8} strokeWidth={2} />
                      </div>
                      <span className={`text-[9px] font-bold uppercase tracking-[0.08em] ${hasData ? labelText : 'text-[var(--ink-3)]'}`}>
                        {label}
                      </span>
                      <span className={`ml-auto font-mono tabular-nums text-[10px] ${overBudget ? (overPos ? 'text-emerald-600' : 'text-red-500') : 'text-[var(--ink-3)]'}`}>
                        {hasData ? `${Math.round(pct)}%` : '—'}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-[var(--border-ed)]">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: hasEntered ? `${pct}%` : '0%',
                          backgroundColor: hasData ? fillColor : 'transparent',
                          transition: hasEntered ? 'width 500ms cubic-bezier(.22,1,.36,1)' : 'none',
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </WidgetShell>
    )
  }

  // Compute trend per budget type: compare current spent with last month's history
  const trendPerType = BUDGET_TYPE_CONFIGS.reduce((acc, config) => {
    const hist = budgetTypeHistory?.[config.key]
    if (hist && hist.length >= 1) {
      const prevSpent = hist[hist.length - 1].value
      const currentSpent = budgetTotals[config.key].spent
      const delta = currentSpent - prevSpent
      const threshold = prevSpent * 0.05 // 5% threshold for flat
      acc[config.key] = Math.abs(delta) < threshold ? 'flat' : delta > 0 ? 'up' : 'down'
    } else {
      acc[config.key] = null
    }
    return acc
  }, {} as Record<string, 'up' | 'down' | 'flat' | null>)

  return (
    <WidgetShell module="kern" size={size} kicker="Budgetten" href={href}>

      {/* ── Vier budget-rijen ── */}
      <div ref={inViewRef} className={`flex flex-col ${isFullSize ? 'gap-1' : 'gap-2'}`}>
        {BUDGET_TYPE_CONFIGS.map((config) => {
          const typeData = budgetTotals[config.key]
          return (
            <BudgetRow
              key={config.key}
              config={config}
              limit={typeData.limit}
              spent={typeData.spent}
              hasEntered={hasEntered}
              trend={isFullSize ? trendPerType[config.key] : undefined}
            />
          )
        })}
      </div>

      {/* ── Netto maandbalans (full-size) — prominent summary ── */}
      {isFullSize && (
        <>
          <div className="mt-3 border-t border-dashed border-[var(--border-ed)]" />
          <div className={`mt-3 rounded-[var(--r-md)] px-3 py-2.5 ${isNettoPositief ? 'bg-emerald-50/60' : 'bg-red-50/60'}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
                  Netto maandbalans
                </p>
                <p className="mt-0.5 font-serif italic text-[11px] text-[var(--ink-4)]">
                  Inkomen min alle uitgaven
                </p>
              </div>
              <div className="text-right">
                <p className={`font-mono tabular-nums text-2xl font-semibold ${isNettoPositief ? 'text-emerald-700' : 'text-red-600'}`}>
                  {isNettoPositief ? '+' : ''}{formatCurrency(nettoBalans)}
                </p>
                {freedomStr && (
                  <p className="font-serif italic text-[11px] text-[var(--ink-3)]">
                    {isNettoPositief ? `+${freedomStr} vrijheid` : `${freedomStr} achter`}
                  </p>
                )}
              </div>
            </div>
          </div>
        </>
      )}

    </WidgetShell>
  )
})
