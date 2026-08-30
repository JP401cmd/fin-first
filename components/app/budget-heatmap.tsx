'use client'

import { useState, useMemo, useCallback, useRef, memo } from 'react'
import type { BudgetWithChildren } from '@/lib/budget-data'
import { BudgetIcon, isOverPositive, type BudgetType } from '@/components/app/budget-shared'
import { budgetSpentPct, budgetBarPct } from '@/lib/budget-spending'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import type { WidgetSize } from '@/lib/widget-catalog'
import { MaskedAmount } from '@/components/app/masked-amount'

/* ── Types ────────────────────────────────────────────────────── */

/** A section in the combined heatmap */
export interface HeatmapSection {
  label: string
  budgetType: BudgetType
  groups: BudgetWithChildren[]
}

interface CombinedBudgetHeatmapProps {
  sections: HeatmapSection[]
  spending: Record<string, number>
  onNavigate: (budgetId: string) => void
  beschikbaarMap?: Record<string, number>
  previousSpending?: Record<string, number>
  size?: WidgetSize
  /**
   * M17 — "toon meer" onder de compacte mobiele lijst (quarter/half): opent de
   * schermbrede heatmap. Optioneel: zonder deze prop toont de lijst alleen de
   * top-N zonder uitweg, wat alleen zinvol is buiten widget-context.
   */
  onShowAll?: () => void
}

/**
 * M17 — hoeveel categorieën de compacte mobiele lijst toont vóór "toon meer".
 * Besluit eigenaar 26-08-2026: top-5. Dezelfde volgorde als de treemap zelf
 * (grootste budget eerst — `squarify` sorteert op `weight`), zodat de lijst
 * dezelfde vijf blokken toont die je op desktop het grootst ziet.
 */
const COMPACT_MOBILE_ITEMS = 5

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
  /** Budget type this rect belongs to */
  budgetType: BudgetType
  /** Flat index for stagger animation */
  index: number
}

