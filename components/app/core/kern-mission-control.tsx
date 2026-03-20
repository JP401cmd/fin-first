'use client'

import { useState, Fragment } from 'react'
import {
  ShoppingCart, Wallet, PiggyBank, Building2, TrendingUp,
  ArrowRight,
  CheckCircle2, AlertTriangle,
  ArrowUpRight, ArrowDownRight, Minus,
} from 'lucide-react'
import { formatCurrency, isOverPositive, type BudgetType } from '@/components/app/budget-shared'
import { buildSegments, typeColors, MiniDonut, type MiniDonutSlice } from '@/components/app/budget-donut'
import type { BudgetWithChildren } from '@/lib/budget-data'

interface KernMissionControlProps {
  budgetingActive: boolean
  // Budget data
  overviewBudgetGroups: BudgetWithChildren[]
  overviewSpending: Record<string, number>
  totalBudgetSpent: number
  totalBudgetLimit: number
  overBudgetCount: number
  // Cash data
  cashAccounts: Array<{ id: string; name: string; balance: number; source: 'asset' | 'bank' }>
  totalCash: number
  // Assets data
  nonCashAssets: Array<{ id: string; name: string; current_value: number; net_worth_inclusion_pct: number }>
  totalNonCashAssets: number
  assetGrowthDirection: 'up' | 'down' | 'flat'
  // Debt data
  debtsList: Array<{ id: string; name: string; current_balance: number; net_worth_inclusion_pct: number }>
  rawTotalDebts: number
  debtProgress: { totalOriginal: number; totalCurrent: number; progressPct: number } | null
  // Callbacks
  onCardClick: (type: 'budgets' | 'assets' | 'debts', itemId?: string) => void
}

type TabKey = 'budgets' | 'assets' | 'debts'

const MOBILE_ITEMS = 3
const DESKTOP_ITEMS = 4

