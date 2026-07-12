'use client'

// ── category-history-chart.tsx ─────────────────────────────────────────
//
// Cumulatief verloop van een asset- of debt-categorie. Drie render-modes:
//
//   - stacked  — gestapelde areas per entiteit, top-lijn = totalen
//   - lines    — losse lijnen per entiteit (groei-vergelijking)
//   - bars     — gegroepeerde bars per maand (entiteit-vs-entiteit per
//                periode; geen stacking)
//
// Periode-toggle (3M/6M/12M/All): 3/6/12 slicen client-side uit de 12-maands
// `initialData` zodat een veelvoorkomende interactie geen round-trip kost.
// "All" haalt de volledige historie op via `/api/core/category-history`.
//
// State-persistentie:
//   - `mode`        → localStorage (per subtype) — gebruikers houden meestal
//                     één voorkeur over alle bezoeken heen.
//   - `period`      → niet persistent — page-load fresh (bewust: meeste
//                     vragen beginnen bij "afgelopen jaar").
//   - `visibleIds`  → URL `?items=` zodat een filter-state deelbaar is via
//                     deeplink. Wanneer alles zichtbaar is laten we de param
//                     leeg om de URL clean te houden.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { formatMaskedCurrency } from '@/lib/format'
import type {
  CategoryHistoryData,
  CategoryHistoryEntity,
} from '@/lib/load-category-history'

// ── Types ──────────────────────────────────────────────────────────────

export type CategoryHistoryMode = 'stacked' | 'lines' | 'bars'
export type CategoryHistoryPeriod = 3 | 6 | 12 | 'all'

export type CategoryHistoryChartProps = {
  variant: 'asset' | 'debt'
  subtype: string
  initialData: CategoryHistoryData
  defaultMode?: CategoryHistoryMode
  defaultPeriod?: CategoryHistoryPeriod
}

// ── Constants ──────────────────────────────────────────────────────────

const SVG_PADDING = { top: 12, right: 12, bottom: 24, left: 56 } as const
const CHART_HEIGHT = 288 // matches Tailwind h-72
const Y_GRID_LINES = 4
const X_LABEL_TARGET = 6

