'use client'

import { useState, useMemo, useCallback, useRef, memo } from 'react'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { formatCurrency } from '@/components/app/budget-shared'
import {
  type AllocationViewMode,
  CATEGORY_LABELS,
  VIEW_MODE_LABELS,
} from '@/lib/portfolio-allocation'
import { MaskedAmount } from '@/components/app/masked-amount'

// ── Types ──────────────────────────────────────────────────────

export type HeatmapHolding = {
  id: string
  name: string
  ticker: string | null
  isin: string | null
  units: number
  avg_purchase_price: number
  current_price: number | null
  last_price_update: string | null
  currency?: string
  daily_change_percent?: number | null
  asset_class?: string | null
  sector?: string | null
  geography?: string | null
}

export type ColorMode = 'daily_change' | 'total_return' | 'dividend_yield'

type Props = {
  holdings: HeatmapHolding[]
  dividendData?: Map<string, number>
  onHoldingClick?: (id: string) => void
}

/** A positioned rectangle in the treemap layout */
interface TreemapRect {
  holdingId: string
  label: string
  ticker: string | null
  x: number
  y: number
  w: number
  h: number
  weight: number
  /** Flat index for stagger animation */
  index: number
}

/** A group of holdings sharing the same classification */
interface HoldingGroup {
  key: string
  label: string
  totalValue: number
  holdings: HeatmapHolding[]
}

/** Tooltip state tied to a specific holding */
interface TooltipData {
  holding: HeatmapHolding
  mouseX: number
  mouseY: number
}

// ── Constants ──────────────────────────────────────────────────

/** SVG viewBox dimensions — 5:3 aspect ratio */
const VB_W = 1000
const VB_H = 600

/** Padding between cells */
const CELL_GAP = 3

/** Corner radius on cells */
const CELL_RADIUS = 4

/** Height reserved for group labels inside the group rectangle */
const GROUP_LABEL_H = 18

/** Dutch labels for the color mode toggle */
const COLOR_MODE_LABELS: Record<ColorMode, string> = {
  daily_change: 'Dagelijks',
  total_return: 'Totaal',
  dividend_yield: 'Dividend',
}

/** Dutch labels for the grouping toggle */
const GROUPING_LABELS: Record<AllocationViewMode, string> = {
  asset_class: 'Assetklasse',
  sector: 'Sector',
  geography: 'Geografie',
}

// ── Color interpolation ────────────────────────────────────────

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
 * Determine the heatmap fill color for a holding based on the active color mode.
 *
 * Uses smooth linear interpolation within defined threshold ranges to produce
 * a Finviz-style red/green gradient for performance metrics or a neutral-to-green
 * gradient for dividend yield.
 */
export function getHoldingHeatColor(value: number, mode: ColorMode): string {
  if (mode === 'daily_change') {
    // Red-green spectrum around 0%, thresholds at +/-1% and +/-3%
    if (value <= -3) return '#991b1b'
    if (value <= -1) return lerpColor('#dc2626', '#991b1b', (value + 1) / -2)
    if (value < 0) return lerpColor('#fca5a5', '#dc2626', value / -1)
    if (value === 0) return '#6b7280'
    if (value <= 1) return lerpColor('#6b7280', '#86efac', value / 1)
    if (value <= 3) return lerpColor('#86efac', '#16a34a', (value - 1) / 2)
    return '#166534'
  }

  if (mode === 'total_return') {
    // Same red-green spectrum, wider thresholds: +/-10% and +/-30%
    if (value <= -30) return '#991b1b'
    if (value <= -10) return lerpColor('#dc2626', '#991b1b', (value + 10) / -20)
    if (value < 0) return lerpColor('#fca5a5', '#dc2626', value / -10)
    if (value === 0) return '#6b7280'
    if (value <= 10) return lerpColor('#6b7280', '#86efac', value / 10)
    if (value <= 30) return lerpColor('#86efac', '#16a34a', (value - 10) / 20)
    return '#166534'
  }

  // dividend_yield: neutral-to-green spectrum (0% to 8%+)
  if (value <= 0) return '#6b7280'
  if (value <= 2) return lerpColor('#6b7280', '#86efac', value / 2)
  if (value <= 5) return lerpColor('#86efac', '#16a34a', (value - 2) / 3)
  return lerpColor('#16a34a', '#166534', Math.min((value - 5) / 3, 1))
}

