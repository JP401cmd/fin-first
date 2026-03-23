'use client'

import { useRef, useState, useCallback, useEffect } from 'react'

// ── Types ───────────────────────────────────────────────────────────────────

type PointerInfo = { clientX: number }

interface UseChartZoomOptions {
  minAge: number
  maxAge: number
  /** Left padding in age-units (default 0) */
  padLeft?: number
  /** Right padding in age-units (default 0) */
  padRight?: number
  /** Minimum visible span in years (default 5) */
  minSpan?: number
  /** Maximum zoom factor (default 8) */
  maxZoom?: number
}

interface UseChartZoomReturn {
  containerRef: React.RefObject<HTMLDivElement | null>
  containerProps: React.HTMLAttributes<HTMLDivElement>
  visibleMin: number
  visibleMax: number
  zoomLevel: number
  isInteracting: boolean
  resetZoom: () => void
  zoomBy: (factor: number, centerAge?: number) => void
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useChartZoom({
  minAge,
  maxAge,
  padLeft = 0,
  padRight = 0,
  minSpan = 5,
  maxZoom = 8,
}: UseChartZoomOptions): UseChartZoomReturn {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const fullMin = minAge - padLeft
  const fullMax = maxAge + padRight
  const fullSpan = fullMax - fullMin
  const effectiveMinSpan = Math.min(minSpan, fullSpan)

  const [visibleMin, setVisibleMin] = useState(fullMin)
  const [visibleMax, setVisibleMax] = useState(fullMax)
  const [isInteracting, setIsInteracting] = useState(false)

  // Reset when data range changes
  useEffect(() => {
    setVisibleMin(fullMin)
    setVisibleMax(fullMax)
  }, [fullMin, fullMax])

  const visibleSpan = visibleMax - visibleMin
  const zoomLevel = fullSpan / visibleSpan

  // Refs for native event listeners (can't rely on closure state)
  const visibleMinRef = useRef(visibleMin)
  const visibleMaxRef = useRef(visibleMax)
  const fullSpanRef = useRef(fullSpan)
  visibleMinRef.current = visibleMin
  visibleMaxRef.current = visibleMax
  fullSpanRef.current = fullSpan

  // --- Clamp helper ---
  const clamp = useCallback(
    (newMin: number, newMax: number): [number, number] => {
      let span = newMax - newMin
      // Enforce minimum span
      if (span < effectiveMinSpan) span = effectiveMinSpan
      // Enforce maximum zoom
      if (span < fullSpan / maxZoom) span = fullSpan / maxZoom
      // Enforce full range
      if (span > fullSpan) span = fullSpan

      let min = newMin
      let max = min + span
      // Keep within bounds
      if (min < fullMin) { min = fullMin; max = min + span }
      if (max > fullMax) { max = fullMax; min = max - span }
      // Final safety
      min = Math.max(min, fullMin)
      max = Math.min(max, fullMax)
      return [min, max]
    },
    [effectiveMinSpan, fullSpan, fullMin, fullMax, maxZoom],
  )
  const clampRef = useRef(clamp)
  clampRef.current = clamp

  // --- Zoom around a center age ---
  const zoomBy = useCallback(
    (factor: number, centerAge?: number) => {
      const center = centerAge ?? (visibleMin + visibleMax) / 2
      const newSpan = visibleSpan / factor
      const newMin = center - (newSpan * (center - visibleMin) / visibleSpan)
      const newMax = newMin + newSpan
      const [clampedMin, clampedMax] = clamp(newMin, newMax)
      setVisibleMin(clampedMin)
      setVisibleMax(clampedMax)
    },
    [visibleMin, visibleMax, visibleSpan, clamp],
  )

  const resetZoom = useCallback(() => {
    setVisibleMin(fullMin)
    setVisibleMax(fullMax)
  }, [fullMin, fullMax])

  // --- Pointer tracking for pan/pinch ---
  const pointersRef = useRef(new Map<number, PointerInfo>())
  const gestureStartRef = useRef<{
    pointerIds: number[]
    startDist: number
    startSpan: number
    startCenter: number
    startMin: number
    startMax: number
    startClientCenter: number
  } | null>(null)
  const panStartRef = useRef<{
    startX: number
    startMin: number
    startMax: number
  } | null>(null)
  const rafRef = useRef<number | null>(null)
  const lastTapRef = useRef<number>(0)

  // Convert pixel X to age
  const pixelToAge = useCallback(
    (clientX: number): number => {
      const el = containerRef.current
      if (!el) return visibleMin
      const rect = el.getBoundingClientRect()
      // SimChart uses PAD.left=60, PAD.right=16
      const padLeftPx = 60
      const padRightPx = 16
      const innerW = rect.width - padLeftPx - padRightPx
      const relX = clientX - rect.left - padLeftPx
      const ratio = innerW > 0 ? relX / innerW : 0
      return visibleMin + ratio * (visibleMax - visibleMin)
    },
    [visibleMin, visibleMax],
  )

  const scheduleUpdate = useCallback(
    (fn: () => void) => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        fn()
        rafRef.current = null
      })
    },
    [],
  )

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Only handle primary button (or touch)
      if (e.pointerType === 'mouse' && e.button !== 0) return

      const el = containerRef.current
      if (!el) return
      el.setPointerCapture(e.pointerId)
      pointersRef.current.set(e.pointerId, { clientX: e.clientX })

      if (pointersRef.current.size === 2) {
        // Start pinch gesture
        const pts = Array.from(pointersRef.current.entries())
        const dist = Math.abs(pts[0][1].clientX - pts[1][1].clientX)
        const centerX = (pts[0][1].clientX + pts[1][1].clientX) / 2
        gestureStartRef.current = {
          pointerIds: pts.map(([id]) => id),
          startDist: dist,
          startSpan: visibleMax - visibleMin,
          startCenter: pixelToAge(centerX),
          startMin: visibleMin,
          startMax: visibleMax,
          startClientCenter: centerX,
        }
        panStartRef.current = null
        setIsInteracting(true)
      } else if (pointersRef.current.size === 1) {
        // Check for double-tap
        const now = Date.now()
        if (now - lastTapRef.current < 300) {
          resetZoom()
          lastTapRef.current = 0
          return
        }
        lastTapRef.current = now

        // Start pan (only if zoomed)
        if (zoomLevel > 1.01) {
          panStartRef.current = {
            startX: e.clientX,
            startMin: visibleMin,
            startMax: visibleMax,
          }
          setIsInteracting(true)
        }
      }
    },
    [visibleMin, visibleMax, zoomLevel, pixelToAge, resetZoom],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!pointersRef.current.has(e.pointerId)) return
      pointersRef.current.set(e.pointerId, { clientX: e.clientX })

      if (gestureStartRef.current && pointersRef.current.size === 2) {
        // Pinch
        const pts = Array.from(pointersRef.current.values())
        const dist = Math.abs(pts[0].clientX - pts[1].clientX)
        const gs = gestureStartRef.current

        scheduleUpdate(() => {
          const scale = gs.startDist / Math.max(dist, 1)
          const newSpan = gs.startSpan * scale
          const center = gs.startCenter
          // Keep center age at same position
          const ratio = (center - gs.startMin) / gs.startSpan
          const newMin = center - ratio * newSpan
          const newMax = newMin + newSpan
          const [cMin, cMax] = clamp(newMin, newMax)
          setVisibleMin(cMin)
          setVisibleMax(cMax)
        })
      } else if (panStartRef.current && pointersRef.current.size === 1) {
        // Pan
        const ps = panStartRef.current
        const el = containerRef.current
        if (!el) return

        scheduleUpdate(() => {
          const rect = el.getBoundingClientRect()
          const padLeftPx = 60
          const padRightPx = 16
          const innerW = rect.width - padLeftPx - padRightPx
          if (innerW <= 0) return
          const span = ps.startMax - ps.startMin
          const deltaAge = ((ps.startX - e.clientX) / innerW) * span
          const newMin = ps.startMin + deltaAge
          const newMax = ps.startMax + deltaAge
          const [cMin, cMax] = clamp(newMin, newMax)
          setVisibleMin(cMin)
          setVisibleMax(cMax)
        })
      }
    },
    [clamp, scheduleUpdate],
  )

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      pointersRef.current.delete(e.pointerId)

      if (pointersRef.current.size === 1 && gestureStartRef.current) {
        // 2→1 transition: switch from pinch to pan
        gestureStartRef.current = null
        const remaining = Array.from(pointersRef.current.entries())[0]
        if (remaining) {
          panStartRef.current = {
            startX: remaining[1].clientX,
            startMin: visibleMin,
            startMax: visibleMax,
          }
        }
      }

      if (pointersRef.current.size === 0) {
        gestureStartRef.current = null
        panStartRef.current = null
        setIsInteracting(false)
      }
    },
    [visibleMin, visibleMax],
  )

  const onPointerCancel = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      pointersRef.current.delete(e.pointerId)
      if (pointersRef.current.size === 0) {
        gestureStartRef.current = null
        panStartRef.current = null
        setIsInteracting(false)
      }
    },
    [],
  )

  // --- Wheel zoom (scroll over chart) ---
  // Attached as native event listener with { passive: false } so we can preventDefault
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      // Skip horizontal scroll (trackpad swipe)
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
      // Skip tiny deltas (accidental)
      if (Math.abs(e.deltaY) < 2) return

      // When fully zoomed out and scrolling in zoom-out direction (deltaY > 0),
      // let the event pass through to the page so the user can scroll normally
      const curSpan = visibleMaxRef.current - visibleMinRef.current
      const isFullyZoomedOut = curSpan >= fullSpanRef.current - 0.01
      if (isFullyZoomedOut && e.deltaY > 0) return

      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.15 : 0.87
      const rect = el.getBoundingClientRect()
      const padLeftPx = 60
      const padRightPx = 16
      const innerW = rect.width - padLeftPx - padRightPx
      const relX = e.clientX - rect.left - padLeftPx
      const ratio = innerW > 0 ? relX / innerW : 0.5
      // Read current values from refs
      const curMin = visibleMinRef.current
      const curMax = visibleMaxRef.current
      const centerAge = curMin + ratio * curSpan
      const newSpan = curSpan / factor
      const newMin = centerAge - (newSpan * (centerAge - curMin) / curSpan)
      const newMax = newMin + newSpan
      const [cMin, cMax] = clampRef.current(newMin, newMax)
      setVisibleMin(cMin)
      setVisibleMax(cMax)
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // --- Keyboard ---
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const span = visibleMax - visibleMin
      switch (e.key) {
        case '+':
        case '=': {
          e.preventDefault()
          const center = (visibleMin + visibleMax) / 2
          const newSpan = span / 1.3
          const [cMin, cMax] = clamp(center - newSpan / 2, center + newSpan / 2)
          setVisibleMin(cMin)
          setVisibleMax(cMax)
          break
        }
        case '-':
        case '_': {
          e.preventDefault()
          const center = (visibleMin + visibleMax) / 2
          const newSpan = span * 1.3
          const [cMin, cMax] = clamp(center - newSpan / 2, center + newSpan / 2)
          setVisibleMin(cMin)
          setVisibleMax(cMax)
          break
        }
        case 'ArrowLeft': {
          e.preventDefault()
          const step = span * 0.15
          const [cMin, cMax] = clamp(visibleMin - step, visibleMax - step)
          setVisibleMin(cMin)
          setVisibleMax(cMax)
          break
        }
        case 'ArrowRight': {
          e.preventDefault()
          const step = span * 0.15
          const [cMin, cMax] = clamp(visibleMin + step, visibleMax + step)
          setVisibleMin(cMin)
          setVisibleMax(cMax)
          break
        }
        case '0':
        case 'Escape':
          e.preventDefault()
          resetZoom()
          break
      }
    },
    [visibleMin, visibleMax, clamp, resetZoom],
  )

  // Prevent iOS Safari's default pinch-to-zoom on the container
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = (e: Event) => {
      if (pointersRef.current.size >= 2) e.preventDefault()
    }
    // Also prevent gesturestart/gesturechange on Safari
    el.addEventListener('touchmove', handler, { passive: false })
    el.addEventListener('gesturestart', handler as EventListener, { passive: false })
    el.addEventListener('gesturechange', handler as EventListener, { passive: false })
    return () => {
      el.removeEventListener('touchmove', handler)
      el.removeEventListener('gesturestart', handler as EventListener)
      el.removeEventListener('gesturechange', handler as EventListener)
    }
  }, [])

  // Cleanup RAF on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const isZoomed = zoomLevel > 1.01

  const containerProps: React.HTMLAttributes<HTMLDivElement> = {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onKeyDown,
    tabIndex: 0,
    role: 'application' as const,
    'aria-roledescription': 'zoombare grafiek',
    style: {
      touchAction: 'pan-y',
      userSelect: 'none',
      WebkitUserSelect: 'none',
      cursor: isInteracting ? 'grabbing' : isZoomed ? 'grab' : 'default',
      outline: 'none',
    } as React.CSSProperties,
  }

  return {
    containerRef,
    containerProps,
    visibleMin,
    visibleMax,
    zoomLevel,
    isInteracting,
    resetZoom,
    zoomBy,
  }
}
