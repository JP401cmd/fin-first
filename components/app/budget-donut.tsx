'use client'

import { useState, useMemo, useEffect } from 'react'
import { type BudgetWithChildren } from '@/lib/budget-data'
import { BudgetIcon, isOverPositive, type BudgetType } from '@/components/app/budget-shared'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { Eye, EyeOff, ChevronDown } from 'lucide-react'
import { MaskedAmount } from '@/components/app/masked-amount'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { formatMaskedCurrency } from '@/lib/format'

const HIDDEN_BUDGETS_KEY = 'donut-hidden-budgets'
const COLLAPSED_TYPES_KEY = 'donut-collapsed-types'

function loadHiddenBudgets(): Set<string> {
  try {
    const stored = localStorage.getItem(HIDDEN_BUDGETS_KEY)
    if (stored) return new Set(JSON.parse(stored))
  } catch { /* */ }
  return new Set()
}

function saveHiddenBudgets(set: Set<string>) {
  try { localStorage.setItem(HIDDEN_BUDGETS_KEY, JSON.stringify(Array.from(set))) } catch { /* */ }
}

function loadCollapsedTypes(): Set<string> {
  try {
    const stored = localStorage.getItem(COLLAPSED_TYPES_KEY)
    if (stored) return new Set(JSON.parse(stored))
  } catch { /* */ }
  return new Set()
}

function saveCollapsedTypes(set: Set<string>) {
  try { localStorage.setItem(COLLAPSED_TYPES_KEY, JSON.stringify(Array.from(set))) } catch { /* */ }
}

interface BudgetDonutProps {
  groups: BudgetWithChildren[]
  spending: Record<string, number>
  onNavigate: (budgetId: string) => void
}

/* ── CSS-variable colour helpers ─────────────────────────────── */

const VALID_SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]

function snapToShade(n: number): number {
  let best = VALID_SHADES[0]
  let bestDist = Math.abs(n - best)
  for (const s of VALID_SHADES) {
    const d = Math.abs(n - s)
    if (d < bestDist) { best = s; bestDist = d }
  }
  return best
}

function cssType(bt: BudgetType): string {
  return bt === 'archive' ? 'other' : bt
}

/** Outer ring: distribute shades 200–400 (budget track) and 500–700 (spent fill) */
function segmentColors(type: BudgetType, idx: number, total: number) {
  const t = total > 1 ? idx / (total - 1) : 0.5
  const ct = cssType(type)
  return {
    budget: `color-mix(in srgb, var(--color-${ct}-${snapToShade(200 + t * 200)}) 35%, transparent)`,
    spent: `var(--color-${ct}-${snapToShade(500 + t * 200)})`,
  }
}

/** Inner ring: shades 100–300 (budget track) and 400–600 (spent fill) */
function childSegColors(type: BudgetType, idx: number, total: number) {
  const t = total > 1 ? idx / (total - 1) : 0.5
  const ct = cssType(type)
  return {
    budget: `color-mix(in srgb, var(--color-${ct}-${snapToShade(100 + t * 200)}) 30%, transparent)`,
    spent: `var(--color-${ct}-${snapToShade(400 + t * 200)})`,
  }
}

/** Legend + external consumers: fixed type-based colours via CSS vars */
export function typeColors(budgetType: BudgetType) {
  const t = cssType(budgetType)
  return {
    budget: `var(--color-${t}-200)`,
    spent: `var(--color-${t}-500)`,
    bg: `var(--color-${t}-50)`,
    text: `var(--color-${t}-600)`,
    border: `var(--color-${t}-200)`,
  }
}

export function childTypeColors(budgetType: BudgetType, idx: number, total: number) {
  const t = cssType(budgetType)
  const frac = total > 1 ? idx / (total - 1) : 0.5
  return {
    budget: `var(--color-${t}-${snapToShade(100 + frac * 200)})`,
    spent: `var(--color-${t}-${snapToShade(400 + frac * 200)})`,
  }
}

/* ── SVG arc helper ──────────────────────────────────────────── */

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const clampedEnd = Math.min(endAngle, startAngle + 359.999)
  const start = polarToCartesian(cx, cy, r, clampedEnd)
  const end = polarToCartesian(cx, cy, r, startAngle)
  const largeArc = clampedEnd - startAngle > 180 ? 1 : 0
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

/* ── Segment data ────────────────────────────────────────────── */