// ── Utility helpers ────────────────────────────────────────────

/** Compute the current market value of a holding */
function holdingValue(h: HeatmapHolding): number {
  if (h.current_price == null) return 0
  return h.units * h.current_price
}

/** Compute unrealized P&L percentage */
function unrealizedPctPL(h: HeatmapHolding): number | null {
  if (h.current_price == null || h.avg_purchase_price <= 0) return null
  const cost = h.avg_purchase_price * h.units
  const current = h.current_price * h.units
  return ((current - cost) / cost) * 100
}

/** Returns the color value for a holding given the active color mode */
function getColorValue(
  h: HeatmapHolding,
  mode: ColorMode,
  dividendData?: Map<string, number>,
): number {
  if (mode === 'daily_change') return h.daily_change_percent ?? 0
  if (mode === 'total_return') return unrealizedPctPL(h) ?? 0
  // dividend_yield
  return dividendData?.get(h.id) ?? 0
}

/** Check whether a holding's price data is stale (> 24 hours old) */
function isStalePrice(h: HeatmapHolding): boolean {
  if (!h.last_price_update) return true
  const lastUpdate = new Date(h.last_price_update)
  const now = new Date()
  return now.getTime() - lastUpdate.getTime() > 24 * 60 * 60 * 1000
}

/** Format a date string to a short Dutch locale format */
function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Onbekend'
  try {
    return new Date(dateStr).toLocaleDateString('nl-NL', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return 'Onbekend'
  }
}

/** Classify a holding into a group key based on the active view mode */
function classifyHolding(h: HeatmapHolding, mode: AllocationViewMode): string {
  const field = h[mode]
  if (field && field !== '') return field
  return 'anders'
}

// ── Squarified treemap algorithm ───────────────────────────────

/**
 * Squarified treemap layout (Bruls, Huizing & van Wijk, 2000).
 *
 * Recursively subdivides a rectangle by choosing the axis that produces the
 * best aspect ratio (closest to 1:1) for each row of items. Items are sorted
 * descending by weight so the largest blocks are placed first.
 */
