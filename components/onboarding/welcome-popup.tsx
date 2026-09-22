'use client'

import { useEffect, useId, useRef, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useFocusTrap } from '@/lib/hooks/use-focus-trap'
import { acquireOverlay } from '@/lib/overlay-signal'

/**
 * Welkomstpopup vóór stap 1 — een rustig "lees-en-begin"-moment.
 *
 * Editorial centered modal (NIET een bottom-sheet): begroeting, filosofie, twee
 * regels over wat de app doet, en een korte vooruitblik op de onboarding met de
 * CTA "Start de onboarding →". Bewust kort (B-052, 19 sep 2026): de vier
 * waardes die hier van 17 tot 19 sep 2026 stonden zijn verhuisd naar
 * `lib/onboarding/waardes.ts` en horen op het successcherm ná de onboarding
 * (W-015) — het moment waarop er data staat om ze waar te maken. Vóór 17 sep
 * was dit twee alinea's proza waarin een nieuwe gebruiker nergens las wát de
 * app voor 'm doet; de twee regels hieronder zeggen dat nu in één adem.
 *
 * **Render-strategie**:
 * - `createPortal` naar document.body — modal staat los van de onboarding-
 *   shell zodat de focus-trap niet vecht met de step-transition-wrapper.
 * - Centered op desktop én mobile via `fixed inset-0 flex items-center`,
 *   met `p-4` zodat op smalle schermen de card altijd buiten de safe-area
 *   blijft. Inner card is `max-w-lg` — leesbreedte voor proza, zonder
 *   overweldigend te worden — en scrollt intern (`max-h-[calc(100dvh-2rem)]`)
 *   als vangnet voor een heel korte telefoon.
 * - Scherpe hoeken (editorial-DNA), 1px ink-border voor het krant-effect.
 *   Geen schaduw — backdrop-blur op de overlay levert de diepte.
 * - Geen close-X: de gebruiker sluit uitsluitend via de primaire CTA.
 *   Reden: forceer lezen, voorkom een afwijzing-pad waarbij iemand de
 *   filosofie wegklikt zonder ze gezien te hebben. Wel ESC-key (a11y).
 *
 * **A11y**:
 * - `role="dialog"` + `aria-modal="true"` + `aria-labelledby` op de H1.
 * - Focus-trap zodra de popup open is, initial-focus op de primary CTA.
 * - Returns focus naar de trigger (in dit geval het wrapper-element van
 *   de onboarding-page) wanneer de popup sluit.
 * - `prefers-reduced-motion`: skipt de fade-in.
 *
 * **Props**: `onDismiss` is de enige interactie — caller is verantwoordelijk
 * voor de localStorage-write die voorkomt dat de popup opnieuw verschijnt
 * bij refresh. We doen die write hier bewust niet, zodat de popup ook in
 * een test-context (zonder localStorage-mock) zuiver gebruikt kan worden.
 */
export interface WelcomePopupProps {
  onDismiss: () => void
  /**
   * De vier accent-CSS-vars van deze gebruiker. Nodig omdat deze popup naar
   * `document.body` portalt en dus BUITEN de wrapper van de onboarding-pagina
   * valt: zonder deze meegift zou hij in de standaardkleuren verschijnen
   * terwijl het scherm eronder de getrokken kleuren draagt.
   */
  colorVars?: CSSProperties
}

