'use client'

import { useState, Fragment } from 'react'
import {
  ShoppingCart, Wallet, PiggyBank, Building2, TrendingUp,
  ArrowRight,
  CheckCircle2, AlertTriangle,
  ArrowUpRight, ArrowDownRight, Minus,
} from 'lucide-react'
import { formatCurrency, isOverPositive, type BudgetType } from '@/components/app/budget-shared'
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
      label: 'Vermogen',
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
  // Visual separation: border + subtle colored background tints
  // Vermogen = very faint green, Schulden = very faint red (both light + dark mode)
  const getBorderClasses = (key: TabKey) => {
    if (key === 'budgets') {
      // Budgets: full-width top row — neutral, no background tint
      return ''
    }
    if (key === 'assets') {
      // Bottom-left: subtle green tint + right border separator
      return 'bg-emerald-500/[0.035] lg:border-r lg:border-[var(--border-ed)]'
    }
    // Debts: bottom-right, subtle red tint
    return 'bg-red-500/[0.035]'
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
      {/* Budgets row height is content-driven (adapts to number of expense categories) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 lg:grid-rows-[auto_auto_auto]">
        {/* ── Budget card — full-width top row, two-column split ── */}
        {budgetingActive && (() => {
          // Group segments by budget type for uniform rendering
          const typeOrder: BudgetType[] = ['income', 'savings', 'debt']
          const typeIcons: Record<string, typeof TrendingUp> = { income: TrendingUp, savings: PiggyBank, debt: Building2, expense: ShoppingCart }
          const typeLabels: Record<string, string> = { income: 'Inkomen', savings: 'Sparen', debt: 'Schulden', expense: 'Uitgaven' }
          const segmentsByType = (type: BudgetType) => segments.filter(s => s.budgetType === type)
          const expenseSegments = segmentsByType('expense')
          const MAX_ITEMS_PER_TYPE = 8

          // Reusable renderer for a budget type section (header + optional parent budgets)
          const renderTypeSection = (type: BudgetType, typeSegs: typeof segments, summary: typeof budgetTypeSummaries[0] | undefined, showChildren = true) => {
            const tc = typeColors(type)
            const Icon = typeIcons[type] || ShoppingCart
            const label = typeLabels[type] || type

            if (!summary && typeSegs.length === 0) {
              return null
            }

            const typePct = summary && summary.limit > 0 ? Math.round((summary.spent / summary.limit) * 100) : 0
            const typeOver = summary ? summary.spent > summary.limit && summary.limit > 0 : false
            const overPos = typeOver && isOverPositive(type)

            return (
              <div key={type}>
                {/* Type header */}
                <div className="mb-1.5">
                  <div className="flex items-center justify-between mb-0.5 gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded" style={{ backgroundColor: tc.bg }}>
                        <Icon className="h-3 w-3" style={{ color: tc.text }} />
                      </div>
                      <span className="text-[0.9375rem] font-medium leading-tight text-[var(--ink)]">{label}</span>
                    </div>
                    {summary && (
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span className={`font-mono text-xs font-medium ${typeOver ? (overPos ? 'text-emerald-600' : 'text-red-600') : 'text-[var(--ink-2)]'}`}>
                          {formatCurrency(summary.spent)} <span className="hidden sm:inline text-[var(--ink-4)]">/ {formatCurrency(summary.limit)}</span>
                        </span>
                        <span className={`font-mono text-[10px] font-bold ${typeOver ? (overPos ? 'text-emerald-600' : 'text-red-600') : 'text-[var(--ink-3)]'}`}>{typePct}%</span>
                      </div>
                    )}
                  </div>
                  {summary && summary.limit > 0 && (
                    <div className="h-[3px] w-full overflow-hidden rounded-full bg-[var(--subtle)]">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${typeOver ? (overPos ? 'bg-emerald-400' : 'bg-red-400') : ''}`}
                        style={{ width: `${Math.min(typePct, 100)}%`, ...(!typeOver ? { backgroundColor: typePct >= 80 ? tc.text : tc.spent } : {}) }}
                      />
                    </div>
                  )}
                </div>

                {/* Individual parent budgets (only shown when showChildren is true) */}
                {showChildren && (
                <div className="space-y-0.5 pl-7">
                  {typeSegs.slice(0, MAX_ITEMS_PER_TYPE).map((seg) => {
                    const pct = seg.limit > 0 ? Math.round((seg.spent / seg.limit) * 100) : 0
                    const isOver = seg.spent > seg.limit && seg.limit > 0
                    const segOverPos = isOver && isOverPositive(type)
                    return (
                      <div key={seg.id} onClick={(e) => { e.stopPropagation(); onCardClick('budgets') }} className="cursor-pointer rounded-md -mx-1 px-1 py-1 sm:py-0.5 min-h-[44px] sm:min-h-0 flex flex-col justify-center transition-colors hover:bg-kern-50">
                        <div className="flex items-center justify-between text-xs gap-1">
                          <span className="truncate text-sm text-[var(--ink-2)]">{seg.name}</span>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <span className={`font-mono text-xs font-medium ${isOver ? (segOverPos ? 'text-emerald-600' : 'text-red-600') : 'text-[var(--ink-2)]'}`}>
                              {formatCurrency(seg.spent)} <span className="hidden sm:inline text-[var(--ink-4)]">/ {formatCurrency(seg.limit)}</span>
                            </span>
                            <span className={`font-mono text-[10px] font-bold ${isOver ? (segOverPos ? 'text-emerald-600' : 'text-red-600') : 'text-[var(--ink-3)]'}`}>{pct}%</span>
                          </div>
                        </div>
                        <div className="mt-0.5 h-[2px] w-full overflow-hidden rounded-full bg-[var(--subtle)]">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${isOver ? (segOverPos ? 'bg-emerald-400' : 'bg-red-400') : ''}`}
                            style={{ width: `${Math.min(pct, 100)}%`, ...(!isOver ? { backgroundColor: pct >= 80 ? tc.text : tc.spent } : {}) }}
                          />
                        </div>
                      </div>
                    )
                  })}
                  {typeSegs.length > MAX_ITEMS_PER_TYPE && (
                    <p className="mt-1 text-[10px] text-kern-600 font-medium">
                      en {typeSegs.length - MAX_ITEMS_PER_TYPE} meer bekijken &rarr;
                    </p>
                  )}
                  {typeSegs.length === 0 && (
                    <p className="text-[11px] text-[var(--ink-4)] italic">Geen budgetten</p>
                  )}
                </div>
                )}
              </div>
            )
          }

          // Left column types (Inkomen, Sparen, Schulden)
          const leftTypes = typeOrder.map(type => ({
            type,
            segs: segmentsByType(type),
            summary: budgetTypeSummaries.find(ts => ts.type === type),
          }))
          // Right column: Uitgaven
          const expenseSummary = budgetTypeSummaries.find(ts => ts.type === 'expense')

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
                  <div>
                    <p className="text-sm font-semibold text-[var(--ink-2)]">Budgetten</p>
                    <p className="text-xs text-[var(--ink-3)]">
                      <span className="font-mono tabular-nums">{formatCurrency(totalBudgetSpent)}</span>
                      <span className="text-[var(--ink-4)]"> van </span>
                      <span className="font-mono tabular-nums">{formatCurrency(totalBudgetLimit)}</span>
                    </p>
                  </div>
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

              {/* Two-column split: Left = Inkomen/Sparen/Schulden, Right = Uitgaven — all with same structure */}
              {/* On mobile (< lg): Uitgaven first (order-1), then Inkomen/Sparen/Schulden (order-2) */}
              <div className="flex flex-col gap-4 lg:flex-row lg:gap-0">
                {/* ─── Left column: Inkomen, Sparen, Schulden (type-headers only, no individual budgets) ─── */}
                <div className="order-2 lg:order-none lg:basis-1/2 lg:shrink-0 lg:pr-5 space-y-3 border-t border-[var(--border-ed)] pt-3 lg:border-t-0 lg:pt-0">
                  {leftTypes.filter(lt => lt.summary || lt.segs.length > 0).length > 0 ? (
                    leftTypes.map(({ type, segs, summary }) => renderTypeSection(type, segs, summary, false))
                  ) : (
                    <p className="text-xs text-[var(--ink-4)]">Geen inkomen/sparen/schulden budgetten</p>
                  )}
                </div>

                {/* ─── Right column: Uitgaven (same structure as left types) — shown first on mobile ─── */}
                <div className="order-1 lg:order-none lg:basis-1/2 min-w-0 overflow-hidden lg:border-l lg:border-[var(--border-ed)] lg:pl-5">
                  {renderTypeSection('expense', expenseSegments, expenseSummary) || (
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

        {/* ── Visual separator between Budgets (cashflow) and Assets/Debts (vermogen) ── */}
        {budgetingActive && (
          <div className="hidden lg:block lg:col-span-2 h-px bg-[var(--border-md)]" role="separator" />
        )}

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
                  <p className="text-sm font-semibold text-[var(--ink-2)]">Vermogen</p>
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
