'use client'

import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useFocusTrap } from '@/lib/hooks/use-focus-trap'

/**
 * Welkomstpopup vóór stap 1 — een rustig "lees-en-begin"-moment.
 *
 * Editorial centered modal (NIET een bottom-sheet), met proza-tekst in Source
 * Serif italic. Geen feature-opsomming, geen bullets — alleen begroeting,
 * filosofie, en een korte vooruitblik op wat de gebruiker te wachten staat.
 *
 * **Render-strategie**:
 * - `createPortal` naar document.body — modal staat los van de onboarding-
 *   shell zodat de focus-trap niet vecht met de step-transition-wrapper.
 * - Centered op desktop én mobile via `fixed inset-0 flex items-center`,
 *   met `p-4` zodat op smalle schermen de card altijd buiten de safe-area
 *   blijft. Inner card is `max-w-md` — leesbreedte voor proza, zonder
 *   overweldigend te worden.
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
}

export function WelcomePopup({ onDismiss }: WelcomePopupProps) {
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ink)]/40 p-4 backdrop-blur-sm motion-safe:animate-[welcome-fade-in_180ms_ease-out_both]"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        ref={containerRef}
        className="w-full max-w-md border border-[var(--ink)] bg-[var(--paper)] p-7 sm:p-10"
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

        {/* Proza-paragrafen — geen lijst, geen bullets. Twee korte alinea's
            die de filosofie schetsen en het tijdpad benoemen. */}
        <div
          className="mt-6 space-y-4 font-serif text-[15px] leading-relaxed text-[var(--ink-2)]"
          style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
        >
          <p>
            TriFinity is je financieel dagblad: een rustig overzicht van wat je
            hebt, waar je naartoe wilt, en wat dat in tijd betekent. Geen klinisch
            dashboard, geen bankportaal.
          </p>
          <p>
            We beginnen met een paar korte vragen &mdash; ongeveer vier minuten.
            Alles wat je hier invult, pas je later aan.
          </p>
        </div>

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
