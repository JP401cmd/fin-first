'use client'

import { useState, useMemo } from 'react'
import { type BudgetWithChildren } from '@/lib/budget-data'
import { BudgetIcon, formatCurrency, type BudgetType } from '@/components/app/budget-shared'

interface BudgetDonutProps {
  groups: BudgetWithChildren[]
  spending: Record<string, number>
  onNavigate: (budgetId: string) => void
}

/* ── Colour palette ─────────────────────────────────────────────── */

const PALETTE = [
  { h: 142 },  // groen — inkomen
  { h: 25 },   // oranje — vaste lasten
  { h: 350 },  // rose — dagelijks
  { h: 200 },  // blauw — vervoer
  { h: 265 },  // paars — leuke dingen
  { h: 45 },   // amber — sparen
  { h: 170 },  // teal
  { h: 310 },  // fuchsia
]

function groupColor(idx: number) {
  const p = PALETTE[idx % PALETTE.length]
  return {
    h: p.h,
    budget: `hsl(${p.h}, 45%, 82%)`,
    spent: `hsl(${p.h}, 65%, 50%)`,
    bg: `hsl(${p.h}, 50%, 96%)`,
    text: `hsl(${p.h}, 60%, 35%)`,
    border: `hsl(${p.h}, 45%, 85%)`,
  }
}

function childColor(parentH: number, childIdx: number, total: number) {
  const spread = Math.min(total * 8, 40)
  const offset = total > 1 ? -spread / 2 + (childIdx / (total - 1)) * spread : 0
  const h = parentH + offset
  return {
    budget: `hsl(${h}, 45%, 80%)`,
    spent: `hsl(${h}, 60%, 48%)`,
  }
}

/* ── SVG arc helper ─────────────────────────────────────────────── */

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

/* ── Segment data ───────────────────────────────────────────────── */

interface ChildSeg {
  id: string
  name: string
  icon: string
  limit: number
  spent: number
}

interface Segment {
  id: string
  name: string
  icon: string
  budgetType: BudgetType
  limit: number
  spent: number
  colorIdx: number
  children: ChildSeg[]
}

