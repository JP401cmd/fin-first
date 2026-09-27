'use client'

/**
 * `useSamenstellingPast` — mobiel in Doelen mag de Samenstelling-laag de modus-cel niet
 * hoger maken dan de Vermogen-laag (één-scherm-eis, ADR 0179 D7; visuele check 27 sep).
 *
 * De drie modi liggen in één gridcel; die is zo hoog als de hoogste laag. De lagen zelf
 * worden door de cel uitgerekt, dus de hook meet hun INHOUD (`firstElementChild`): de
 * natuurlijke hoogte van `SimChart` en van `WealthCompositionChart`. Daaruit volgt de
 * Samenstelling-plot waarbij beide even hoog zijn (`samenstellingPlotPassend`). De
 * Vermogen-laag hangt niet van die plot af, dus na één ronde is het stabiel.
 *
 * Beide lagen blijven gemonteerd (de inactieve op opacity 0), dus de meting — en daarmee
 * de hoogte — verandert niet bij een modus-wissel. Vóór de meting geldt de startwaarde uit
 * de stand (`samenstellingStartMobiel`).
 */

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { samenstellingPlotPassend } from './canvas-stand'

/** Kleinere verschillen dan dit negeren we (afronding, subpixels): geen trilling. */
const DREMPEL_PX = 2

export function useSamenstellingPast({
  actief,
  startPlot,
  vermogenPlot,
}: {
  /** Alleen mobiel in Doelen (`CanvasStand.samenstellingPastInVermogen`). */
  actief: boolean
  /** De Samenstelling-plot vóór de meting (`CanvasStand.samenstellingHoogte`). */
  startPlot: number | null
  /** De Vermogen-plot (`CanvasStand.plotHoogte`); begrenst de groei naar boven. */
  vermogenPlot: number | null
}): {
  vermogenRef: RefObject<HTMLDivElement | null>
  samenstellingRef: RefObject<HTMLDivElement | null>
  samenstellingPlot: number | null
} {
  const vermogenRef = useRef<HTMLDivElement | null>(null)
  const samenstellingRef = useRef<HTMLDivElement | null>(null)
  const [gemeten, setGemeten] = useState<number | null>(null)
  const plot = actief ? (gemeten ?? startPlot) : startPlot

  // De meting hoort bij de plot die werkelijk in de DOM staat (commit-fase).
  const plotRef = useRef<number | null>(plot)
  const vermogenPlotRef = useRef<number | null>(vermogenPlot)
  useLayoutEffect(() => {
    plotRef.current = plot
    vermogenPlotRef.current = vermogenPlot
  }, [plot, vermogenPlot])

  useEffect(() => {
    if (!actief || typeof ResizeObserver === 'undefined') return
    const vermogenLaag = vermogenRef.current
    const samenstellingLaag = samenstellingRef.current
    if (!vermogenLaag || !samenstellingLaag) return
    let observer: ResizeObserver | null = null
    const meet = () => {
      const vermogen = vermogenLaag.firstElementChild as HTMLElement | null
      const samenstelling = samenstellingLaag.firstElementChild as HTMLElement | null
      if (!vermogen || !samenstelling) return
      // Een grafiek die later laadt, vervangt zijn kind: volg ook het nieuwe kind.
      observer?.observe(vermogen)
      observer?.observe(samenstelling)
      const huidig = plotRef.current
      const vPlot = vermogenPlotRef.current
      if (huidig == null || vPlot == null) return
      const volgende = samenstellingPlotPassend({
        vermogenHoogte: vermogen.offsetHeight,
        samenstellingHoogte: samenstelling.offsetHeight,
        huidigePlot: huidig,
        vermogenPlot: vPlot,
      })
      if (volgende == null) return
      setGemeten((vorige) => {
        const basis = vorige ?? huidig
        return Math.abs(basis - volgende) < DREMPEL_PX ? vorige : volgende
      })
    }
    observer = new ResizeObserver(meet)
    // De lagen zelf volgen de cel; hun inhoud draagt de natuurlijke hoogte.
    observer.observe(vermogenLaag)
    observer.observe(samenstellingLaag)
    // Geen directe meting: een ResizeObserver meldt elk nieuw doel meteen één keer.
    return () => observer?.disconnect()
  }, [actief])

  return { vermogenRef, samenstellingRef, samenstellingPlot: plot }
}
