'use client'

import { useState, useMemo, useCallback, useRef, memo } from 'react'
import type { BudgetWithChildren } from '@/lib/budget-data'
import { BudgetIcon, formatCurrency, isOverPositive, type BudgetType } from '@/components/app/budget-shared'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'

/* ── Types ────────────────────────────────────────────────────── */

interface BudgetHeatmapProps {
  groups: BudgetWithChildren[]
  spending: Record<string, number>
  budgetType: BudgetType
  onNavigate: (budgetId: string) => void
  beschikbaarMap?: Record<string, number>
  previousSpending?: Record<string, number>
}

/** A positioned rectangle in the treemap layout */
interface TreemapRect {
  id: string
  name: string
  icon: string
  x: number
  y: number
  w: number
  h: number
  weight: number
  spent: number
  limit: number
  parentId: string | null
  /** Flat index for stagger animation */
  index: number
}

/** Tooltip data for the hovered cell */
interface TooltipData {
  rect: TreemapRect
  mouseX: number
  mouseY: number
}

/* ── Constants ────────────────────────────────────────────────── */

/** Minimum block weight so even 0-limit budgets remain visible */
const MIN_WEIGHT = 20

/** SVG viewBox dimensions — 16:10 aspect ratio */
const VB_W = 800
const VB_H = 500

/** Padding between cells */
const CELL_GAP = 3

/** Corner radius on cells */
const CELL_RADIUS = 6

/* ── Color interpolation ─────────────────────────────────────── */

/** Linearly interpolate between two hex colors */
function lerpColor(a: string, b: string, t: number): string {
  const clamp = Math.max(0, Math.min(1, t))
  const pa = parseInt(a.slice(1), 16)
  const pb = parseInt(b.slice(1), 16)
  const r = Math.round(((pa >> 16) & 0xff) * (1 - clamp) + ((pb >> 16) & 0xff) * clamp)
  const g = Math.round(((pa >> 8) & 0xff) * (1 - clamp) + ((pb >> 8) & 0xff) * clamp)
  const bl = Math.round((pa & 0xff) * (1 - clamp) + (pb & 0xff) * clamp)
  return `#${((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)}`
}

/**
 * Determine the heatmap fill color based on budget type and percentage used.
 *
 * Expense budgets use a green-to-red scale (spending is "bad"),
 * while income/savings/debt use neutral-to-green (reaching the goal is "good").
 */
function getHeatmapColor(budgetType: BudgetType, percentUsed: number): string {
  const p = Math.max(0, Math.min(percentUsed, 200)) // cap at 200%

  if (budgetType === 'expense') {
    if (p <= 50) return lerpColor('#22c55e', '#a3e635', p / 50)
    if (p <= 80) return lerpColor('#a3e635', '#facc15', (p - 50) / 30)
    if (p <= 100) return lerpColor('#facc15', '#f97316', (p - 80) / 20)
    return lerpColor('#ef4444', '#991b1b', Math.min((p - 100) / 100, 1))
  }

  // income, savings, debt — reaching target is positive
  if (p <= 50) return lerpColor('#d4d4d8', '#a3e635', p / 50)
  if (p <= 80) return lerpColor('#a3e635', '#22c55e', (p - 50) / 30)
  if (p <= 100) return lerpColor('#22c55e', '#16a34a', (p - 80) / 20)
  return lerpColor('#16a34a', '#15803d', Math.min((p - 100) / 100, 1))
}

/** Neutral gray for budgets with no limit or no spending */
const NEUTRAL_COLOR = '#e4e4e7'

/* ── Squarified treemap algorithm ────────────────────────────── */

/**
 * Squarified treemap layout.
 *
 * The algorithm recursively subdivides a rectangle by choosing the axis
 * that produces the best aspect ratio (closest to 1:1) for each row of items.
 * Items are sorted by weight descending so the largest blocks are placed first,
 * which improves the overall aspect ratio of every cell.
 *
 * Reference: Bruls, Huizing & van Wijk (2000) — "Squarified Treemaps"
 */
