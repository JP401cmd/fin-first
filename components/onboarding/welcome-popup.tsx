'use client'

import { useEffect, useId, useRef, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useFocusTrap } from '@/lib/hooks/use-focus-trap'
import { acquireOverlay } from '@/lib/overlay-signal'

/**
 * Welkomstpopup vóór stap 1 — een rustig "lees-en-begin"-moment.
 *
 * Editorial centered modal (NIET een bottom-sheet): begroeting, filosofie, de
 * vier waardes van de app (elk in zijn eigen accent), en een korte vooruitblik
 * op wat de gebruiker te wachten staat. De vier waardes kwamen er op 17 sep
 * 2026 bij — tot dan was dit puur proza, en las een nieuwe gebruiker nergens
 * wát de app voor 'm doet.
 *
 * **Render-strategie**:
 * - `createPortal` naar document.body — modal staat los van de onboarding-
 *   shell zodat de focus-trap niet vecht met de step-transition-wrapper.
 * - Centered op desktop én mobile via `fixed inset-0 flex items-center`,
 *   met `p-4` zodat op smalle schermen de card altijd buiten de safe-area
 *   blijft. Inner card is `max-w-lg` — leesbreedte voor proza, zonder
 *   overweldigend te worden — en scrollt intern (`max-h-[calc(100dvh-2rem)]`)
 *   zodat de vier waardes ook op een korte telefoon volledig bereikbaar zijn.
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

/**
 * De vier waardes waar TriFinity om draait, elk in zijn eigen accent. De popup
 * is het eerste moment waarop die kleurtaal wordt geïntroduceerd; vanaf stap 1
 * kleurt elke vraag mee met de hefboom waar hij over gaat (`STEP_ACCENT`).
 *
 * **Over de toewijzing — er zijn vier accenten en drie hefbomen, dus hij kan
 * niet overal kloppen.** De accenten heten op /mijn/uiterlijk Bezittingen
 * (`kern`) · Schulden (`wil`) · Budget (`horizon`) · Fin (`fin`). Drie waardes
 * vallen daar exact op: "wat je hebt" → kern, "wat er omgaat" → horizon,
 * "waar je op kunt sturen" → fin. De vierde, "waar het op uitloopt", heeft
 * geen eigen hefboom — er ís geen Toekomst-accent — en krijgt daarom het
 * overgebleven accent (`wil`). Noem dat dus niet "de kleur van de toekomst":
 * dezelfde tint betekent in de stappen Schulden. Wie hier ooit betekenis aan
 * wil hangen, moet eerst een vijfde accent invoeren, niet de comment oprekken.
 *
 * Copy-grens: elke regel beschrijft wat de app TOONT, nooit wat de gebruiker
 * zou moeten doen of wat iets gaat opleveren — inzicht mag, advies niet
 * (Wft-grens, zie de compliance-check-skill).
 */
const WAARDES: { kicker: string; belofte: string; toelichting: string; accent: string }[] = [
  {
    kicker: 'Wat je hebt',
    belofte: 'Je vermogen in euro’s én in jaren.',
    toelichting:
      'We tellen je bezittingen, schulden en pensioen bij elkaar op, en rekenen dat bedrag om naar de tijd die het je vrij koopt.',
    accent: 'kern',
  },
  {
    kicker: 'Wat er omgaat',
    belofte: 'Elke maand zie je wat je vrijkoopt.',
    toelichting:
      'Je ziet wat er binnenkomt, waar het heen gaat en wat je overhoudt — inclusief de abonnementen die stilletjes blijven lopen.',
    accent: 'horizon',
  },
  {
    kicker: 'Waar het op uitloopt',
    belofte: 'De datum waarop werken een keuze wordt.',
    toelichting:
      'We rekenen je plan door op je eigen cijfers en schuiven die datum mee zodra er iets verandert.',
    accent: 'wil',
  },
  {
    kicker: 'Waar je op kunt sturen',
    belofte: 'Zie wat één keuze met die datum doet.',
    toelichting:
      'Fin rekent mee, wijst aan welke knop het zwaarst weegt en laat zien wat er gebeurt als je eraan draait.',
    accent: 'fin',
  },
]

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

  // De kaart scrollt intern zodra de vier waardes niet op één schermhoogte
  // passen (kleine telefoon). De focus-trap zet de focus op de CTA onderaan en
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
          Geld is opgeslagen tijd.
        </p>

        {/* Eén alinea proza die de toon zet, daarna de vier waardes. Tot
            17 sep 2026 stonden hier twee alinea's en verder niets: mooi, maar
            een nieuwe gebruiker las nergens wát de app nu eigenlijk voor 'm
            doet. De vier waardes zeggen dat — in beloftes, niet in features. */}
        <p
          className="mt-6 font-serif text-[15px] leading-relaxed text-[var(--ink-2)]"
          style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
        >
          TriFinity leest je geldzaken als een dagblad: elke ochtend een kort
          bericht over hoe je ervoor staat. Vier dingen houdt het voor je bij.
        </p>

        {/* De vier waardes — elk met de kicker-streep in zijn eigen accent
            (editorial patroon-kaart *Kicker-streep*). Dezelfde vier kleuren
            kleuren straks de vragen en de hele app, dus dit is meteen de
            introductie van de kleurtaal. */}
        <ul className="mt-6 space-y-5">
          {WAARDES.map((waarde) => (
            <li key={waarde.kicker} className="flex gap-3">
              <span
                aria-hidden
                className="mt-[9px] h-px w-5 shrink-0"
                style={{ background: `var(--color-${waarde.accent}-500)` }}
              />
              <div className="min-w-0">
                <p
                  className="font-mono text-[10px] uppercase tracking-[0.20em]"
                  style={{ color: `var(--color-${waarde.accent}-700)` }}
                >
                  {waarde.kicker}
                </p>
                <p
                  className="mt-1 font-serif text-[15px] font-semibold leading-snug text-[var(--ink)]"
                  style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
                >
                  {waarde.belofte}
                </p>
                <p className="mt-1 text-[13px] leading-snug text-[var(--ink-3)]">
                  {waarde.toelichting}
                </p>
              </div>
            </li>
          ))}
        </ul>

        <p className="mt-6 text-[13px] leading-snug text-[var(--ink-3)]">
          Daarvoor beginnen we met een paar korte vragen, in een paar minuten
          klaar. Alles wat je invult, kun je later nog aanpassen.
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
            Begin &rarr;
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
