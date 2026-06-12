'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { TrendingUp, ArrowRightLeft, Wallet } from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

export type FaseId = 'opbouw' | 'overgang' | 'onttrekking'

interface PhaseSegment {
  id: FaseId
  label: string
  startAge: number
  endAge: number
  color: string        // background CSS value
  textColor: string    // text CSS color
  icon: typeof TrendingUp
}

interface PhaseBarProps {
  currentAge: number
  fireAge: number | null       // null when FIRE unreachable
  fireAgeFractional?: number | null  // fractional FIRE age for precise phase boundaries
  aowAge: number               // usually 67
  endAge: number
  fireReachable: boolean
  isPensioenMode: boolean
  onSegmentClick?: (fase: FaseId) => void
  visibleMinAge?: number       // zoom viewport start (clip segments to this)
  visibleMaxAge?: number       // zoom viewport end (clip segments to this)
}

// ── Display mode thresholds ──────────────────────────────────────────────────

const WIDE_THRESHOLD = 120   // px — show name + age range
const NARROW_THRESHOLD = 60  // px — show only name
const MIN_SEGMENT_PX = 44    // minimum active segment width

// ── Component ────────────────────────────────────────────────────────────────

export function PhaseBar({
  currentAge,
  fireAge,
  fireAgeFractional,
  aowAge,
  endAge,
  fireReachable,
  isPensioenMode,
  onSegmentClick,
  visibleMinAge,
  visibleMaxAge,
}: PhaseBarProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)

  // ResizeObserver to track container width
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ── Build segments based on edge cases ──────────────────────────────────

  const segments = buildSegments({ currentAge, fireAge, fireAgeFractional, aowAge, endAge, fireReachable, isPensioenMode })

  // ── Clip segments to visible zoom viewport ──────────────────────────────

  const vpMin = visibleMinAge ?? currentAge
  const vpMax = visibleMaxAge ?? endAge
  const totalAgeSpan = vpMax - vpMin
  if (totalAgeSpan <= 0 || segments.length === 0) return null

  // Clip each segment to the visible viewport, filtering out fully hidden ones
  const clippedSegments = segments
    .map(s => ({
      ...s,
      clippedStart: Math.max(s.startAge, vpMin),
      clippedEnd: Math.min(s.endAge, vpMax),
    }))
    .filter(s => s.clippedEnd > s.clippedStart)

  if (clippedSegments.length === 0) return null

  // ── Calculate widths (proportional to age span, with minimums) ──────────

  const rawFractions = clippedSegments.map(s => (s.clippedEnd - s.clippedStart) / totalAgeSpan)
  const segmentWidths = applyMinWidths(rawFractions, containerWidth)

  return (
    <div
      ref={containerRef}
      role="group"
      aria-label="Levensfasen"
      className="flex w-full"
      style={{ height: 44, gap: 1 }}
    >
      {clippedSegments.map((seg, i) => {
        const widthPx = segmentWidths[i]
        const isCollapsed = widthPx < MIN_SEGMENT_PX
        const isWide = widthPx >= WIDE_THRESHOLD
        const isNarrow = widthPx >= NARROW_THRESHOLD && widthPx < WIDE_THRESHOLD

        const Icon = seg.icon

        if (isCollapsed) {
          return (
            <div
              key={seg.id}
              aria-hidden
              tabIndex={-1}
              style={{
                width: widthPx,
                background: seg.color,
                borderRadius: 0,
                minWidth: 0,
              }}
              className="h-full shrink-0"
            />
          )
        }

        return (
          <button
            key={seg.id}
            type="button"
            aria-haspopup="dialog"
            aria-label={`${seg.label}: leeftijd ${Math.round(seg.startAge)} tot ${Math.round(seg.endAge)}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onSegmentClick?.(seg.id)}
            style={{
              width: widthPx,
              background: seg.color,
              color: seg.textColor,
              borderRadius: 0,
              minWidth: MIN_SEGMENT_PX,
            }}
            className="group relative flex h-full shrink-0 cursor-pointer items-center justify-center gap-1.5 overflow-hidden px-2 text-[12px] font-medium ring-1 ring-inset ring-white/20 transition-all select-none hover:-translate-y-0.5 hover:shadow-sm hover:brightness-110 focus-visible:ring-2 focus-visible:ring-[var(--color-horizon-500)] focus-visible:ring-offset-1 focus-visible:outline-none active:scale-[0.98]"
          >
            {/* Wide: icon + name + age range */}
            {isWide && (
              <>
                <Icon size={14} className="shrink-0 opacity-90" />
                <span className="truncate font-semibold">{seg.label}</span>
                <span className="shrink-0 text-[10px] opacity-70">
                  {Math.round(seg.startAge)}&ndash;{Math.round(seg.endAge)}
                </span>
              </>
            )}
            {/* Narrow: icon + name */}
            {isNarrow && (
              <>
                <Icon size={14} className="shrink-0 opacity-90" />
                <span className="truncate font-semibold">{seg.label}</span>
              </>
            )}
            {/* Collapsed icon-only (when between MIN and NARROW) */}
            {!isWide && !isNarrow && (
              <Icon size={16} className="shrink-0" />
            )}
          </button>
        )
      })}
    </div>
  )
}

// ── Segment builder ─────────────────────────────────────────────────────────

export function buildSegments({
  currentAge,
  fireAge,
  fireAgeFractional,
  aowAge,
  endAge,
  fireReachable,
  isPensioenMode,
}: Omit<PhaseBarProps, 'onSegmentClick' | 'visibleMinAge' | 'visibleMaxAge'>): PhaseSegment[] {
  const segments: PhaseSegment[] = []

  // Use fractional FIRE age for proportionally correct phase widths.
  // The phase bar splits at the exact fractional boundary (e.g. 60.5) so it
  // aligns with the FIRE marker on the chart. Labels are rounded for readability.
  const effectiveFireAge = fireReachable && (fireAgeFractional ?? fireAge) != null
    ? (fireAgeFractional ?? fireAge!)
    : null
  const effectiveAowAge = Math.round(aowAge)

  // Edge case: FIRE unreachable → only Opbouw, full width
  if (!fireReachable || effectiveFireAge == null) {
    segments.push({
      id: 'opbouw',
      label: 'Opbouw',
      startAge: currentAge,
      endAge: endAge,
      color: 'var(--color-horizon-600)',
      textColor: '#fff',
      icon: TrendingUp,
    })
    return segments
  }

  // Edge case: already FIRE'd (fireAge <= currentAge) → Opbouw collapses
  const alreadyFired = effectiveFireAge <= currentAge

  // Edge case: FIRE = AOW or pensioen-modus → Overgang collapses
  const overgangCollapses = isPensioenMode || effectiveFireAge >= effectiveAowAge

  if (alreadyFired) {
    // No opbouw phase — already past FIRE
    if (!overgangCollapses && effectiveAowAge > currentAge && effectiveAowAge < endAge) {
      // Overgang: currentAge → AOW
      segments.push({
        id: 'overgang',
        label: 'Overgang',
        startAge: currentAge,
        endAge: effectiveAowAge,
        color: 'var(--color-horizon-200)',
        textColor: 'var(--color-horizon-800)',
        icon: ArrowRightLeft,
      })
      // Onttrekking: AOW → endAge
      segments.push({
        id: 'onttrekking',
        label: 'Onttrekking',
        startAge: effectiveAowAge,
        endAge: endAge,
        color: 'var(--color-kern-500)',
        textColor: '#fff',
        icon: Wallet,
      })
    } else {
      // Only onttrekking
      segments.push({
        id: 'onttrekking',
        label: 'Onttrekking',
        startAge: currentAge,
        endAge: endAge,
        color: 'var(--color-kern-500)',
        textColor: '#fff',
        icon: Wallet,
      })
    }
    return segments
  }

  // Normal case: Opbouw phase
  const opbouwEnd = effectiveFireAge
  segments.push({
    id: 'opbouw',
    label: 'Opbouw',
    startAge: currentAge,
    endAge: opbouwEnd,
    color: 'var(--color-horizon-600)',
    textColor: '#fff',
    icon: TrendingUp,
  })

  // Overgang phase (between FIRE and AOW, only if not collapsed)
  if (!overgangCollapses && effectiveFireAge < effectiveAowAge) {
    segments.push({
      id: 'overgang',
      label: 'Overgang',
      startAge: effectiveFireAge,
      endAge: Math.min(effectiveAowAge, endAge),
      color: 'var(--color-horizon-200)',
      textColor: 'var(--color-horizon-800)',
      icon: ArrowRightLeft,
    })
  }

  // Onttrekking phase
  const onttrekkingStart = overgangCollapses
    ? effectiveFireAge
    : Math.min(effectiveAowAge, endAge)
  if (onttrekkingStart < endAge) {
    segments.push({
      id: 'onttrekking',
      label: 'Onttrekking',
      startAge: onttrekkingStart,
      endAge: endAge,
      color: 'var(--color-kern-500)',
      textColor: '#fff',
      icon: Wallet,
    })
  }

  return segments
}

// ── Width calculator with minimum enforcement ───────────────────────────────

function applyMinWidths(fractions: number[], containerWidth: number): number[] {
  if (containerWidth <= 0) return fractions.map(() => 0)

  const raw = fractions.map(f => f * containerWidth)
  // Total gap pixels
  const gapTotal = Math.max(0, (raw.length - 1)) // 1px gaps
  const available = containerWidth - gapTotal

  // First pass: enforce minimum on active segments, redistribute from largest
  const adjusted = raw.map(w => Math.max(w, 0))
  const total = adjusted.reduce((a, b) => a + b, 0)

  if (total > 0) {
    // Normalize to available width
    const scale = available / total
    return adjusted.map(w => w * scale)
  }

  return adjusted
}