function squarify(
  items: { id: string; name: string; icon: string; weight: number; spent: number; limit: number; parentId: string | null }[],
  x: number,
  y: number,
  w: number,
  h: number,
  startIndex: number,
): TreemapRect[] {
  if (items.length === 0 || w <= 0 || h <= 0) return []

  // Single item — fill the entire rectangle
  if (items.length === 1) {
    return [{
      ...items[0],
      x: x + CELL_GAP / 2,
      y: y + CELL_GAP / 2,
      w: Math.max(0, w - CELL_GAP),
      h: Math.max(0, h - CELL_GAP),
      index: startIndex,
    }]
  }

  const totalWeight = items.reduce((s, it) => s + it.weight, 0)
  if (totalWeight <= 0) return []

  // Sort descending by weight for better aspect ratios
  const sorted = [...items].sort((a, b) => b.weight - a.weight)

  // Determine the axis to lay out along (shorter side)
  const isVertical = w >= h

  const mainSize = isVertical ? w : h
  const crossSize = isVertical ? h : w

  /**
   * Compute worst aspect ratio for a row of items along the cross axis
   * at a given row width along the main axis.
   */
  function worstRatio(row: typeof sorted, rowWeight: number): number {
    const rowLen = (rowWeight / totalWeight) * mainSize
    if (rowLen <= 0) return Infinity
    let worst = 0
    for (const item of row) {
      const itemCross = (item.weight / rowWeight) * crossSize
      const ratio = Math.max(rowLen / itemCross, itemCross / rowLen)
      if (ratio > worst) worst = ratio
    }
    return worst
  }

  // Greedily build the first row
  const row: typeof sorted = [sorted[0]]
  let rowWeight = sorted[0].weight

  for (let i = 1; i < sorted.length; i++) {
    const candidate = sorted[i]
    const newWeight = rowWeight + candidate.weight
    if (worstRatio([...row, candidate], newWeight) <= worstRatio(row, rowWeight)) {
      row.push(candidate)
      rowWeight = newWeight
    } else {
      break
    }
  }

  // Layout the row
  const rowMainSize = (rowWeight / totalWeight) * mainSize
  const rects: TreemapRect[] = []
  let crossOffset = 0

  for (let i = 0; i < row.length; i++) {
    const itemCrossSize = (row[i].weight / rowWeight) * crossSize
    const rx = isVertical ? x : x + crossOffset
    const ry = isVertical ? y + crossOffset : y
    const rw = isVertical ? rowMainSize : itemCrossSize
    const rh = isVertical ? itemCrossSize : rowMainSize

    rects.push({
      ...row[i],
      x: rx + CELL_GAP / 2,
      y: ry + CELL_GAP / 2,
      w: Math.max(0, rw - CELL_GAP),
      h: Math.max(0, rh - CELL_GAP),
      index: startIndex + i,
    })

    crossOffset += itemCrossSize
  }

  // Recurse on remaining items
  const remaining = sorted.slice(row.length)
  if (remaining.length > 0) {
    const nx = isVertical ? x + rowMainSize : x
    const ny = isVertical ? y : y + rowMainSize
    const nw = isVertical ? w - rowMainSize : w
    const nh = isVertical ? h : h - rowMainSize
    rects.push(...squarify(remaining, nx, ny, nw, nh, startIndex + row.length))
  }

  return rects
}

/* ── Build flat items from groups ────────────────────────────── */