/** Section header label in the SVG treemap */
interface SectionLabel {
  label: string
  budgetType: BudgetType
  x: number
  y: number
  w: number
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

/** Gap between sections (constant across sizes) */
const SECTION_GAP = 6

/** Size-dependent SVG constants for optimal rendering per widget format */
interface HeatmapConstants {
  VB_W: number
  VB_H: number
  CELL_GAP: number
  CELL_RADIUS: number
  SECTION_LABEL_H: number
}

function getHeatmapConstants(size?: WidgetSize): HeatmapConstants {
  // NB: viewBox-aspects zijn per widget-formaat afgestemd op de BREDE/LAGE
  // tegel-verhouding (content-area) zodat de treemap — die nu met
  // preserveAspectRatio="meet" IN de vaste tegelhoogte past — zo min mogelijk
  // letterbox-witruimte overhoudt. De SVG loopt daardoor nooit meer over.
  switch (size) {
    // NB: 'mini' rendert BudgetHeatmap niet — de widget toont daar bewust een
    // categorie-telling i.p.v. een kleur-only mini-treemap (na de overflow-fix,
    // commit edd7ca08). Er is daarom geen 'mini'-constantenpad meer.
    case 'quarter':
      // Tegel ~1 kolom, kort → aspect ~2.0.
      return { VB_W: 400, VB_H: 200, CELL_GAP: 2, CELL_RADIUS: 4, SECTION_LABEL_H: 12 }
    case 'half':
      // Tegel ~2 kolommen, kort → aspect ~4.2.
      return { VB_W: 800, VB_H: 190, CELL_GAP: 2, CELL_RADIUS: 5, SECTION_LABEL_H: 14 }
    case 'xl':
      // Double (lg: 4 kolommen × 2 rijen) = brede, lage tegel; de legenda eet
      // verticale ruimte → nóg breder effectief SVG-vlak (aspect ~5.0).
      return { VB_W: 1600, VB_H: 320, CELL_GAP: 3, CELL_RADIUS: 6, SECTION_LABEL_H: 18 }
    case 'full':
      // Full = 2 kol × 2 rijen; met legenda eronder is het SVG-vlak breed/laag
      // (aspect ~2.4). Bewust APART van `default` zodat de vrijstaande
      // budgetten-pagina (size undefined) zijn hoge, multi-sectie viewBox houdt.
      return { VB_W: 800, VB_H: 340, CELL_GAP: 3, CELL_RADIUS: 6, SECTION_LABEL_H: 18 }
    default:
      // size === undefined → vrijstaande /overzicht/cashflow/budget-heatmap:
      // natuurlijke hoogte (h-auto), kan meerdere secties stapelen → hoog.
      return { VB_W: 800, VB_H: 500, CELL_GAP: 3, CELL_RADIUS: 6, SECTION_LABEL_H: 18 }
  }
}

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
 * Expense budgets use a neutral/green scale up to 100% (spending within budget is fine),
 * and only transition to red when exceeding the budget (>100%).
 * Income/savings/debt use neutral-to-green (reaching the goal is "good").
 */
function getHeatmapColor(budgetType: BudgetType, percentUsed: number): string {
  const p = Math.max(0, Math.min(percentUsed, 200)) // cap at 200%

  if (budgetType === 'expense') {
    // 0–100%: neutral gray → green (within budget is good)
    if (p <= 50) return lerpColor('#d4d4d8', '#a3e635', p / 50)
    if (p <= 80) return lerpColor('#a3e635', '#22c55e', (p - 50) / 30)
    if (p <= 100) return lerpColor('#22c55e', '#16a34a', (p - 80) / 20)
    // >100%: red (over budget)
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
  items: { id: string; name: string; icon: string; weight: number; spent: number; limit: number; parentId: string | null; budgetType: BudgetType }[],
  x: number,
  y: number,
  w: number,
  h: number,
  startIndex: number,
  cellGap: number,
): TreemapRect[] {
  if (items.length === 0 || w <= 0 || h <= 0) return []

  // Single item — fill the entire rectangle
  if (items.length === 1) {
    return [{
      ...items[0],
      x: x + cellGap / 2,
      y: y + cellGap / 2,
      w: Math.max(0, w - cellGap),
      h: Math.max(0, h - cellGap),
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
      x: rx + cellGap / 2,
      y: ry + cellGap / 2,
      w: Math.max(0, rw - cellGap),
      h: Math.max(0, rh - cellGap),
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
    rects.push(...squarify(remaining, nx, ny, nw, nh, startIndex + row.length, cellGap))
  }

  return rects
}

/* ── Build flat items from groups ────────────────────────────── */

function buildTreemapItems(
  groups: BudgetWithChildren[],
  spending: Record<string, number>,
  budgetType: BudgetType,
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
    budgetType: BudgetType
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
        budgetType,
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
          budgetType,
        })
      }
    }
  }

  return items
}

/* ── Build combined sectioned layout ────────────────────────── */

/**
 * Build a combined treemap with sections stacked vertically.
 * Each section gets proportional height based on total weight,
 * with a label header above each section.
 */