function squarify(
  items: { id: string; label: string; ticker: string | null; weight: number }[],
  x: number,
  y: number,
  w: number,
  h: number,
  startIndex: number,
): TreemapRect[] {
  if (items.length === 0 || w <= 0 || h <= 0) return []

  // Single item fills the entire rectangle
  if (items.length === 1) {
    return [{
      holdingId: items[0].id,
      label: items[0].label,
      ticker: items[0].ticker,
      x: x + CELL_GAP / 2,
      y: y + CELL_GAP / 2,
      w: Math.max(0, w - CELL_GAP),
      h: Math.max(0, h - CELL_GAP),
      weight: items[0].weight,
      index: startIndex,
    }]
  }

  const totalWeight = items.reduce((s, it) => s + it.weight, 0)
  if (totalWeight <= 0) return []

  // Sort descending by weight for better aspect ratios
  const sorted = [...items].sort((a, b) => b.weight - a.weight)

  // Lay out along the shorter side
  const isVertical = w >= h
  const mainSize = isVertical ? w : h
  const crossSize = isVertical ? h : w

  /** Compute worst aspect ratio for a candidate row */
  function worstRatio(
    row: typeof sorted,
    rowWeight: number,
  ): number {
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

  // Layout the row into positioned rectangles
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
      holdingId: row[i].id,
      label: row[i].label,
      ticker: row[i].ticker,
      x: rx + CELL_GAP / 2,
      y: ry + CELL_GAP / 2,
      w: Math.max(0, rw - CELL_GAP),
      h: Math.max(0, rh - CELL_GAP),
      weight: row[i].weight,
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

// ── Group holdings by classification ───────────────────────────

function buildGroups(
  holdings: HeatmapHolding[],
  mode: AllocationViewMode,
): HoldingGroup[] {
  const map = new Map<string, HeatmapHolding[]>()

  for (const h of holdings) {
    const key = classifyHolding(h, mode)
    const list = map.get(key)
    if (list) {
      list.push(h)
    } else {
      map.set(key, [h])
    }
  }

  const labels = CATEGORY_LABELS[mode]

  return Array.from(map.entries())
    .map(([key, group]) => ({
      key,
      label: labels[key] || key,
      totalValue: group.reduce((s, h) => s + Math.max(holdingValue(h), 1), 0),
      holdings: group,
    }))
    .sort((a, b) => b.totalValue - a.totalValue)
}

// ── Two-level treemap layout ───────────────────────────────────

/**
 * Compute a two-level treemap: first lay out groups, then lay out holdings
 * within each group rectangle. Returns all holding rects plus group bounding info.
 */
function computeTwoLevelLayout(
  groups: HoldingGroup[],
): { rects: TreemapRect[]; groupBounds: { key: string; label: string; x: number; y: number; w: number; h: number }[] } {
  if (groups.length === 0) return { rects: [], groupBounds: [] }

  // First level: compute group rectangles
  const groupItems = groups.map((g) => ({
    id: g.key,
    label: g.label,
    ticker: null as string | null,
    weight: g.totalValue,
  }))

  const groupRects = squarify(groupItems, 0, 0, VB_W, VB_H, 0)

  // Second level: within each group rect, lay out individual holdings
  const allRects: TreemapRect[] = []
  const groupBounds: { key: string; label: string; x: number; y: number; w: number; h: number }[] = []
  let globalIndex = 0

  for (const gRect of groupRects) {
    const group = groups.find((g) => g.key === gRect.holdingId)
    if (!group) continue

    groupBounds.push({
      key: group.key,
      label: group.label,
      x: gRect.x,
      y: gRect.y,
      w: gRect.w,
      h: gRect.h,
    })

    // Reserve space at the top of the group rect for the group label
    const innerY = gRect.y + GROUP_LABEL_H
    const innerH = Math.max(0, gRect.h - GROUP_LABEL_H)

    // Build items for the sub-treemap
    const holdingItems = group.holdings.map((h) => ({
      id: h.id,
      label: h.ticker || h.name,
      ticker: h.ticker,
      weight: Math.max(holdingValue(h), 1),
    }))

    const subRects = squarify(holdingItems, gRect.x, innerY, gRect.w, innerH, globalIndex)
    allRects.push(...subRects)
    globalIndex += subRects.length
  }

  return { rects: allRects, groupBounds }
}

// ── Toggle button group ────────────────────────────────────────

function ToggleGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  labels,
}: {
  label: string
  options: T[]
  value: T
  onChange: (v: T) => void
  labels: Record<T, string>
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--ink-4)]">
        {label}
      </span>
      <div className="flex gap-0.5 rounded-lg bg-[var(--subtle)] p-0.5">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
              value === opt
                ? 'bg-kern-600 text-white shadow-sm'
                : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]'
            }`}
          >
            {labels[opt]}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── SVG pattern definition for stale price overlay ─────────────

function StalePatternDef() {
  return (
    <defs>
      <pattern
        id="stale-stripes"
        patternUnits="userSpaceOnUse"
        width="8"
        height="8"
        patternTransform="rotate(45)"
      >
        <line
          x1="0" y1="0"
          x2="0" y2="8"
          stroke="rgba(0,0,0,0.15)"
          strokeWidth="3"
        />
      </pattern>
    </defs>
  )
}

// ── Individual treemap cell ────────────────────────────────────

function TreemapCell({
  rect,
  holding,
  fillColor,
  isStale,
  isHovered,
  hasEntered,
  onMouseEnter,
  onMouseLeave,
  onClick,
}: {
  rect: TreemapRect
  holding: HeatmapHolding
  fillColor: string
  isStale: boolean
  isHovered: boolean
  hasEntered: boolean
  onMouseEnter: (e: React.MouseEvent) => void
  onMouseLeave: () => void
  onClick: () => void
}) {
  const hasPriceData = holding.current_price != null
  const displayLabel = rect.ticker || holding.name
  const value = holdingValue(holding)

  // Determine what text fits in the cell
  const canFitName = rect.w > 60 && rect.h > 40
  const canFitValue = rect.w > 70 && rect.h > 50
  const canFitPct = rect.w > 50 && rect.h > 30

  const textShadow = '0 1px 3px rgba(0,0,0,0.5)'
  const plPct = unrealizedPctPL(holding)

  return (
    <g
      className="cursor-pointer"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
    >
      {/* Background rect with fill color transition */}
      <rect
        x={rect.x}
        y={rect.y}
        width={rect.w}
        height={rect.h}
        rx={CELL_RADIUS}
        ry={CELL_RADIUS}
        fill={hasPriceData ? fillColor : '#9ca3af'}
        stroke={isHovered ? 'var(--ink)' : 'rgba(255,255,255,0.3)'}
        strokeWidth={isHovered ? 2 : 0.5}
        style={{
          opacity: hasEntered ? 1 : 0,
          transition: `opacity 0.4s ease-out ${rect.index * 30}ms, fill 300ms ease, stroke 0.15s ease`,
        }}
      />

      {/* Stale price diagonal stripes overlay */}
      {isStale && hasPriceData && (
        <rect
          x={rect.x}
          y={rect.y}
          width={rect.w}
          height={rect.h}
          rx={CELL_RADIUS}
          ry={CELL_RADIUS}
          fill="url(#stale-stripes)"
          style={{
            opacity: hasEntered ? 1 : 0,
            transition: `opacity 0.4s ease-out ${rect.index * 30}ms`,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Cell content via foreignObject for proper text wrapping */}
      <foreignObject
        x={rect.x}
        y={rect.y}
        width={rect.w}
        height={rect.h}
        style={{
          opacity: hasEntered ? 1 : 0,
          transition: `opacity 0.4s ease-out ${rect.index * 30 + 80}ms`,
          pointerEvents: 'none',
        }}
      >
        <div
          // @ts-expect-error xmlns required for foreignObject but not in React types
          xmlns="http://www.w3.org/1999/xhtml"
          className="flex h-full w-full flex-col items-center justify-center overflow-hidden px-1 py-0.5"
        >
          {/* Ticker or name */}
          {canFitName && (
            <p
              className="w-full truncate text-center text-[10px] font-bold leading-tight text-white"
              style={{ textShadow }}
            >
              {hasPriceData ? displayLabel : '?'}
            </p>
          )}

          {/* Value */}
          {canFitValue && hasPriceData && (
            <p
              className="font-mono text-[9px] tabular-nums leading-tight text-white/90"
              style={{ textShadow }}
            >
              {<MaskedAmount value={value} tone="kern" />}
            </p>
          )}

          {/* P&L percentage */}
          {canFitPct && plPct != null && (
            <p
              className="font-mono text-[8px] tabular-nums leading-tight text-white/80"
              style={{ textShadow }}
            >
              {plPct >= 0 ? '+' : ''}{plPct.toFixed(1)}%
            </p>
          )}

          {/* No price data indicator */}
          {canFitName && !hasPriceData && (
            <p
              className="text-[9px] leading-tight text-white/70"
              style={{ textShadow }}
            >
              Geen koers
            </p>
          )}
        </div>
      </foreignObject>
    </g>
  )
}

// ── Tooltip component ──────────────────────────────────────────

function HeatmapTooltip({
  data,
  dividendData,
  containerRef,
}: {
  data: TooltipData
  dividendData?: Map<string, number>
  containerRef: React.RefObject<HTMLDivElement | null>
}) {
  const { holding, mouseX, mouseY } = data
  const value = holdingValue(holding)
  const cost = holding.avg_purchase_price * holding.units
  const plAbs = holding.current_price != null ? value - cost : null
  const plPct = unrealizedPctPL(holding)
  const dividendYield = dividendData?.get(holding.id)

  // Position relative to container, flipping when near edges
  const containerBounds = containerRef.current?.getBoundingClientRect()
  const tooltipX = containerBounds ? mouseX - containerBounds.left : mouseX
  const tooltipY = containerBounds ? mouseY - containerBounds.top : mouseY
  const flipX = containerBounds ? tooltipX > containerBounds.width * 0.6 : false
  const flipY = containerBounds ? tooltipY > containerBounds.height * 0.65 : false

  return (
    <div
      className="pointer-events-none absolute z-50 w-64 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-3 shadow-lg"
      style={{
        left: flipX ? undefined : tooltipX + 14,
        right: flipX && containerBounds ? containerBounds.width - tooltipX + 14 : undefined,
        top: flipY ? undefined : tooltipY + 14,
        bottom: flipY && containerBounds ? containerBounds.height - tooltipY + 14 : undefined,
      }}
    >
      {/* Header: name + ticker */}
      <div className="mb-2">
        <p className="text-xs font-semibold text-[var(--ink)]">
          {holding.name}
          {holding.ticker && (
            <span className="ml-1.5 text-[var(--ink-3)]">({holding.ticker})</span>
          )}
        </p>
        {holding.isin && (
          <p className="text-[10px] text-[var(--ink-4)]">ISIN: {holding.isin}</p>
        )}
      </div>

      {/* Data rows */}
      <div className="space-y-1 text-[11px]">
        {/* Current price */}
        {holding.current_price != null && (
          <div className="flex justify-between">
            <span className="text-[var(--ink-3)]">Huidige koers</span>
            <span className="font-mono tabular-nums text-[var(--ink)]">
              {<MaskedAmount value={holding.current_price} tone="kern" />}
              {holding.currency && holding.currency !== 'EUR' && (
                <span className="ml-1 inline-flex items-center rounded-sm bg-kern-100 px-1 text-[9px] font-medium text-kern-600">
                  {holding.currency}
                </span>
              )}
            </span>
          </div>
        )}

        {/* Value */}
        <div className="flex justify-between">
          <span className="text-[var(--ink-3)]">Waarde</span>
          <span className="font-mono tabular-nums text-[var(--ink)]">
            {holding.current_price != null ? formatCurrency(value) : '-'}
          </span>
        </div>

        {/* Cost basis */}
        <div className="flex justify-between">
          <span className="text-[var(--ink-3)]">Kostprijs</span>
          <span className="font-mono tabular-nums text-[var(--ink)]">
            {<MaskedAmount value={cost} tone="kern" />}
          </span>
        </div>

        {/* Unrealized P&L */}
        {plAbs != null && plPct != null && (
          <div className="flex justify-between">
            <span className="text-[var(--ink-3)]">Onger. P&amp;L</span>
            <span className={`font-mono tabular-nums ${plAbs >= 0 ? 'text-positive' : 'text-negative'}`}>
              {plAbs >= 0 ? '+' : ''}{<MaskedAmount value={plAbs} tone="kern" />} ({plPct >= 0 ? '+' : ''}{plPct.toFixed(1)}%)
            </span>
          </div>
        )}

        {/* Daily change */}
        {holding.daily_change_percent != null && (
          <div className="flex justify-between">
            <span className="text-[var(--ink-3)]">Dagelijks rendement</span>
            <span className={`font-mono tabular-nums ${holding.daily_change_percent >= 0 ? 'text-positive' : 'text-negative'}`}>
              {holding.daily_change_percent >= 0 ? '+' : ''}{holding.daily_change_percent.toFixed(2)}%
            </span>
          </div>
        )}

        {/* Dividend yield */}
        {dividendYield != null && dividendYield > 0 && (
          <div className="flex justify-between">
            <span className="text-[var(--ink-3)]">Dividend yield</span>
            <span className="font-mono tabular-nums text-emerald-600">
              {dividendYield.toFixed(2)}%
            </span>
          </div>
        )}

        {/* Last updated */}
        <div className="mt-1 border-t border-[var(--border-ed)] pt-1">
          <div className="flex justify-between">
            <span className="text-[var(--ink-4)]">Laatst bijgewerkt</span>
            <span className="text-[var(--ink-4)]">
              {formatDate(holding.last_price_update)}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Color legend bar ───────────────────────────────────────────

function ColorLegend({ colorMode }: { colorMode: ColorMode }) {
  const gradientId = `holdings-heat-legend-${colorMode}`

  if (colorMode === 'dividend_yield') {
    // Neutral-to-green spectrum
    return (
      <div className="mt-4 flex flex-col items-center gap-1">
        <svg width="240" height="14" viewBox="0 0 240 14" className="overflow-visible">
          <defs>
            <linearGradient id={gradientId}>
              <stop offset="0%" stopColor="#6b7280" />
              <stop offset="25%" stopColor="#86efac" />
              {/* eslint-disable-next-line no-restricted-syntax -- legenda van continue lerp-kleurschaal, geen winst/verlies-token */}
              <stop offset="62%" stopColor="#16a34a" />
              <stop offset="100%" stopColor="#166534" />
            </linearGradient>
          </defs>
          <rect x="0" y="0" width="240" height="10" rx="3" fill={`url(#${gradientId})`} />
        </svg>
        <div className="flex w-60 justify-between">
          <span className="text-[9px] text-[var(--ink-4)]">0%</span>
          <span className="text-[9px] text-[var(--ink-4)]">2%</span>
          <span className="text-[9px] text-[var(--ink-4)]">5%</span>
          <span className="text-[9px] text-[var(--ink-4)]">8%+</span>
        </div>
        <p className="text-[9px] text-[var(--ink-4)]">
          Dividend yield: grijs = geen dividend, groen = hoog rendement
        </p>
      </div>
    )
  }

  // Red-green spectrum for daily_change and total_return
  const isDaily = colorMode === 'daily_change'
  const lowLabel = isDaily ? '-3%' : '-30%'
  const midLowLabel = isDaily ? '-1%' : '-10%'
  const midHighLabel = isDaily ? '+1%' : '+10%'
  const highLabel = isDaily ? '+3%' : '+30%'

  return (
    <div className="mt-4 flex flex-col items-center gap-1">
      <svg width="240" height="14" viewBox="0 0 240 14" className="overflow-visible">
        <defs>
          <linearGradient id={gradientId}>
            <stop offset="0%" stopColor="#991b1b" />
            {/* eslint-disable-next-line no-restricted-syntax -- legenda van continue lerp-kleurschaal, geen winst/verlies-token */}
            <stop offset="17%" stopColor="#dc2626" />
            <stop offset="33%" stopColor="#fca5a5" />
            <stop offset="50%" stopColor="#6b7280" />
            <stop offset="67%" stopColor="#86efac" />
            {/* eslint-disable-next-line no-restricted-syntax -- legenda van continue lerp-kleurschaal, geen winst/verlies-token */}
            <stop offset="83%" stopColor="#16a34a" />
            <stop offset="100%" stopColor="#166534" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="240" height="10" rx="3" fill={`url(#${gradientId})`} />
      </svg>
      <div className="flex w-60 justify-between">
        <span className="text-[9px] text-[var(--ink-4)]">{lowLabel}</span>
        <span className="text-[9px] text-[var(--ink-4)]">{midLowLabel}</span>
        <span className="text-[9px] text-[var(--ink-4)]">0%</span>
        <span className="text-[9px] text-[var(--ink-4)]">{midHighLabel}</span>
        <span className="text-[9px] text-[var(--ink-4)]">{highLabel}</span>
      </div>
      <p className="text-[9px] text-[var(--ink-4)]">
        {isDaily ? 'Dagelijkse koersverandering' : 'Totaal rendement sinds aankoop'}:
        rood = verlies, groen = winst
      </p>
    </div>
  )
}