function buildTreemapItems(
  groups: BudgetWithChildren[],
  spending: Record<string, number>,
  beschikbaarMap?: Record<string, number>,
) {
  const items: {
    id: string
    name: string
    icon: string
    weight: number
    spent: number
    limit: number
    parentId: string | null
  }[] = []

  for (const group of groups) {
    if (group.children.length === 0) {
      // Parent without children — render as single block
      const spent = spending[group.id] ?? 0
      const limit = beschikbaarMap?.[group.id] !== undefined
        ? beschikbaarMap[group.id] + spent
        : Number(group.default_limit)
      items.push({
        id: group.id,
        name: group.name,
        icon: group.icon,
        weight: Math.max(limit, MIN_WEIGHT),
        spent,
        limit,
        parentId: null,
      })
    } else {
      // Add each child as a separate block
      for (const child of group.children) {
        const spent = spending[child.id] ?? 0
        const limit = beschikbaarMap?.[child.id] !== undefined
          ? beschikbaarMap[child.id] + spent
          : Number(child.default_limit)
        items.push({
          id: child.id,
          name: child.name,
          icon: child.icon,
          weight: Math.max(limit, MIN_WEIGHT),
          spent,
          limit,
          parentId: group.id,
        })
      }
    }
  }

  return items
}

/* ── Trend arrow helper ──────────────────────────────────────── */

function getTrendArrow(
  currentSpent: number,
  previousSpending: Record<string, number> | undefined,
  budgetId: string,
): { arrow: string; label: string } | null {
  if (!previousSpending) return null
  const prev = previousSpending[budgetId]
  if (prev === undefined) return null

  const diff = currentSpent - prev
  const threshold = Math.max(prev * 0.05, 1) // 5% or minimum 1 euro

  if (Math.abs(diff) < threshold) return { arrow: '\u2192', label: 'gelijk aan vorige maand' }
  if (diff > 0) return { arrow: '\u2191', label: 'meer dan vorige maand' }
  return { arrow: '\u2193', label: 'minder dan vorige maand' }
}

/* ── Tooltip component ───────────────────────────────────────── */

function HeatmapTooltip({
  data,
  budgetType,
  previousSpending,
  containerRef,
}: {
  data: TooltipData
  budgetType: BudgetType
  previousSpending?: Record<string, number>
  containerRef: React.RefObject<HTMLDivElement | null>
}) {
  const { rect, mouseX, mouseY } = data
  const pct = rect.limit > 0 ? Math.round((rect.spent / rect.limit) * 100) : 0
  const remaining = Math.max(0, rect.limit - rect.spent)
  const overPositive = isOverPositive(budgetType)
  const isOver = rect.spent > rect.limit && rect.limit > 0
  const trend = getTrendArrow(rect.spent, previousSpending, rect.id)

  // Position tooltip relative to the container
  const containerBounds = containerRef.current?.getBoundingClientRect()
  const tooltipX = containerBounds ? mouseX - containerBounds.left : mouseX
  const tooltipY = containerBounds ? mouseY - containerBounds.top : mouseY

  // Flip tooltip if it would overflow the right side
  const flipX = containerBounds ? tooltipX > containerBounds.width * 0.65 : false
  const flipY = containerBounds ? tooltipY > containerBounds.height * 0.7 : false

  return (
    <div
      className="pointer-events-none absolute z-50 w-56 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-3 shadow-lg"
      style={{
        left: flipX ? undefined : tooltipX + 12,
        right: flipX && containerBounds ? containerBounds.width - tooltipX + 12 : undefined,
        top: flipY ? undefined : tooltipY + 12,
        bottom: flipY && containerBounds ? containerBounds.height - tooltipY + 12 : undefined,
      }}
    >
      {/* Header: icon + name */}
      <div className="mb-2 flex items-center gap-2">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--subtle)]">
          <BudgetIcon name={rect.icon} className="h-3.5 w-3.5 text-[var(--ink-2)]" />
        </div>
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-[var(--ink)]">
          {rect.name}
        </span>
      </div>

      {/* Spent / limit */}
      <div className="mb-1.5 font-mono text-xs tabular-nums">
        <span className={isOver ? (overPositive ? 'text-emerald-600' : 'text-red-600') : 'text-[var(--ink)]'}>
          {formatCurrency(rect.spent)}
        </span>
        <span className="text-[var(--ink-3)]"> / {formatCurrency(rect.limit)}</span>
      </div>

      {/* Percentage bar */}
      <div className="mb-1.5">
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-all"
            style={{
              width: `${Math.min(pct, 100)}%`,
              backgroundColor: rect.limit > 0 ? getHeatmapColor(budgetType, pct) : NEUTRAL_COLOR,
            }}
          />
        </div>
        <div className="mt-0.5 flex items-center justify-between">
          <span className={`text-[10px] font-medium ${isOver ? (overPositive ? 'text-emerald-600' : 'text-red-600') : 'text-[var(--ink-2)]'}`}>
            {pct}%
          </span>
          {trend && (
            <span className="text-[10px] text-[var(--ink-3)]">
              {trend.arrow} {trend.label}
            </span>
          )}
        </div>
      </div>

      {/* Remaining */}
      <div className="text-[10px] text-[var(--ink-3)]">
        Resterend: <span className="font-mono tabular-nums">{formatCurrency(remaining)}</span>
      </div>
    </div>
  )
}