export interface ChildSeg {
  id: string
  name: string
  icon: string
  limit: number
  spent: number
}

export interface Segment {
  id: string
  name: string
  icon: string
  budgetType: BudgetType
  limit: number
  spent: number
  colorIdx: number
  children: ChildSeg[]
}

export function buildSegments(
  groups: BudgetWithChildren[],
  spending: Record<string, number>,
): Segment[] {
  return groups
    .map((g, idx) => {
      const children = g.children.map((c) => ({
        id: c.id,
        name: c.name,
        icon: c.icon,
        limit: Number(c.default_limit),
        spent: spending[c.id] ?? 0,
      }))

      const limit = children.length > 0
        ? children.reduce((s, c) => s + c.limit, 0)
        : Number(g.default_limit)
      const spent = children.length > 0
        ? children.reduce((s, c) => s + c.spent, 0)
        : (spending[g.id] ?? 0)

      return {
        id: g.id,
        name: g.name,
        icon: g.icon,
        budgetType: g.budget_type as BudgetType,
        limit,
        spent,
        colorIdx: idx,
        children,
      }
    })
    .filter((s) => s.limit > 0)
}

/* ── Type labels ─────────────────────────────────────────────── */

const TYPE_LABELS: Record<string, string> = {
  income: 'Inkomen',
  expense: 'Uitgaven',
  savings: 'Sparen',
  debt: 'Schulden',
  archive: 'Archief',
}

/* ── TypeDonut (internal sub-component) ──────────────────────── */

interface InnerArc {
  start: number
  end: number
  spentEnd: number
  isOver: boolean
  childIdx: number
}

interface OuterArc {
  start: number
  end: number
  spentEnd: number
  isOver: boolean
  innerArcs: InnerArc[]
}

interface TypeDonutProps {
  budgetType: BudgetType
  segments: Segment[]
  onNavigate: (budgetId: string) => void
  hiddenBudgets: Set<string>
  onToggleHidden: (id: string) => void
  isCollapsed: boolean
  onToggleCollapse: () => void
}

