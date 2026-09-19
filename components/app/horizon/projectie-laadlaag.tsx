'use client'

import { useEffect, useState } from 'react'
import { FinDots } from '@/components/app/fin-dots'

/**
 * ProjectieLaadlaag — Fin's wachtstand ÓP de Toekomst-grafiek (B-057).
 *
 * Verschijnt zolang de getoonde projectie verouderd is: een herlaad van de
 * grondslag (`loadData`), een server-refresh (`router.refresh` in een transition)
 * of een hersolve van de hoofdlijn in de kernel-worker (`mainPending` uit
 * `useHorizonFireSim`). De ouder combineert die drie tot één `pending`.
 *
 * Vorm: hetzelfde gezicht als `MiniNetWorthChartAnchor` (/overzicht) en `FinLaden`
 * (plan-review) — "wachten heeft app-breed één gezicht": FinDots in `thinking`
 * + serif-italic microtekst in horizon-700. Géén backdrop, géén skeleton, géén
 * layout-shift: de oude lijn blijft (gedempt, zie `mainPending` op
 * `ChartStaticLayers`) zichtbaar onder de laag. Geen overlay in de conventie-zin
 * (geen focus-trap, geen `z-[70]`): lokale `z-10`, zoals de zoom-knoppen van
 * `ZoomableChartContainer` — en `pointer-events-none`, zodat hover/zoom blijven
 * werken.
 *
 * Toon-drempel (`PROJECTIE_LAADLAAG_DREMPEL_MS`): een hersolve van ~200 ms mag
 * niet flikkeren; pas boven de drempel wordt Fin zichtbaar. De `aria-live`-regio
 * blijft altijd gemount (meldingen-conventie) en kondigt "bijwerken" aan;
 * `prefers-reduced-motion` komt via `fin-dots.css`.
 */
export const PROJECTIE_LAADLAAG_DREMPEL_MS = 150
export const PROJECTIE_LAADLAAG_TEKST = 'Projectie bijwerken…'

export function ProjectieLaadlaag({
  pending,
  label = PROJECTIE_LAADLAAG_TEKST,
}: {
  pending: boolean
  label?: string
}) {
  const [zichtbaar, setZichtbaar] = useState(false)
  useEffect(() => {
    if (!pending) {
      setZichtbaar(false)
      return
    }
    const t = setTimeout(() => setZichtbaar(true), PROJECTIE_LAADLAAG_DREMPEL_MS)
    return () => clearTimeout(t)
  }, [pending])

  return (
    <div
      data-testid="projectie-laadlaag"
      data-zichtbaar={zichtbaar ? 'true' : 'false'}
      aria-live="polite"
      aria-busy={pending || undefined}
      className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
    >
      {zichtbaar && (
        <div className="flex flex-col items-center gap-2 rounded-full bg-[var(--paper)]/85 px-5 py-3">
          <span aria-hidden="true">
            <FinDots size={26} state="thinking" />
          </span>
          <p className="font-serif text-[11px] italic leading-none text-horizon-700">{label}</p>
        </div>
      )}
      {/* Schermlezer: alleen de tekst, en alleen zolang er echt gewacht wordt. */}
      {zichtbaar && <span className="sr-only">{label}</span>}
    </div>
  )
}