/* ── Legend component ─────────────────────────────────────────── */

function HeatmapLegend({ budgetType }: { budgetType: BudgetType }) {
  const isExpense = budgetType === 'expense'

  // Build gradient stops
  const stops = isExpense
    ? [
        { offset: '0%', color: '#22c55e' },
        { offset: '50%', color: '#a3e635' },
        { offset: '80%', color: '#facc15' },
        { offset: '100%', color: '#ef4444' },
      ]
    : [
        { offset: '0%', color: '#d4d4d8' },
        { offset: '50%', color: '#a3e635' },
        { offset: '80%', color: '#22c55e' },
        { offset: '100%', color: '#15803d' },
      ]

  const gradientId = `heatmap-legend-${budgetType}`

  return (
    <div className="mt-4 flex flex-col items-center gap-1">
      <svg width="240" height="14" viewBox="0 0 240 14" className="overflow-visible">
        <defs>
          <linearGradient id={gradientId}>
            {stops.map((s, i) => (
              <stop key={i} offset={s.offset} stopColor={s.color} />
            ))}
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="240" height="10" rx="3" fill={`url(#${gradientId})`} />
      </svg>
      <div className="flex w-60 justify-between">
        <span className="text-[9px] text-[var(--ink-4)]">0%</span>
        <span className="text-[9px] text-[var(--ink-4)]">50%</span>
        <span className="text-[9px] text-[var(--ink-4)]">80%</span>
        <span className="text-[9px] text-[var(--ink-4)]">100%+</span>
      </div>
      <p className="text-[9px] text-[var(--ink-4)]">
        {isExpense ? 'Groen = ruimte over \u00b7 Rood = over budget' : 'Grijs = begin \u00b7 Groen = doel bereikt'}
      </p>
    </div>
  )
}

/* ── Mobile layout: stacked groups ───────────────────────────── */

