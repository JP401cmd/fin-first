'use client'

import { useEffect, useState } from 'react'

type SupportedVar =
  | '--module-active-700'
  | '--module-active-500'
  | '--module-active-200'

/**
 * Resolves a `--module-active-*` CSS-var to a concrete color string at
 * runtime. SVG sparklines and other inline-rendered elements often need
 * a real hex/rgb color (CSS-vars don't always survive print or SVG
 * attribute parsing), but we still want them to follow the active module
 * on routes that override the variable in their layout.
 *
 * Strategy:
 *  1. SSR / first paint: return `fallback` (a print-safe hex). This avoids
 *     hydration mismatches and gives the reader something while we measure.
 *  2. After hydration we resolve the variable through a hidden DOM element.
 *     Setting `color: var(...)` on the element and reading the computed
 *     `color` returns the resolved `rgb(...)` string — which SVG accepts as
 *     `stroke`/`fill`.
 *  3. Print: we deliberately keep `fallback` so the printer engine never has
 *     to evaluate a CSS-var (Chromium and PDF-printers handle these
 *     unreliably across page-breaks).
 */
export function useResolvedModuleColor(varName: SupportedVar, fallback: string): string {
  const [color, setColor] = useState(fallback)

  useEffect(() => {
    if (typeof window === 'undefined') return

    // Print contexts: never resolve — print engines are unreliable with var().
    if (typeof window.matchMedia === 'function' && window.matchMedia('print').matches) {
      setColor(fallback)
      return
    }

    // We measure through a temporary off-screen element so we don't pollute
    // any real elements with `color`-assignments that could leak via cascade.
    const probe = document.createElement('span')
    probe.style.position = 'absolute'
    probe.style.left = '-9999px'
    probe.style.color = `var(${varName})`
    document.body.appendChild(probe)

    try {
      const resolved = window.getComputedStyle(probe).color.trim()
      // `getComputedStyle` returns either `rgb(r, g, b)` or `rgba(r, g, b, a)`
      // — both are valid SVG attributes. If the var didn't resolve we'll get
      // the inherited browser default (typically black); we treat any
      // non-empty value as a successful resolve.
      if (resolved && resolved !== '') {
        setColor(resolved)
      }
    } finally {
      probe.remove()
    }
  }, [varName, fallback])

  return color
}
