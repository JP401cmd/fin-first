'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  clampPan,
  fitToBox,
  IDENTITY,
  isClick,
  zoomAtPoint,
  type Box,
  type PlaatTransform,
} from '@/lib/uat/plaat-transform'

// 2D zoom/pan-hook voor een SVG met een vaste viewBox (0 0 viewW viewH). De
// pure wiskunde zit in lib/uat/plaat-transform.ts; deze hook doet enkel de
// DOM-kant: cursor-positie → viewBox-coördinaten via getScreenCTM, pointer-
// events voor pan (1 vinger/muis) en pinch (2 vingers), niet-passieve wheel-
// listener voor cursor-gecentreerd zoomen, en klik-vs-sleep-detectie.

interface Options {
  viewW: number
  viewH: number
  minScale?: number
  maxScale?: number
  /** padding (viewBox-eenheden) bij fit-to-box. */
  padding?: number
}

interface Pointer {
  clientX: number
  clientY: number
}

export interface UsePlaatZoomPan {
  transform: PlaatTransform
  svgRef: React.RefObject<SVGSVGElement | null>
  /** Spread op het <svg>-element (pointer-handlers + touch-action). */
  svgHandlers: {
    onPointerDown: (e: React.PointerEvent<SVGSVGElement>) => void
    onPointerMove: (e: React.PointerEvent<SVGSVGElement>) => void
    onPointerUp: (e: React.PointerEvent<SVGSVGElement>) => void
    onPointerCancel: (e: React.PointerEvent<SVGSVGElement>) => void
    style: React.CSSProperties
  }
  /** Terug naar fit-to-screen. */
  reset: () => void
  /** Zoom-to-fit op een content-box (zone-bbox). */
  fitBox: (box: Box) => void
  /** true als de laatste pointer-interactie een sleep was (voor klik-onderdrukking op knopen). */
  hasDragged: () => boolean
  isInteracting: boolean
}

