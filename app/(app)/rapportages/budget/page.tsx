'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { ArrowLeft, Printer, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronRight } from 'lucide-react'
import { formatMaskedCurrency, formatTimestamp } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { eurToFreedomTime } from '@/components/app/freedom-time-label'
import { ReportSparkline } from '@/app/(app)/rapportages/[id]/components/report-sparkline'
import { KassabonTable } from '@/app/(app)/rapportages/[id]/components/kassabon-table'
import {
  FiguresStrip,
  ScenarioCallout,
  RekeningTag,
  SectionLabel,
  OrnamentColophon,
} from '@/components/editorial'
import { SectionDivider } from '@/components/app/section-divider'
import type { BudgetReportData, BudgetReportCategory, BudgetReportVarianceItem, BudgetReportAggregate } from '@/lib/budget-report-data'

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Masked-aware currency formatter hook. Each subcomponent calls `useFc()` to
 * get a stable callback that returns either the masked placeholder or the
 * formatted EUR string, based on the privacy toggle state.
 */
function useFc() {
  const { masked } = useMaskedAmounts()
  return useCallback((v: number) => formatMaskedCurrency(v, masked), [masked])
}

function TrendIcon({ direction, invert }: { direction: 'up' | 'down' | 'flat'; invert?: boolean }) {
  if (direction === 'flat') return <Minus className="h-3 w-3 text-[var(--ink-4)]" />
  const isGood = invert ? direction === 'down' : direction === 'up'
  if (direction === 'up') return <TrendingUp className={`h-3 w-3 ${isGood ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}`} />
  return <TrendingDown className={`h-3 w-3 ${isGood ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}`} />
}

function HealthDot({ score }: { score: 'healthy' | 'warning' | 'over' }) {
  const color = score === 'healthy' ? 'bg-[var(--positive)]' : score === 'warning' ? 'bg-amber-500' : 'bg-[var(--negative)]'
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
}

