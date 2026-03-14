'use client'

import { useState, Fragment } from 'react'
import {
  ShoppingCart, Wallet, PiggyBank, Building2,
  ArrowRight, ChevronRight, BarChart3,
  CheckCircle2, AlertTriangle,
  ArrowUpRight, ArrowDownRight, Minus,
} from 'lucide-react'
import { formatCurrency, BudgetIcon } from '@/components/app/budget-shared'
import { buildSegments, typeColors } from '@/components/app/budget-donut'
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
  onCardClick: (type: 'budgets' | 'cash' | 'assets' | 'debts', itemId?: string) => void
}

type TabKey = 'budgets' | 'cash' | 'assets' | 'debts'

const MOBILE_ITEMS = 3

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

  // Merge cash into assets when budgeting is off
  const cashFromAssets = !budgetingActive
    ? cashAccounts.filter(a => a.source === 'asset').map(a => ({ id: a.id, name: a.name, value: a.balance, isCash: true }))
    : []
  const nonCashItems = nonCashAssets.map(a => ({ id: a.id, name: a.name, value: a.current_value, isCash: false }))
  const allAssetItems = [...nonCashItems, ...cashFromAssets].sort((a, b) => b.value - a.value)
  const heroTotal = budgetingActive
    ? totalNonCashAssets
    : totalNonCashAssets + cashFromAssets.reduce((s, a) => s + a.value, 0)

  // Build tabs
  type TabConfig = { key: TabKey; label: string; metric: string; subtitle: string }
  const tabs: TabConfig[] = [
    ...(budgetingActive ? [
      {
        key: 'budgets' as const,
        label: 'Budgetten',
        metric: totalBudgetLimit > 0 ? `${budgetPct}%` : '\u2014',
        subtitle: overBudgetCount > 0 ? `${overBudgetCount} over` : 'op schema',
      },
      {
        key: 'cash' as const,
        label: 'Cash',
        metric: formatCurrency(totalCash),
        subtitle: `${cashAccounts.length} rek.`,
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

  const [activeTab, setActiveTab] = useState<TabKey>(tabs[0].key)

  // Health score: percentage of "missions" with positive status
  const healthScore = (() => {
    let green = 0
    let total = 0
    if (budgetingActive) {
      green += overBudgetCount === 0 ? 1 : 0
      total++
      green += totalCash >= 0 ? 1 : 0
      total++
    }
    green += assetGrowthDirection !== 'down' ? 1 : 0
    total++
    green += rawTotalDebts === 0 || (debtProgress != null && debtProgress.progressPct > 50) ? 1 : 0
    total++
    return total > 0 ? Math.round((green / total) * 100) : 0
  })()

  // Border classes for 2x2 grid on desktop
  const getBorderClasses = (key: TabKey) => {
    if (budgetingActive) {
      if (key === 'budgets') return 'lg:border-r lg:border-b lg:border-[var(--border-ed)]'
      if (key === 'cash') return 'lg:border-b lg:border-[var(--border-ed)]'
      if (key === 'assets') return 'lg:border-r lg:border-[var(--border-ed)]'
      return ''
    } else {
      if (key === 'assets') return 'lg:border-r lg:border-[var(--border-ed)]'
      return ''
    }
  }

  return (
    <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] shadow-[var(--s0)] overflow-hidden">
      {/* Accent bar */}
      <div className="h-[3px] w-full bg-kern-500" />

      {/* Pipeline header */}
      <div className="border-b border-[var(--border-ed)] px-4 py-4 sm:px-5">
        <div className="flex items-center justify-between">
          {tabs.map((tab, i) => (
            <Fragment key={tab.key}>
              {i > 0 && (
                <div className="flex shrink-0 items-center text-[var(--ink-4)]">
                  <div className="h-px w-3 bg-[var(--border-md)] sm:w-6" />
                  <ChevronRight className="h-3 w-3" />
                </div>
              )}
              <div className="flex-1 text-center animate-fade-up" style={{ '--stagger': `${i * 80}ms` } as React.CSSProperties}>
                <p className="label-editorial text-kern-600">{tab.label}</p>
                <p className="mt-1 font-mono text-base font-bold tabular-nums text-[var(--ink)] sm:text-xl">
                  {tab.metric}
                </p>
                <p className="font-serif text-[11px] italic text-[var(--ink-3)] sm:text-xs">
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

      {/* Content grid — tabs on mobile, 2x2 with rules on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2">
        {/* ── Budget card ── */}
        {budgetingActive && (
          <div
            onClick={() => onCardClick('budgets')}
            className={`group cursor-pointer p-4 sm:p-5 ${getBorderClasses('budgets')} ${activeTab !== 'budgets' ? 'hidden lg:block' : ''}`}
          >
            <div className="mb-2 sm:mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-[var(--r)] bg-[var(--subtle)] group-hover:bg-kern-50">
                  <ShoppingCart className="h-5 w-5 text-kern-600" />
                </div>
                <p className="text-sm font-semibold text-[var(--ink-2)]">Budgetten</p>
              </div>
              {overBudgetCount === 0 ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-kern-500" />
              )}
            </div>

            <p className="font-mono text-2xl font-bold text-[var(--ink)]">
              {formatCurrency(totalBudgetSpent)} <span className="text-base font-normal text-[var(--ink-3)]">/ {formatCurrency(totalBudgetLimit)}</span>
            </p>
            <div className={`mt-1.5 mb-3 inline-flex items-center gap-1.5 self-start rounded-full px-2.5 py-0.5 text-xs font-medium ${
              overBudgetCount === 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-kern-50 text-kern-700'
            }`}>
              {overBudgetCount === 0 ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
              {overBudgetCount === 0 ? `${budgetPct}% besteed` : `${overBudgetCount} over budget`}
            </div>

            <div className="space-y-1.5 border-t border-[var(--border-ed)] pt-2 sm:pt-3">
              {segments.slice(0, MOBILE_ITEMS).map((seg) => {
                const pct = seg.limit > 0 ? Math.round((seg.spent / seg.limit) * 100) : 0
                const isOver = seg.spent > seg.limit && seg.limit > 0
                return (
                  <div key={seg.id} onClick={(e) => { e.stopPropagation(); onCardClick('budgets', seg.id) }} className="cursor-pointer rounded-md -mx-1 px-1 py-0.5 transition-colors hover:bg-kern-50">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded" style={{ backgroundColor: typeColors(seg.budgetType).bg }}>
                          <BudgetIcon name={seg.icon} className="h-3 w-3" />
                        </div>
                        <span className="truncate text-[var(--ink-2)]">{seg.name}</span>
                      </div>
                      <span className={`shrink-0 font-mono font-medium ${isOver ? 'text-red-600' : 'text-[var(--ink-2)]'}`}>
                        {formatCurrency(seg.spent)} <span className="text-[var(--ink-4)]">/ {formatCurrency(seg.limit)}</span>
                      </span>
                    </div>
                    <div className="mt-0.5 h-[3px] w-full overflow-hidden rounded-full bg-[var(--subtle)]">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${isOver ? 'bg-red-400' : 'bg-kern-400'}`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  </div>
                )
              })}
              {segments.length > MOBILE_ITEMS && (
                <p className="text-xs text-kern-600">en {segments.length - MOBILE_ITEMS} meer &rarr;</p>
              )}
              {segments.length === 0 && (
                <p className="text-xs text-[var(--ink-4)]">Geen budgetten ingesteld</p>
              )}
            </div>

            <div className="mt-2 sm:mt-3 flex items-center justify-between">
              <span className="label-editorial text-kern-600 opacity-0 transition-opacity group-hover:opacity-100">Beheer budgetten</span>
              <ArrowRight className="h-4 w-4 text-[var(--ink-4)] transition-colors group-hover:text-kern-500" />
            </div>
          </div>
        )}

        {/* ── Cash card ── */}
        {budgetingActive && (() => {
          const maxCashBalance = cashAccounts.length > 0 ? Math.max(...cashAccounts.map(a => Math.abs(a.balance))) : 1
          return (
            <div
              onClick={() => onCardClick('cash')}
              className={`group cursor-pointer p-4 sm:p-5 ${getBorderClasses('cash')} ${activeTab !== 'cash' ? 'hidden lg:block' : ''}`}
            >
              <div className="mb-2 sm:mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-[var(--r)] bg-[var(--subtle)] group-hover:bg-kern-50">
                    <Wallet className="h-5 w-5 text-kern-600" />
                  </div>
                  <p className="text-sm font-semibold text-[var(--ink-2)]">Cash</p>
                </div>
                {totalCash >= 0 ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-kern-500" />
                )}
              </div>

              <p className="font-mono text-2xl font-bold text-[var(--ink)]">{formatCurrency(totalCash)}</p>
              <div className={`mt-1.5 mb-3 inline-flex items-center gap-1.5 self-start rounded-full px-2.5 py-0.5 text-xs font-medium ${
                totalCash >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-kern-50 text-kern-700'
              }`}>
                {totalCash >= 0 ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                {cashAccounts.length} {cashAccounts.length === 1 ? 'rekening' : 'rekeningen'}
              </div>

              <div className="space-y-1.5 border-t border-[var(--border-ed)] pt-2 sm:pt-3">
                {cashAccounts.slice(0, MOBILE_ITEMS).map((acc) => {
                  const pct = maxCashBalance > 0 ? Math.round((Math.abs(acc.balance) / maxCashBalance) * 100) : 0
                  return (
                    <div key={acc.id} className="rounded-md -mx-1 px-1 py-0.5">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-emerald-50">
                            <Wallet className="h-3 w-3 text-emerald-600" />
                          </div>
                          <span className="truncate text-[var(--ink-2)]">{acc.name}</span>
                          <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700 border border-emerald-200">
                            <BarChart3 className="h-2.5 w-2.5" /> Transacties
                          </span>
                        </div>
                        <span className={`shrink-0 font-mono font-medium ${acc.balance >= 0 ? 'text-[var(--ink-2)]' : 'text-red-600'}`}>
                          {formatCurrency(acc.balance)}
                        </span>
                      </div>
                      <div className="mt-0.5 h-[3px] w-full overflow-hidden rounded-full bg-[var(--subtle)]">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${acc.balance >= 0 ? 'bg-emerald-400' : 'bg-red-400'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
                {cashAccounts.length > MOBILE_ITEMS && (
                  <p className="text-xs text-kern-600">en {cashAccounts.length - MOBILE_ITEMS} meer &rarr;</p>
                )}
                {cashAccounts.length === 0 && (
                  <p className="text-xs text-[var(--ink-4)]">Geen cash-rekeningen</p>
                )}
              </div>

              <div className="mt-2 sm:mt-3 flex items-center justify-between">
                <span className="label-editorial text-kern-600 opacity-0 transition-opacity group-hover:opacity-100">Bekijk overzicht</span>
                <ArrowRight className="h-4 w-4 text-[var(--ink-4)] transition-colors group-hover:text-kern-500" />
              </div>
            </div>
          )
        })()}

        {/* ── Assets card ── */}
        {(() => {
          const maxValue = allAssetItems.length > 0 ? Math.max(...allAssetItems.map(a => Math.abs(a.value))) : 1
          return (
            <div
              onClick={() => onCardClick('assets')}
              className={`group cursor-pointer p-4 sm:p-5 ${getBorderClasses('assets')} ${activeTab !== 'assets' ? 'hidden lg:block' : ''}`}
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
                {allAssetItems.slice(0, MOBILE_ITEMS).map((item) => {
                  const pct = maxValue > 0 ? Math.round((Math.abs(item.value) / maxValue) * 100) : 0
                  return (
                    <div key={item.id} onClick={(e) => { e.stopPropagation(); onCardClick('assets', item.id) }} className="cursor-pointer rounded-md -mx-1 px-1 py-0.5 transition-colors hover:bg-kern-50">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${item.isCash ? 'bg-kern-50' : 'bg-emerald-50'}`}>
                            {item.isCash
                              ? <Wallet className="h-3 w-3 text-kern-600" />
                              : <PiggyBank className="h-3 w-3 text-emerald-600" />}
                          </div>
                          <span className="truncate text-[var(--ink-2)]">{item.name}</span>
                        </div>
                        <span className={`shrink-0 font-mono font-medium ${item.value >= 0 ? 'text-[var(--ink-2)]' : 'text-red-600'}`}>
                          {formatCurrency(item.value)}
                        </span>
                      </div>
                      <div className="mt-0.5 h-[3px] w-full overflow-hidden rounded-full bg-[var(--subtle)]">
                        <div className={`h-full rounded-full transition-all duration-500 ${item.isCash ? 'bg-kern-400' : 'bg-emerald-400'}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
                {allAssetItems.length > MOBILE_ITEMS && (
                  <p className="text-xs text-kern-600">en {allAssetItems.length - MOBILE_ITEMS} meer &rarr;</p>
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

        {/* ── Debts card ── */}
        {(() => {
          const maxDebtBalance = debtsList.length > 0 ? Math.max(...debtsList.map(d => d.current_balance)) : 1
          return (
            <div
              onClick={() => onCardClick('debts')}
              className={`group cursor-pointer p-4 sm:p-5 ${getBorderClasses('debts')} ${activeTab !== 'debts' ? 'hidden lg:block' : ''}`}
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
                {debtsList.slice(0, MOBILE_ITEMS).map((debt) => {
                  const pct = maxDebtBalance > 0 ? Math.round((debt.current_balance / maxDebtBalance) * 100) : 0
                  return (
                    <div key={debt.id} onClick={(e) => { e.stopPropagation(); onCardClick('debts', debt.id) }} className="cursor-pointer rounded-md -mx-1 px-1 py-0.5 transition-colors hover:bg-kern-50">
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
                  <p className="text-xs text-kern-600">en {debtsList.length - MOBILE_ITEMS} meer &rarr;</p>
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