export function usePlaatZoomPan({
  viewW,
  viewH,
  minScale = 0.5,
  maxScale = 6,
  padding = 24,
}: Options): UsePlaatZoomPan {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [transform, setTransform] = useState<PlaatTransform>(IDENTITY)
  const [isInteracting, setIsInteracting] = useState(false)

  const transformRef = useRef(transform)
  transformRef.current = transform

  // Klik-vs-sleep: cumulatieve verplaatsing sinds pointerdown.
  const draggedRef = useRef(false)
  const downPointRef = useRef<{ x: number; y: number } | null>(null)

  const pointersRef = useRef(new Map<number, Pointer>())
  const panStartRef = useRef<{ x: number; y: number; t: PlaatTransform } | null>(null)
  const pinchStartRef = useRef<{ dist: number; t: PlaatTransform } | null>(null)

  // clientX/Y → viewBox-gebruikerscoördinaten (houdt rekening met preserveAspectRatio).
  const toUser = useCallback((clientX: number, clientY: number): { x: number; y: number } => {
    const svg = svgRef.current
    if (!svg || typeof svg.getScreenCTM !== 'function') {
      return { x: 0, y: 0 }
    }
    const ctm = svg.getScreenCTM()
    if (!ctm) return { x: 0, y: 0 }
    const inv = ctm.inverse()
    return {
      x: inv.a * clientX + inv.c * clientY + inv.e,
      y: inv.b * clientX + inv.d * clientY + inv.f,
    }
  }, [])

  const applyClamped = useCallback(
    (next: PlaatTransform) => {
      setTransform(clampPan(next, viewW, viewH, viewW, viewH))
    },
    [viewW, viewH],
  )

  const reset = useCallback(() => {
    draggedRef.current = false
    setTransform(clampPan(fitToBox({ x: 0, y: 0, w: viewW, h: viewH }, viewW, viewH), viewW, viewH, viewW, viewH))
  }, [viewW, viewH])

  const fitBox = useCallback(
    (box: Box) => {
      const t = fitToBox(box, viewW, viewH, padding, maxScale)
      setTransform(clampPan(t, viewW, viewH, viewW, viewH))
    },
    [viewW, viewH, padding, maxScale],
  )

  const hasDragged = useCallback(() => draggedRef.current, [])

  // ── Pointer: pan (1) + pinch (2) ──────────────────────────────────────────
  const onPointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const svg = svgRef.current
    if (!svg) return
    // Bewust NOG NIET capturen: een simpele klik mag zo native op de knoop
    // vallen (het detailpaneel openen). Pas bij een echte sleep (drempel
    // overschreden) grijpen we de pointer, zodat pannen buiten het SVG doorloopt.
    pointersRef.current.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY })
    draggedRef.current = false
    downPointRef.current = { x: e.clientX, y: e.clientY }

    if (pointersRef.current.size === 2) {
      const pts = Array.from(pointersRef.current.values())
      const dist = Math.hypot(pts[0].clientX - pts[1].clientX, pts[0].clientY - pts[1].clientY)
      pinchStartRef.current = { dist: Math.max(1, dist), t: transformRef.current }
      panStartRef.current = null
      draggedRef.current = true
      pointersRef.current.forEach((_, id) => {
        try {
          svg.setPointerCapture(id)
        } catch {
          /* pointer kan al vrij zijn */
        }
      })
      setIsInteracting(true)
    } else if (pointersRef.current.size === 1) {
      panStartRef.current = { x: e.clientX, y: e.clientY, t: transformRef.current }
      setIsInteracting(true)
    }
  }, [])

  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!pointersRef.current.has(e.pointerId)) return
      pointersRef.current.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY })

      // Sleepdetectie t.o.v. eerste contact; bij de eerste echte sleep capturen
      // we de pointer zodat pannen doorloopt als de cursor het SVG verlaat.
      const down = downPointRef.current
      if (down && !draggedRef.current && !isClick(e.clientX - down.x, e.clientY - down.y)) {
        draggedRef.current = true
        const svg = svgRef.current
        if (svg) {
          try {
            svg.setPointerCapture(e.pointerId)
          } catch {
            /* negeren */
          }
        }
      }

      if (pinchStartRef.current && pointersRef.current.size >= 2) {
        const pts = Array.from(pointersRef.current.values())
        const dist = Math.hypot(pts[0].clientX - pts[1].clientX, pts[0].clientY - pts[1].clientY)
        const ps = pinchStartRef.current
        const factor = Math.max(1, dist) / ps.dist
        // Pinch-midden in viewBox-coördinaten; zoom vanaf de START-transform.
        const midClientX = (pts[0].clientX + pts[1].clientX) / 2
        const midClientY = (pts[0].clientY + pts[1].clientY) / 2
        const mid = toUser(midClientX, midClientY)
        const next = zoomAtPoint(ps.t, factor, mid.x, mid.y, minScale, maxScale)
        applyClamped(next)
        draggedRef.current = true
        return
      }

      if (panStartRef.current && pointersRef.current.size === 1) {
        const ps = panStartRef.current
        const start = toUser(ps.x, ps.y)
        const cur = toUser(e.clientX, e.clientY)
        applyClamped({ scale: ps.t.scale, tx: ps.t.tx + (cur.x - start.x), ty: ps.t.ty + (cur.y - start.y) })
      }
    },
    [applyClamped, toUser, minScale, maxScale],
  )

  const endPointer = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    pointersRef.current.delete(e.pointerId)
    if (pointersRef.current.size === 1) {
      // 2→1: pinch → pan overnemen met de resterende vinger.
      pinchStartRef.current = null
      const remaining = Array.from(pointersRef.current.values())[0]
      if (remaining) {
        panStartRef.current = { x: remaining.clientX, y: remaining.clientY, t: transformRef.current }
      }
    }
    if (pointersRef.current.size === 0) {
      panStartRef.current = null
      pinchStartRef.current = null
      downPointRef.current = null
      setIsInteracting(false)
    }
  }, [])

  // ── Wheel: cursor-gecentreerd zoomen (niet-passief zodat preventDefault werkt) ─
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const handler = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) < 1) return
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
      const u = toUser(e.clientX, e.clientY)
      const next = zoomAtPoint(transformRef.current, factor, u.x, u.y, minScale, maxScale)
      applyClamped(next)
    }
    svg.addEventListener('wheel', handler, { passive: false })
    return () => svg.removeEventListener('wheel', handler)
  }, [applyClamped, toUser, minScale, maxScale])

  return {
    transform,
    svgRef,
    svgHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endPointer,
      onPointerCancel: endPointer,
      style: {
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        cursor: isInteracting ? 'grabbing' : 'grab',
      },
    },
    reset,
    fitBox,
    hasDragged,
    isInteracting,
  }
}