export function WelcomePopup({ onDismiss, colorVars }: WelcomePopupProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const ctaRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  // SSR-guard — createPortal mag pas mounten zodra document beschikbaar is.
  // We slaan de mounted-state niet apart op; in plaats daarvan checken we
  // `typeof document` direct en returnen null tijdens server-render.

  useFocusTrap({
    active: true,
    containerRef,
    initialFocusRef: ctaRef,
  })

  // De kaart scrollt intern zodra de tekst niet op één schermhoogte past
  // (heel kleine telefoon). De focus-trap zet de focus op de CTA onderaan en
  // de browser scrolt die in beeld — waardoor de popup halverwege opende en de
  // begroeting bóven de vouw verdween (gezien op 390×844). We zetten de kaart
  // daarom na die focus expliciet terug naar boven. De focus blijft op de CTA,
  // dus de focus-trap en het toetsenbordgedrag veranderen niet.
  //
  // De rAF is geen slag in de lucht: `useFocusTrap` focust zélf in een
  // requestAnimationFrame. Die hook wordt hierboven aangeroepen, dus zijn
  // callback staat als eerste in de wachtrij van dezelfde frame; de onze draait
  // er direct achteraan en overschrijft de scroll-bijwerking van `.focus()`.
  // Een gewone effect-body zou juist TE VROEG zijn (gemeten: scrollTop bleef op
  // 101 op 390×844, 402 op 360×640).
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (containerRef.current) containerRef.current.scrollTop = 0
    })
    return () => cancelAnimationFrame(id)
  }, [])

  // Verberg de zwevende nav-pill zolang deze popup open is (ADR 0039). Bewust
  // géén BottomSheet-migratie: gedocumenteerd editorial centered modal (NIET
  // een bottom-sheet) zonder X-sluitknop — alleen het pill-signaal wordt
  // gedeeld met het overlay-systeem. Zie overlay-signal.ts.
  useEffect(() => acquireOverlay(), [])

  // ESC sluit de popup — minimale a11y-affordance, ook al is er geen X-knop.
  // We willen niet dat een gebruiker zonder muis vastzit in de dialog. ESC is
  // de gangbare keyboard-exit voor modals en breekt de "forceer lezen"-bedoeling
  // niet — wie ESC drukt heeft bewust gekozen.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onDismiss()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onDismiss])

  // SSR-safe: alleen mounten zodra document beschikbaar is. Onboarding draait
  // als client-component dus dit is in praktijk altijd waar; defensive code.
  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-[var(--scrim)] p-4 backdrop-blur-[var(--scrim-blur)] motion-safe:animate-[welcome-fade-in_180ms_ease-out_both]"
      style={colorVars}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        ref={containerRef}
        className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto border border-[var(--ink)] bg-[var(--paper)] p-7 sm:p-9"
      >
        {/* Kicker-rij: 28×1px module-streep + WELKOM in mono — editorial
            patroon-kaart Kicker-streep (ui-ux skill). */}
        <div className="mb-5 flex items-center gap-2.5">
          <span
            aria-hidden
            className="inline-block h-px w-7"
            style={{ background: 'var(--module-active-500)' }}
          />
          <span className="font-mono text-[10px] uppercase tracking-[0.20em] text-[var(--module-active-700)]">
            Welkom
          </span>
        </div>

        {/* H1 — Playfair black, italic-em op "TriFinity". We laten de
            font-family door var(--font-playfair) leveren zodat de pagina-
            scope (Next.js next/font) consistent blijft. */}
        <h1
          id={titleId}
          className="font-serif text-3xl font-bold leading-tight text-[var(--ink)] sm:text-4xl"
          style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
        >
          Welkom bij{' '}
          <em
            className="font-normal italic"
            style={{ color: 'var(--module-active-700)' }}
          >
            TriFinity
          </em>
        </h1>

        {/* Tagline — Source Serif italic, 17px. Subtiele bovenmarge zodat ze
            visueel aan de headline blijft hangen. */}
        <p
          className="mt-3 font-serif text-[17px] italic leading-snug text-[var(--ink-2)]"
          style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
        >
          Geld levert tijd op.
        </p>

        {/* Twee regels over wat de app doet — in beloftes, niet in features
            (B-052). Copy-grens: beschrijft wat de app TOONT, geen advies of
            opbrengstbelofte (Wft). */}
        <p
          className="mt-6 font-serif text-[15px] leading-relaxed text-[var(--ink-2)]"
          style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
        >
          TriFinity telt op wat je hebt en wat er elke maand omgaat, en rekent
          dat om naar tijd: de datum waarop werken een keuze wordt. Fin laat
          zien wat één keuze met die datum doet.
        </p>

        <p className="mt-5 text-[13px] leading-snug text-[var(--ink-3)]">
          We beginnen met een korte onboarding: een paar vragen, in een paar
          minuten klaar. Alles wat je invult, kun je later nog aanpassen.
        </p>

        {/* CTA-rij — rechts-uitgelijnd, primary alleen. Geen secundaire actie
            (zoals "skip" of "X") want het hele punt van deze popup is dat de
            gebruiker bewust begint. */}
        <div className="mt-8 flex justify-end">
          <button
            ref={ctaRef}
            type="button"
            onClick={onDismiss}
            className="inline-flex min-h-11 items-center justify-center bg-[var(--ink)] px-6 py-3 text-sm font-medium text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
          >
            Start de onboarding &rarr;
          </button>
        </div>
      </div>

      {/* Local keyframes — scoped via @keyframes naam zodat we niet met
          andere modal-animaties botsen. `motion-safe:` Tailwind-modifier
          schakelt de animatie uit voor users met reduce-motion. */}
      <style jsx>{`
        @keyframes welcome-fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
      `}</style>
    </div>,
    document.body,
  )
}
