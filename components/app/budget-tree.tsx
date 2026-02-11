'use client'

import { useRef, useLayoutEffect, useState, useCallback, useEffect } from 'react'
import { BudgetIcon, formatCurrency, getTypeColors, type BudgetType } from '@/components/app/budget-shared'
import type { Budget, BudgetWithChildren } from '@/lib/budget-data'

interface BudgetTreeProps {
  groups: BudgetWithChildren[]
  spending: Record<string, number>
  budgetType: BudgetType
  onNavigate: (budgetId: string) => void
}

/* ── ChildBar ────────────────────────────────────────────────── */

function ChildBar({
  child,
  spent,
  budgetType,
  onNavigate,
  onHover,
  isHovered,
}: {
  child: Budget
  spent: number
  budgetType: BudgetType
  onNavigate: (id: string) => void
  onHover: (id: string | null) => void
  isHovered: boolean
}) {
  const limit = Number(child.default_limit)
  const pct = limit > 0 ? (spent / limit) * 100 : 0
  const overBudget = spent > limit && limit > 0
  const overPct = overBudget ? Math.min(((spent - limit) / limit) * 100, 40) : 0
  const alertThreshold = child.alert_threshold ?? 80
  const isHard = child.limit_type === 'hard'
  const isAboveAlert = pct >= alertThreshold
  const colors = getTypeColors(budgetType)

  const fillColor = overBudget
    ? 'bg-red-500'
    : isAboveAlert
      ? colors.barWarning
      : colors.barDefault

  return (
    <div
      className={`group flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors ${
        isHovered ? 'bg-zinc-100' : 'hover:bg-zinc-50'
      }`}
      onClick={() => onNavigate(child.id)}
      onMouseEnter={() => onHover(child.id)}
      onMouseLeave={() => onHover(null)}
      data-child-id={child.id}
    >
      {/* Icon */}
      <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${colors.bg}`}>
        <BudgetIcon name={child.icon} className={`h-3.5 w-3.5 ${colors.textLight}`} />
      </div>

      {/* Name */}
      <span className="w-28 shrink-0 truncate text-xs font-medium text-zinc-700 lg:w-36">
        {child.name}
      </span>

      {/* Bar track */}
      <div className="relative flex-1" style={{ minHeight: 14 }}>
        {/* Background track */}
        <div className="absolute inset-y-1 left-0 right-0 rounded-full bg-zinc-100" />

        {/* Fill */}
        <div
          className={`absolute inset-y-1 left-0 rounded-full transition-all duration-500 ${fillColor}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />

        {/* Over-budget extension */}
        {overBudget && (
          <div
            className="absolute inset-y-1 rounded-r-full bg-red-500/70"
            style={{ left: '100%', width: `${overPct}%` }}
          />
        )}

        {/* Alert threshold marker */}
        {alertThreshold > 0 && alertThreshold < 100 && (
          <div
            className="absolute top-0 bottom-0 w-px border-l border-dashed border-zinc-400"
            style={{ left: `${alertThreshold}%`, marginTop: -2, marginBottom: -2 }}
          />
        )}

        {/* Limit boundary (the "fence") */}
        <div
          className={`absolute top-0 bottom-0 ${
            isHard ? 'w-0.5' : 'w-0.5 border-l border-dashed'
          }`}
          style={{
            left: '100%',
            marginTop: -2,
            marginBottom: -2,
            backgroundColor: isHard ? (overBudget ? '#ef4444' : colors.hex) : undefined,
            borderColor: !isHard ? (overBudget ? '#ef4444' : colors.hex) : undefined,
          }}
        />
      </div>

      {/* Amount label */}
      <span className="w-24 shrink-0 text-right text-xs text-zinc-500 lg:w-28">
        <span className={`font-medium ${overBudget ? 'text-red-600' : 'text-zinc-700'}`}>
          {formatCurrency(spent)}
        </span>
        <span className="text-zinc-400"> / {formatCurrency(limit)}</span>
      </span>
    </div>
  )
}

/* ── ParentNode ──────────────────────────────────────────────── */

