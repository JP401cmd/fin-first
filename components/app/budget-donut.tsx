'use client'

import { useState, useMemo } from 'react'
import { type BudgetWithChildren } from '@/lib/budget-data'
import { BudgetIcon, formatCurrency, isOverPositive, type BudgetType } from '@/components/app/budget-shared'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'

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
}

function TypeDonut({ budgetType, segments, onNavigate }: TypeDonutProps) {
  const { ref, hasEntered, animationComplete } = useInViewAnimation({ duration: 1200 })
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const [hoveredChild, setHoveredChild] = useState<{ parentIdx: number; childIdx: number } | null>(null)

  const totalBudget = segments.reduce((s, seg) => s + seg.limit, 0)
  const totalSpent = segments.reduce((s, seg) => s + seg.spent, 0)

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

  // Build outer + inner arcs
  const arcData = useMemo<OuterArc[]>(() => {
    if (totalBudget <= 0) return []
    let angle = 0
    return segments.map((seg) => {
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
  }, [segments, totalBudget, gap, innerGap])

  // Active state
  const active = hoveredIdx ?? selectedIdx
  const activeSeg = active !== null ? segments[active] : null
  const activeChild = hoveredChild !== null ? segments[hoveredChild.parentIdx]?.children[hoveredChild.childIdx] : null

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
          {formatCurrency(activeChild.spent)} / {formatCurrency(activeChild.limit)}
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
          {formatCurrency(activeSeg.spent)} / {formatCurrency(activeSeg.limit)}
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
          {formatCurrency(totalSpent)}
        </text>
        <text x={cx} y={cy + 6} textAnchor="middle" className="fill-[var(--ink-4)] font-sans text-[9px]">
          van {formatCurrency(totalBudget)}
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

      <div className="p-4">
        {/* Type title */}
        <p className="mb-3 text-center font-sans text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)]">
          {TYPE_LABELS[budgetType] ?? budgetType}
        </p>

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
            const isExpanded = selectedIdx === i

            return (
              <div key={seg.id}>
                <button
                  className="flex w-full items-center gap-2 rounded-[var(--r)] border px-2.5 py-1.5 text-left transition-all"
                  style={{
                    borderColor: isExpanded ? c.border : 'var(--border-ed)',
                    backgroundColor: isExpanded ? c.bg : 'var(--paper)',
                    boxShadow: isExpanded ? `0 0 0 2px ${c.border}` : undefined,
                  }}
                  onMouseEnter={() => { setHoveredIdx(i); setHoveredChild(null) }}
                  onMouseLeave={() => setHoveredIdx(null)}
                  onClick={() => {
                    setSelectedIdx(selectedIdx === i ? null : i)
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
                    <p className="truncate text-xs font-medium text-[var(--ink)]">{seg.name}</p>
                    <p className="font-mono text-[10px] text-[var(--ink-3)]">
                      <span className={isOver ? (isOverPositive(budgetType) ? 'font-semibold text-emerald-600' : 'font-semibold text-red-600') : ''}>
                        {formatCurrency(seg.spent)}
                      </span>
                      {' / '}
                      {formatCurrency(seg.limit)}
                    </p>
                  </div>
                  <span className={`shrink-0 font-mono text-[10px] font-bold ${isOver ? (isOverPositive(budgetType) ? 'text-emerald-600' : 'text-red-600') : 'text-[var(--ink-2)]'}`}>
                    {pct}%
                  </span>
                </button>

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
                          onMouseEnter={() => setHoveredChild({ parentIdx: i, childIdx: ci })}
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
                              {formatCurrency(child.spent)}
                            </span>
                            {' / '}
                            {formatCurrency(child.limit)}
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
      </div>
    </div>
  )
}

/* ── BudgetDonut (orchestrator) ──────────────────────────────── */

export function BudgetDonut({ groups, spending, onNavigate }: BudgetDonutProps) {
  const segments = useMemo(() => buildSegments(groups, spending), [groups, spending])

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

  return (
    <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
      {typeGroups.map(({ type, segments: typeSegs }) => (
        <TypeDonut
          key={type}
          budgetType={type}
          segments={typeSegs}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  )
}
