'use client'

import { useChartZoom } from '@/lib/hooks/use-chart-zoom'
import { Minus, Plus, RotateCcw } from 'lucide-react'

// ── ZoomableChartContainer ──────────────────────────────────────────────────

export type ZoomControls = {
  zoomBy: (factor: number, centerAge?: number) => void
  resetZoom: () => void
  isZoomed: boolean
}

export function ZoomableChartContainer({
  currentAge,
  endAge,
  children,
}: {
  currentAge: number
  endAge: number
  children: (visibleMin: number, visibleMax: number, controls: ZoomControls) => React.ReactNode
}) {
  const {
    containerRef,
    containerProps,
    visibleMin,
    visibleMax,
    zoomLevel,
    resetZoom,
    zoomBy,
  } = useChartZoom({ minAge: currentAge, maxAge: endAge })

  const isZoomed = zoomLevel > 1.01
  const controls: ZoomControls = { zoomBy, resetZoom, isZoomed }
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  return (
    <div ref={containerRef} {...containerProps} className="relative">
      {children(visibleMin, visibleMax, controls)}

      {/* Zoom indicator badge — top right */}
      {isZoomed && (
        <div
          className="absolute right-2 top-2 z-10 flex items-center gap-1.5"
          style={prefersReducedMotion ? undefined : { animation: 'fadeIn 150ms ease' }}
        >
          <span className="rounded-full bg-[var(--ink)]/80 px-2 py-0.5 font-mono text-[10px] text-[var(--paper)]">
            {Math.round(visibleMin)}&ndash;{Math.round(visibleMax)} jaar
          </span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); resetZoom() }}
            className="rounded-full bg-[var(--ink)]/80 p-1 text-[var(--paper)] transition-opacity hover:opacity-80"
            aria-label="Reset zoom"
          >
            <RotateCcw className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* +/- buttons — bottom right */}
      {isZoomed && (
        <div
          className="absolute bottom-8 right-2 z-10 flex flex-col gap-1"
          style={prefersReducedMotion ? undefined : { animation: 'fadeIn 150ms ease' }}
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); zoomBy(1.4) }}
            className="flex h-6 w-6 items-center justify-center rounded border border-[var(--border-ed)] bg-[var(--subtle)] text-[var(--ink-2)] transition-colors hover:bg-[var(--paper)]"
            aria-label="Zoom in"
          >
            <Plus className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); zoomBy(0.7) }}
            className="flex h-6 w-6 items-center justify-center rounded border border-[var(--border-ed)] bg-[var(--subtle)] text-[var(--ink-2)] transition-colors hover:bg-[var(--paper)]"
            aria-label="Zoom uit"
          >
            <Minus className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Screen reader announcement */}
      <div aria-live="polite" className="sr-only">
        {isZoomed && `Grafiek toont leeftijd ${Math.round(visibleMin)} tot ${Math.round(visibleMax)}`}
      </div>
    </div>
  )
}