const COMPACT_EUR = new Intl.NumberFormat('nl-NL', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

const NL_MONTH_ABBR = [
  'jan', 'feb', 'mrt', 'apr', 'mei', 'jun',
  'jul', 'aug', 'sep', 'okt', 'nov', 'dec',
] as const

// ── Helpers ────────────────────────────────────────────────────────────

function monthLabel(yyyy_mm: string): string {
  const [y, m] = yyyy_mm.split('-').map(Number)
  if (!y || !m) return yyyy_mm
  return `${NL_MONTH_ABBR[m - 1]} '${String(y).slice(-2)}`
}

function fullMonthLabel(yyyy_mm: string): string {
  const [y, m] = yyyy_mm.split('-').map(Number)
  if (!y || !m) return yyyy_mm
  return `${NL_MONTH_ABBR[m - 1]} ${y}`
}

function fmtCompactEur(v: number): string {
  return `€ ${COMPACT_EUR.format(v)}`
}

function pctDelta(curr: number, prev: number): number | null {
  if (prev === 0) return null
  return ((curr - prev) / Math.abs(prev)) * 100
}

/**
 * Donker-mengvariant van een hex-kleur — gebruikt voor stroke boven een
 * area-fill, zodat de outline duidelijk verschilt van de transparante vulling.
 * Implementatie: ~25% richting zwart mixen via component-wise lerp. Houdt de
 * implementatie self-contained (geen `chroma`-achtige dep).
 */
function darkenHex(hex: string, amount = 0.25): string {
  const m = hex.replace('#', '')
  if (m.length !== 6) return hex
  const r = Math.max(0, Math.min(255, Math.round(parseInt(m.slice(0, 2), 16) * (1 - amount))))
  const g = Math.max(0, Math.min(255, Math.round(parseInt(m.slice(2, 4), 16) * (1 - amount))))
  const b = Math.max(0, Math.min(255, Math.round(parseInt(m.slice(4, 6), 16) * (1 - amount))))
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

function sliceData(
  full: CategoryHistoryData,
  months: number,
): CategoryHistoryData {
  const total = full.months.length
  if (total <= months) return full
  const start = total - months
  const slicedMonths = full.months.slice(start)
  const slicedByEntity: Record<string, number[]> = {}
  for (const id of Object.keys(full.byEntityId)) {
    slicedByEntity[id] = full.byEntityId[id].slice(start)
  }
  // Re-derive totals over the visible window (raw cannot be summed across
  // entities not in `byEntityId` map — keep it consistent with the stack).
  const slicedTotals = slicedMonths.map((_, i) => {
    let sum = 0
    for (const id of Object.keys(slicedByEntity)) {
      sum += slicedByEntity[id][i] ?? 0
    }
    return sum
  })
  return {
    months: slicedMonths,
    byEntityId: slicedByEntity,
    totals: slicedTotals,
    entities: full.entities,
  }
}

// ── Component ──────────────────────────────────────────────────────────

export function CategoryHistoryChart({
  variant,
  subtype,
  initialData,
  defaultMode = 'stacked',
  defaultPeriod = 12,
}: CategoryHistoryChartProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const { masked } = useMaskedAmounts()
  const fc = useCallback((v: number) => formatMaskedCurrency(v, masked), [masked])

  // ── Persisted view state ────────────────────────────────────
  const storageKey = `category-history-mode:${subtype}`
  const [mode, setMode] = useState<CategoryHistoryMode>(defaultMode)
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const stored = window.localStorage.getItem(storageKey)
      if (stored === 'stacked' || stored === 'lines' || stored === 'bars') {
        setMode(stored)
      }
    } catch {
      // ignore — fall back to defaultMode
    }
  }, [storageKey])
  const updateMode = useCallback((next: CategoryHistoryMode) => {
    setMode(next)
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(storageKey, next)
    } catch {
      // ignore
    }
  }, [storageKey])

  const [period, setPeriod] = useState<CategoryHistoryPeriod>(defaultPeriod)
  const [allData, setAllData] = useState<CategoryHistoryData | null>(null)
  const [allLoading, setAllLoading] = useState(false)
  const [allError, setAllError] = useState<string | null>(null)

  const handlePeriodChange = useCallback((next: CategoryHistoryPeriod) => {
    setPeriod(next)
    if (next === 'all' && !allData && !allLoading) {
      setAllLoading(true)
      setAllError(null)
      const url = `/api/core/category-history?entityType=${variant}&subtype=${encodeURIComponent(subtype)}&period=all`
      fetch(url)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((json: CategoryHistoryData) => setAllData(json))
        .catch((e: unknown) => setAllError(e instanceof Error ? e.message : 'fetch-failed'))
        .finally(() => setAllLoading(false))
    }
  }, [variant, subtype, allData, allLoading])

  // ── URL-state for visibleIds ────────────────────────────────
  // Init from URL on mount; subsequent updates write back via router.replace.
  const allIds = useMemo(
    () => initialData.entities.map((e) => e.id),
    [initialData.entities],
  )
  const [visibleIds, setVisibleIds] = useState<Set<string>>(() => new Set(allIds))
  // Hydrate from URL once on mount.
  useEffect(() => {
    const param = searchParams.get('items')
    if (!param) return
    const ids = param.split(',').map((s) => s.trim()).filter(Boolean)
    const valid = new Set(ids.filter((id) => allIds.includes(id)))
    if (valid.size > 0) setVisibleIds(valid)
    // Only run on first mount — URL changes from this component update via
    // updateVisible() below. eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const updateVisible = useCallback((next: Set<string>) => {
    setVisibleIds(next)
    const params = new URLSearchParams(searchParams.toString())
    if (next.size === allIds.length) {
      params.delete('items')
    } else {
      params.set('items', Array.from(next).join(','))
    }
    const qs = params.toString()
    router.replace(qs ? `?${qs}` : '?', { scroll: false })
  }, [allIds.length, router, searchParams])

  const toggleEntity = useCallback((id: string) => {
    const next = new Set(visibleIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    // Don't allow zero-visible — that produces an empty chart with no obvious
    // recovery. Fall back to "all visible" when the user deselects the last.
    if (next.size === 0) updateVisible(new Set(allIds))
    else updateVisible(next)
  }, [allIds, visibleIds, updateVisible])

  const resetVisible = useCallback(() => {
    updateVisible(new Set(allIds))
  }, [allIds, updateVisible])

  // ── Data resolution ─────────────────────────────────────────
  const activeData = useMemo<CategoryHistoryData>(() => {
    if (period === 'all') return allData ?? initialData
    return sliceData(initialData, period)
  }, [period, allData, initialData])

  // ── Hover ────────────────────────────────────────────────────
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  // ── Responsive width via ResizeObserver ─────────────────────
  const { ref, hasEntered } = useInViewAnimation({ duration: 600 })
  const [containerW, setContainerW] = useState(640)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w && w > 0) setContainerW(Math.round(w))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])

  // Hooks below run unconditionally — early-return for the empty/sparse
  // branch lives at the bottom of this function (after all hook calls) so
  // React's hook-order invariant is preserved across the two render paths.

  // ── Chart geometry ──────────────────────────────────────────
  const W = Math.max(320, containerW)
  const H = CHART_HEIGHT
  const innerW = W - SVG_PADDING.left - SVG_PADDING.right
  const innerH = H - SVG_PADDING.top - SVG_PADDING.bottom

  const months = activeData.months
  const visibleEntities = useMemo(
    () => activeData.entities.filter((e) => visibleIds.has(e.id)),
    [activeData.entities, visibleIds],
  )

  // For stacked & area: compute cumulative per-month per-entity (in entity order).
  // For bars: compute per-month per-entity (raw, no stacking).
  // For lines: per-entity series.
  const isDebt = variant === 'debt'

  // Compute Y-range based on mode + visible entities.
  const yRange = useMemo(() => {
    let max = 0
    let min = 0
    for (let i = 0; i < months.length; i++) {
      if (mode === 'stacked') {
        let sum = 0
        for (const e of visibleEntities) {
          sum += activeData.byEntityId[e.id]?.[i] ?? 0
        }
        if (sum > max) max = sum
        if (sum < min) min = sum
      } else {
        for (const e of visibleEntities) {
          const v = activeData.byEntityId[e.id]?.[i] ?? 0
          if (v > max) max = v
          if (v < min) min = v
        }
      }
    }
    // 8% headroom keeps the top label legible.
    const padded = Math.max(max * 1.08, 1)
    return { min: Math.min(min, 0), max: padded }
  }, [mode, visibleEntities, activeData.byEntityId, months.length])

  const yScale = useCallback(
    (v: number) => SVG_PADDING.top + ((yRange.max - v) / (yRange.max - yRange.min || 1)) * innerH,
    [yRange.max, yRange.min, innerH],
  )
  const xScale = useCallback(
    (i: number) =>
      months.length > 1
        ? SVG_PADDING.left + (i / (months.length - 1)) * innerW
        : SVG_PADDING.left + innerW / 2,
    [months.length, innerW],
  )

  const yZero = yScale(0)

  // X-axis labels — show every Nth so we get ~6 visible.
  const labelStep = Math.max(1, Math.ceil(months.length / X_LABEL_TARGET))

  // Y-axis grid + labels.
  const gridValues = useMemo(() => {
    const step = (yRange.max - yRange.min) / Y_GRID_LINES
    return Array.from({ length: Y_GRID_LINES + 1 }, (_, i) => yRange.min + step * i)
  }, [yRange.max, yRange.min])

  // ── Header values ───────────────────────────────────────────
  const lastTotal = activeData.totals[activeData.totals.length - 1] ?? 0
  const firstTotal = activeData.totals[0] ?? 0
  const deltaAbs = lastTotal - firstTotal
  const deltaPct = pctDelta(lastTotal, firstTotal)
  const deltaSign = deltaAbs >= 0 ? '+' : '−'
  const periodLabel =
    period === 'all'
      ? 'sinds eerste meting'
      : `sinds ${period} mnd`

  // ── Stacked area paths ──────────────────────────────────────
  // Bottom→top order matches `entities` (active first by value desc).
  const stackedPaths = useMemo(() => {
    if (mode !== 'stacked') return []
    // Cumulative running totals per month, in entity-array order (only visible).
    const running = new Array(months.length).fill(0) as number[]
    return visibleEntities.map((entity) => {
      const series = activeData.byEntityId[entity.id] ?? []
      const top: string[] = []
      const bottom: string[] = []
      for (let i = 0; i < months.length; i++) {
        const baseY = yScale(running[i])
        bottom.push(`${xScale(i).toFixed(1)},${baseY.toFixed(1)}`)
      }
      // Forward pass for top edge (after we know the new running sum).
      const newRunning = running.slice()
      for (let i = 0; i < months.length; i++) {
        newRunning[i] += series[i] ?? 0
        top.push(`${xScale(i).toFixed(1)},${yScale(newRunning[i]).toFixed(1)}`)
      }
      for (let i = 0; i < months.length; i++) running[i] = newRunning[i]
      const d = `M${top.join(' L')} L${bottom.reverse().join(' L')} Z`
      return {
        id: entity.id,
        name: entity.name,
        color: entity.color,
        stroke: darkenHex(entity.color, 0.3),
        d,
      }
    })
  }, [mode, visibleEntities, months.length, activeData.byEntityId, xScale, yScale])

  // ── Lines mode paths ────────────────────────────────────────
  const linePaths = useMemo(() => {
    if (mode !== 'lines') return []
    return visibleEntities.map((entity) => {
      const series = activeData.byEntityId[entity.id] ?? []
      const d = series
        .map((v, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i).toFixed(1)} ${yScale(v).toFixed(1)}`)
        .join(' ')
      return { id: entity.id, name: entity.name, color: entity.color, d }
    })
  }, [mode, visibleEntities, activeData.byEntityId, xScale, yScale])

  // ── Bars mode geometry ──────────────────────────────────────
  // Group bars per month — N entities side-by-side. Bar width caps at 12px.
  const barGeometry = useMemo(() => {
    if (mode !== 'bars') return null
    const monthWidth = months.length > 1 ? innerW / months.length : innerW
    const visibleCount = Math.max(1, visibleEntities.length)
    const barW = Math.min(monthWidth / (visibleCount + 1), 12)
    const groupWidth = barW * visibleCount
    return { monthWidth, barW, groupWidth }
  }, [mode, months.length, innerW, visibleEntities.length])

  // ── Total line for stacked mode ─────────────────────────────
  const totalsPath = useMemo(() => {
    if (mode !== 'stacked') return null
    return activeData.totals
      .map((v, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i).toFixed(1)} ${yScale(v).toFixed(1)}`)
      .join(' ')
  }, [mode, activeData.totals, xScale, yScale])

  // ── Hover handler — pointer → nearest month index ───────────
  const svgRef = useRef<SVGSVGElement | null>(null)
  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const xPx = ((e.clientX - rect.left) / rect.width) * W - SVG_PADDING.left
    if (xPx < 0 || xPx > innerW) {
      setHoverIndex(null)
      return
    }
    const ratio = xPx / innerW
    const idx = Math.round(ratio * (months.length - 1))
    const clamped = Math.max(0, Math.min(months.length - 1, idx))
    setHoverIndex(clamped)
  }, [W, innerW, months.length])

  const handleMouseLeave = useCallback(() => setHoverIndex(null), [])

  // ── Empty / sparse state ────────────────────────────────────
  // Placed AFTER all hook calls so React's hook-order invariant holds.
  if (initialData.months.length < 2) {
    const cta = variant === 'asset'
      ? `/core/assets/revalue${pathname ? `?returnTo=${encodeURIComponent(pathname)}` : ''}`
      : '/core/debts'
    return (
      <div ref={ref} className="space-y-4">
        <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-6 text-center">
          <p className="mb-2 text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]" style={{ fontFamily: 'var(--font-dm-mono, monospace)' }}>
            Cumulatief verloop
          </p>
          <h3 className="mb-2 text-base font-semibold text-[var(--ink)]" style={{ fontFamily: 'var(--font-playfair, serif)' }}>
            Nog geen historie
          </h3>
          <p className="mx-auto mb-4 max-w-sm text-sm text-[var(--ink-3)]">
            Werk een waarde bij om de eerste meting vast te leggen.
          </p>
          <Link
            href={cta}
            className="inline-flex items-center gap-1.5 rounded-[var(--r)] border border-[var(--ink)] bg-[var(--ink)] px-3 py-1.5 text-xs font-medium text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)]"
          >
            Herwaarderen
          </Link>
        </div>
      </div>
    )
  }

  // ── Render ──────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Editorial header strip */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]" style={{ fontFamily: 'var(--font-dm-mono, monospace)' }}>
            Cumulatief verloop
          </p>
          <p className="font-mono text-2xl tabular-nums text-[var(--ink)]" style={{ fontFamily: 'var(--font-dm-mono, monospace)' }}>
            {fc(lastTotal)}
          </p>
          <p className={`text-xs ${deltaAbs >= 0 ? 'text-[var(--ink-2)]' : 'text-[var(--ink-3)]'}`}>
            <span className="font-mono tabular-nums">
              {deltaSign}{fc(Math.abs(deltaAbs))}
              {deltaPct != null && (
                <> ({deltaSign}{Math.abs(deltaPct).toFixed(1)}%)</>
              )}
            </span>{' '}
            <span className="text-[var(--ink-3)]">{periodLabel}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodToggle value={period} onChange={handlePeriodChange} loading={allLoading} />
          <ModeToggle value={mode} onChange={updateMode} />
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={resetVisible}
          className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
            visibleIds.size === allIds.length
              ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
              : 'border-[var(--border-ed)] text-[var(--ink-2)] hover:bg-[var(--subtle)]'
          }`}
        >
          Alle
        </button>
        {initialData.entities.map((entity) => {
          const isOn = visibleIds.has(entity.id)
          const series = activeData.byEntityId[entity.id]
          const currentValue = series?.[series.length - 1] ?? 0
          const dimmed = !entity.isActive
          return (
            <button
              key={entity.id}
              type="button"
              onClick={() => toggleEntity(entity.id)}
              aria-pressed={isOn}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-opacity ${
                dimmed ? 'border-dashed opacity-60' : ''
              } ${
                isOn
                  ? 'text-[var(--ink)]'
                  : 'border-[var(--border-ed)] text-[var(--ink-3)] hover:bg-[var(--subtle)]'
              }`}
              style={
                isOn
                  ? {
                      // Active chip uses the entity's color as a tint background +
                      // matching border so the legend visually anchors to the chart.
                      backgroundColor: `${entity.color}1f`,
                      borderColor: entity.color,
                    }
                  : undefined
              }
            >
              <span
                aria-hidden="true"
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: entity.color }}
              />
              <span className="max-w-[160px] truncate">{entity.name}</span>
              <span className="font-mono tabular-nums text-[var(--ink-3)]">{fc(currentValue)}</span>
            </button>
          )
        })}
      </div>

      {/* Optional all-fetch error notice — keep functional, don't alarm. */}
      {allError && period === 'all' && (
        <p
          role="status"
          aria-live="polite"
          className="text-[11px] italic text-[var(--ink-4)]"
        >
          Volledige historie kon niet worden opgehaald — toont laatst beschikbare reeks.
        </p>
      )}

      {/* SVG chart wrapper */}
      <div
        ref={ref}
        className="relative rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-4"
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="h-72 w-full"
          role="img"
          aria-label={`Cumulatief verloop ${periodLabel}`}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {/* Y-axis grid + labels */}
          {gridValues.map((val, i) => {
            const y = yScale(val)
            return (
              <g key={i}>
                <line
                  x1={SVG_PADDING.left}
                  x2={W - SVG_PADDING.right}
                  y1={y}
                  y2={y}
                  stroke="var(--border-md)"
                  strokeWidth={1}
                  opacity={0.45}
                />
                <text
                  x={SVG_PADDING.left - 6}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-[var(--ink-3)]"
                  style={{ fontSize: 10, fontFamily: 'var(--font-dm-mono, monospace)' }}
                >
                  {fmtCompactEur(val)}
                </text>
              </g>
            )
          })}

          {/* Debt-only "doel = nul" guideline at y=0 (only when zero is in range) */}
          {isDebt && yRange.min < 0 && (
            <line
              x1={SVG_PADDING.left}
              x2={W - SVG_PADDING.right}
              y1={yZero}
              y2={yZero}
              stroke="var(--ink-3)"
              strokeWidth={1}
              strokeDasharray="2 3"
              opacity={0.6}
            />
          )}

          {/* Stacked areas (bottom→top, then totals line on top) */}
          {mode === 'stacked' && (
            <g
              style={{
                opacity: hasEntered ? 1 : 0,
                transition: 'opacity 600ms cubic-bezier(.22,1,.36,1)',
              }}
            >
              {stackedPaths.map((p) => (
                <path
                  key={p.id}
                  d={p.d}
                  fill={p.color}
                  fillOpacity={0.55}
                  stroke={p.stroke}
                  strokeWidth={0.75}
                />
              ))}
              {totalsPath && (
                <path
                  d={totalsPath}
                  fill="none"
                  stroke="var(--ink)"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  pathLength={1}
                  strokeDasharray="1"
                  strokeDashoffset={hasEntered ? 0 : 1}
                  style={{
                    transition: hasEntered
                      ? 'stroke-dashoffset 700ms cubic-bezier(.22,1,.36,1) 80ms'
                      : 'none',
                  }}
                />
              )}
            </g>
          )}

          {/* Lines mode */}
          {mode === 'lines' && (
            <g>
              {linePaths.map((p, i) => (
                <path
                  key={p.id}
                  d={p.d}
                  fill="none"
                  stroke={p.color}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  pathLength={1}
                  strokeDasharray="1"
                  strokeDashoffset={hasEntered ? 0 : 1}
                  style={{
                    transition: hasEntered
                      ? `stroke-dashoffset 700ms cubic-bezier(.22,1,.36,1) ${i * 40}ms`
                      : 'none',
                  }}
                />
              ))}
            </g>
          )}

          {/* Bars mode */}
          {mode === 'bars' && barGeometry && (
            <g
              style={{
                opacity: hasEntered ? 1 : 0,
                transition: 'opacity 500ms cubic-bezier(.22,1,.36,1)',
              }}
            >
              {months.map((_, mi) => {
                const groupCenterX = xScale(mi)
                const groupStartX = groupCenterX - barGeometry.groupWidth / 2
                return (
                  <g key={mi}>
                    {visibleEntities.map((entity, ei) => {
                      const v = activeData.byEntityId[entity.id]?.[mi] ?? 0
                      const barX = groupStartX + ei * barGeometry.barW
                      const barTopY = yScale(Math.max(v, 0))
                      const barBottomY = yScale(Math.min(v, 0))
                      const barH = Math.max(0, barBottomY - barTopY)
                      // Anchor at zero so positive bars rise up and negative bars
                      // (rare for snapshots but valid for debt deltas) hang down.
                      const finalY = v >= 0 ? barTopY : yZero
                      const finalH = v >= 0 ? yZero - barTopY : barBottomY - yZero
                      return (
                        <rect
                          key={entity.id}
                          x={barX}
                          y={finalY}
                          width={Math.max(1, barGeometry.barW - 1)}
                          height={Math.max(1, finalH || barH)}
                          fill={entity.color}
                          opacity={0.85}
                        />
                      )
                    })}
                  </g>
                )
              })}
            </g>
          )}

          {/* X-axis labels */}
          {months.map((m, i) => {
            if (i % labelStep !== 0 && i !== months.length - 1) return null
            return (
              <text
                key={m}
                x={xScale(i)}
                y={H - 6}
                textAnchor="middle"
                className="fill-[var(--ink-3)]"
                style={{ fontSize: 10, fontFamily: 'var(--font-inter, sans-serif)' }}
              >
                {monthLabel(m)}
              </text>
            )
          })}

          {/* Hover guide */}
          {hoverIndex != null && (
            <line
              x1={xScale(hoverIndex)}
              x2={xScale(hoverIndex)}
              y1={SVG_PADDING.top}
              y2={SVG_PADDING.top + innerH}
              stroke="var(--ink-3)"
              strokeWidth={1}
              strokeDasharray="3 3"
              opacity={0.7}
            />
          )}
        </svg>

        {/* Tooltip — positioned absolutely over the chart card. */}
        {hoverIndex != null && (
          <HoverTooltip
            month={months[hoverIndex]}
            entities={visibleEntities}
            byEntityId={activeData.byEntityId}
            totals={activeData.totals}
            index={hoverIndex}
            xPx={xScale(hoverIndex) + SVG_PADDING.left}
            containerWidth={W}
            fc={fc}
          />
        )}
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────