// ── Mobile card layout ─────────────────────────────────────────

function MobileHeatmap({
  groups,
  colorMode,
  dividendData,
  hasEntered,
  onHoldingClick,
}: {
  groups: HoldingGroup[]
  colorMode: ColorMode
  dividendData?: Map<string, number>
  hasEntered: boolean
  onHoldingClick?: (id: string) => void
}) {
  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <div
          key={group.key}
          className="overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)]"
        >
          {/* Group header */}
          <div className="flex items-center gap-2 border-b border-[var(--border-ed)] px-3 py-2">
            <span className="flex-1 truncate text-xs font-semibold text-[var(--ink)]">
              {group.label}
            </span>
            <span className="font-mono text-[10px] tabular-nums text-[var(--ink-3)]">
              {<MaskedAmount value={group.totalValue} tone="kern" />}
            </span>
          </div>

          {/* Horizontally scrollable holding cards */}
          <div className="flex gap-1.5 overflow-x-auto p-2">
            {group.holdings.map((h, idx) => {
              const colorValue = getColorValue(h, colorMode, dividendData)
              const color = h.current_price != null
                ? getHoldingHeatColor(colorValue, colorMode)
                : '#9ca3af'
              const plPct = unrealizedPctPL(h)
              const stale = isStalePrice(h)

              return (
                <button
                  key={h.id}
                  type="button"
                  className="relative flex shrink-0 flex-col items-center justify-center rounded-md px-3 py-2.5"
                  style={{
                    backgroundColor: color,
                    minWidth: 80,
                    minHeight: 56,
                    opacity: hasEntered ? 1 : 0,
                    transform: hasEntered ? 'scale(1)' : 'scale(0.92)',
                    transition: `opacity 0.4s ease-out ${idx * 30}ms, transform 0.4s ease-out ${idx * 30}ms, background-color 300ms ease`,
                  }}
                  onClick={() => onHoldingClick?.(h.id)}
                >
                  {/* Stale indicator */}
                  {stale && h.current_price != null && (
                    <div
                      className="absolute inset-0 rounded-md opacity-30"
                      style={{
                        backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(0,0,0,0.15) 3px, rgba(0,0,0,0.15) 6px)',
                      }}
                    />
                  )}

                  <span className="relative truncate text-[10px] font-bold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]">
                    {h.ticker || h.name}
                  </span>
                  <span className="relative font-mono text-[9px] tabular-nums text-white/90 [text-shadow:0_1px_2px_rgba(0,0,0,0.4)]">
                    {h.current_price != null ? formatCurrency(holdingValue(h)) : '?'}
                  </span>
                  {plPct != null && (
                    <span className="relative font-mono text-[8px] tabular-nums text-white/80 [text-shadow:0_1px_2px_rgba(0,0,0,0.4)]">
                      {plPct >= 0 ? '+' : ''}{plPct.toFixed(1)}%
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main exported component ────────────────────────────────────

const HoldingsHeatmap = memo(function HoldingsHeatmap({
  holdings,
  dividendData,
  onHoldingClick,
}: Props) {
  const { ref, hasEntered } = useInViewAnimation({ duration: 900 })
  const containerRef = useRef<HTMLDivElement | null>(null)

  const [groupMode, setGroupMode] = useState<AllocationViewMode>('asset_class')
  const [colorMode, setColorMode] = useState<ColorMode>('daily_change')
  const [tooltip, setTooltip] = useState<TooltipData | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  // Build a lookup map for quick holding access by id
  const holdingMap = useMemo(() => {
    const map = new Map<string, HeatmapHolding>()
    for (const h of holdings) map.set(h.id, h)
    return map
  }, [holdings])

  // Group holdings by classification
  const groups = useMemo(
    () => buildGroups(holdings, groupMode),
    [holdings, groupMode],
  )

  // Compute two-level treemap layout
  const { rects, groupBounds } = useMemo(
    () => computeTwoLevelLayout(groups),
    [groups],
  )

  // Compute fill colors for every holding (recomputes when color mode changes)
  const fillColors = useMemo(() => {
    const map = new Map<string, string>()
    for (const h of holdings) {
      const value = getColorValue(h, colorMode, dividendData)
      map.set(h.id, getHoldingHeatColor(value, colorMode))
    }
    return map
  }, [holdings, colorMode, dividendData])

  // Stale price set
  const staleSet = useMemo(() => {
    const set = new Set<string>()
    for (const h of holdings) {
      if (isStalePrice(h)) set.add(h.id)
    }
    return set
  }, [holdings])

  const handleMouseEnter = useCallback((holdingId: string, e: React.MouseEvent) => {
    const h = holdingMap.get(holdingId)
    if (!h) return
    setHoveredId(holdingId)
    setTooltip({ holding: h, mouseX: e.clientX, mouseY: e.clientY })
  }, [holdingMap])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setTooltip((prev) => prev ? { ...prev, mouseX: e.clientX, mouseY: e.clientY } : null)
  }, [])

  const handleMouseLeave = useCallback(() => {
    setHoveredId(null)
    setTooltip(null)
  }, [])

  const handleClick = useCallback((holdingId: string) => {
    onHoldingClick?.(holdingId)
  }, [onHoldingClick])

  // Edge case: no holdings
  if (holdings.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-[var(--ink-3)]" data-testid="heatmap-empty">
        Voeg holdings toe om de heatmap te zien.
      </div>
    )
  }

  return (
    <div ref={ref} data-testid="holdings-heatmap">
      {/* Toggle bar */}
      <div className="mb-4 flex flex-wrap items-center gap-4" data-testid="heatmap-toggles">
        <ToggleGroup
          label="Groepering"
          options={['asset_class', 'sector', 'geography'] as AllocationViewMode[]}
          value={groupMode}
          onChange={setGroupMode}
          labels={GROUPING_LABELS}
        />
        <ToggleGroup
          label="Kleurmodus"
          options={['daily_change', 'total_return', 'dividend_yield'] as ColorMode[]}
          value={colorMode}
          onChange={setColorMode}
          labels={COLOR_MODE_LABELS}
        />
      </div>

      <div ref={containerRef} className="relative">
        {/* Desktop: SVG treemap (hidden below md) */}
        <div className="hidden md:block">
          <svg
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            className="h-auto w-full"
            preserveAspectRatio="xMidYMid meet"
            onMouseMove={handleMouseMove}
            data-testid="heatmap-svg"
          >
            <StalePatternDef />

            {/* Group outlines with labels */}
            {groupBounds.map((gb) => (
              <g key={`group-${gb.key}`}>
                <rect
                  x={gb.x}
                  y={gb.y}
                  width={gb.w}
                  height={gb.h}
                  rx={CELL_RADIUS + 2}
                  ry={CELL_RADIUS + 2}
                  fill="none"
                  stroke="var(--border-md)"
                  strokeWidth="2"
                  opacity={hasEntered ? 0.6 : 0}
                  style={{ transition: 'opacity 0.5s ease-out 0.2s' }}
                />
                {/* Group label at the top of the group rectangle */}
                {gb.w > 80 && (
                  <text
                    x={gb.x + 6}
                    y={gb.y + 13}
                    className="fill-[var(--ink-3)] font-sans text-[11px] font-semibold"
                    opacity={hasEntered ? 0.85 : 0}
                    style={{ transition: 'opacity 0.5s ease-out 0.3s' }}
                  >
                    {gb.label}
                  </text>
                )}
              </g>
            ))}

            {/* Holding cells */}
            {rects.map((rect) => {
              const holding = holdingMap.get(rect.holdingId)
              if (!holding) return null
              return (
                <TreemapCell
                  key={rect.holdingId}
                  rect={rect}
                  holding={holding}
                  fillColor={fillColors.get(rect.holdingId) ?? '#9ca3af'}
                  isStale={staleSet.has(rect.holdingId)}
                  isHovered={hoveredId === rect.holdingId}
                  hasEntered={hasEntered}
                  onMouseEnter={(e) => handleMouseEnter(rect.holdingId, e)}
                  onMouseLeave={handleMouseLeave}
                  onClick={() => handleClick(rect.holdingId)}
                />
              )
            })}
          </svg>
        </div>

        {/* Mobile: vertical card groups with horizontal scroll */}
        <div className="md:hidden">
          <MobileHeatmap
            groups={groups}
            colorMode={colorMode}
            dividendData={dividendData}
            hasEntered={hasEntered}
            onHoldingClick={onHoldingClick}
          />
        </div>

        {/* Tooltip (desktop only) */}
        {tooltip && (
          <div className="hidden md:block">
            <HeatmapTooltip
              data={tooltip}
              dividendData={dividendData}
              containerRef={containerRef}
            />
          </div>
        )}
      </div>

      {/* Legend */}
      <ColorLegend colorMode={colorMode} />
    </div>
  )
})

export default HoldingsHeatmap