function ParentNode({
  parent,
  totalSpent,
  totalLimit,
  budgetType,
  onNavigate,
}: {
  parent: Budget
  totalSpent: number
  totalLimit: number
  budgetType: BudgetType
  onNavigate: (id: string) => void
}) {
  const colors = getTypeColors(budgetType)
  const pct = totalLimit > 0 ? Math.min(Math.round((totalSpent / totalLimit) * 100), 100) : 0

  return (
    <div
      className="flex w-40 cursor-pointer flex-col items-center gap-2 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md"
      onClick={() => onNavigate(parent.id)}
      data-parent-id={parent.id}
    >
      <div className={`flex h-10 w-10 items-center justify-center rounded-full ${colors.bgDark}`}>
        <BudgetIcon name={parent.icon} className={`h-5 w-5 ${colors.text}`} />
      </div>
      <p className="w-full truncate text-center text-xs font-semibold text-zinc-800">
        {parent.name}
      </p>
      <p className="text-xs text-zinc-500">
        <span className="font-medium text-zinc-700">{formatCurrency(totalSpent)}</span>
        <span className="text-zinc-400"> / {formatCurrency(totalLimit)}</span>
      </p>
      {/* Mini progress bar */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            totalSpent > totalLimit ? 'bg-red-500' : pct > 80 ? colors.barWarning : colors.barDefault
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

/* ── BezierConnectors ────────────────────────────────────────── */

function BezierConnectors({
  containerRef,
  parentId,
  childIds,
  hoveredChild,
  budgetType,
  spending,
  budgets,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>
  parentId: string
  childIds: string[]
  hoveredChild: string | null
  budgetType: BudgetType
  spending: Record<string, number>
  budgets: Budget[]
}) {
  const [paths, setPaths] = useState<
    { d: string; childId: string; overBudget: boolean }[]
  >([])
  const [svgSize, setSvgSize] = useState({ w: 0, h: 0 })
  const colors = getTypeColors(budgetType)

  const measure = useCallback(() => {
    const container = containerRef.current
    if (!container) return

    const rect = container.getBoundingClientRect()
    setSvgSize({ w: rect.width, h: rect.height })

    const parentEl = container.querySelector(`[data-parent-id="${parentId}"]`)
    if (!parentEl) return

    const pRect = parentEl.getBoundingClientRect()
    const px = pRect.right - rect.left
    const py = pRect.top + pRect.height / 2 - rect.top

    const newPaths: { d: string; childId: string; overBudget: boolean }[] = []

    for (const childId of childIds) {
      const childEl = container.querySelector(`[data-child-id="${childId}"]`)
      if (!childEl) continue

      const cRect = childEl.getBoundingClientRect()
      const cx = cRect.left - rect.left
      const cy = cRect.top + cRect.height / 2 - rect.top

      const dx = cx - px
      const cp1x = px + dx * 0.6
      const cp2x = cx - dx * 0.6

      const d = `M ${px} ${py} C ${cp1x} ${py}, ${cp2x} ${cy}, ${cx} ${cy}`

      const budget = budgets.find((b) => b.id === childId)
      const spent = spending[childId] ?? 0
      const limit = budget ? Number(budget.default_limit) : 0
      const overBudget = spent > limit && limit > 0

      newPaths.push({ d, childId, overBudget })
    }

    setPaths(newPaths)
  }, [containerRef, parentId, childIds, spending, budgets])

  useLayoutEffect(() => {
    measure()
  }, [measure])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver(() => measure())
    observer.observe(container)
    return () => observer.disconnect()
  }, [containerRef, measure])

  if (paths.length === 0 || svgSize.w === 0) return null

  return (
    <svg
      className="pointer-events-none absolute inset-0"
      width={svgSize.w}
      height={svgSize.h}
      style={{ overflow: 'visible' }}
    >
      {paths.map(({ d, childId, overBudget }) => {
        const isActive = hoveredChild === childId
        return (
          <path
            key={childId}
            d={d}
            fill="none"
            stroke={overBudget ? '#ef4444' : colors.hex}
            strokeWidth={isActive ? 2 : 1.5}
            opacity={isActive ? 0.8 : 0.3}
            className="transition-all duration-200"
          />
        )
      })}
    </svg>
  )
}

/* ── TreeGroup (one parent + children) ───────────────────────── */

function TreeGroup({
  parent,
  spending,
  budgetType,
  onNavigate,
}: {
  parent: BudgetWithChildren
  spending: Record<string, number>
  budgetType: BudgetType
  onNavigate: (id: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [hoveredChild, setHoveredChild] = useState<string | null>(null)

  const totalSpent = parent.children.length > 0
    ? parent.children.reduce((sum, c) => sum + (spending[c.id] ?? 0), 0)
    : (spending[parent.id] ?? 0)
  const totalLimit = Number(parent.default_limit)

  const childIds = parent.children.map((c) => c.id)

  if (parent.children.length === 0) {
    // No children — show single card
    return (
      <div
        className="flex cursor-pointer items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 transition-shadow hover:shadow-md"
        onClick={() => onNavigate(parent.id)}
      >
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${getTypeColors(budgetType).bg}`}>
          <BudgetIcon name={parent.icon} className={`h-5 w-5 ${getTypeColors(budgetType).text}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-zinc-900">{parent.name}</p>
          <p className="text-xs text-zinc-500">
            {formatCurrency(totalSpent)} / {formatCurrency(totalLimit)}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mb-6">
      {/* Desktop: tree layout */}
      <div ref={containerRef} className="relative hidden items-start gap-6 md:flex">
        {/* SVG overlay */}
        <BezierConnectors
          containerRef={containerRef}
          parentId={parent.id}
          childIds={childIds}
          hoveredChild={hoveredChild}
          budgetType={budgetType}
          spending={spending}
          budgets={parent.children}
        />

        {/* Parent node (left) */}
        <div className="shrink-0 pt-2">
          <ParentNode
            parent={parent}
            totalSpent={totalSpent}
            totalLimit={totalLimit}
            budgetType={budgetType}
            onNavigate={onNavigate}
          />
        </div>

        {/* Children (right) */}
        <div className="min-w-0 flex-1 space-y-0.5">
          {parent.children.map((child) => (
            <ChildBar
              key={child.id}
              child={child}
              spent={spending[child.id] ?? 0}
              budgetType={budgetType}
              onNavigate={onNavigate}
              onHover={setHoveredChild}
              isHovered={hoveredChild === child.id}
            />
          ))}
        </div>
      </div>

      {/* Mobile: stacked layout */}
      <div className="md:hidden">
        {/* Parent as header */}
        <div
          className={`flex cursor-pointer items-center gap-3 rounded-t-xl border border-zinc-200 bg-gradient-to-r p-3 ${getTypeColors(budgetType).headerGradient}`}
          onClick={() => onNavigate(parent.id)}
        >
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${getTypeColors(budgetType).bgDark}`}>
            <BudgetIcon name={parent.icon} className={`h-5 w-5 ${getTypeColors(budgetType).text}`} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-zinc-800">{parent.name}</p>
            <p className="text-xs text-zinc-500">
              {formatCurrency(totalSpent)} / {formatCurrency(totalLimit)}
            </p>
          </div>
        </div>

        {/* Children indented */}
        <div className="rounded-b-xl border border-t-0 border-zinc-200 bg-white">
          {parent.children.map((child) => (
            <ChildBar
              key={child.id}
              child={child}
              spent={spending[child.id] ?? 0}
              budgetType={budgetType}
              onNavigate={onNavigate}
              onHover={() => {}}
              isHovered={false}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── BudgetTree (top-level) ──────────────────────────────────── */

export function BudgetTree({ groups, spending, budgetType, onNavigate }: BudgetTreeProps) {
  if (groups.length === 0) return null

  return (
    <div className="space-y-2">
      {groups.map((group) => (
        <TreeGroup
          key={group.id}
          parent={group}
          spending={spending}
          budgetType={budgetType}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  )
}