function buildCombinedLayout(
  sections: HeatmapSection[],
  spending: Record<string, number>,
  constants: HeatmapConstants,
  beschikbaarMap?: Record<string, number>,
): { rects: TreemapRect[]; labels: SectionLabel[]; allGroups: BudgetWithChildren[] } {
  const { VB_W, VB_H, CELL_GAP, SECTION_LABEL_H } = constants

  // Build items per section
  const sectionData = sections
    .filter((s) => s.groups.length > 0)
    .map((s) => ({
      ...s,
      items: buildTreemapItems(s.groups, spending, s.budgetType, beschikbaarMap),
    }))
    .filter((s) => s.items.length > 0)

  if (sectionData.length === 0) return { rects: [], labels: [], allGroups: [] }

  // Compute total weight per section for proportional height allocation
  const sectionWeights = sectionData.map((s) => s.items.reduce((sum, it) => sum + it.weight, 0))
  const totalWeight = sectionWeights.reduce((s, w) => s + w, 0)

  // Reserve space for labels and gaps
  const totalLabelSpace = sectionData.length * SECTION_LABEL_H
  const totalGapSpace = Math.max(0, sectionData.length - 1) * SECTION_GAP
  const availableH = VB_H - totalLabelSpace - totalGapSpace

  const allRects: TreemapRect[] = []
  const labels: SectionLabel[] = []
  const allGroups: BudgetWithChildren[] = []
  let yOffset = 0
  let globalIndex = 0

  for (let si = 0; si < sectionData.length; si++) {
    const section = sectionData[si]
    const sectionH = totalWeight > 0
      ? (sectionWeights[si] / totalWeight) * availableH
      : availableH / sectionData.length

    // Add section label
    labels.push({
      label: section.label,
      budgetType: section.budgetType,
      x: 0,
      y: yOffset,
      w: VB_W,
    })
    yOffset += SECTION_LABEL_H

    // Squarify within this section's area
    const sectionRects = squarify(section.items, 0, yOffset, VB_W, sectionH, globalIndex, CELL_GAP)
    allRects.push(...sectionRects)
    globalIndex += sectionRects.length

    // Collect groups
    allGroups.push(...section.groups)

    yOffset += sectionH + SECTION_GAP
  }

  return { rects: allRects, labels, allGroups }
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
  previousSpending,
  containerRef,
}: {
  data: TooltipData
  previousSpending?: Record<string, number>
  containerRef: React.RefObject<HTMLDivElement | null>
}) {
  const { rect, mouseX, mouseY } = data
  const budgetType = rect.budgetType
  // Weergave-percentage geklemd op [0,100]; de KLEUR gebruikt de niet-boven-
  // geklemde waarde, want getHeatmapColor kleurt pas rood boven de 100.
  const pct = budgetSpentPct(rect.spent, rect.limit)
  const colorPct = budgetBarPct(rect.spent, rect.limit)
  // Weergave volgt de carry-klem: meegenomen ruimte boven de limiet bestaat niet.
  const remaining = Math.max(0, Math.min(rect.limit, rect.limit - rect.spent))
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
        <span className={isOver ? (overPositive ? 'text-positive' : 'text-negative') : 'text-[var(--ink)]'}>
          {<MaskedAmount value={rect.spent} tone="wil" />}
        </span>
        <span className="text-[var(--ink-3)]"> / {<MaskedAmount value={rect.limit} tone="wil" />}</span>
      </div>

      {/* Percentage bar */}
      <div className="mb-1.5">
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-[var(--subtle)]">
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-all"
            style={{
              width: `${pct}%`, // budgetSpentPct is al geklemd op [0,100]
              backgroundColor: rect.limit > 0 ? getHeatmapColor(budgetType, colorPct) : NEUTRAL_COLOR,
            }}
          />
        </div>
        <div className="mt-0.5 flex items-center justify-between">
          <span className={`text-[10px] font-medium ${isOver ? (overPositive ? 'text-positive' : 'text-negative') : 'text-[var(--ink-2)]'}`}>
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
        Resterend: <span className="font-mono tabular-nums">{<MaskedAmount value={remaining} tone="wil" />}</span>
      </div>
    </div>
  )
}

/* ── Combined Legend component ────────────────────────────────── */

function CombinedHeatmapLegend() {
  // Combined legend: neutral/green for 0-100%, red for >100% (expense overspend)
  const gradientId = 'heatmap-legend-combined'

  return (
    <div className="mt-4 flex flex-col items-center gap-1">
      <div className="flex items-center gap-6">
        {/* Main scale: 0–100% */}
        <div className="flex flex-col items-center gap-0.5">
          <svg width="180" height="14" viewBox="0 0 180 14" className="overflow-visible">
            <defs>
              <linearGradient id={gradientId}>
                <stop offset="0%" stopColor="#d4d4d8" />
                <stop offset="40%" stopColor="#a3e635" />
                {/* eslint-disable no-restricted-syntax -- legenda van continue lerp-kleurschaal, geen winst/verlies-token */}
                <stop offset="70%" stopColor="#22c55e" />
                <stop offset="100%" stopColor="#16a34a" />
                {/* eslint-enable no-restricted-syntax */}
              </linearGradient>
            </defs>
            <rect x="0" y="0" width="180" height="10" rx="3" fill={`url(#${gradientId})`} />
          </svg>
          <div className="flex w-[180px] justify-between">
            <span className="text-[9px] text-[var(--ink-4)]">0%</span>
            <span className="text-[9px] text-[var(--ink-4)]">50%</span>
            <span className="text-[9px] text-[var(--ink-4)]">100%</span>
          </div>
        </div>

        {/* Overspend indicator */}
        <div className="flex flex-col items-center gap-0.5">
          <svg width="50" height="14" viewBox="0 0 50 14" className="overflow-visible">
            <defs>
              <linearGradient id="heatmap-legend-over">
                {/* eslint-disable-next-line no-restricted-syntax -- legenda van continue lerp-kleurschaal, geen winst/verlies-token */}
                <stop offset="0%" stopColor="#ef4444" />
                <stop offset="100%" stopColor="#991b1b" />
              </linearGradient>
            </defs>
            <rect x="0" y="0" width="50" height="10" rx="3" fill="url(#heatmap-legend-over)" />
          </svg>
          <span className="text-[9px] text-[var(--ink-4)]">&gt;100%</span>
        </div>
      </div>
      <p className="text-[9px] text-[var(--ink-4)]">
        Grijs = begin &middot; Groen = op schema &middot; Rood = over budget (alleen uitgaven)
      </p>
    </div>
  )
}