export function KernMissionControl({
  budgetingActive,
  overviewBudgetGroups,
  overviewSpending,
  totalBudgetSpent,
  totalBudgetLimit,
  overBudgetCount,
  cashAccounts,
  totalCash,
  nonCashAssets,
  totalNonCashAssets,
  assetGrowthDirection,
  debtsList,
  rawTotalDebts,
  debtProgress,
  onCardClick,
}: KernMissionControlProps) {
  // Compute derived data
  const segments = buildSegments(overviewBudgetGroups, overviewSpending)
  const budgetPct = totalBudgetLimit > 0 ? Math.round((totalBudgetSpent / totalBudgetLimit) * 100) : 0

  // Group budgets by type for the card summary
  const budgetTypeSummaries = (() => {
    const map = new Map<string, { spent: number; limit: number }>()
    const order = ['income', 'expense', 'savings', 'debt']
    const labels: Record<string, string> = { income: 'Inkomen', expense: 'Uitgaven', savings: 'Sparen', debt: 'Schulden' }
    for (const seg of segments) {
      const existing = map.get(seg.budgetType) || { spent: 0, limit: 0 }
      existing.spent += seg.spent
      existing.limit += seg.limit
      map.set(seg.budgetType, existing)
    }
    return order
      .filter(t => map.has(t))
      .map(t => ({ type: t as BudgetType, label: labels[t] || t, ...map.get(t)! }))
  })()

  // Always merge cash into assets — cash is a subset of assets (shown in bottom row)
  const cashItems = cashAccounts.map(a => ({ id: a.id, name: a.name, value: a.balance, isCash: true, source: a.source }))
  const nonCashItems = nonCashAssets.map(a => ({ id: a.id, name: a.name, value: a.current_value, isCash: false, source: 'asset' as const }))
  const allAssetItems = [...cashItems, ...nonCashItems].sort((a, b) => b.value - a.value)
  const heroTotal = totalNonCashAssets + totalCash

  // Build tabs — budgetten bovenaan, vermogen + schulden onderaan
  type TabConfig = { key: TabKey; label: string; metric: string; subtitle: string }
  const tabs: TabConfig[] = [
    ...(budgetingActive ? [
      {
        key: 'budgets' as const,
        label: 'Budg.',
        metric: totalBudgetLimit > 0 ? `${budgetPct}%` : '\u2014',
        subtitle: overBudgetCount > 0 ? `${overBudgetCount} over` : 'op schema',
      },
    ] : []),
    {
      key: 'assets' as const,
      label: 'Assets',
      metric: formatCurrency(heroTotal),
      subtitle: assetGrowthDirection === 'up' ? 'groeiend' : assetGrowthDirection === 'down' ? 'dalend' : 'stabiel',
    },
    {
      key: 'debts' as const,
      label: 'Schulden',
      metric: rawTotalDebts > 0 ? formatCurrency(rawTotalDebts) : 'Vrij',
      subtitle: rawTotalDebts === 0 ? 'schuldvrij' : debtProgress ? `${debtProgress.progressPct.toFixed(0)}% afgelost` : 'actief',
    },
  ]

  const [activeTab, setActiveTab] = useState<TabKey>(budgetingActive ? 'budgets' : 'assets')

  // Health score: percentage of "missions" with positive status
  const healthScore = (() => {
    let green = 0
    let total = 0
    if (budgetingActive) {
      green += overBudgetCount === 0 ? 1 : 0
      total++
    }
    // Assets (includes cash) health
    green += assetGrowthDirection !== 'down' ? 1 : 0
    total++
    green += totalCash >= 0 ? 1 : 0
    total++
    green += rawTotalDebts === 0 || (debtProgress != null && debtProgress.progressPct > 50) ? 1 : 0
    total++
    return total > 0 ? Math.round((green / total) * 100) : 0
  })()

  // Border classes for grid on desktop
  // Layout: Budgets full-width (top row), Assets | Debts (bottom row)
  const getBorderClasses = (key: TabKey) => {
    if (key === 'budgets') {
      // Budgets: full-width top row, bottom border as separator
      return 'lg:border-b lg:border-[var(--border-ed)]'
    }
    if (key === 'assets') {
      // Bottom-left: right border separator
      return 'lg:border-r lg:border-[var(--border-ed)]'
    }
    // Debts: bottom-right, no extra borders
    return ''
  }

  return (
    <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] shadow-[var(--s0)] overflow-hidden">
      {/* Accent bar */}
      <div className="h-[3px] w-full bg-kern-500" />

      {/* Pipeline header */}
      <div className="border-b border-[var(--border-ed)] px-4 py-4 sm:px-5 lg:hidden">
        <div className="flex items-center justify-between">
          {tabs.map((tab, i) => (
            <Fragment key={tab.key}>
              <div className="flex-1 text-center animate-fade-up" style={{ '--stagger': `${i * 80}ms` } as React.CSSProperties}>
                <p className="label-editorial text-kern-600">{tab.label}</p>
                <p className="mt-1 font-mono text-xs font-bold tabular-nums text-[var(--ink)] sm:text-xl">
                  {tab.metric}
                </p>
                <p className="font-serif text-[10px] italic text-[var(--ink-3)] sm:text-xs">
                  {tab.subtitle}
                </p>
              </div>
            </Fragment>
          ))}
        </div>

        {/* Health progress bar */}
        <div className="mt-3 h-[3px] w-full overflow-hidden rounded-full bg-[var(--subtle)]">
          <div
            className="h-full rounded-full bg-kern-500 transition-all duration-500"
            style={{ width: `${healthScore}%` }}
          />
        </div>
      </div>

      {/* Mobile tab bar (< lg) */}
      <div className="border-b border-[var(--border-ed)] px-5 pb-3 pt-3 lg:hidden">
        <div className="flex gap-1 rounded-[var(--r)] bg-[var(--subtle)] p-1" role="tablist">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              role="tab"
              aria-selected={activeTab === tab.key}
              className={`flex-1 rounded-[var(--r-sm)] px-2 py-2 text-[11px] font-semibold transition-colors ${
                activeTab === tab.key
                  ? 'bg-[var(--paper)] text-[var(--ink)] shadow-sm'
                  : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content grid — tabs on mobile; Budgets full-width top, Assets+Debts bottom row on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2">
        {/* ── Budget card — full-width top row, two-column split ── */}
        {budgetingActive && (() => {
          // Separate expense parent budgets from other types
          const expenseSegments = segments.filter(s => s.budgetType === 'expense')
          const nonExpenseTypeSummaries = budgetTypeSummaries.filter(ts => ts.type !== 'expense')
          const expenseTypeSummary = budgetTypeSummaries.find(ts => ts.type === 'expense')
          const MAX_EXPENSE_ITEMS = 8

          return (
            <div
              onClick={() => onCardClick('budgets')}
              className={`group cursor-pointer p-3 sm:p-5 lg:col-span-2 ${activeTab !== 'budgets' ? 'hidden lg:block' : ''}`}
            >
              {/* Header */}
              <div className="mb-2 sm:mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-[var(--r)] bg-[var(--subtle)] group-hover:bg-kern-50">
                    <ShoppingCart className="h-5 w-5 text-kern-600" />
                  </div>
                  <p className="text-sm font-semibold text-[var(--ink-2)]">Budgetten</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    overBudgetCount === 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-kern-50 text-kern-700'
                  }`}>
                    {overBudgetCount === 0 ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                    {overBudgetCount === 0 ? `${budgetPct}% besteed` : `${overBudgetCount} over budget`}
                  </div>
                </div>
              </div>

              {/* Two-column split: Left = Inkomen/Sparen/Schulden, Right = Uitgaven detail */}
              <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
                {/* ─── Left column: Mini donut + Inkomen, Sparen, Schulden type summaries ─── */}
                <div className="lg:w-[40%] lg:shrink-0">
                  <div className="flex items-center gap-3 mb-2">
                    <MiniDonut
                      slices={budgetTypeSummaries.map(ts => ({ type: ts.type, spent: ts.spent, limit: ts.limit }))}
                      size={56}
                      strokeWidth={7}
                      className="shrink-0 sm:h-14 sm:w-14 h-10 w-10"
                    />
                    <div>
                      <p className="font-mono text-lg font-bold text-[var(--ink)]">
                        {formatCurrency(totalBudgetSpent)}
                      </p>
                      <p className="text-xs text-[var(--ink-3)]">
                        van {formatCurrency(totalBudgetLimit)}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    {nonExpenseTypeSummaries.map((ts) => {
                      const pct = ts.limit > 0 ? Math.round((ts.spent / ts.limit) * 100) : 0
                      const isOver = ts.spent > ts.limit && ts.limit > 0
                      const overPos = isOver && isOverPositive(ts.type)
                      const tc = typeColors(ts.type)
                      return (
                        <div key={ts.type} onClick={(e) => { e.stopPropagation(); onCardClick('budgets') }} className="cursor-pointer rounded-md -mx-1 px-1 py-1.5 sm:py-0.5 min-h-[44px] sm:min-h-0 flex flex-col justify-center transition-colors hover:bg-kern-50">
                          <div className="flex items-center justify-between text-xs gap-1">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded" style={{ backgroundColor: tc.bg }}>
                                {ts.type === 'income' && <TrendingUp className="h-3 w-3" style={{ color: tc.text }} />}
                                {ts.type === 'savings' && <PiggyBank className="h-3 w-3" style={{ color: tc.text }} />}
                                {ts.type === 'debt' && <Building2 className="h-3 w-3" style={{ color: tc.text }} />}
                              </div>
                              <span className="truncate font-medium text-[var(--ink-2)]">{ts.label}</span>
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                              <span className={`font-mono font-medium ${isOver ? (overPos ? 'text-emerald-600' : 'text-red-600') : 'text-[var(--ink-2)]'}`}>
                                {formatCurrency(ts.spent)} <span className="hidden sm:inline text-[var(--ink-4)]">/ {formatCurrency(ts.limit)}</span>
                              </span>
                              <span className={`font-mono font-bold ${isOver ? (overPos ? 'text-emerald-600' : 'text-red-600') : 'text-[var(--ink-3)]'}`}>{pct}%</span>
                            </div>
                          </div>
                          <div className="mt-0.5 h-[3px] w-full overflow-hidden rounded-full bg-[var(--subtle)]">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${isOver ? (overPos ? 'bg-emerald-400' : 'bg-red-400') : ''}`}
                              style={{ width: `${Math.min(pct, 100)}%`, ...(!isOver ? { backgroundColor: pct >= 80 ? tc.text : tc.spent } : {}) }}
                            />
                          </div>
                        </div>
                      )
                    })}
                    {nonExpenseTypeSummaries.length === 0 && (
                      <p className="text-xs text-[var(--ink-4)]">Geen inkomen/sparen/schulden budgetten</p>
                    )}
                  </div>
                </div>

                {/* ─── Right column: Uitgaven with individual parent budgets ─── */}
                <div className="flex-1 border-t border-[var(--border-ed)] pt-3 lg:border-t-0 lg:border-l lg:border-[var(--border-ed)] lg:pl-6 lg:pt-0">
                  {/* Uitgaven header with total */}
                  {expenseTypeSummary && (() => {
                    const expPct = expenseTypeSummary.limit > 0 ? Math.round((expenseTypeSummary.spent / expenseTypeSummary.limit) * 100) : 0
                    const expOver = expenseTypeSummary.spent > expenseTypeSummary.limit && expenseTypeSummary.limit > 0
                    const tc = typeColors('expense')
                    return (
                      <div className="mb-2">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded" style={{ backgroundColor: tc.bg }}>
                              <ShoppingCart className="h-3 w-3" style={{ color: tc.text }} />
                            </div>
                            <span className="text-sm font-semibold text-[var(--ink-2)]">Uitgaven</span>
                          </div>
                          <span className={`font-mono text-xs sm:text-sm font-bold ${expOver ? 'text-red-600' : 'text-[var(--ink-2)]'}`}>
                            {formatCurrency(expenseTypeSummary.spent)} <span className="hidden sm:inline text-xs font-normal text-[var(--ink-4)]">/ {formatCurrency(expenseTypeSummary.limit)}</span>
                          </span>
                        </div>
                        <div className="h-[3px] w-full overflow-hidden rounded-full bg-[var(--subtle)]">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${expOver ? 'bg-red-400' : ''}`}
                            style={{ width: `${Math.min(expPct, 100)}%`, ...(!expOver ? { backgroundColor: expPct >= 80 ? tc.text : tc.spent } : {}) }}
                          />
                        </div>
                      </div>
                    )
                  })()}

                  {/* Individual expense parent budgets */}
                  <div className="space-y-0.5 max-h-[260px] overflow-y-auto lg:max-h-[180px]">
                    {expenseSegments.slice(0, MAX_EXPENSE_ITEMS).map((seg) => {
                      const pct = seg.limit > 0 ? Math.round((seg.spent / seg.limit) * 100) : 0
                      const isOver = seg.spent > seg.limit && seg.limit > 0
                      const tc = typeColors('expense')
                      return (
                        <div key={seg.id} onClick={(e) => { e.stopPropagation(); onCardClick('budgets') }} className="cursor-pointer rounded-md -mx-1 px-1 py-1.5 sm:py-0.5 min-h-[44px] sm:min-h-0 flex flex-col justify-center transition-colors hover:bg-kern-50">
                          <div className="flex items-center justify-between text-xs gap-1">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="truncate text-[var(--ink-2)]">{seg.name}</span>
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                              <span className={`font-mono font-medium ${isOver ? 'text-red-600' : 'text-[var(--ink-2)]'}`}>
                                {formatCurrency(seg.spent)} <span className="hidden sm:inline text-[var(--ink-4)]">/ {formatCurrency(seg.limit)}</span>
                              </span>
                              <span className={`font-mono text-[10px] font-bold ${isOver ? 'text-red-600' : 'text-[var(--ink-3)]'}`}>{pct}%</span>
                            </div>
                          </div>
                          <div className="mt-0.5 h-[2px] w-full overflow-hidden rounded-full bg-[var(--subtle)]">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${isOver ? 'bg-red-400' : ''}`}
                              style={{ width: `${Math.min(pct, 100)}%`, ...(!isOver ? { backgroundColor: pct >= 80 ? tc.text : tc.spent } : {}) }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {expenseSegments.length > MAX_EXPENSE_ITEMS && (
                    <p className="mt-1.5 text-[10px] text-kern-600 font-medium">
                      en {expenseSegments.length - MAX_EXPENSE_ITEMS} meer bekijken &rarr;
                    </p>
                  )}

                  {expenseSegments.length === 0 && !expenseTypeSummary && (
                    <p className="text-xs text-[var(--ink-4)]">Geen uitgavenbudgetten</p>
                  )}
                </div>
              </div>

              <div className="mt-2 sm:mt-3 flex items-center justify-between">
                <span className="label-editorial text-kern-600 opacity-0 transition-opacity group-hover:opacity-100">Beheer budgetten</span>
                <ArrowRight className="h-4 w-4 text-[var(--ink-4)] transition-colors group-hover:text-kern-500" />
              </div>
            </div>
          )
        })()}

        {/* ── Assets card (includes cash / liquide middelen) — bottom left ── */}
        {(() => {
          const maxValue = allAssetItems.length > 0 ? Math.max(...allAssetItems.map(a => Math.abs(a.value))) : 1
          return (
            <div
              onClick={() => onCardClick('assets')}
              className={`group cursor-pointer p-3 sm:p-5 ${getBorderClasses('assets')} ${activeTab !== 'assets' ? 'hidden lg:block' : ''}`}
            >
              <div className="mb-2 sm:mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-[var(--r)] bg-[var(--subtle)] group-hover:bg-kern-50">
                    <PiggyBank className="h-5 w-5 text-kern-600" />
                  </div>
                  <p className="text-sm font-semibold text-[var(--ink-2)]">Assets</p>
                </div>
                {assetGrowthDirection === 'up' && <ArrowUpRight className="h-4 w-4 text-emerald-500" />}
                {assetGrowthDirection === 'down' && <ArrowDownRight className="h-4 w-4 text-red-500" />}
                {assetGrowthDirection === 'flat' && <Minus className="h-4 w-4 text-[var(--ink-4)]" />}
              </div>

              <p className="font-mono text-2xl font-bold text-[var(--ink)]">{formatCurrency(heroTotal)}</p>
              <div className={`mt-1.5 mb-3 inline-flex items-center gap-1.5 self-start rounded-full px-2.5 py-0.5 text-xs font-medium ${
                assetGrowthDirection === 'down' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'
              }`}>
                {assetGrowthDirection === 'up' && <><ArrowUpRight className="h-3 w-3" />Groeiend</>}
                {assetGrowthDirection === 'down' && <><ArrowDownRight className="h-3 w-3" />Dalend</>}
                {assetGrowthDirection === 'flat' && <><Minus className="h-3 w-3" />Stabiel</>}
              </div>

              <div className="space-y-1.5 border-t border-[var(--border-ed)] pt-2 sm:pt-3">
                {/* Liquide middelen sub-section */}
                {cashItems.length > 0 && (
                  <>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-4)]">
                      Liquide middelen
                      <span className="ml-1.5 font-mono normal-case">{formatCurrency(totalCash)}</span>
                    </p>
                    {cashItems.slice(0, 2).map((item) => {
                      const pct = maxValue > 0 ? Math.round((Math.abs(item.value) / maxValue) * 100) : 0
                      return (
                        <div key={item.id} onClick={(e) => { e.stopPropagation(); onCardClick('assets', item.id) }} className="cursor-pointer rounded-md -mx-1 px-1 py-0.5 transition-colors hover:bg-kern-50">
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-kern-50">
                                <Wallet className="h-3 w-3 text-kern-600" />
                              </div>
                              <span className="truncate text-[var(--ink-2)]">{item.name}</span>
                            </div>
                            <span className={`shrink-0 font-mono font-medium ${item.value >= 0 ? 'text-[var(--ink-2)]' : 'text-red-600'}`}>
                              {formatCurrency(item.value)}
                            </span>
                          </div>
                          <div className="mt-0.5 h-[3px] w-full overflow-hidden rounded-full bg-[var(--subtle)]">
                            <div className="h-full rounded-full bg-kern-400 transition-all duration-500" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      )
                    })}
                    {cashItems.length > 2 && (
                      <p className="text-[10px] text-kern-600">en {cashItems.length - 2} meer</p>
                    )}
                  </>
                )}
                {/* Beleggingen & overig sub-section */}
                {nonCashItems.length > 0 && (
                  <>
                    {cashItems.length > 0 && (
                      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-4)] pt-1">
                        Beleggingen &amp; overig
                        <span className="ml-1.5 font-mono normal-case">{formatCurrency(totalNonCashAssets)}</span>
                      </p>
                    )}
                    {nonCashItems.slice(0, 2).map((item) => {
                      const pct = maxValue > 0 ? Math.round((Math.abs(item.value) / maxValue) * 100) : 0
                      return (
                        <div key={item.id} onClick={(e) => { e.stopPropagation(); onCardClick('assets', item.id) }} className="cursor-pointer rounded-md -mx-1 px-1 py-0.5 transition-colors hover:bg-kern-50">
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-emerald-50">
                                <PiggyBank className="h-3 w-3 text-emerald-600" />
                              </div>
                              <span className="truncate text-[var(--ink-2)]">{item.name}</span>
                            </div>
                            <span className={`shrink-0 font-mono font-medium ${item.value >= 0 ? 'text-[var(--ink-2)]' : 'text-red-600'}`}>
                              {formatCurrency(item.value)}
                            </span>
                          </div>
                          <div className="mt-0.5 h-[3px] w-full overflow-hidden rounded-full bg-[var(--subtle)]">
                            <div className="h-full rounded-full bg-emerald-400 transition-all duration-500" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      )
                    })}
                    {nonCashItems.length > 2 && (
                      <p className="text-[10px] text-kern-600">en {nonCashItems.length - 2} meer</p>
                    )}
                  </>
                )}
                {allAssetItems.length === 0 && (
                  <p className="text-xs text-[var(--ink-4)]">Geen assets</p>
                )}
              </div>

              <div className="mt-2 sm:mt-3 flex items-center justify-between">
                <span className="label-editorial text-kern-600 opacity-0 transition-opacity group-hover:opacity-100">Bekijk portfolio</span>
                <ArrowRight className="h-4 w-4 text-[var(--ink-4)] transition-colors group-hover:text-kern-500" />
              </div>
            </div>
          )
        })()}

        {/* ── Debts card — bottom right ── */}
        {(() => {
          const maxDebtBalance = debtsList.length > 0 ? Math.max(...debtsList.map(d => d.current_balance)) : 1
          return (
            <div
              onClick={() => onCardClick('debts')}
              className={`group cursor-pointer p-3 sm:p-5 ${getBorderClasses('debts')} ${activeTab !== 'debts' ? 'hidden lg:block' : ''}`}
            >
              <div className="mb-2 sm:mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-[var(--r)] bg-[var(--subtle)] group-hover:bg-kern-50">
                    <Building2 className="h-5 w-5 text-kern-600" />
                  </div>
                  <p className="text-sm font-semibold text-[var(--ink-2)]">Schulden</p>
                </div>
                {rawTotalDebts === 0 ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : debtProgress && debtProgress.progressPct > 50 ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-kern-500" />
                )}
              </div>

              <p className={`font-mono text-2xl font-bold ${rawTotalDebts > 0 ? 'text-[var(--ink)]' : 'text-emerald-600'}`}>
                {rawTotalDebts > 0 ? formatCurrency(rawTotalDebts) : 'Schuldvrij'}
              </p>
              <div className={`mt-1.5 mb-3 inline-flex items-center gap-1.5 self-start rounded-full px-2.5 py-0.5 text-xs font-medium ${
                rawTotalDebts === 0 ? 'bg-emerald-50 text-emerald-700' : debtProgress && debtProgress.progressPct > 50 ? 'bg-emerald-50 text-emerald-700' : 'bg-kern-50 text-kern-700'
              }`}>
                {rawTotalDebts === 0 ? (
                  <><CheckCircle2 className="h-3 w-3" />Schuldvrij!</>
                ) : debtProgress ? (
                  <><CheckCircle2 className="h-3 w-3" />{debtProgress.progressPct.toFixed(0)}% afgelost</>
                ) : (
                  <><AlertTriangle className="h-3 w-3" />Vrijheid terugkopen</>
                )}
              </div>

              {debtProgress && debtProgress.totalOriginal > 0 && (
                <div className="mb-3">
                  <div className="h-[5px] w-full overflow-hidden rounded-full bg-[var(--subtle)]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
                      style={{ width: `${debtProgress.progressPct}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[10px] font-mono text-[var(--ink-4)]">
                    {formatCurrency(debtProgress.totalOriginal - debtProgress.totalCurrent)} afgelost van {formatCurrency(debtProgress.totalOriginal)}
                  </p>
                </div>
              )}

              <div className="space-y-1.5 border-t border-[var(--border-ed)] pt-2 sm:pt-3">
                {debtsList.slice(0, DESKTOP_ITEMS).map((debt, idx) => {
                  const pct = maxDebtBalance > 0 ? Math.round((debt.current_balance / maxDebtBalance) * 100) : 0
                  return (
                    <div key={debt.id} onClick={(e) => { e.stopPropagation(); onCardClick('debts', debt.id) }} className={`cursor-pointer rounded-md -mx-1 px-1 py-0.5 transition-colors hover:bg-kern-50 ${idx >= MOBILE_ITEMS ? 'hidden lg:block' : ''}`}>
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-red-50">
                            <Building2 className="h-3 w-3 text-red-500" />
                          </div>
                          <span className="truncate text-[var(--ink-2)]">{debt.name}</span>
                        </div>
                        <span className="shrink-0 font-mono font-medium text-red-600">
                          {formatCurrency(debt.current_balance)}
                        </span>
                      </div>
                      <div className="mt-0.5 h-[3px] w-full overflow-hidden rounded-full bg-[var(--subtle)]">
                        <div
                          className="h-full rounded-full bg-red-400 transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
                {debtsList.length > MOBILE_ITEMS && (
                  <p className={`text-xs text-kern-600 ${debtsList.length <= DESKTOP_ITEMS ? 'lg:hidden' : ''}`}>en <span className="lg:hidden">{debtsList.length - MOBILE_ITEMS}</span><span className="hidden lg:inline">{debtsList.length - DESKTOP_ITEMS}</span> meer &rarr;</p>
                )}
                {debtsList.length === 0 && (
                  <p className="text-xs text-[var(--ink-4)] flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-500" /> Geen schulden</p>
                )}
              </div>

              <div className="mt-2 sm:mt-3 flex items-center justify-between">
                <span className="label-editorial text-kern-600 opacity-0 transition-opacity group-hover:opacity-100">Beheer schulden</span>
                <ArrowRight className="h-4 w-4 text-[var(--ink-4)] transition-colors group-hover:text-kern-500" />
              </div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}