function PeriodToggle({
  value,
  onChange,
  loading,
}: {
  value: CategoryHistoryPeriod
  onChange: (next: CategoryHistoryPeriod) => void
  loading: boolean
}) {
  const options: { key: CategoryHistoryPeriod; label: string }[] = [
    { key: 3, label: '3M' },
    { key: 6, label: '6M' },
    { key: 12, label: '12M' },
    { key: 'all', label: 'All' },
  ]
  return (
    <div role="radiogroup" aria-label="Periode" className="inline-flex items-center gap-1">
      {options.map((opt) => {
        const active = opt.key === value
        const showSpinner = opt.key === 'all' && loading
        return (
          <button
            key={String(opt.key)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.key)}
            className={`rounded-[var(--r)] border border-[var(--border-ed)] px-2.5 py-1 text-xs transition-colors hover:bg-[var(--subtle)] ${
              active ? 'bg-[var(--ink)] text-[var(--paper)]' : 'text-[var(--ink-2)]'
            }`}
          >
            {showSpinner ? '…' : opt.label}
          </button>
        )
      })}
    </div>
  )
}

function ModeToggle({
  value,
  onChange,
}: {
  value: CategoryHistoryMode
  onChange: (next: CategoryHistoryMode) => void
}) {
  const options: { key: CategoryHistoryMode; label: string; aria: string }[] = [
    { key: 'stacked', label: 'Stack', aria: 'Gestapeld verloop' },
    { key: 'lines', label: 'Lijn', aria: 'Lijnen per entiteit' },
    { key: 'bars', label: 'Bar', aria: 'Bars per maand' },
  ]
  return (
    <div role="radiogroup" aria-label="Weergave" className="inline-flex items-center gap-1">
      {options.map((opt) => {
        const active = opt.key === value
        return (
          <button
            key={opt.key}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={opt.aria}
            onClick={() => onChange(opt.key)}
            className={`rounded-[var(--r)] border border-[var(--border-ed)] px-2.5 py-1 text-xs transition-colors hover:bg-[var(--subtle)] ${
              active ? 'bg-[var(--ink)] text-[var(--paper)]' : 'text-[var(--ink-2)]'
            }`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

function HoverTooltip({
  month,
  entities,
  byEntityId,
  totals,
  index,
  xPx,
  containerWidth,
  fc,
}: {
  month: string
  entities: CategoryHistoryEntity[]
  byEntityId: Record<string, number[]>
  totals: number[]
  index: number
  xPx: number
  containerWidth: number
  fc: (v: number) => string
}) {
  const TOOLTIP_W = 220
  const PADDING = 16
  // Clamp position so the tooltip never overflows the card.
  const rawLeft = xPx + 12
  const left = Math.max(
    PADDING,
    Math.min(rawLeft, containerWidth - TOOLTIP_W - PADDING),
  )
  const total = totals[index] ?? 0
  const prevTotal = index > 0 ? (totals[index - 1] ?? 0) : null
  const deltaTotal = prevTotal != null ? total - prevTotal : null

  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-10 rounded-[var(--r-sm)] border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 text-xs shadow-[0_2px_8px_rgba(0,0,0,0.08)]"
      style={{ left, top: 12, width: TOOLTIP_W }}
    >
      <p className="mb-1.5 text-[10px] uppercase tracking-[0.12em] text-[var(--ink-3)]" style={{ fontFamily: 'var(--font-dm-mono, monospace)' }}>
        {fullMonthLabel(month)}
      </p>
      <div className="space-y-1">
        {entities.map((e) => {
          const v = byEntityId[e.id]?.[index] ?? 0
          return (
            <div key={e.id} className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: e.color }}
                />
                <span className="truncate text-[var(--ink-2)]">{e.name}</span>
              </span>
              <span className="font-mono tabular-nums text-[var(--ink)]">{fc(v)}</span>
            </div>
          )
        })}
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-[var(--border-ed)] pt-1.5">
        <span className="text-[10px] uppercase tracking-[0.1em] text-[var(--ink-3)]" style={{ fontFamily: 'var(--font-dm-mono, monospace)' }}>
          Totaal
        </span>
        <span className="font-mono tabular-nums text-[var(--ink)]">{fc(total)}</span>
      </div>
      {deltaTotal != null && (
        <div className="mt-0.5 text-right text-[10px] text-[var(--ink-3)]">
          <span className="font-mono tabular-nums">
            {deltaTotal >= 0 ? '+' : '−'}{fc(Math.abs(deltaTotal))}
          </span>{' '}
          t.o.v. vorige maand
        </div>
      )}
    </div>
  )
}
