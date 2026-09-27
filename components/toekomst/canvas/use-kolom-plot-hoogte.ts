'use client'

/**
 * `useKolomPlotHoogte` — de harp is maatgevend (eigenaarsbesluit 27 sep).
 *
 * Meet in katern Doelen, op desktop, twee NATUURLIJKE hoogtes met een ResizeObserver:
 * - de lab-kolom (het lab zelf, zonder de acties; die staan eronder in de actierij);
 * - de grafiekkolom (`lg:self-start`, dus niet door de gridrij uitgerekt).
 * Daaruit volgt de plothoogte waarbij de grafiekkolom even hoog is als de lab-kolom
 * (`kolomPlotHoogte`, pure som in `canvas-stand.ts`). Omdat beide hoogtes natuurlijk zijn
 * en de chrome niet van de plot afhangt, stabiliseert dat na één ronde: geen feedback-lus.
 *
 * De uitkomst wordt ONTHOUDEN zolang de canvas gemonteerd is. De canvas staat in de
 * `(katern)`-layout en blijft staan bij een katernwissel, dus Plan krijgt dezelfde maat
 * en de grafiek verspringt niet bij Plan ↔ Doelen. Vóór de eerste meting: `null`, en
 * `canvasStand` kiest dan `KOLOM_PLOTHOOGTE.start`.
 *
 * `huidigePlot` wordt in een layout-effect vastgelegd (commit-fase), zodat een meting
 * altijd bij de plot hoort die werkelijk in de DOM staat — ook als React een render
 * onderbreekt.
 */

import { useEffect, useLayoutEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from 'react'
import { kolomPlotHoogte as berekenKolomPlotHoogte } from './canvas-stand'

/** Kleinere verschillen dan dit negeren we (afronding, subpixels): geen trilling. */
const DREMPEL_PX = 2

export interface KolomMeetRefs {
  /** Op de kolom-inhoud (het lab, natuurlijke hoogte). */
  kolomRef: RefObject<HTMLDivElement | null>
  /** Op de grafiekkolom (natuurlijke hoogte). */
  grafiekRef: RefObject<HTMLDivElement | null>
}

/**
 * De onthouden maat zelf is state van de canvas (`setOnthouden`): de stand van het canvas
 * leest hem al vóór deze hook, die de plot van diezelfde stand nodig heeft.
 */
export function useKolomPlotHoogte({
  meten,
  huidigePlot,
  setOnthouden,
}: {
  /** Alleen meten waar de kolom maatgevend is: Doelen, desktop, met een kolom. */
  meten: boolean
  /** De plothoogte die nu getekend is (`stand.plotHoogte`). */
  huidigePlot: number | null
  /** Schrijft de onthouden plothoogte (state van de canvas). */
  setOnthouden: Dispatch<SetStateAction<number | null>>
}): KolomMeetRefs {
  const kolomRef = useRef<HTMLDivElement | null>(null)
  const grafiekRef = useRef<HTMLDivElement | null>(null)
  const plotRef = useRef<number | null>(huidigePlot)

  useLayoutEffect(() => {
    plotRef.current = huidigePlot
  }, [huidigePlot])

  useEffect(() => {
    if (!meten || typeof ResizeObserver === 'undefined') return
    const kolom = kolomRef.current
    const grafiek = grafiekRef.current
    if (!kolom || !grafiek) return
    const meet = () => {
      const plot = plotRef.current
      if (plot == null) return
      const volgende = berekenKolomPlotHoogte({
        kolomHoogte: kolom.offsetHeight,
        grafiekKolomHoogte: grafiek.offsetHeight,
        huidigePlot: plot,
      })
      if (volgende == null) return
      setOnthouden((vorige) => (vorige != null && Math.abs(vorige - volgende) < DREMPEL_PX ? vorige : volgende))
    }
    const observer = new ResizeObserver(meet)
    observer.observe(kolom)
    observer.observe(grafiek)
    return () => observer.disconnect()
  }, [meten, setOnthouden])

  return { kolomRef, grafiekRef }
}