function PercentBar({ percent }: { percent: number }) {
  const clamped = Math.min(percent, 100)
  const barColor = percent > 100
    ? 'bg-[var(--negative)]'
    : percent >= 80
      ? 'bg-amber-500'
      : 'bg-[var(--module-active-500)]'

  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--border-ed)]">
      <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${clamped}%` }} />
    </div>
  )
}

// ── Section: Scorecard secondary (sparkline + pillars + burn-rate) ───────────

/**
 * Secondary scorecard rendered under the editorial FiguresStrip.
 *
 * The headline numbers (Begroot, Besteed, Verschil, Vrijheid-impact) live in
 * the FiguresStrip above this block; this card focuses on context that doesn't
 * fit a 4-column strip — the 6-month spending trend, three category-health
 * pillars (Op koers / Let op / Over budget), and the mid-month burn-rate
 * projection. Together they answer "how is this month tracking?" beyond the
 * headline-totals.
 */
function BudgetScorecard({ data }: { data: BudgetReportData }) {
  const fc = useFc()
  const s = data.summary

  // Trend values: total expense spending per month
  const totalTrend = data.trendMonths.map((_, i) =>
    data.categories
      .filter(c => c.budgetType === 'expense')
      .reduce((sum, c) => sum + (c.trendValues[i] ?? 0), 0)
  )

  return (
    <div className="mb-8">
      {/* Sparkline */}
      <div className="mb-5">
        <ReportSparkline
          values={totalTrend}
          color="#c4a06b"
          height={48}
          invertTrend
          thresholdValue={s.totalBudgeted}
          thresholdColor="#94a3b8"
        />
        <div className="mt-1 flex justify-between font-inter text-[9px] text-[var(--ink-4)]">
          {data.trendMonths.map(m => <span key={m}>{m}</span>)}
        </div>
      </div>

      {/* Stat pillars */}
      <div className="grid grid-cols-3 gap-3">
        <div className="border border-[var(--module-active-300)] bg-[var(--module-active-50)]/40 p-3 text-center">
          <p className="font-dm-mono text-xl font-bold tabular-nums text-[var(--positive)]">{s.categoriesOnTrack}</p>
          <p className="mt-0.5 font-inter text-[10px] font-medium text-[var(--positive)]">Op koers</p>
        </div>
        <div className="border border-amber-200 bg-amber-50 p-3 text-center">
          <p className="font-dm-mono text-xl font-bold tabular-nums text-amber-700">{s.categoriesNearLimit}</p>
          <p className="mt-0.5 font-inter text-[10px] font-medium text-amber-600">Let op</p>
        </div>
        <div className="border border-[var(--negative)]/30 bg-[var(--negative)]/10 p-3 text-center">
          <p className="font-dm-mono text-xl font-bold tabular-nums text-[var(--negative)]">{s.categoriesOverBudget}</p>
          <p className="mt-0.5 font-inter text-[10px] font-medium text-[var(--negative)]">Over budget</p>
        </div>
      </div>

      {/* Burn rate & projection */}
      {data.daysPassed > 0 && data.daysPassed < data.daysInMonth && (
        <div className="mt-4 border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/50 p-3">
          <div className="flex items-center justify-between">
            <span className="font-inter text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)]">
              Uitgavesnelheid
            </span>
            <span className="font-dm-mono text-xs tabular-nums text-[var(--ink-2)]">
              dag {data.daysPassed} / {data.daysInMonth}
            </span>
          </div>
          <div className="mt-2">
            <PercentBar percent={Math.round((data.daysPassed / data.daysInMonth) * 100)} />
          </div>
          <p className="mt-1.5 font-source-serif text-[12px] italic text-[var(--ink-3)]">
            Bij dit tempo eindig je op{' '}
            <span className={`font-dm-mono ${s.projectedMonthEnd > s.totalBudgeted ? 'text-[var(--negative)]' : 'text-[var(--positive)]'}`}>
              {fc(s.projectedMonthEnd)}
            </span>
            {' '}— {s.projectedMonthEnd > s.totalBudgeted
              ? `${fc(s.projectedMonthEnd - s.totalBudgeted)} over budget`
              : `${fc(s.totalBudgeted - s.projectedMonthEnd)} onder budget`
            }
          </p>
        </div>
      )}
    </div>
  )
}

// ── Section: Essentieel vs Discretionair ─────────────────────────────────────

function AggregateColumn({ agg, dailyExpenseRate }: { agg: BudgetReportAggregate; dailyExpenseRate: number }) {
  const fc = useFc()
  const isUnder = agg.variance >= 0
  return (
    <div>
      <div className="space-y-1.5">
        <div className="flex justify-between">
          <span className="font-inter text-[11px] text-[var(--ink-2)]">Begroot</span>
          <span className="font-dm-mono text-[12px] tabular-nums text-[var(--ink)]">{fc(agg.budgeted)}</span>
        </div>
        <div className="flex justify-between">
          <span className="font-inter text-[11px] text-[var(--ink-2)]">Besteed</span>
          <span className="font-dm-mono text-[12px] tabular-nums text-[var(--ink)]">{fc(agg.spent)}</span>
        </div>
        <div className="border-t border-dashed border-[var(--border-ed)] pt-1 flex justify-between">
          <span className="font-inter text-[11px] font-medium text-[var(--ink-2)]">Verschil</span>
          <span className={`font-dm-mono text-[12px] font-medium tabular-nums ${isUnder ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}`}>
            {isUnder ? '+' : ''}{fc(agg.variance)}
          </span>
        </div>
        {dailyExpenseRate > 0 && Math.abs(agg.freedomDaysImpact) >= 0.1 && (
          <div className="flex justify-between">
            <span className="font-inter text-[10px] text-[var(--ink-3)]">Vrijheidsdagen</span>
            <span className={`font-dm-mono text-[10px] italic tabular-nums ${agg.freedomDaysImpact >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}`}>
              {agg.freedomDaysImpact >= 0 ? '+' : ''}{agg.freedomDaysImpact.toLocaleString('nl-NL', { maximumFractionDigits: 1 })}d
            </span>
          </div>
        )}
      </div>
      <p className="mt-2 font-inter text-[10px] text-[var(--ink-4)]">{agg.categoryCount} categorieën</p>
    </div>
  )
}

function EssentialDiscretionary({ data }: { data: BudgetReportData }) {
  // Lives inside the parent RekeningTag wrapper which provides its own paper/border
  // chrome; this block contributes only the internal 2-column structure (header
  // strip + body) without double-borders.
  return (
    <div className="overflow-hidden">
      <div className="grid grid-cols-1 md:grid-cols-2">
        <div className="border-b-2 border-[var(--ink)] bg-[var(--subtle)]/40 px-5 py-2.5">
          <p className="font-inter text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink)]">
            Essentieel
          </p>
          <p className="mt-0.5 font-source-serif text-[11px] italic text-[var(--ink-3)]">Vaste lasten &amp; noodzakelijk</p>
        </div>
        <div className="border-b-2 border-[var(--ink)] border-l-0 md:border-l border-[var(--border-ed)] bg-[var(--subtle)]/40 px-5 py-2.5">
          <p className="font-inter text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink)]">
            Discretionair
          </p>
          <p className="mt-0.5 font-source-serif text-[11px] italic text-[var(--ink-3)]">Leefplezier &amp; keuzes</p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2">
        <div className="border-r-0 md:border-r border-[var(--border-ed)] px-5 py-4">
          <AggregateColumn agg={data.essentialTotal} dailyExpenseRate={data.dailyExpenseRate} />
        </div>
        <div className="border-t md:border-t-0 border-[var(--border-ed)] px-5 py-4">
          <AggregateColumn agg={data.discretionaryTotal} dailyExpenseRate={data.dailyExpenseRate} />
        </div>
      </div>
    </div>
  )
}

// ── Section: Budget vs Werkelijk table ───────────────────────────────────────

function BudgetTableCategoryRow({ cat, isExpanded, onToggle }: { cat: BudgetReportCategory; isExpanded: boolean; onToggle: () => void }) {
  const fc = useFc()
  const hasChildren = cat.children.length > 0
  const varianceColor = cat.variance >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'

  return (
    <>
      <tr className="border-b border-dotted border-[var(--rule-soft)] hover:bg-[var(--subtle)]/30">
        <td className="py-1.5 pr-2">
          <button
            type="button"
            onClick={hasChildren ? onToggle : undefined}
            className={`flex items-center gap-1.5 ${hasChildren ? 'cursor-pointer' : 'cursor-default'}`}
          >
            <HealthDot score={cat.healthScore} />
            {hasChildren && (
              isExpanded
                ? <ChevronDown className="h-3 w-3 text-[var(--ink-4)]" />
                : <ChevronRight className="h-3 w-3 text-[var(--ink-4)]" />
            )}
            <span className="font-source-serif text-[12px] text-[var(--ink)]">{cat.name}</span>
          </button>
        </td>
        <td className="py-1.5 px-2 text-right font-dm-mono text-[12px] tabular-nums text-[var(--ink-2)]">
          {fc(cat.limit)}
        </td>
        <td className="py-1.5 px-2 text-right font-dm-mono text-[12px] tabular-nums text-[var(--ink)]">
          {fc(cat.spent)}
        </td>
        <td className={`py-1.5 px-2 text-right font-dm-mono text-[12px] font-medium tabular-nums ${varianceColor}`}>
          {cat.variance >= 0 ? '+' : ''}{fc(cat.variance)}
        </td>
        <td className={`py-1.5 px-2 text-right font-dm-mono text-[11px] tabular-nums ${cat.percentUsed > 100 ? 'text-[var(--negative)]' : 'text-[var(--ink-2)]'}`}>
          {cat.percentUsed}%
        </td>
        <td className="py-1.5 pl-2 w-20">
          {cat.trendValues.length >= 2 && (
            <ReportSparkline values={cat.trendValues} color="#c4a06b" width={80} height={20} showFill={false} invertTrend />
          )}
        </td>
      </tr>
      {hasChildren && isExpanded && cat.children.map(child => (
        <tr key={child.id} className="border-b border-dotted border-[var(--rule-soft)]/60">
          <td className="py-1 pr-2 pl-6">
            <span className="font-source-serif text-[11px] text-[var(--ink-3)]">{child.name}</span>
          </td>
          <td className="py-1 px-2 text-right font-dm-mono text-[11px] tabular-nums text-[var(--ink-3)]">
            {fc(child.limit)}
          </td>
          <td className="py-1 px-2 text-right font-dm-mono text-[11px] tabular-nums text-[var(--ink-2)]">
            {fc(child.spent)}
          </td>
          <td className={`py-1 px-2 text-right font-dm-mono text-[11px] tabular-nums ${child.limit - child.spent >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}`}>
            {child.limit - child.spent >= 0 ? '+' : ''}{fc(child.limit - child.spent)}
          </td>
          <td className={`py-1 px-2 text-right font-dm-mono text-[10px] tabular-nums ${child.percentUsed > 100 ? 'text-[var(--negative)]' : 'text-[var(--ink-3)]'}`}>
            {child.percentUsed}%
          </td>
          <td />
        </tr>
      ))}
    </>
  )
}

function BudgetTable({ categories }: { categories: BudgetReportCategory[] }) {
  // Default: all expanded
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(categories.filter(c => c.children.length > 0).map(c => c.id)))

  // Sleep-affordance: show "sleep →" hint on mobile until the user has scrolled
  // horizontally at least once. Hint hides on first non-zero scrollLeft so it
  // doesn't repeatedly nag after the user has discovered the gesture.
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [scrolled, setScrolled] = useState(false)

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleScroll() {
    if (scrolled) return
    const el = scrollRef.current
    if (el && el.scrollLeft > 4) setScrolled(true)
  }

  const expense = categories.filter(c => c.budgetType === 'expense')
  const savings = categories.filter(c => c.budgetType === 'savings')
  const debt = categories.filter(c => c.budgetType === 'debt')

  function renderGroup(items: BudgetReportCategory[], label: string) {
    if (items.length === 0) return null
    return (
      <>
        <tr>
          <td colSpan={6} className="pt-4 pb-1.5">
            <span className="text-[10px] uppercase tracking-[0.08em] font-mono text-[var(--ink-4)]">{label}</span>
          </td>
        </tr>
        {items.map(cat => (
          <BudgetTableCategoryRow key={cat.id} cat={cat} isExpanded={expanded.has(cat.id)} onToggle={() => toggle(cat.id)} />
        ))}
      </>
    )
  }

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      data-scrolled={scrolled ? 'true' : 'false'}
      className="relative overflow-x-auto"
    >
      {/* Sleep-affordance: only visible on <640px until user scrolls horizontally. */}
      {!scrolled && (
        <span
          aria-hidden
          className="pointer-events-none absolute right-2 top-2 z-[2] px-1.5 py-px font-mono text-[8.5px] uppercase tracking-[0.10em] text-[var(--module-active-500)] bg-[var(--paper)] border border-[var(--rule-soft)] sm:hidden"
        >
          sleep &rarr;
        </span>
      )}
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b-2 border-[var(--ink)]">
            <th className="pb-1.5 text-left text-[10px] uppercase tracking-[0.08em] font-mono text-[var(--ink-4)]">Categorie</th>
            <th className="pb-1.5 px-2 text-right text-[10px] uppercase tracking-[0.08em] font-mono text-[var(--ink-4)]">Budget</th>
            <th className="pb-1.5 px-2 text-right text-[10px] uppercase tracking-[0.08em] font-mono text-[var(--ink-4)]">Besteed</th>
            <th className="pb-1.5 px-2 text-right text-[10px] uppercase tracking-[0.08em] font-mono text-[var(--ink-4)]">Verschil</th>
            <th className="pb-1.5 px-2 text-right text-[10px] uppercase tracking-[0.08em] font-mono text-[var(--ink-4)]">%</th>
            <th className="pb-1.5 pl-2 text-right text-[10px] uppercase tracking-[0.08em] font-mono text-[var(--ink-4)]">Trend</th>
          </tr>
        </thead>
        <tbody>
          {renderGroup(expense, 'Uitgaven')}
          {renderGroup(savings, 'Sparen')}
          {renderGroup(debt, 'Schulden')}
        </tbody>
      </table>
    </div>
  )
}

// ── Section: Over/Under budget highlights ────────────────────────────────────

function VarianceItemList({ items, variant, dailyRate }: { items: BudgetReportVarianceItem[]; variant: 'over' | 'under'; dailyRate: number }) {
  const fc = useFc()
  const isOver = variant === 'over'
  const totalFreedom = items.reduce((s, i) => s + Math.abs(i.freedomDaysImpact), 0)

  // Editorial comparison-row treatment: a tinted block (8% color-mix) with a 3px
  // semantic left-border replaces the prior rounded box-card. Section header is
  // a SectionLabel so the kicker-streep style stays consistent with the rest of
  // the editorial layout.
  const tone = isOver
    ? {
        bg: 'bg-[color-mix(in_oklch,var(--negative)_8%,transparent)]',
        border: 'border-l-[3px] border-[var(--negative)]',
        accent: 'text-[var(--negative)]',
        ruleSoft: 'border-[var(--negative)]/30',
      }
    : {
        bg: 'bg-[color-mix(in_oklch,var(--positive)_8%,transparent)]',
        border: 'border-l-[3px] border-[var(--positive)]',
        accent: 'text-[var(--positive)]',
        ruleSoft: 'border-[var(--positive)]/30',
      }

  return (
    <div>
      <SectionLabel>
        {isOver ? 'Over budget' : 'Onder budget'}
      </SectionLabel>
      <div className={`${tone.bg} ${tone.border} p-4`}>
        <div className="space-y-1.5">
          {items.map(item => (
            <div key={item.categoryName} className="flex justify-between gap-2">
              <span className="truncate font-source-serif text-[12px] text-[var(--ink-2)]">{item.categoryName}</span>
              <span className={`shrink-0 font-dm-mono text-[12px] tabular-nums ${tone.accent}`}>
                {isOver ? '' : '+'}{fc(item.variance)}
              </span>
            </div>
          ))}
        </div>
        {dailyRate > 0 && totalFreedom >= 0.1 && (
          <div className={`mt-2 border-t border-dashed pt-1.5 ${tone.ruleSoft}`}>
            <p className={`font-inter text-[10px] italic ${tone.accent}`}>
              {isOver
                ? `${totalFreedom.toLocaleString('nl-NL', { maximumFractionDigits: 1 })} vrijheidsdagen verloren`
                : `${totalFreedom.toLocaleString('nl-NL', { maximumFractionDigits: 1 })} vrijheidsdagen gewonnen`
              }
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function VarianceHighlights({ over, under, dailyRate }: { over: BudgetReportVarianceItem[]; under: BudgetReportVarianceItem[]; dailyRate: number }) {
  if (over.length === 0 && under.length === 0) return null

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {over.length > 0 && <VarianceItemList items={over} variant="over" dailyRate={dailyRate} />}
      {under.length > 0 && <VarianceItemList items={under} variant="under" dailyRate={dailyRate} />}
    </div>
  )
}

// ── Section: Trend grid ──────────────────────────────────────────────────────

function TrendGrid({ categories }: { categories: BudgetReportCategory[] }) {
  const fc = useFc()
  const expenseCategories = categories
    .filter(c => c.budgetType === 'expense' && c.trendValues.some(v => v > 0))
    .sort((a, b) => b.spent - a.spent)

  if (expenseCategories.length === 0) return null

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {expenseCategories.map(cat => (
        <div key={cat.id} className="flex items-center gap-3 rounded-[var(--r)] border border-dashed border-[var(--border-ed)] bg-[var(--subtle)]/30 px-3 py-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate font-inter text-[11px] font-medium text-[var(--ink)]">{cat.name}</span>
              <TrendIcon direction={cat.trendDirection} invert />
            </div>
            <p className="font-dm-mono text-[10px] tabular-nums text-[var(--ink-3)]">{fc(cat.spent)}</p>
          </div>
          <div className="w-20 shrink-0">
            <ReportSparkline values={cat.trendValues} color="#c4a06b" width={80} height={24} showFill={false} invertTrend />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Section: Month comparison ────────────────────────────────────────────────

function MonthComparison({ data }: { data: BudgetReportData }) {
  const fc = useFc()
  const c = data.comparison
  // Top changers (biggest absolute month-over-month change)
  const topChangers = data.categories
    .filter(cat => cat.budgetType === 'expense' && cat.previousMonthSpent > 0)
    .sort((a, b) => Math.abs(b.monthOverMonthChange) - Math.abs(a.monthOverMonthChange))
    .slice(0, 3)

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-[var(--ink)]">
              <th className="pb-1.5 text-left font-inter text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]" />
              <th className="pb-1.5 px-3 text-right font-inter text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">{c.previousMonth.label}</th>
              <th className="pb-1.5 px-3 text-right font-inter text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">{c.threeMonthAverage.label}</th>
              <th className="pb-1.5 px-3 text-right font-inter text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">{c.currentMonth.label}</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-dashed border-[var(--border-ed)]">
              <td className="py-1.5 font-source-serif text-[12px] text-[var(--ink-2)]">Totaal uitgaven</td>
              <td className="py-1.5 px-3 text-right font-dm-mono text-[12px] tabular-nums text-[var(--ink-2)]">{fc(c.previousMonth.totalSpent)}</td>
              <td className="py-1.5 px-3 text-right font-dm-mono text-[12px] tabular-nums text-[var(--ink-2)]">{fc(c.threeMonthAverage.totalSpent)}</td>
              <td className="py-1.5 px-3 text-right font-dm-mono text-[12px] font-medium tabular-nums text-[var(--ink)]">{fc(c.currentMonth.totalSpent)}</td>
            </tr>
            {c.currentMonth.savingsRate != null && (
              <tr className="border-b border-dashed border-[var(--border-ed)]">
                <td className="py-1.5 font-source-serif text-[12px] text-[var(--ink-2)]">Spaarquote</td>
                <td className="py-1.5 px-3 text-right font-dm-mono text-[12px] tabular-nums text-[var(--ink-2)]">
                  {c.previousMonth.savingsRate != null ? `${c.previousMonth.savingsRate}%` : '-'}
                </td>
                <td className="py-1.5 px-3 text-right font-dm-mono text-[12px] tabular-nums text-[var(--ink-2)]">-</td>
                <td className="py-1.5 px-3 text-right font-dm-mono text-[12px] font-medium tabular-nums text-[var(--ink)]">
                  {c.currentMonth.savingsRate}%
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Biggest changers */}
      {topChangers.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 font-inter text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)]">
            Grootste veranderingen vs. vorige maand
          </p>
          <div className="space-y-1">
            {topChangers.map(cat => {
              const isUp = cat.monthOverMonthChange > 0
              return (
                <div key={cat.id} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <TrendIcon direction={isUp ? 'up' : 'down'} invert />
                    <span className="font-source-serif text-[12px] text-[var(--ink-2)]">{cat.name}</span>
                  </div>
                  <span className={`font-dm-mono text-[11px] tabular-nums ${isUp ? 'text-[var(--negative)]' : 'text-[var(--positive)]'}`}>
                    {isUp ? '+' : ''}{cat.monthOverMonthChange}%
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Section: Budget utilization distribution ─────────────────────────────────

function UtilizationDistribution({ categories }: { categories: BudgetReportCategory[] }) {
  const expense = categories.filter(c => c.budgetType === 'expense' && c.limit > 0)
  if (expense.length === 0) return null

  const buckets = {
    low: expense.filter(c => c.percentUsed < 50).length,
    medium: expense.filter(c => c.percentUsed >= 50 && c.percentUsed < 80).length,
    high: expense.filter(c => c.percentUsed >= 80 && c.percentUsed <= 100).length,
    over: expense.filter(c => c.percentUsed > 100).length,
  }
  const total = expense.length

  return (
    <div className="rounded-[var(--r)] border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/50 p-4">
      <p className="mb-2 font-inter text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)]">
        Budget benutting
      </p>
      <div className="flex h-4 overflow-hidden rounded-full">
        {buckets.low > 0 && (
          <div className="bg-[var(--module-active-300)]" style={{ width: `${(buckets.low / total) * 100}%` }} title={`${buckets.low} onder 50%`} />
        )}
        {buckets.medium > 0 && (
          <div className="bg-[var(--module-active-500)]" style={{ width: `${(buckets.medium / total) * 100}%` }} title={`${buckets.medium} tussen 50–80%`} />
        )}
        {buckets.high > 0 && (
          <div className="bg-amber-400" style={{ width: `${(buckets.high / total) * 100}%` }} title={`${buckets.high} tussen 80–100%`} />
        )}
        {buckets.over > 0 && (
          <div className="bg-[var(--negative)]" style={{ width: `${(buckets.over / total) * 100}%` }} title={`${buckets.over} boven 100%`} />
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        <span className="flex items-center gap-1 font-inter text-[10px] text-[var(--ink-3)]">
          <span className="inline-block h-2 w-2 rounded-full bg-[var(--module-active-300)]" /> {buckets.low}× &lt;50%
        </span>
        <span className="flex items-center gap-1 font-inter text-[10px] text-[var(--ink-3)]">
          <span className="inline-block h-2 w-2 rounded-full bg-[var(--module-active-500)]" /> {buckets.medium}× 50–80%
        </span>
        <span className="flex items-center gap-1 font-inter text-[10px] text-[var(--ink-3)]">
          <span className="inline-block h-2 w-2 rounded-full bg-amber-400" /> {buckets.high}× 80–100%
        </span>
        <span className="flex items-center gap-1 font-inter text-[10px] text-[var(--ink-3)]">
          <span className="inline-block h-2 w-2 rounded-full bg-[var(--negative)]" /> {buckets.over}× &gt;100%
        </span>
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function BudgetReportPage() {
  const fc = useFc()
  const router = useRouter()
  const searchParams = useSearchParams()
  const monthParam = searchParams.get('month')
  const now = new Date()
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const month = monthParam || defaultMonth

  const [data, setData] = useState<BudgetReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchReport() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/report/budget?month=${month}`)
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || 'Rapport laden mislukt')
        }
        setData(await res.json())
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Rapport laden mislukt')
      } finally {
        setLoading(false)
      }
    }
    fetchReport()
  }, [month])

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-[var(--module-active-500)] border-t-transparent" />
          <p className="font-inter text-sm text-[var(--ink-3)]">Budgetrapport wordt opgesteld...</p>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <p className="font-playfair text-xl text-[var(--ink)]">Rapport niet beschikbaar</p>
          <p className="mt-2 font-inter text-sm text-[var(--ink-3)]">{error || 'Geen data gevonden'}</p>
          <button
            type="button"
            onClick={() => router.push('/rapportages')}
            className="mt-4 rounded-[var(--r)] bg-[var(--ink)] px-4 py-2 font-inter text-sm text-[var(--paper)] hover:bg-[var(--ink-2)]"
          >
            Terug naar rapportages
          </button>
        </div>
      </div>
    )
  }

  const freedom = data.dailyExpenseRate > 0 && data.summary.freedomDaysVariance !== 0
    ? eurToFreedomTime(Math.abs(data.summary.totalVariance), data.dailyExpenseRate)
    : null

  const freedomGained = data.summary.totalVariance >= 0

  return (
    <div className="mx-auto max-w-[900px] px-4 py-6 md:px-8">
      {/* ── Toolbar ── */}
      <div data-print-hide className="mb-6 flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.push('/rapportages')}
          className="flex items-center gap-2 font-inter text-sm text-[var(--ink-2)] transition-colors hover:text-[var(--ink)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Terug naar rapportages
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-2 rounded-[var(--r)] border border-[var(--border-md)] bg-[var(--paper)] px-4 py-2 font-inter text-sm font-medium text-[var(--ink)] shadow-[var(--s0)] transition-all hover:shadow-[var(--s1)] hover:-translate-y-px"
        >
          <Printer className="h-4 w-4" />
          Afdrukken als PDF
        </button>
      </div>

      {/* ── Editorial masthead met dubbele lijn ── */}
      <div
        className="pb-4 mb-8"
        style={{ borderBottom: '4px double var(--ink)' }}
      >
        <div className="inline-flex items-center justify-center gap-2.5 text-[10px] uppercase tracking-[0.22em] font-mono text-[var(--module-active-700)] mb-1 w-full">
          <span
            aria-hidden
            className="inline-block h-px w-7 shrink-0"
            style={{ background: 'var(--module-active-500)' }}
          />
          Budgetrapport
          <span
            aria-hidden
            className="inline-block h-px w-7 shrink-0"
            style={{ background: 'var(--module-active-500)' }}
          />
        </div>
        <h1
          className="text-center text-3xl font-bold tracking-tight text-[var(--ink)] md:text-[42px] md:leading-[1.1]"
          style={{ fontFamily: 'var(--font-playfair, serif)', letterSpacing: '-0.03em' }}
        >
          {data.monthLabel}
        </h1>
        <div className="mt-3 flex items-center justify-center gap-2 text-[13px] font-source-serif italic text-[var(--ink-3)]">
          {data.displayName && <span>{data.displayName}</span>}
          {data.displayName && <span>&middot;</span>}
          <span>Gegenereerd op {new Date(data.generatedAt).toLocaleDateString('nl-NL')}</span>
        </div>
      </div>

      {/* ── Methodologie-callout — uitleg vóór de cijfers ── */}
      <ScenarioCallout title="Hoe dit rapport leest">
        Variance = limit &minus; spent. Een negatieve variance betekent meer besteed dan begroot.
        De vrijheid-impact onderaan is het variance-bedrag omgerekend naar tijd, met je
        dagelijkse uitgaven-rate als deler.
      </ScenarioCallout>

      {/* ── Mini-hero figures-strip — 4 hoofdgetallen, vrijheid-impact als winnaar ── */}
      <FiguresStrip
        cols={4}
        figures={[
          {
            kicker: 'Begroot',
            amount: fc(data.summary.totalBudgeted),
            sub: `${data.categories.length} ${data.categories.length === 1 ? 'categorie' : 'categorieën'}`,
            variant: 'neutral',
          },
          {
            kicker: 'Besteed',
            amount: fc(data.summary.totalSpent),
            sub: `${data.daysPassed}/${data.daysInMonth} dagen`,
            variant: 'neutral',
          },
          {
            kicker: 'Verschil',
            amount: `${data.summary.totalVariance >= 0 ? '+' : ''}${fc(data.summary.totalVariance)}`,
            sub: `${data.summary.variancePercent}%`,
            variant: data.summary.totalVariance >= 0 ? 'positive' : 'negative',
          },
          {
            kicker: 'Vrijheid-impact',
            amount: freedom ? `${freedomGained ? '+' : '-'}${freedom.formatted}` : '—',
            sub: data.summary.projectedMonthEnd != null
              ? `vs. ${fc(data.summary.projectedMonthEnd)} eind maand`
              : 'opgespaarde tijd',
            // Hoofduitkomst — automatische highlight-marker via FiguresStrip-cell.
            variant: 'winner',
          },
        ]}
      />

      {/* ── Secundaire scorecard: sparkline + categorie-pillars + burn-rate ── */}
      <BudgetScorecard data={data} />

      {/* ── Budget vs Werkelijk (direct na scorecard — bedragen zijn het belangrijkst) ── */}
      <div className="mb-8">
        <div className="mb-4 flex items-center justify-between border-b border-[var(--border-ed)] pb-2">
          <span className="font-inter text-[11px] font-semibold uppercase tracking-[0.11em] text-[var(--ink-3)]">
            Budget vs. Werkelijk
          </span>
          <span className="font-source-serif text-[13px] italic text-[var(--ink-3)]">
            {data.categories.length} categorieën
          </span>
        </div>
        <BudgetTable categories={data.categories} />
      </div>

      {/* ── Over/Under budget highlights ── */}
      {(data.overBudgetCategories.length > 0 || data.underBudgetCategories.length > 0) && (
        <div className="mb-8">
          <VarianceHighlights
            over={data.overBudgetCategories}
            under={data.underBudgetCategories}
            dailyRate={data.dailyExpenseRate}
          />
        </div>
      )}

      {/* ── Dateline ── */}
      <div className="mb-6 flex items-center justify-between border-b border-[var(--border-ed)] pb-2">
        <span className="font-inter text-[11px] font-semibold uppercase tracking-[0.11em] text-[var(--ink-3)]">
          Inkomen &amp; Uitgaven
        </span>
      </div>

      {/* ── Kassabon + Essential/Discretionary, omhuld door RekeningTag ── */}
      <div className="mb-8">
        <RekeningTag label="rekening">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <KassabonTable
              title="Kassabon"
              rows={[
                { label: 'Inkomen', value: data.summary.totalIncomeActual, sublabel: `/ ${fc(data.summary.totalIncomeBudgeted)}` },
                { label: 'Uitgaven', value: -data.categories.filter(c => c.budgetType === 'expense').reduce((s, c) => s + c.spent, 0), sublabel: `/ ${fc(data.categories.filter(c => c.budgetType === 'expense').reduce((s, c) => s + c.limit, 0))}` },
                { label: 'Sparen', value: -data.summary.totalSavingsActual, sublabel: `/ ${fc(data.summary.totalSavingsBudgeted)}` },
                { label: 'Schulden', value: -data.summary.totalDebtActual, sublabel: `/ ${fc(data.summary.totalDebtBudgeted)}` },
              ]}
              total={{
                label: data.summary.savingsRate != null ? `Spaarquote: ${data.summary.savingsRate}%` : 'Netto',
                value: data.summary.totalIncomeActual - data.categories.filter(c => c.budgetType === 'expense').reduce((s, c) => s + c.spent, 0) - data.summary.totalSavingsActual - data.summary.totalDebtActual,
              }}
              footer={`Gebaseerd op transacties in ${data.monthLabel.toLowerCase()}`}
            />
            <EssentialDiscretionary data={data} />
          </div>
        </RekeningTag>
      </div>

      {/* ── Budget benutting verdeling ── */}
      <div className="mb-8">
        <UtilizationDistribution categories={data.categories} />
      </div>

      {/* ── Uitgavetrends (seizoenspatronen) ── */}
      <div className="mb-8">
        <div className="mb-4 flex items-center justify-between border-b border-[var(--border-ed)] pb-2">
          <span className="font-inter text-[11px] font-semibold uppercase tracking-[0.11em] text-[var(--ink-3)]">
            Uitgavetrends
          </span>
          <span className="font-source-serif text-[13px] italic text-[var(--ink-3)]">
            6 maanden
          </span>
        </div>
        <TrendGrid categories={data.categories} />
      </div>

      {/* ── Maandvergelijking ── */}
      <div className="mb-8">
        <div className="mb-4 flex items-center justify-between border-b border-[var(--border-ed)] pb-2">
          <span className="font-inter text-[11px] font-semibold uppercase tracking-[0.11em] text-[var(--ink-3)]">
            Maandvergelijking
          </span>
        </div>
        <MonthComparison data={data} />
      </div>

      {/* ── Cumulatief YTD ── */}
      {data.ytd.monthsCovered > 1 && (
        <div className="mb-8 rounded-[var(--r)] border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/50 p-4">
          <p className="mb-2 font-inter text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)]">
            Jaar tot datum ({data.ytd.monthsCovered} maanden)
          </p>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="font-dm-mono text-sm font-bold tabular-nums text-[var(--ink)]">{fc(data.ytd.totalBudgeted)}</p>
              <p className="mt-0.5 font-inter text-[10px] text-[var(--ink-3)]">Begroot</p>
            </div>
            <div>
              <p className="font-dm-mono text-sm font-bold tabular-nums text-[var(--ink)]">{fc(data.ytd.totalSpent)}</p>
              <p className="mt-0.5 font-inter text-[10px] text-[var(--ink-3)]">Besteed</p>
            </div>
            <div>
              <p className={`font-dm-mono text-sm font-bold tabular-nums ${data.ytd.variance >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}`}>
                {data.ytd.variance >= 0 ? '+' : ''}{fc(data.ytd.variance)}
              </p>
              <p className="mt-0.5 font-inter text-[10px] text-[var(--ink-3)]">Verschil</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Rollovers ── */}
      {data.rollovers.length > 0 && (
        <div className="mb-8">
          <div className="mb-4 flex items-center justify-between border-b border-[var(--border-ed)] pb-2">
            <span className="font-inter text-[11px] font-semibold uppercase tracking-[0.11em] text-[var(--ink-3)]">
              Rollovers
            </span>
            <span className="font-dm-mono text-[12px] tabular-nums text-[var(--ink-2)]">
              Totaal: {fc(data.totalRolloverImpact)}
            </span>
          </div>
          <div className="space-y-1">
            {data.rollovers.map(r => (
              <div key={r.budgetId} className="flex items-center justify-between gap-2 py-0.5">
                <span className="truncate font-source-serif text-[12px] text-[var(--ink-2)]">{r.budgetName}</span>
                <div className="flex items-center gap-2">
                  <span className="font-inter text-[10px] text-[var(--ink-4)]">{r.rolloverType}</span>
                  <span className="font-dm-mono text-[12px] tabular-nums text-[var(--positive)]">+{fc(r.carriedAmount)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Vrijheidstijd-eindconclusie ──
           De FiguresStrip boven heeft het cijfer al met highlight-marker als
           "winner" gemarkeerd; om dubbele highlight-markers binnen één pagina
           te vermijden vervangen we hier het rounded-badge-frame door een
           dubbele-lijn-finale (`border-b-4 border-double border-[var(--ink)]`)
           rond het hoofdbedrag — de boekhoudkundige sluitstreep die in de
           editorial blueprint hoort op de eindrij. */}
      {freedom && (
        <div className="mt-8 text-center">
          <p className="font-inter text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)] mb-3">
            Geld is opgeslagen tijd
          </p>
          <p
            className={`inline-block font-playfair text-4xl font-bold pb-2 ${freedomGained ? 'text-[var(--module-active-700)]' : 'text-[var(--negative)]'}`}
            style={{ letterSpacing: '-0.03em', borderBottom: '4px double var(--ink)' }}
          >
            {freedomGained ? '+' : '-'}{freedom.formatted}
          </p>
          <p className={`mt-2 font-inter text-[10px] font-bold uppercase tracking-[0.08em] ${freedomGained ? 'text-[var(--module-active-700)]' : 'text-[var(--negative)]'}`}>
            {freedomGained ? 'vrijheid gewonnen' : 'vrijheid verloren'}
          </p>
          <p className="mx-auto mt-3 max-w-prose font-source-serif text-[13px] italic text-[var(--ink-3)]">
            Je budgetdiscipline in {data.monthLabel.toLowerCase()} vertegenwoordigt{' '}
            {freedom.formattedDagen} aan {freedomGained ? 'gewonnen' : 'verloren'} financiële vrijheid,
            gebaseerd op je dagelijkse uitgaven van {fc(Math.round(data.dailyExpenseRate))}/dag.
          </p>
        </div>
      )}

      {/* ── Editorial footer: dubbele-lijn-divider + tf.-monogram + ornament-colophon ── */}
      <SectionDivider variant="double-rule" className="mt-10" />
      <div className="text-center pt-2">
        <p className="font-playfair text-lg font-bold text-[var(--ink)]">
          <span>t</span><span style={{ color: 'var(--module-active-700)' }}>f.</span>
        </p>
        <p className="mt-1 font-source-serif text-[13px] italic text-[var(--ink-3)]">
          &ldquo;Geld is opgeslagen tijd&rdquo;
        </p>
      </div>
      <OrnamentColophon
        module="Budget"
        text={formatTimestamp(data.generatedAt)}
      />
    </div>
  )
}