/* ── Mobile layout: stacked sections with groups ───────────────── */

function MobileCombinedHeatmap({
  sections,
  spending,
  beschikbaarMap,
  onNavigate,
  hasEntered,
}: {
  sections: HeatmapSection[]
  spending: Record<string, number>
  beschikbaarMap?: Record<string, number>
  onNavigate: (budgetId: string) => void
  hasEntered: boolean
}) {
  let globalIndex = 0

  return (
    <div className="space-y-6">
      {sections
        .filter((s) => s.groups.length > 0)
        .map((section) => {
          const items = buildTreemapItems(section.groups, spending, section.budgetType, beschikbaarMap)
          if (items.length === 0) return null

          const overPositive = isOverPositive(section.budgetType)

          return (
            <div key={section.budgetType}>
              {/* Section header */}
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                {section.label}
              </h4>

              <div className="space-y-3">
                {section.groups.map((group) => {
                  // Collect items belonging to this group
                  const groupItems = items.filter(
                    (it) => it.parentId === group.id || (it.parentId === null && it.id === group.id),
                  )

                  if (groupItems.length === 0) return null

                  const groupTotalLimit = groupItems.reduce((s, it) => s + it.limit, 0)
                  const groupTotalSpent = groupItems.reduce((s, it) => s + it.spent, 0)

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
                          {<MaskedAmount value={groupTotalSpent} tone="wil" />} / {<MaskedAmount value={groupTotalLimit} tone="wil" />}
                        </span>
                      </div>

                      {/* Horizontal child blocks */}
                      <div className="flex flex-wrap gap-1 p-2">
                        {groupItems.map((item) => {
                          const idx = globalIndex++
                          const pct = budgetSpentPct(item.spent, item.limit)
          const colorPct = budgetBarPct(item.spent, item.limit)
                          const color = item.limit > 0 ? getHeatmapColor(section.budgetType, colorPct) : NEUTRAL_COLOR
                          const isOver = item.spent > item.limit && item.limit > 0

                          // Width proportional to weight within the group
                          const totalGroupWeight = groupItems.reduce((s, it) => s + it.weight, 0)
                          const widthPct = totalGroupWeight > 0 ? (item.weight / totalGroupWeight) * 100 : 100 / groupItems.length

                          return (
                            <button
                              key={item.id}
                              type="button"
                              className="flex flex-col items-center justify-center rounded-md px-2 py-2 transition-opacity"
                              style={{
                                backgroundColor: color,
                                width: `calc(${widthPct}% - 4px)`,
                                minWidth: 60,
                                minHeight: 52,
                                opacity: hasEntered ? 1 : 0,
                                transform: hasEntered ? 'scale(1)' : 'scale(0.92)',
                                transition: `opacity 0.4s ease-out ${idx * 40}ms, transform 0.4s ease-out ${idx * 40}ms`,
                              }}
                              onClick={(e) => {
                                // Blok wint van de omhullende tegel-<Link> (WidgetShell):
                                // stop de bubble zodat déze deeplink (categorie-pane)
                                // opent i.p.v. de tegel-href.
                                e.preventDefault()
                                e.stopPropagation()
                                onNavigate(item.id)
                              }}
                            >
                              <span className="truncate text-[10px] font-medium text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.3)]">
                                {item.name}
                              </span>
                              <span className={`font-mono text-[10px] font-bold tabular-nums [text-shadow:0_1px_2px_rgba(0,0,0,0.3)] ${
                                // eslint-disable-next-line no-restricted-syntax -- lichte tint-variant op gekleurde heatmap-cel; text-positive/negative is hier onleesbaar
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
            </div>
          )
        })}
    </div>
  )
}

/* ── Mobile layout: compacte top-N-lijst voor krappe tegels ────── */

/**
 * MobileCompactHeatmapList — de mobiele lezing van de heatmap in een KRAPPE
 * tegel (`quarter`/`half`).
 *
 * WAAROM (M17): die tegels toonden op mobiel dezelfde SVG-treemap als desktop.
 * De viewBox van `half` is 800×190 terwijl het content-vlak op 390px-breed
 * ~330×70px is — `preserveAspectRatio="meet"` schaalt de hele SVG dan met een
 * factor ~0,4-0,5, en de labels in de `foreignObject` (nominaal 9-10px) schalen
 * mee tot ~4-5px. Tien categorieën in een halve tegel werden zo decoratie in
 * plaats van informatie. De `canFitName`/`canFitPct`-checks in `TreemapCell`
 * merken dat niet op: die rekenen in viewBox-eenheden, niet in echte pixels.
 *
 * De rijke `MobileCombinedHeatmap` (groepskaarten met kop en blokken) is voor
 * deze tegelhoogte veel te hoog — dat was precies de overloop die commit
 * `edd7ca08` destijds met de treemap probeerde op te lossen. Vandaar een derde,
 * bewust magere vorm: één regel per categorie, echte HTML-tekst die niet
 * meeschaalt, top-5, en een altijd zichtbare uitweg naar het volle scherm.
 *
 * Layout-contract: `h-full` + de lijst scrollt (`min-h-0 flex-1 overflow-y-auto`)
 * terwijl de "toon meer"-knop `shrink-0` onderaan staat. Zo kan de uitweg nooit
 * uit beeld scrollen en wordt er niets geklikt afgesneden — de tegel zelf staat
 * op `overflow-hidden` en biedt bij deze formaten géén ScrollableContent.
 */
function MobileCompactHeatmapList({
  sections,
  spending,
  beschikbaarMap,
  onNavigate,
  onShowAll,
  hasEntered,
}: {
  sections: HeatmapSection[]
  spending: Record<string, number>
  beschikbaarMap?: Record<string, number>
  onNavigate: (budgetId: string) => void
  onShowAll?: () => void
  hasEntered: boolean
}) {
  const all = sections
    .filter((s) => s.groups.length > 0)
    .flatMap((s) =>
      buildTreemapItems(s.groups, spending, s.budgetType, beschikbaarMap).map((it) => ({
        ...it,
        budgetType: s.budgetType,
      })),
    )
    // Zelfde ordening als `squarify()`: grootste blok eerst.
    .sort((a, b) => b.weight - a.weight)

  if (all.length === 0) return null

  const shown = all.slice(0, COMPACT_MOBILE_ITEMS)
  const rest = all.length - shown.length

  return (
    <div className="flex h-full flex-col">
      <ul aria-label="Grootste budgetten" className="min-h-0 flex-1 space-y-[3px] overflow-y-auto">
        {shown.map((item, idx) => {
          const pct = budgetSpentPct(item.spent, item.limit)
          const colorPct = budgetBarPct(item.spent, item.limit)
          const color = item.limit > 0 ? getHeatmapColor(item.budgetType, colorPct) : NEUTRAL_COLOR
          return (
            <li key={item.id}>
              <button
                type="button"
                className="flex w-full items-center gap-1.5 text-left"
                style={{
                  opacity: hasEntered ? 1 : 0,
                  transition: `opacity 0.4s ease-out ${idx * 40}ms`,
                }}
                onClick={(e) => {
                  // De tegel is zelf een <Link> (WidgetShell); stop de bubble
                  // zodat een tik op een regel de categorie opent i.p.v. de
                  // tegel-href te volgen.
                  e.preventDefault()
                  e.stopPropagation()
                  onNavigate(item.id)
                }}
              >
                {/* Kleurstip = dezelfde heatmap-kleurschaal als de treemap, zodat
                    "rood is over budget" ook in deze vorm klopt. */}
                <span
                  aria-hidden="true"
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--ink-2)]">
                  {item.name}
                </span>
                <span className="shrink-0 font-mono text-[11px] font-semibold tabular-nums text-[var(--ink)]">
                  {pct}%
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      {rest > 0 && onShowAll && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onShowAll()
          }}
          className="mt-1 shrink-0 self-start text-[11px] font-semibold text-[var(--ink-3)] underline underline-offset-2"
        >
          Toon alle {all.length}
        </button>
      )}
    </div>
  )
}

/* ── Main SVG treemap cell ───────────────────────────────────── */

function TreemapCell({
  rect,
  isHovered,
  hasEntered,
  cellRadius,
  size,
  onMouseEnter,
  onMouseLeave,
  onClick,
}: {
  rect: TreemapRect
  isHovered: boolean
  hasEntered: boolean
  cellRadius: number
  size?: WidgetSize
  onMouseEnter: (e: React.MouseEvent) => void
  onMouseLeave: () => void
  onClick: () => void
}) {
  const budgetType = rect.budgetType
  // Weergave-percentage geklemd op [0,100]; de KLEUR gebruikt de niet-boven-
  // geklemde waarde, want getHeatmapColor kleurt pas rood boven de 100.
  const pct = budgetSpentPct(rect.spent, rect.limit)
  const colorPct = budgetBarPct(rect.spent, rect.limit)
  const color = rect.limit > 0 ? getHeatmapColor(budgetType, colorPct) : NEUTRAL_COLOR
  const overPositive = isOverPositive(budgetType)
  const isOver = rect.spent > rect.limit && rect.limit > 0

  // Determine what text fits inside the cell — adjusted per widget size.
  // xl deelt de label-rijkdom van full (grotere cellen, dus icoon + bedrag).
  const isQuarter = size === 'quarter'
  const isFull = size === 'full' || size === 'xl'

  const canFitIcon = !isQuarter && rect.w > 50 && rect.h > 50
  const canFitName = isQuarter ? rect.w > 25 && rect.h > 18 : rect.w > 40 && rect.h > 30
  const canFitPct = isQuarter ? rect.w > 20 && rect.h > 14 : rect.w > 30 && rect.h > 20
  const canFitAmount = isFull && rect.w > 70 && rect.h > 55

  // Text color: use white with shadow for readability on colored backgrounds
  const textShadow = '0 1px 2px rgba(0,0,0,0.3)'

  const staggerDelay = rect.index * 40

  // Desktop treemap-cellen zijn volwaardig toetsenbord-bedienbaar (parity met de
  // mobiele <button>-variant): role/tabIndex/aria-label + Enter/Space.
  const ariaLabel = `${rect.name}, ${pct}% van budget besteed`

  return (
    <g
      className="cursor-pointer"
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={(e) => {
        // Cel wint van de omhullende tegel-<Link> (WidgetShell): stop de bubble
        // zodat de per-blok deeplink (categorie-pane) opent i.p.v. de tegel-href.
        e.preventDefault()
        e.stopPropagation()
        onClick()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          e.stopPropagation()
          onClick()
        }
      }}
    >
      {/* Background rect */}
      <rect
        x={rect.x}
        y={rect.y}
        width={rect.w}
        height={rect.h}
        rx={cellRadius}
        ry={cellRadius}
        fill={color}
        stroke={isHovered ? 'var(--ink)' : 'rgba(255,255,255,0.4)'}
        strokeWidth={isHovered ? 2 : 0.5}
        style={{
          opacity: hasEntered ? 1 : 0,
          transform: hasEntered ? 'scale(1)' : 'scale(0.92)',
          transformOrigin: `${rect.x + rect.w / 2}px ${rect.y + rect.h / 2}px`,
          transition: `opacity 0.3s ease-out ${staggerDelay}ms, transform 0.3s ease-out ${staggerDelay}ms, stroke 0.15s ease`,
        }}
      />

      {/* Cell content via foreignObject */}
      <foreignObject
        x={rect.x}
        y={rect.y}
        width={rect.w}
        height={rect.h}
        style={{
          opacity: hasEntered ? 1 : 0,
          transition: `opacity 0.4s ease-out ${staggerDelay + 100}ms`,
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
                className={`w-full truncate text-center font-medium leading-tight text-white ${isQuarter ? 'text-[8px]' : 'text-[9px]'}`}
                style={{ textShadow }}
              >
                {rect.name}
              </p>
            )}

            {/* Percentage */}
            {canFitPct && (
              <p
                className={`font-mono font-bold tabular-nums leading-tight ${isQuarter ? 'text-[8px]' : 'text-[10px]'} ${
                  // eslint-disable-next-line no-restricted-syntax -- lichte tint-variant op gekleurde heatmap-cel; text-positive/negative is hier onleesbaar
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
                {<MaskedAmount value={rect.spent} tone="wil" />}
              </p>
            )}
          </div>
        </foreignObject>
    </g>
  )
}

/* ── BudgetHeatmap (top-level — combined) ────────────────────── */

export const BudgetHeatmap = memo(function BudgetHeatmap({
  sections,
  spending,
  onNavigate,
  beschikbaarMap,
  previousSpending,
  size,
  onShowAll,
}: CombinedBudgetHeatmapProps) {
  const { ref, hasEntered } = useInViewAnimation({ duration: 900 })
  const containerRef = useRef<HTMLDivElement | null>(null)

  const [tooltip, setTooltip] = useState<TooltipData | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  // Size-dependent constants
  const constants = useMemo(() => getHeatmapConstants(size), [size])
  const { VB_W, VB_H, CELL_RADIUS } = constants

  // Build combined sectioned layout
  const { rects, labels, allGroups } = useMemo(
    () => buildCombinedLayout(sections, spending, constants, beschikbaarMap),
    [sections, spending, constants, beschikbaarMap],
  )

  // Clamp viewBox height: use actual content extent but cap at VB_H * 1.1
  // to prevent the SVG from shrinking when content exceeds VB_H
  const totalVbH = useMemo(() => {
    if (rects.length === 0) return VB_H
    const maxY = Math.max(...rects.map((r) => r.y + r.h))
    return Math.min(maxY + 4, VB_H * 1.1)
  }, [rects, VB_H])

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
        const parent = allGroups.find((g) => g.id === pid)
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
  }, [rects, allGroups])

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

  // 'quarter' is te krap voor de hover-tooltip/mousemove (kleine cellen).
  const isCompact = size === 'quarter'

  // ── Layout-modus ────────────────────────────────────────────
  // Widget-context (concrete `size`): de treemap MOET binnen de vaste
  // tegelhoogte passen → fit-to-height (SVG h-full + preserveAspectRatio meet,
  // letterbox i.p.v. overflow). Vrijstaande budgetten-pagina (`size` undefined):
  // natuurlijke hoogte (h-auto, hoogte-uit-breedte) zoals voorheen — ongewijzigd.
  const constrainToHeight = size !== undefined
  // Grote formaten (full/xl) + de vrijstaande pagina houden de mobiele
  // gestapelde groepslijst (die heeft de hoogte om te ademen).
  const showStackedMobile = !size || size === 'full' || size === 'xl'
  // M17: compacte tegels (quarter/half) kregen op mobiel de fit-treemap. Die
  // schaalt de labels terug tot ~4-5px — onleesbaar, en dus decoratie. Ze
  // krijgen nu de compacte top-5-lijst met "toon meer". Desktop houdt de
  // treemap: daar is de schaalfactor ~1× en leest hij prima.
  const showCompactMobile = size === 'quarter' || size === 'half'
  // Legenda alleen waar er ruimte is (full/xl + vrijstaande pagina).
  const showLegend = !size || size === 'full' || size === 'xl'

  // SVG-blok: fit-to-height in widget-context; op mobiel verborgen zodra een
  // van de twee mobiele lezingen het overneemt.
  const hideSvgOnMobile = showStackedMobile || showCompactMobile
  const svgBlockClass = !constrainToHeight
    ? (hideSvgOnMobile ? 'hidden md:block' : 'block')
    : hideSvgOnMobile
      ? 'hidden md:flex md:min-h-0 md:flex-1 md:flex-col'
      : 'flex min-h-0 flex-1 flex-col'

  // Edge case: no sections with data
  const hasData = sections.some((s) => s.groups.length > 0)
  if (!hasData) return null

  return (
    <div ref={ref} className={constrainToHeight ? 'flex h-full flex-col' : undefined}>
      {/* SVG treemap — desktop altijd; op mobiel óók voor compacte (quarter/half)
          tegels. In widget-context past de SVG binnen de tegelhoogte (fit). */}
      <div className={svgBlockClass}>
        <div ref={containerRef} className={`relative${constrainToHeight ? ' min-h-0 flex-1' : ''}`}>
          <svg
            viewBox={`0 0 ${VB_W} ${totalVbH}`}
            className={constrainToHeight ? 'h-full w-full' : 'h-auto w-full'}
            preserveAspectRatio="xMidYMid meet"
            onMouseMove={isCompact ? undefined : handleMouseMove}
            style={{
              animation: hasEntered ? 'fadeUp 0.4s ease-out both' : 'none',
              opacity: hasEntered ? undefined : 0,
            }}
          >
            {/* Section labels — compact at quarter */}
            {labels.map((label) => (
              <text
                key={`section-${label.budgetType}`}
                x={label.x + 4}
                y={label.y + (size === 'quarter' ? 10 : 13)}
                className={`fill-[var(--ink-2)] font-sans font-semibold uppercase tracking-wider ${size === 'quarter' ? 'text-[9px]' : 'text-[12px]'}`}
                opacity={hasEntered ? 1 : 0}
                style={{ transition: 'opacity 0.4s ease-out 0.1s', letterSpacing: '0.05em' }}
              >
                {label.label}
              </text>
            ))}

            {/* Parent group outlines — only at half/full/xl where there's room */}
            {(size === 'half' || size === 'full' || size === 'xl' || !size) && parentOutlines.map(([pid, outline]) => (
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
                isHovered={hoveredId === rect.id}
                hasEntered={hasEntered}
                cellRadius={CELL_RADIUS}
                size={size}
                onMouseEnter={(e) => handleMouseEnter(rect, e)}
                onMouseLeave={handleMouseLeave}
                onClick={() => onNavigate(rect.id)}
              />
            ))}
          </svg>

          {/* Tooltip (desktop only) — binnen de positionerende containerRef zodat
              de mouse-coördinaten exact kloppen; op mobiel/quarter uitgeschakeld. */}
          {!isCompact && tooltip && (
            <div className="hidden md:block">
              <HeatmapTooltip
                data={tooltip}
                previousSpending={previousSpending}
                containerRef={containerRef}
              />
            </div>
          )}
        </div>

        {/* Legenda binnen het SVG-blok (fit-mode): flex-col met SVG=flex-1 en
            legenda=shrink-0 zodat de treemap krimpt en de legenda in de tegel
            blijft i.p.v. eronder weg te vallen. */}
        {constrainToHeight && showLegend && (
          <div className="shrink-0">
            <CombinedHeatmapLegend />
          </div>
        )}
      </div>

      {/* Mobiel: gestapelde secties — alleen grote formaten (full/xl) + de
          vrijstaande pagina; scrollt via WidgetShell's ScrollableContent. */}
      {/* Mobiel, krappe tegel (quarter/half): compacte top-5-lijst + uitweg naar
          het volle scherm. `h-full` zodat de interne scroll/anker-layout van de
          lijst de tegelhoogte krijgt i.p.v. eruit te lopen (M17). */}
      {showCompactMobile && (
        <div className="min-h-0 flex-1 md:hidden">
          <MobileCompactHeatmapList
            sections={sections}
            spending={spending}
            beschikbaarMap={beschikbaarMap}
            onNavigate={onNavigate}
            onShowAll={onShowAll}
            hasEntered={hasEntered}
          />
        </div>
      )}

      {showStackedMobile && (
        <div className="md:hidden">
          <MobileCombinedHeatmap
            sections={sections}
            spending={spending}
            beschikbaarMap={beschikbaarMap}
            onNavigate={onNavigate}
            hasEntered={hasEntered}
          />
          {constrainToHeight && showLegend && <CombinedHeatmapLegend />}
        </div>
      )}

      {/* Legenda vrijstaande pagina (natuurlijke hoogte): onderaan, buiten de
          fit-flex — ongewijzigd t.o.v. voorheen. */}
      {!constrainToHeight && showLegend && <CombinedHeatmapLegend />}
    </div>
  )
})
