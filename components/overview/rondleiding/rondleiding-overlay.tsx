'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useFocusTrap } from '@/lib/hooks/use-focus-trap'
import { useOverlayOpen } from '@/lib/hooks/use-scroll-lock'
import type { RondleidingPlatform, RondleidingStap, RondleidingStapBody } from '@/lib/rondleiding/steps'
import {
  RondleidingKaart,
  RONDLEIDING_BODY_ID,
  RONDLEIDING_TITEL_ID,
} from './rondleiding-kaart'
import { SpotlightScrim } from './spotlight-scrim'
import { useSpotlightRect } from './use-spotlight-rect'

/**
 * RondleidingOverlay — de spotlight-laag van de rondleiding op /overzicht
 * (ADR 0130, fase 3b).
 *
 * ══ GEDOCUMENTEERDE UITZONDERING op de ShellOverlay-driewegregel ═════════
 *
 * CLAUDE.md schrijft voor dat elke nieuwe overlay via `<ShellOverlay>` loopt.
 * Deze niet, en dat is een bewuste keuze met één harde reden: **het uitgelichte
 * element moet interactief blijven**. Een ShellOverlay (of welke `fixed
 * inset-0`-laag dan ook) legt één vlak over de hele viewport en vangt daarmee
 * élke klik; de laatste stap wijst naar de nav-pill respectievelijk Fins eigen
 * knop, en op een hefboomtegel tikken tijdens de tour is toegestaan gedrag (dat
 * beëindigt 'm als `onderbroken`). Vandaar vier scrim-panelen rond een gat.
 *
 * Uit diezelfde keuze volgen drie dingen die hier bewust ANDERS zijn:
 *
 *  1. **Geen `acquireOverlay()`.** Zou de nav-pill zichzelf laten verbergen —
 *     precies het element dat de mobiele slotstap uitlicht.
 *  2. **Geen scroll-lock.** De spotlight scrollt juist naar elk volgend
 *     element toe; de pagina moet dus mee kunnen bewegen.
 *  3. **`aria-modal="false"`.** Er is geen modale afsluiting: alles buiten de
 *     kaart blijft bereikbaar. Wél een focus-trap op de kaart zelf, zodat
 *     Tab niet stilletjes achter de scrim verdwijnt, en een altijd gemounte
 *     `aria-live`-regio die elke stapwissel aankondigt.
 *
 * Fin zwijgt intussen via `lib/rondleiding/signal.ts`, niet via de
 * overlay-teller — zie de kop van dat bestand.
 *
 * ══ Wél verbergen bij een ÉCHTE overlay ══════════════════════════════════
 *
 * Opent er tijdens de tour toch een gewone modal (de gebruiker tikt de
 * gezondheidskaart open), dan zou de spotlight er dwars doorheen prikken: beide
 * zitten op `z-[70]`. `visibility: hidden` zolang `useOverlayOpen()` waar is
 * lost dat op zonder de tour te beëindigen — sluit de sheet, en de spotlight
 * staat er weer.
 */

export function RondleidingOverlay({
  stap,
  body,
  index,
  totaal,
  platform,
  afscheid,
  onVorige,
  onVolgende,
  onOverslaan,
  onEersteStap,
  onRondkijken,
  onStart,
  onTargetOntbreekt,
}: {
  stap: RondleidingStap
  body: RondleidingStapBody
  index: number
  totaal: number
  platform: RondleidingPlatform
  afscheid: boolean
  onVorige: () => void
  onVolgende: () => void
  onOverslaan: () => void
  onEersteStap: () => void
  onRondkijken: () => void
  onStart: () => void
  /** Het element van deze stap bestaat na de zoekdeadline niet — stap over. */
  onTargetOntbreekt: () => void
}) {
  const [gemount, setGemount] = useState(false)
  useEffect(() => setGemount(true), [])

  const kaartRef = useRef<HTMLDivElement>(null)
  const overlayVerbergen = useOverlayOpen()

  const selector = stap.target?.[platform] ?? null
  const rect = useSpotlightRect(selector, {
    enabled: gemount && !overlayVerbergen,
    onMissing: onTargetOntbreekt,
  })

  useFocusTrap({ active: gemount && !overlayVerbergen, containerRef: kaartRef })

  // Toetsenbord: Esc = overslaan, →/Enter = volgende, ← = vorige. Op `document`
  // en niet op de kaart: de focus mag tijdens de tour ook op de pagina liggen
  // (het gat is interactief), en de toetsen horen dan nog steeds te werken.
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      // Staat er een échte overlay bovenop (de gezondheidskaart als sheet), dan
      // is deze laag onzichtbaar én hoort Esc bij DIE laag. BottomSheet luistert
      // óók op `document`; zonder deze guard sloot één Esc de sheet én
      // beëindigde hij de rondleiding als `overgeslagen` — onzichtbaar, en
      // onomkeerbaar voor de autostart.
      if (overlayVerbergen) return
      if (e.key === 'Escape') {
        e.preventDefault()
        onOverslaan()
        return
      }
      // Laat toetsaanslagen in een invoerveld met rust.
      const doel = e.target as HTMLElement | null
      if (doel && /^(INPUT|TEXTAREA|SELECT)$/.test(doel.tagName)) return
      if (e.key === 'ArrowRight' || e.key === 'Enter') {
        // Enter op een knop is de knop zelf; dan niet ook nog doorstappen.
        if (e.key === 'Enter' && doel?.tagName === 'BUTTON') return
        e.preventDefault()
        onVolgende()
        return
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        onVorige()
      }
    },
    [overlayVerbergen, onOverslaan, onVolgende, onVorige],
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [handleKey])

  if (!gemount || typeof document === 'undefined') return null

  return createPortal(
    <div
      data-testid="rondleiding-overlay"
      role="dialog"
      aria-modal="false"
      aria-labelledby={RONDLEIDING_TITEL_ID}
      aria-describedby={RONDLEIDING_BODY_ID}
      className="fixed inset-0 z-[70] pointer-events-none"
      style={overlayVerbergen ? { visibility: 'hidden' } : undefined}
    >
      {/* Altijd gemount, ook tussen stappen door: een aria-live-regio die pas
          bij een wissel in de boom verschijnt, kondigt de eerste stap niet aan. */}
      <p aria-live="polite" className="sr-only">
        {`Stap ${index + 1} van ${totaal} — ${stap.titel}`}
      </p>

      {/* Op de welkomstkaart (geen gat) is het hele scherm scrim: één misklik
          ernaast zou de eenmalige autostart definitief als 'overgeslagen'
          wegschrijven. Daar sluit alleen de knop of Esc; bij een spotlight blijft
          de scrim-tik een uitweg. */}
      <SpotlightScrim rect={rect} onScrimClick={rect ? onOverslaan : undefined} />

      <RondleidingKaart
        stap={stap}
        body={body}
        index={index}
        totaal={totaal}
        rect={rect}
        platform={platform}
        afscheid={afscheid}
        onVorige={onVorige}
        onVolgende={onVolgende}
        onOverslaan={onOverslaan}
        onEersteStap={onEersteStap}
        onRondkijken={onRondkijken}
        onStart={onStart}
        kaartRef={kaartRef}
      />
    </div>,
    document.body,
  )
}