function TypeDonut({ budgetType, segments, onNavigate, hiddenBudgets, onToggleHidden, isCollapsed, onToggleCollapse }: TypeDonutProps) {
  const { masked } = useMaskedAmounts()
  const { ref, hasEntered, animationComplete } = useInViewAnimation({ duration: 1200 })
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const [hoveredChild, setHoveredChild] = useState<{ parentIdx: number; childIdx: number } | null>(null)

  const visibleSegments = useMemo(() => segments.filter(seg => !hiddenBudgets.has(seg.id)), [segments, hiddenBudgets])
  const totalBudget = visibleSegments.reduce((s, seg) => s + seg.limit, 0)
  const totalSpent = visibleSegments.reduce((s, seg) => s + seg.spent, 0)

  const size = 300
  const cx = size / 2
  const cy = size / 2
  const outerR = 120
  const outerWidth = 36
  const innerR = 78
  const innerWidth = 28
  const gap = 1.2
  const innerGap = 1.5
  const ct = cssType(budgetType)

  // Build outer + inner arcs (only for visible segments)
  const arcData = useMemo<OuterArc[]>(() => {
    if (totalBudget <= 0) return []
    let angle = 0
    return visibleSegments.map((seg) => {
      const sweep = (seg.limit / totalBudget) * 360
      const start = angle + gap / 2
      const end = start + Math.max(sweep - gap, 0.5)
      const spentRatio = seg.limit > 0 ? Math.min(seg.spent / seg.limit, 1) : 0
      const spentSweep = sweep * spentRatio
      const spentEnd = start + Math.max(spentSweep - gap, 0)
      const isOver = seg.spent > seg.limit && seg.limit > 0

      // Inner arcs: full 360° circle for children of this parent
      const childTotalLimit = seg.children.reduce((s, c) => s + c.limit, 0)
      const innerArcs: InnerArc[] = []

      if (childTotalLimit > 0) {
        let childAngle = 0
        seg.children.forEach((child, ci) => {
          const childSweep = (child.limit / childTotalLimit) * 360
          const cStart = childAngle + innerGap / 2
          const cEnd = cStart + Math.max(childSweep - innerGap, 0.5)
          const cSpentRatio = child.limit > 0 ? Math.min(child.spent / child.limit, 1) : 0
          const cSpentSweep = childSweep * cSpentRatio
          const cSpentEnd = cStart + Math.max(cSpentSweep - innerGap, 0)
          const cIsOver = child.spent > child.limit && child.limit > 0
          innerArcs.push({ start: cStart, end: cEnd, spentEnd: cSpentEnd, isOver: cIsOver, childIdx: ci })
          childAngle += childSweep
        })
      }

      angle += sweep
      return { start, end, spentEnd, isOver, innerArcs }
    })
  }, [visibleSegments, totalBudget, gap, innerGap])

  // Active state — index refers to visibleSegments for donut, but legend uses all segments
  const active = hoveredIdx ?? selectedIdx
  const activeSeg = active !== null ? visibleSegments[active] : null
  const activeChild = hoveredChild !== null ? visibleSegments[hoveredChild.parentIdx]?.children[hoveredChild.childIdx] : null

  const pctUsed = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0

  // Center text
  let centerContent: React.ReactNode
  if (activeChild) {
    const childPct = activeChild.limit > 0 ? Math.round((activeChild.spent / activeChild.limit) * 100) : 0
    centerContent = (
      <g>
        <text x={cx} y={cy - 14} textAnchor="middle" className="fill-[var(--ink-2)] font-sans text-[10px] font-semibold">
          {activeChild.name}
        </text>
        <text x={cx} y={cy + 4} textAnchor="middle" className="fill-[var(--ink-3)] font-mono text-[9px]">
          {formatMaskedCurrency(activeChild.spent, masked)} / {formatMaskedCurrency(activeChild.limit, masked)}
        </text>
        <text x={cx} y={cy + 18} textAnchor="middle"
          className={`font-mono text-[10px] font-bold ${activeChild.spent > activeChild.limit ? (isOverPositive(budgetType) ? 'fill-emerald-500' : 'fill-red-500') : 'fill-[var(--ink)]'}`}
        >
          {childPct}%
        </text>
      </g>
    )
  } else if (activeSeg) {
    const segPct = activeSeg.limit > 0 ? Math.round((activeSeg.spent / activeSeg.limit) * 100) : 0
    centerContent = (
      <g>
        <text x={cx} y={cy - 14} textAnchor="middle" className="fill-[var(--ink)] font-sans text-[11px] font-bold">
          {activeSeg.name}
        </text>
        <text x={cx} y={cy + 4} textAnchor="middle" className="fill-[var(--ink-3)] font-mono text-[9px]">
          {formatMaskedCurrency(activeSeg.spent, masked)} / {formatMaskedCurrency(activeSeg.limit, masked)}
        </text>
        <text x={cx} y={cy + 18} textAnchor="middle"
          className={`font-mono text-[10px] font-semibold ${activeSeg.spent > activeSeg.limit ? (isOverPositive(budgetType) ? 'fill-emerald-500' : 'fill-red-500') : 'fill-[var(--ink)]'}`}
        >
          {segPct}% besteed
        </text>
      </g>
    )
  } else {
    centerContent = (
      <g>
        <text x={cx} y={cy - 10} textAnchor="middle" className="fill-[var(--ink)] font-mono text-[14px] font-bold">
          {formatMaskedCurrency(totalSpent, masked)}
        </text>
        <text x={cx} y={cy + 6} textAnchor="middle" className="fill-[var(--ink-4)] font-sans text-[9px]">
          van {formatMaskedCurrency(totalBudget, masked)}
        </text>
        <text x={cx} y={cy + 20} textAnchor="middle"
          className={`font-mono text-[10px] font-semibold ${pctUsed > 100 ? (isOverPositive(budgetType) ? 'fill-emerald-500' : 'fill-red-500') : 'fill-[var(--ink-3)]'}`}
        >
          {pctUsed}%
        </text>
      </g>
    )
  }

  const c = typeColors(budgetType)

  return (
    <div
      ref={ref}
      className="overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] shadow-[var(--s0)]"
    >
      {/* 3px accent top */}
      <div className="h-[3px]" style={{ backgroundColor: `var(--color-${ct}-500)` }} />

      {/* Clickable type header */}
      <button
        type="button"
        onClick={onToggleCollapse}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-[var(--subtle)]"
      >
        <div className="flex items-center gap-2">
          <ChevronDown className={`h-3.5 w-3.5 text-[var(--ink-4)] transition-transform duration-200 ${isCollapsed ? '' : 'rotate-180'}`} />
          <p className="font-sans text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)]">
            {TYPE_LABELS[budgetType] ?? budgetType}
          </p>
          <span className="font-mono text-[10px] text-[var(--ink-4)]">{segments.length}</span>
        </div>
        <p className="font-mono text-xs font-semibold tabular-nums text-[var(--ink)]">
          {<MaskedAmount value={segments.reduce((s, seg) => s + seg.spent, 0)} tone="wil" />}
          <span className="font-normal text-[var(--ink-4)]"> / {<MaskedAmount value={segments.reduce((s, seg) => s + seg.limit, 0)} tone="wil" />}</span>
        </p>
      </button>

      {!isCollapsed && <div className="px-4 pb-4">

        {/* SVG donut */}
        <div className="flex justify-center">
          <svg
            viewBox={`0 0 ${size} ${size}`}
            className="h-auto w-full max-w-[280px]"
            style={{ overflow: 'visible' }}
          >
            {arcData.map((arc, i) => {
              const dimmed = active !== null && active !== i
              const colors = segmentColors(budgetType, i, segments.length)
              const stagger = i * 60
              const budgetAnim = hasEntered ? `drawPath 700ms cubic-bezier(.22,1,.36,1) ${stagger}ms both` : 'none'
              const spentAnim = hasEntered ? `drawPath 500ms cubic-bezier(.22,1,.36,1) ${stagger + 200}ms both` : 'none'

              return (
                <g key={`outer-${i}`}>
                  {/* Budget arc (track — light colour, full segment) */}
                  <path
                    d={describeArc(cx, cy, outerR - outerWidth / 2, arc.start, arc.end)}
                    fill="none"
                    strokeWidth={outerWidth}
                    strokeLinecap="butt"
                    pathLength={1}
                    strokeDasharray={1}
                    opacity={dimmed ? 0.2 : 1}
                    className="cursor-pointer transition-opacity duration-200"
                    style={{
                      stroke: colors.budget,
                      strokeDashoffset: hasEntered ? undefined : 1,
                      animation: budgetAnim,
                    }}
                    onMouseEnter={animationComplete ? () => { setHoveredIdx(i); setHoveredChild(null) } : undefined}
                    onMouseLeave={animationComplete ? () => setHoveredIdx(null) : undefined}
                    onClick={animationComplete ? () => {
                      setSelectedIdx(selectedIdx === i ? null : i)
                      setHoveredChild(null)
                    } : undefined}
                  />

                  {/* Spent arc (fill — dark colour, proportional) */}
                  {arc.spentEnd > arc.start && (
                    <path
                      d={describeArc(cx, cy, outerR - outerWidth / 2, arc.start, arc.spentEnd)}
                      fill="none"
                      strokeWidth={outerWidth}
                      strokeLinecap="butt"
                      pathLength={1}
                      strokeDasharray={1}
                      opacity={dimmed ? 0.2 : 1}
                      className="cursor-pointer transition-opacity duration-200"
                      style={{
                        stroke: colors.spent,
                        strokeDashoffset: hasEntered ? undefined : 1,
                        animation: spentAnim,
                      }}
                      onMouseEnter={animationComplete ? () => { setHoveredIdx(i); setHoveredChild(null) } : undefined}
                      onMouseLeave={animationComplete ? () => setHoveredIdx(null) : undefined}
                      onClick={animationComplete ? () => {
                        setSelectedIdx(selectedIdx === i ? null : i)
                        setHoveredChild(null)
                      } : undefined}
                    />
                  )}

                  {/* Overspend glow */}
                  {arc.isOver && (
                    <path
                      d={describeArc(cx, cy, outerR - outerWidth / 2, arc.start, arc.end)}
                      fill="none"
                      stroke={isOverPositive(budgetType) ? '#10b981' : '#ef4444'}
                      strokeWidth={outerWidth + 6}
                      strokeLinecap="butt"
                      opacity={dimmed ? 0.06 : 0.25}
                      className="pointer-events-none"
                    />
                  )}

                  {/* Inner ring: children of active (hovered/selected) parent only */}
                  {active === i && arc.innerArcs.map((ca) => {
                    const childDimmed = hoveredChild !== null && !(hoveredChild.parentIdx === i && hoveredChild.childIdx === ca.childIdx)
                    const cc = childSegColors(budgetType, ca.childIdx, segments[i].children.length)
                    const childStagger = ca.childIdx * 40
                    const cBudgetAnim = `drawPath 400ms cubic-bezier(.22,1,.36,1) ${childStagger}ms both`
                    const cSpentAnim = `drawPath 300ms cubic-bezier(.22,1,.36,1) ${childStagger + 120}ms both`

                    return (
                      <g key={`inner-${i}-${ca.childIdx}`}>
                        {/* Child budget arc (track) */}
                        <path
                          d={describeArc(cx, cy, innerR - innerWidth / 2, ca.start, ca.end)}
                          fill="none"
                          strokeWidth={innerWidth}
                          strokeLinecap="butt"
                          pathLength={1}
                          strokeDasharray={1}
                          opacity={childDimmed ? 0.2 : 1}
                          className="cursor-pointer transition-opacity duration-200"
                          style={{
                            stroke: cc.budget,
                            animation: cBudgetAnim,
                          }}
                          onMouseEnter={() => setHoveredChild({ parentIdx: i, childIdx: ca.childIdx })}
                          onMouseLeave={() => setHoveredChild(null)}
                          onClick={() => onNavigate(segments[i].children[ca.childIdx].id)}
                        />

                        {/* Child spent arc (fill) */}
                        {ca.spentEnd > ca.start && (
                          <path
                            d={describeArc(cx, cy, innerR - innerWidth / 2, ca.start, ca.spentEnd)}
                            fill="none"
                            strokeWidth={innerWidth}
                            strokeLinecap="butt"
                            pathLength={1}
                            strokeDasharray={1}
                            opacity={childDimmed ? 0.2 : 1}
                            className="cursor-pointer transition-opacity duration-200"
                            style={{
                              stroke: cc.spent,
                              animation: cSpentAnim,
                            }}
                            onMouseEnter={() => setHoveredChild({ parentIdx: i, childIdx: ca.childIdx })}
                            onMouseLeave={() => setHoveredChild(null)}
                            onClick={() => onNavigate(segments[i].children[ca.childIdx].id)}
                          />
                        )}

                        {/* Child overspend glow */}
                        {ca.isOver && (
                          <path
                            d={describeArc(cx, cy, innerR - innerWidth / 2, ca.start, ca.end)}
                            fill="none"
                            stroke={isOverPositive(budgetType) ? '#10b981' : '#ef4444'}
                            strokeWidth={innerWidth + 4}
                            strokeLinecap="butt"
                            opacity={childDimmed ? 0.06 : 0.25}
                            className="pointer-events-none"
                          />
                        )}
                      </g>
                    )
                  })}
                </g>
              )
            })}

            {/* Center text */}
            {centerContent}
          </svg>
        </div>

        {/* Legend */}
        <div className="mt-4 space-y-1">
          {segments.map((seg, i) => {
            const pct = seg.limit > 0 ? Math.round((seg.spent / seg.limit) * 100) : 0
            const isOver = seg.spent > seg.limit && seg.limit > 0
            const isHidden = hiddenBudgets.has(seg.id)
            const visibleIdx = visibleSegments.indexOf(seg)
            const isExpanded = selectedIdx !== null && selectedIdx === visibleIdx && !isHidden

            return (
              <div key={seg.id}>
                <div className="flex items-center gap-1">
                  <button
                    className={`flex min-w-0 flex-1 items-center gap-2 rounded-[var(--r)] border px-2.5 py-1.5 text-left transition-all ${isHidden ? 'opacity-40' : ''}`}
                    style={{
                      borderColor: isExpanded ? c.border : 'var(--border-ed)',
                      backgroundColor: isExpanded ? c.bg : 'var(--paper)',
                      boxShadow: isExpanded ? `0 0 0 2px ${c.border}` : undefined,
                    }}
                    onMouseEnter={() => { if (!isHidden && visibleIdx >= 0) { setHoveredIdx(visibleIdx); setHoveredChild(null) } }}
                    onMouseLeave={() => setHoveredIdx(null)}
                    onClick={() => {
                      if (isHidden) return
                      setSelectedIdx(selectedIdx === visibleIdx ? null : visibleIdx)
                      setHoveredChild(null)
                    }}
                  >
                    <div className="flex items-center gap-0.5">
                      <span className="block h-4 w-2 rounded-l-sm" style={{ backgroundColor: c.spent }} />
                      <span className="block h-4 w-2 rounded-r-sm" style={{ backgroundColor: c.budget }} />
                    </div>
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: c.bg }}>
                      <BudgetIcon name={seg.icon} className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-xs font-medium ${isHidden ? 'text-[var(--ink-4)] line-through' : 'text-[var(--ink)]'}`}>{seg.name}</p>
                      <p className="font-mono text-[10px] text-[var(--ink-3)]">
                        <span className={isOver && !isHidden ? (isOverPositive(budgetType) ? 'font-semibold text-emerald-600' : 'font-semibold text-red-600') : ''}>
                          {<MaskedAmount value={seg.spent} tone="wil" />}
                        </span>
                        {' / '}
                        {<MaskedAmount value={seg.limit} tone="wil" />}
                      </p>
                    </div>
                    <span className={`shrink-0 font-mono text-[10px] font-bold ${isOver && !isHidden ? (isOverPositive(budgetType) ? 'text-emerald-600' : 'text-red-600') : 'text-[var(--ink-2)]'}`}>
                      {pct}%
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onToggleHidden(seg.id) }}
                    className="shrink-0 rounded-[var(--r-sm)] p-1.5 text-[var(--ink-4)] transition-colors hover:text-[var(--ink-2)] hover:bg-[var(--subtle)]"
                    title={isHidden ? 'Tonen in donut' : 'Verbergen uit donut'}
                  >
                    {isHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>

                {/* Expanded children */}
                {isExpanded && seg.children.length > 0 && (
                  <div className="ml-4 mt-0.5 space-y-0.5">
                    {seg.children.map((child, ci) => {
                      const childPct = child.limit > 0 ? Math.round((child.spent / child.limit) * 100) : 0
                      const childOver = child.spent > child.limit && child.limit > 0
                      const cc = childTypeColors(budgetType, ci, seg.children.length)

                      return (
                        <button
                          key={child.id}
                          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1 text-left transition-colors hover:bg-[var(--subtle)]"
                          onMouseEnter={() => { if (visibleIdx >= 0) setHoveredChild({ parentIdx: visibleIdx, childIdx: ci }) }}
                          onMouseLeave={() => setHoveredChild(null)}
                          onClick={(e) => { e.stopPropagation(); onNavigate(child.id) }}
                        >
                          <div className="flex items-center gap-0.5">
                            <span className="block h-3 w-1.5 rounded-l-sm" style={{ backgroundColor: cc.spent }} />
                            <span className="block h-3 w-1.5 rounded-r-sm" style={{ backgroundColor: cc.budget }} />
                          </div>
                          <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded" style={{ backgroundColor: c.bg }}>
                            <BudgetIcon name={child.icon} className="h-2.5 w-2.5" />
                          </div>
                          <span className="min-w-0 flex-1 truncate text-[10px] text-[var(--ink-2)]">{child.name}</span>
                          <span className="font-mono text-[10px] text-[var(--ink-3)]">
                            <span className={childOver ? (isOverPositive(budgetType) ? 'font-semibold text-emerald-600' : 'font-semibold text-red-600') : ''}>
                              {<MaskedAmount value={child.spent} tone="wil" />}
                            </span>
                            {' / '}
                            {<MaskedAmount value={child.limit} tone="wil" />}
                          </span>
                          <span className={`w-7 text-right font-mono text-[10px] font-medium ${childOver ? (isOverPositive(budgetType) ? 'text-emerald-600' : 'text-red-600') : 'text-[var(--ink-3)]'}`}>
                            {childPct}%
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>}
    </div>
  )
}

/* ── BudgetDonut (orchestrator) ──────────────────────────────── */

/* ── MiniDonut (compact summary donut) ────────────────────────── */

export interface MiniDonutSlice {
  type: BudgetType
  spent: number
  limit: number
}

interface MiniDonutProps {
  /** Array of budget type summaries with spent/limit */
  slices: MiniDonutSlice[]
  /** Diameter in px — default 56 */
  size?: number
  /** Stroke width in px — default 7 */
  strokeWidth?: number
  /** Optional className for wrapper */
  className?: string
}

/**
 * Compact donut chart (48-64px) showing budget allocation by type.
 * Purely visual — no tooltip/interaction. Uses typeColors for consistency.
 */
export function MiniDonut({ slices, size = 56, strokeWidth = 7, className }: MiniDonutProps) {
  const totalLimit = slices.reduce((s, sl) => s + sl.limit, 0)
  if (totalLimit <= 0) return null

  const r = (size - strokeWidth) / 2
  const cx = size / 2
  const cy = size / 2
  const circumference = 2 * Math.PI * r
  const gap = 2 // px gap between segments

  // Build arcs
  let offset = 0
  const arcs = slices
    .filter(sl => sl.limit > 0)
    .map((sl) => {
      const fraction = sl.limit / totalLimit
      const arcLen = fraction * circumference - gap
      const spentFraction = sl.limit > 0 ? Math.min(sl.spent / sl.limit, 1) : 0
      const spentLen = spentFraction * (fraction * circumference - gap)
      const tc = typeColors(sl.type)
      const currentOffset = offset
      offset += fraction * circumference
      return { sl, arcLen: Math.max(arcLen, 1), spentLen, tc, offset: currentOffset, fullArcLen: fraction * circumference }
    })

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      style={{ transform: 'rotate(-90deg)' }}
    >
      {arcs.map((arc, i) => (
        <g key={arc.sl.type}>
          {/* Track (budget limit — light color) */}
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            strokeWidth={strokeWidth}
            strokeLinecap="butt"
            style={{
              stroke: arc.tc.budget,
              strokeDasharray: `${arc.arcLen} ${circumference - arc.arcLen}`,
              strokeDashoffset: -arc.offset - gap / 2,
            }}
          />
          {/* Fill (spent — dark color) */}
          {arc.spentLen > 0.5 && (
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              strokeWidth={strokeWidth}
              strokeLinecap="butt"
              style={{
                stroke: arc.tc.spent,
                strokeDasharray: `${arc.spentLen} ${circumference - arc.spentLen}`,
                strokeDashoffset: -arc.offset - gap / 2,
              }}
            />
          )}
        </g>
      ))}
    </svg>
  )
}

/* ── BudgetDonut (orchestrator) ──────────────────────────────── */

export function BudgetDonut({ groups, spending, onNavigate }: BudgetDonutProps) {
  const segments = useMemo(() => buildSegments(groups, spending), [groups, spending])
  const [hiddenBudgets, setHiddenBudgets] = useState<Set<string>>(() => loadHiddenBudgets())
  const [collapsedTypes, setCollapsedTypes] = useState<Set<string>>(() => loadCollapsedTypes())

  const toggleHidden = (id: string) => {
    setHiddenBudgets(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      saveHiddenBudgets(next)
      return next
    })
  }

  const toggleCollapsedType = (type: string) => {
    setCollapsedTypes(prev => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type); else next.add(type)
      saveCollapsedTypes(next)
      return next
    })
  }

  // Group by budgetType, filter types with budget > 0
  const typeGroups = useMemo(() => {
    const map = new Map<BudgetType, Segment[]>()
    for (const seg of segments) {
      const existing = map.get(seg.budgetType) || []
      existing.push(seg)
      map.set(seg.budgetType, existing)
    }
    const order: BudgetType[] = ['income', 'expense', 'savings', 'debt']
    return order
      .filter((type) => {
        const segs = map.get(type)
        return segs && segs.reduce((s, seg) => s + seg.limit, 0) > 0
      })
      .map((type) => ({ type, segments: map.get(type)! }))
  }, [segments])

  if (typeGroups.length === 0) return null

  // Uitgaven hebben een eigen volle-breedte rij; inkomen/sparen/schulden
  // vullen daaronder een 3-koloms strip. Dat geeft uitgaven visuele
  // prominentie zonder het SVG-formaat zelf te wijzigen — de centrale
  // donut staat alleen op zijn rij en oogt daardoor groter en ankert
  // de blik.
  const expenseGroup = typeGroups.find((g) => g.type === 'expense')
  const restGroups = typeGroups.filter((g) => g.type !== 'expense')

  return (
    <div className="mt-8 space-y-6">
      {expenseGroup && (
        <TypeDonut
          key={expenseGroup.type}
          budgetType={expenseGroup.type}
          segments={expenseGroup.segments}
          onNavigate={onNavigate}
          hiddenBudgets={hiddenBudgets}
          onToggleHidden={toggleHidden}
          isCollapsed={collapsedTypes.has(expenseGroup.type)}
          onToggleCollapse={() => toggleCollapsedType(expenseGroup.type)}
        />
      )}

      {restGroups.length > 0 && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {restGroups.map(({ type, segments: typeSegs }) => (
            <TypeDonut
              key={type}
              budgetType={type}
              segments={typeSegs}
              onNavigate={onNavigate}
              hiddenBudgets={hiddenBudgets}
              onToggleHidden={toggleHidden}
              isCollapsed={collapsedTypes.has(type)}
              onToggleCollapse={() => toggleCollapsedType(type)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