function MobileHeatmap({
  groups,
  rects,
  budgetType,
  onNavigate,
  hasEntered,
}: {
  groups: BudgetWithChildren[]
  rects: TreemapRect[]
  budgetType: BudgetType
  onNavigate: (budgetId: string) => void
  hasEntered: boolean
}) {
  const overPositive = isOverPositive(budgetType)

  return (
    <div className="space-y-3">
      {groups.map((group) => {
        // Collect rects belonging to this group
        const groupRects = rects.filter(
          (r) => r.parentId === group.id || (r.parentId === null && r.id === group.id),
        )

        if (groupRects.length === 0) return null

        const groupTotalLimit = groupRects.reduce((s, r) => s + r.limit, 0)
        const groupTotalSpent = groupRects.reduce((s, r) => s + r.spent, 0)

        return (
          <div
            key={group.id}
            className="overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)]"
          >
            {/* Group header */}
            <div className="flex items-center gap-2 border-b border-[var(--border-ed)] px-3 py-2">
              <BudgetIcon name={group.icon} className="h-3.5 w-3.5 text-[var(--ink-2)]" />
              <span className="flex-1 truncate text-xs font-semibold text-[var(--ink)]">{group.name}</span>
              <span className="font-mono text-[10px] tabular-nums text-[var(--ink-3)]">
                {formatCurrency(groupTotalSpent)} / {formatCurrency(groupTotalLimit)}
              </span>
            </div>

            {/* Horizontal child blocks */}
            <div className="flex flex-wrap gap-1 p-2">
              {groupRects.map((rect) => {
                const pct = rect.limit > 0 ? Math.round((rect.spent / rect.limit) * 100) : 0
                const color = rect.limit > 0 ? getHeatmapColor(budgetType, pct) : NEUTRAL_COLOR
                const isOver = rect.spent > rect.limit && rect.limit > 0

                // Width proportional to weight within the group
                const totalGroupWeight = groupRects.reduce((s, r) => s + r.weight, 0)
                const widthPct = totalGroupWeight > 0 ? (rect.weight / totalGroupWeight) * 100 : 100 / groupRects.length

                return (
                  <button
                    key={rect.id}
                    type="button"
                    className="flex flex-col items-center justify-center rounded-md px-2 py-2 transition-opacity"
                    style={{
                      backgroundColor: color,
                      width: `calc(${widthPct}% - 4px)`,
                      minWidth: 60,
                      minHeight: 52,
                      opacity: hasEntered ? 1 : 0,
                      transform: hasEntered ? 'scale(1)' : 'scale(0.92)',
                      transition: `opacity 0.4s ease-out ${rect.index * 40}ms, transform 0.4s ease-out ${rect.index * 40}ms`,
                    }}
                    onClick={() => onNavigate(rect.id)}
                  >
                    <span className="truncate text-[10px] font-medium text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.3)]">
                      {rect.name}
                    </span>
                    <span className={`font-mono text-[10px] font-bold tabular-nums [text-shadow:0_1px_2px_rgba(0,0,0,0.3)] ${
                      isOver ? (overPositive ? 'text-emerald-100' : 'text-red-100') : 'text-white'
                    }`}>
                      {pct}%
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── Main SVG treemap cell ───────────────────────────────────── */

function TreemapCell({
  rect,
  budgetType,
  isHovered,
  hasEntered,
  onMouseEnter,
  onMouseLeave,
  onClick,
}: {
  rect: TreemapRect
  budgetType: BudgetType
  isHovered: boolean
  hasEntered: boolean
  onMouseEnter: (e: React.MouseEvent) => void
  onMouseLeave: () => void
  onClick: () => void
}) {
  const pct = rect.limit > 0 ? Math.round((rect.spent / rect.limit) * 100) : 0
  const color = rect.limit > 0 ? getHeatmapColor(budgetType, pct) : NEUTRAL_COLOR
  const overPositive = isOverPositive(budgetType)
  const isOver = rect.spent > rect.limit && rect.limit > 0

  // Determine what text fits inside the cell
  const canFitIcon = rect.w > 50 && rect.h > 50
  const canFitName = rect.w > 40 && rect.h > 30
  const canFitPct = rect.w > 30 && rect.h > 20
  const canFitAmount = rect.w > 70 && rect.h > 55

  // Text color: use white with shadow for readability on colored backgrounds
  const textShadow = '0 1px 2px rgba(0,0,0,0.3)'

  return (
    <g
      className="cursor-pointer"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
    >
      {/* Background rect */}
      <rect
        x={rect.x}
        y={rect.y}
        width={rect.w}
        height={rect.h}
        rx={CELL_RADIUS}
        ry={CELL_RADIUS}
        fill={color}
        stroke={isHovered ? 'var(--ink)' : 'rgba(255,255,255,0.4)'}
        strokeWidth={isHovered ? 2 : 0.5}
        style={{
          opacity: hasEntered ? 1 : 0,
          transform: hasEntered ? 'scale(1)' : 'scale(0.92)',
          transformOrigin: `${rect.x + rect.w / 2}px ${rect.y + rect.h / 2}px`,
          transition: `opacity 0.4s ease-out ${rect.index * 40}ms, transform 0.4s ease-out ${rect.index * 40}ms, stroke 0.15s ease`,
        }}
      />

      {/* Cell content via foreignObject for proper text rendering */}
      <foreignObject
        x={rect.x}
        y={rect.y}
        width={rect.w}
        height={rect.h}
        style={{
          opacity: hasEntered ? 1 : 0,
          transition: `opacity 0.4s ease-out ${rect.index * 40 + 100}ms`,
          pointerEvents: 'none',
        }}
      >
        <div
          // @ts-expect-error xmlns required for foreignObject but not in React types
          xmlns="http://www.w3.org/1999/xhtml"
          className="flex h-full w-full flex-col items-center justify-center overflow-hidden px-1 py-0.5"
        >
          {/* Icon */}
          {canFitIcon && (
            <div className="mb-0.5 flex h-5 w-5 items-center justify-center">
              <BudgetIcon name={rect.icon} className="h-3.5 w-3.5 text-white drop-shadow-sm" />
            </div>
          )}

          {/* Name (truncated) */}
          {canFitName && (
            <p
              className="w-full truncate text-center text-[9px] font-medium leading-tight text-white"
              style={{ textShadow }}
            >
              {rect.name}
            </p>
          )}

          {/* Percentage */}
          {canFitPct && (
            <p
              className={`font-mono text-[10px] font-bold tabular-nums leading-tight ${
                isOver ? (overPositive ? 'text-emerald-100' : 'text-red-100') : 'text-white'
              }`}
              style={{ textShadow }}
            >
              {pct}%
            </p>
          )}

          {/* Spent amount */}
          {canFitAmount && (
            <p
              className="font-mono text-[8px] tabular-nums leading-tight text-white/80"
              style={{ textShadow }}
            >
              {formatCurrency(rect.spent)}
            </p>
          )}
        </div>
      </foreignObject>
    </g>
  )
}

/* ── BudgetHeatmap (top-level) ───────────────────────────────── */

export const BudgetHeatmap = memo(function BudgetHeatmap({
  groups,
  spending,
  budgetType,
  onNavigate,
  beschikbaarMap,
  previousSpending,
}: BudgetHeatmapProps) {
  const { ref, hasEntered } = useInViewAnimation({ duration: 900 })
  const containerRef = useRef<HTMLDivElement | null>(null)

  const [tooltip, setTooltip] = useState<TooltipData | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  // Build treemap data
  const items = useMemo(
    () => buildTreemapItems(groups, spending, beschikbaarMap),
    [groups, spending, beschikbaarMap],
  )

  // Compute treemap layout
  const rects = useMemo(
    () => squarify(items, 0, 0, VB_W, VB_H, 0),
    [items],
  )

  // Group parent outlines for SVG labels
  const parentOutlines = useMemo(() => {
    const map = new Map<string, { name: string; icon: string; minX: number; minY: number; maxX: number; maxY: number }>()
    for (const rect of rects) {
      const pid = rect.parentId
      if (!pid) continue
      const existing = map.get(pid)
      if (existing) {
        existing.minX = Math.min(existing.minX, rect.x)
        existing.minY = Math.min(existing.minY, rect.y)
        existing.maxX = Math.max(existing.maxX, rect.x + rect.w)
        existing.maxY = Math.max(existing.maxY, rect.y + rect.h)
      } else {
        const parent = groups.find((g) => g.id === pid)
        if (parent) {
          map.set(pid, {
            name: parent.name,
            icon: parent.icon,
            minX: rect.x,
            minY: rect.y,
            maxX: rect.x + rect.w,
            maxY: rect.y + rect.h,
          })
        }
      }
    }
    return Array.from(map.entries())
  }, [rects, groups])

  const handleMouseEnter = useCallback((rect: TreemapRect, e: React.MouseEvent) => {
    setHoveredId(rect.id)
    setTooltip({ rect, mouseX: e.clientX, mouseY: e.clientY })
  }, [])

  /** Update tooltip position as the mouse moves over any cell */
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setTooltip((prev) => prev ? { ...prev, mouseX: e.clientX, mouseY: e.clientY } : null)
  }, [])

  const handleMouseLeave = useCallback(() => {
    setHoveredId(null)
    setTooltip(null)
  }, [])

  // Edge case: empty groups
  if (groups.length === 0) return null

  return (
    <div ref={ref}>
      <div ref={containerRef} className="relative">
        {/* Desktop: SVG treemap (hidden below md) */}
        <div className="hidden md:block">
          <svg
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            className="h-auto w-full"
            preserveAspectRatio="xMidYMid meet"
            onMouseMove={handleMouseMove}
            style={{
              animation: hasEntered ? 'fadeUp 0.4s ease-out both' : 'none',
              opacity: hasEntered ? undefined : 0,
            }}
          >
            {/* Parent group outlines — subtle dashed borders with labels */}
            {parentOutlines.map(([pid, outline]) => (
              <g key={`outline-${pid}`}>
                <rect
                  x={outline.minX - 1}
                  y={outline.minY - 1}
                  width={outline.maxX - outline.minX + 2}
                  height={outline.maxY - outline.minY + 2}
                  rx={CELL_RADIUS + 2}
                  ry={CELL_RADIUS + 2}
                  fill="none"
                  stroke="var(--border-md)"
                  strokeWidth="1"
                  strokeDasharray="4 2"
                  opacity={hasEntered ? 0.5 : 0}
                  style={{ transition: 'opacity 0.6s ease-out 0.3s' }}
                />
                {/* Parent label in top-left corner if space allows */}
                {outline.maxX - outline.minX > 80 && (
                  <text
                    x={outline.minX + 6}
                    y={outline.minY + 1}
                    className="fill-[var(--ink-4)] font-sans text-[8px] font-medium"
                    opacity={hasEntered ? 0.7 : 0}
                    style={{ transition: 'opacity 0.6s ease-out 0.4s' }}
                  >
                    {outline.name}
                  </text>
                )}
              </g>
            ))}

            {/* Treemap cells */}
            {rects.map((rect) => (
              <TreemapCell
                key={rect.id}
                rect={rect}
                budgetType={budgetType}
                isHovered={hoveredId === rect.id}
                hasEntered={hasEntered}
                onMouseEnter={(e) => handleMouseEnter(rect, e)}
                onMouseLeave={handleMouseLeave}
                onClick={() => onNavigate(rect.id)}
              />
            ))}
          </svg>

          {/* Attach mousemove on the container for smooth tooltip tracking */}
          {tooltip && (
            <div
              className="absolute inset-0"
              style={{ pointerEvents: 'none' }}
            />
          )}
        </div>

        {/* Mobile: stacked groups (visible below md) */}
        <div className="md:hidden">
          <MobileHeatmap
            groups={groups}
            rects={rects}
            budgetType={budgetType}
            onNavigate={onNavigate}
            hasEntered={hasEntered}
          />
        </div>

        {/* Tooltip (desktop only, positioned via mouse coords) */}
        {tooltip && (
          <div className="hidden md:block">
            <HeatmapTooltip
              data={tooltip}
              budgetType={budgetType}
              previousSpending={previousSpending}
              containerRef={containerRef}
            />
          </div>
        )}
      </div>

      {/* Legend */}
      <HeatmapLegend budgetType={budgetType} />
    </div>
  )
})