function buildSegments(
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

/* ── Component ──────────────────────────────────────────────────── */

export function BudgetDonut({ groups, spending, onNavigate }: BudgetDonutProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const [hoveredChildIdx, setHoveredChildIdx] = useState<number | null>(null)

  const segments = useMemo(() => buildSegments(groups, spending), [groups, spending])

  const totalBudget = segments.reduce((s, seg) => s + seg.limit, 0)
  const totalSpent = segments.reduce((s, seg) => s + seg.spent, 0)

  // SVG dimensions
  const size = 400
  const cx = size / 2
  const cy = size / 2
  const ringR = 155          // single ring radius
  const ringWidth = 44        // single ring width
  const innerR = 108          // inner mini-donut radius (when selected)
  const innerWidth = 34
  const gap = 1.2

  // Build main ring arcs (budget = full, spent = overlay)
  const arcs = useMemo(() => {
    if (totalBudget <= 0) return []
    let angle = 0
    return segments.map((seg) => {
      const budgetSweep = (seg.limit / totalBudget) * 360
      const start = angle + gap / 2
      const end = start + budgetSweep - gap

      // Spent portion within this segment's arc
      const spentRatio = seg.limit > 0 ? Math.min(seg.spent / seg.limit, 1) : 0
      const spentSweep = budgetSweep * spentRatio
      const spentEnd = start + Math.max(spentSweep - gap, 0)

      const isOver = seg.spent > seg.limit && seg.limit > 0

      angle += budgetSweep
      return { start, end: Math.max(end, start + 0.5), spentEnd, isOver }
    })
  }, [segments, totalBudget, gap])

  // Mini donut arcs for selected segment's children
  const selectedSeg = selectedIdx !== null ? segments[selectedIdx] : null
  const showMiniDonut = selectedIdx !== null && selectedSeg !== null && selectedSeg.children.length > 0

  const miniArcs = useMemo(() => {
    if (!selectedSeg || selectedSeg.children.length === 0) return []

    const totalChildLimit = selectedSeg.children.reduce((s, c) => s + c.limit, 0)
    if (totalChildLimit <= 0) return []

    const miniGap = 2
    let angle = 0
    return selectedSeg.children.map((child, ci) => {
      const childSweep = (child.limit / totalChildLimit) * 360
      const start = angle + miniGap / 2
      const end = start + Math.max(childSweep - miniGap, 0.5)

      const spentRatio = child.limit > 0 ? Math.min(child.spent / child.limit, 1) : 0
      const spentSweep = childSweep * spentRatio
      const spentEnd = start + Math.max(spentSweep - miniGap, 0)

      const isOver = child.spent > child.limit && child.limit > 0

      angle += childSweep
      return { start, end, spentEnd, isOver, child, ci }
    })
  }, [selectedSeg])

  const active = hoveredIdx ?? selectedIdx
  const activeSeg = active !== null ? segments[active] : null
  const activeChild = hoveredChildIdx !== null && selectedSeg
    ? selectedSeg.children[hoveredChildIdx]
    : null

  const pctUsed = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0
  const parentColor = selectedIdx !== null ? groupColor(segments[selectedIdx].colorIdx) : null

  // Center text
  let centerContent: React.ReactNode
  if (activeChild) {
    const childPct = activeChild.limit > 0 ? Math.round((activeChild.spent / activeChild.limit) * 100) : 0
    centerContent = (
      <g>
        <text x={cx} y={cy - 18} textAnchor="middle" className="fill-zinc-700 text-[11px] font-semibold">
          {activeChild.name}
        </text>
        <text x={cx} y={cy + 2} textAnchor="middle" className="fill-zinc-500 text-[10px]">
          {formatCurrency(activeChild.spent)} / {formatCurrency(activeChild.limit)}
        </text>
        <text x={cx} y={cy + 20} textAnchor="middle"
          className={`text-[11px] font-bold ${activeChild.spent > activeChild.limit ? 'fill-red-500' : 'fill-emerald-600'}`}
        >
          {childPct}%
        </text>
      </g>
    )
  } else if (activeSeg) {
    centerContent = (
      <g>
        <text x={cx} y={cy - 18} textAnchor="middle" className="fill-zinc-900 text-[13px] font-bold">
          {activeSeg.name}
        </text>
        <text x={cx} y={cy + 4} textAnchor="middle" className="fill-zinc-600 text-[11px]">
          {formatCurrency(activeSeg.spent)} / {formatCurrency(activeSeg.limit)}
        </text>
        <text x={cx} y={cy + 22} textAnchor="middle"
          className={`text-[12px] font-semibold ${activeSeg.spent > activeSeg.limit ? 'fill-red-500' : 'fill-emerald-600'}`}
        >
          {activeSeg.limit > 0 ? Math.round((activeSeg.spent / activeSeg.limit) * 100) : 0}% besteed
        </text>
      </g>
    )
  } else {
    centerContent = (
      <g>
        <text x={cx} y={cy - 12} textAnchor="middle" className="fill-zinc-900 text-[16px] font-bold">
          {formatCurrency(totalSpent)}
        </text>
        <text x={cx} y={cy + 8} textAnchor="middle" className="fill-zinc-400 text-[11px]">
          van {formatCurrency(totalBudget)}
        </text>
        <text x={cx} y={cy + 26} textAnchor="middle"
          className={`text-[12px] font-semibold ${pctUsed > 100 ? 'fill-red-500' : 'fill-zinc-500'}`}
        >
          {pctUsed}% besteed
        </text>
      </g>
    )
  }

  return (
    <div className="mt-8">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
        {/* Donut */}
        <div className="flex items-center justify-center">
          <svg
            viewBox={`0 0 ${size} ${size}`}
            className="h-auto w-full max-w-[420px]"
            style={{ overflow: 'visible' }}
          >
            <defs>
              {segments.map((seg, i) => {
                const c = groupColor(seg.colorIdx)
                return (
                  <g key={`grad-${i}`}>
                    <linearGradient id={`donut-budget-${i}`} x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor={`hsl(${c.h}, 50%, 88%)`} />
                      <stop offset="100%" stopColor={`hsl(${c.h}, 40%, 76%)`} />
                    </linearGradient>
                    <linearGradient id={`donut-spent-${i}`} x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor={`hsl(${c.h}, 60%, 55%)`} />
                      <stop offset="100%" stopColor={`hsl(${c.h}, 70%, 40%)`} />
                    </linearGradient>
                  </g>
                )
              })}
            </defs>

            {/* ── Single ring: budget (light) + spent overlay (dark) ── */}
            {arcs.map((arc, i) => {
              const dimmed = active !== null && active !== i
              return (
                <g key={`ring-${i}`}>
                  {/* Budget arc (full segment, gradient) */}
                  <path
                    d={describeArc(cx, cy, ringR - ringWidth / 2, arc.start, arc.end)}
                    fill="none"
                    stroke={`url(#donut-budget-${i})`}
                    strokeWidth={ringWidth}
                    strokeLinecap="round"
                    opacity={dimmed ? 0.2 : 1}
                    className="cursor-pointer transition-opacity duration-200"
                    onMouseEnter={() => setHoveredIdx(i)}
                    onMouseLeave={() => setHoveredIdx(null)}
                    onClick={() => {
                      setSelectedIdx(selectedIdx === i ? null : i)
                      setHoveredChildIdx(null)
                    }}
                  />
                  {/* Spent arc (overlaid on same ring, gradient) */}
                  {arc.spentEnd > arc.start && (
                    <path
                      d={describeArc(cx, cy, ringR - ringWidth / 2, arc.start, arc.spentEnd)}
                      fill="none"
                      stroke={`url(#donut-spent-${i})`}
                      strokeWidth={ringWidth}
                      strokeLinecap="round"
                      opacity={dimmed ? 0.2 : 1}
                      className="cursor-pointer transition-opacity duration-200"
                      onMouseEnter={() => setHoveredIdx(i)}
                      onMouseLeave={() => setHoveredIdx(null)}
                      onClick={() => {
                        setSelectedIdx(selectedIdx === i ? null : i)
                        setHoveredChildIdx(null)
                      }}
                    />
                  )}
                  {/* Overspend glow */}
                  {arc.isOver && (
                    <path
                      d={describeArc(cx, cy, ringR - ringWidth / 2, arc.start, arc.end)}
                      fill="none"
                      stroke="#ef4444"
                      strokeWidth={ringWidth + 6}
                      strokeLinecap="round"
                      opacity={dimmed ? 0.06 : 0.25}
                      className="pointer-events-none"
                    />
                  )}
                </g>
              )
            })}

            {/* ── Mini donut (inner ring: children of selected) ────── */}
            {showMiniDonut && parentColor && miniArcs.map((arc) => {
              const dimmedChild = hoveredChildIdx !== null && hoveredChildIdx !== arc.ci
              const spread = Math.min(miniArcs.length * 8, 40)
              const offset = miniArcs.length > 1 ? -spread / 2 + (arc.ci / (miniArcs.length - 1)) * spread : 0
              const ch = parentColor.h + offset
              return (
                <g key={`mini-${arc.ci}`}>
                  <defs>
                    <linearGradient id={`donut-child-budget-${arc.ci}`} x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor={`hsl(${ch}, 50%, 86%)`} />
                      <stop offset="100%" stopColor={`hsl(${ch}, 40%, 74%)`} />
                    </linearGradient>
                    <linearGradient id={`donut-child-spent-${arc.ci}`} x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor={`hsl(${ch}, 55%, 53%)`} />
                      <stop offset="100%" stopColor={`hsl(${ch}, 65%, 38%)`} />
                    </linearGradient>
                  </defs>
                  {/* Child budget arc (gradient) */}
                  <path
                    d={describeArc(cx, cy, innerR - innerWidth / 2, arc.start, arc.end)}
                    fill="none"
                    stroke={`url(#donut-child-budget-${arc.ci})`}
                    strokeWidth={innerWidth}
                    strokeLinecap="round"
                    opacity={dimmedChild ? 0.25 : 1}
                    className="cursor-pointer transition-opacity duration-200"
                    onMouseEnter={() => setHoveredChildIdx(arc.ci)}
                    onMouseLeave={() => setHoveredChildIdx(null)}
                    onClick={() => onNavigate(arc.child.id)}
                  />
                  {/* Child spent arc (gradient, overlaid) */}
                  {arc.spentEnd > arc.start && (
                    <path
                      d={describeArc(cx, cy, innerR - innerWidth / 2, arc.start, arc.spentEnd)}
                      fill="none"
                      stroke={`url(#donut-child-spent-${arc.ci})`}
                      strokeWidth={innerWidth}
                      strokeLinecap="round"
                      opacity={dimmedChild ? 0.25 : 1}
                      className="cursor-pointer transition-opacity duration-200"
                      onMouseEnter={() => setHoveredChildIdx(arc.ci)}
                      onMouseLeave={() => setHoveredChildIdx(null)}
                      onClick={() => onNavigate(arc.child.id)}
                    />
                  )}
                  {/* Child overspend glow */}
                  {arc.isOver && (
                    <path
                      d={describeArc(cx, cy, innerR - innerWidth / 2, arc.start, arc.end)}
                      fill="none"
                      stroke="#ef4444"
                      strokeWidth={innerWidth + 4}
                      strokeLinecap="round"
                      opacity={dimmedChild ? 0.06 : 0.25}
                      className="pointer-events-none"
                    />
                  )}
                </g>
              )
            })}

            {/* Center text */}
            {centerContent}
          </svg>
        </div>

        {/* Legend + details */}
        <div className="space-y-2">
          {/* Ring legend */}
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-6 rounded-sm bg-zinc-300" />
              Budget
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-6 rounded-sm bg-zinc-600" />
              Besteed
            </span>
          </div>

          {segments.map((seg, i) => {
            const c = groupColor(seg.colorIdx)
            const pct = seg.limit > 0 ? Math.round((seg.spent / seg.limit) * 100) : 0
            const isOver = seg.spent > seg.limit && seg.limit > 0
            const isActive = active === i
            const isSelected = selectedIdx === i

            return (
              <div key={seg.id}>
                <button
                  className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all ${
                    isActive ? 'ring-2 ring-amber-400' : ''
                  }`}
                  style={{
                    borderColor: isActive ? c.border : '#e4e4e7',
                    backgroundColor: isActive ? c.bg : 'white',
                  }}
                  onMouseEnter={() => setHoveredIdx(i)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  onClick={() => {
                    setSelectedIdx(selectedIdx === i ? null : i)
                    setHoveredChildIdx(null)
                  }}
                >
                  {/* Color swatch: budget (light) + spent (dark) */}
                  <div className="flex items-center gap-0.5">
                    <span className="block h-5 w-2.5 rounded-l-sm" style={{ backgroundColor: c.spent }} />
                    <span className="block h-5 w-2.5 rounded-r-sm" style={{ backgroundColor: c.budget }} />
                  </div>

                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: c.bg }}>
                    <BudgetIcon name={seg.icon} className="h-4 w-4" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-900">{seg.name}</p>
                    <p className="text-xs text-zinc-500">
                      <span className={isOver ? 'font-semibold text-red-600' : ''}>
                        {formatCurrency(seg.spent)}
                      </span>
                      {' / '}
                      {formatCurrency(seg.limit)}
                    </p>
                  </div>

                  <span className={`shrink-0 text-xs font-bold ${isOver ? 'text-red-600' : 'text-zinc-600'}`}>
                    {pct}%
                  </span>
                </button>

                {/* Subcategories when selected */}
                {isSelected && seg.children.length > 0 && (
                  <div className="ml-5 mt-1 mb-1 space-y-0.5">
                    {seg.children.map((child, ci) => {
                      const childPct = child.limit > 0 ? Math.round((child.spent / child.limit) * 100) : 0
                      const childOver = child.spent > child.limit && child.limit > 0
                      const cc = childColor(c.h, ci, seg.children.length)
                      const isChildHovered = hoveredChildIdx === ci

                      return (
                        <button
                          key={child.id}
                          className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left transition-colors ${
                            isChildHovered ? 'bg-zinc-100' : 'hover:bg-zinc-50'
                          }`}
                          onMouseEnter={() => setHoveredChildIdx(ci)}
                          onMouseLeave={() => setHoveredChildIdx(null)}
                          onClick={(e) => { e.stopPropagation(); onNavigate(child.id) }}
                        >
                          <div className="flex items-center gap-0.5">
                            <span className="block h-3 w-1.5 rounded-l-sm" style={{ backgroundColor: cc.spent }} />
                            <span className="block h-3 w-1.5 rounded-r-sm" style={{ backgroundColor: cc.budget }} />
                          </div>
                          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded" style={{ backgroundColor: c.bg }}>
                            <BudgetIcon name={child.icon} className="h-3 w-3" />
                          </div>
                          <span className="min-w-0 flex-1 truncate text-xs text-zinc-700">{child.name}</span>
                          <span className="text-xs text-zinc-500">
                            <span className={childOver ? 'font-semibold text-red-600' : ''}>
                              {formatCurrency(child.spent)}
                            </span>
                            {' / '}
                            {formatCurrency(child.limit)}
                          </span>
                          <span className={`w-8 text-right text-xs font-medium ${childOver ? 'text-red-600' : 'text-zinc-400'}`}>
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
