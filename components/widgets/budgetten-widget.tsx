import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import { formatCurrency } from '@/lib/format'
import type { DashboardData } from './widget-renderer'
import { TrendingUp, ShoppingCart, PiggyBank, CreditCard } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

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
  config: BudgetTypeConfig
  limit:  number
  spent:  number
}

function BudgetRow({ config, limit, spent }: BudgetRowProps) {
  const { icon: Icon, label, iconBg, iconText, labelText, barFillVar, barWarnVar } = config
  const hasData    = limit > 0
  const pct        = progressPct(spent, limit)
  const overBudget = hasData && spent > limit
  const pctLabel   = hasData ? `${Math.round(pct)}%` : '—'
  const fillColor  = overBudget ? barWarnVar : barFillVar

  return (
    <div className="space-y-1">

      {/* Laag 1: icoon + type label */}
      <div className="flex items-center gap-1.5">
        <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[var(--r-sm)] ${iconBg}`}>
          <Icon className={iconText} size={9} strokeWidth={2} />
        </div>
        <span className={`text-[10px] font-bold uppercase tracking-[0.09em] ${hasData ? labelText : 'text-[var(--ink-3)]'}`}>
          {label}
        </span>
      </div>

      {/* Laag 2: voortgangsbalk — track neutraal, fill via inline style (CSS-variabelen) */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--border-ed)]">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width:           `${pct}%`,
            backgroundColor: hasData ? fillColor : 'transparent',
          }}
        />
      </div>

      {/* Laag 3: €spent · percentage · budget €limit */}
      <div className="flex items-center justify-between gap-1">
        <span className={`font-mono tabular-nums text-[10px] ${overBudget ? 'text-red-500 font-semibold' : 'text-[var(--ink-3)]'}`}>
          {hasData ? formatCurrency(spent) : '—'}
        </span>
        <span className={`text-[9px] font-bold ${overBudget ? 'text-red-400' : 'text-[var(--ink-4)]'}`}>
          {pctLabel}
        </span>
        <span className="font-mono tabular-nums text-[10px] text-[var(--ink-3)]">
          {hasData ? formatCurrency(limit) : '—'}
        </span>
      </div>

    </div>
  )
}

// ── Hoofd-component ────────────────────────────────────────────

export function BudgettenWidget({ size, data, href }: Props) {
  const isFullSize       = size === 'full'
  const { budgetTotals } = data

  const nettoBalans =
    budgetTotals.income.spent
    - budgetTotals.expense.spent
    - budgetTotals.savings.spent
    - budgetTotals.debt.spent

  const isNettoPositief = nettoBalans >= 0

  return (
    <WidgetShell module="kern" size={size} kicker="Budgetten" href={href}>

      {/* ── Vier budget-rijen ── */}
      <div className="flex flex-col gap-3">
        {BUDGET_TYPE_CONFIGS.map((config) => {
          const typeData = budgetTotals[config.key]
          return (
            <BudgetRow
              key={config.key}
              config={config}
              limit={typeData.limit}
              spent={typeData.spent}
            />
          )
        })}
      </div>

      {/* ── Netto maandbalans (full-size) ── */}
      {isFullSize && (
        <>
          <div className="mt-4 border-t border-dashed border-[var(--border-ed)]" />
          <div className="mt-3 flex items-end justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
                Netto maandbalans
              </p>
              <p className="mt-0.5 font-serif italic text-[11px] text-[var(--ink-4)]">
                Inkomen min alle uitgaven
              </p>
            </div>
            <p className={`font-mono tabular-nums text-xl font-semibold ${isNettoPositief ? 'text-emerald-700' : 'text-red-600'}`}>
              {isNettoPositief ? '+' : ''}{formatCurrency(nettoBalans)}
            </p>
          </div>
        </>
      )}

    </WidgetShell>
  )
}
