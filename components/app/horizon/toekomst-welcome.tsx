'use client'

/**
 * ToekomstWelcome — eenmalig welkomstbericht als full-page overlay over /toekomst.
 *
 * STAAT LOS van de markers-overlay: dit is een echte modale overlay die bij het
 * EERSTE bezoek de hele pagina vervaagt/dimt en de aandacht volledig naar één
 * kaart trekt. De kaart toont:
 *   • een korte begroeting,
 *   • DIRECT het netto vermogen als eerste concrete waarde — in euro's én in
 *     vrijheidstijd (Geld is opgeslagen tijd),
 *   • dat de prognose een schatting is (jouw gegevens + slimme aannames),
 *   • dat de instellingen al voor je klaarstaan (geen aparte setup nodig).
 * Wegklikken (✕ / "Bekijk je grafiek" / Escape / klik op de achtergrond) onthult
 * de grafiek met de aanscherp-markers eromheen.
 *
 * First-visit-only: de parent geeft `visible` (afgeleid van de server-marker
 * `hasSeenWelcome`) en bij eerste render wordt de slug `horizon_welcome_shown`
 * gemarkeerd. Verdwijnt na dismiss en komt NIET terug via de overlay-toggle.
 *
 * Rendert via een portal naar document.body zodat `fixed inset-0` altijd de hele
 * viewport dekt — ook als een voorouder een transform/filter heeft (dat zou een
 * containing block voor `fixed` maken).
 *
 * Geen eigen rekenlogica — netto vermogen + dagtarief komen van de parent.
 */

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Sparkles, X, ArrowRight } from 'lucide-react'
import { formatWithFreedom } from '@/lib/format'
import { MaskedAmount } from '@/components/app/masked-amount'
import { useFocusTrap } from '@/lib/hooks/use-focus-trap'

export interface ToekomstWelcomeProps {
  /** Of de overlay zichtbaar is (first-visit-only, door parent bepaald). */
  visible: boolean
  /** Netto vermogen (bezittingen − schulden). Eerste concrete waarde. */
  netWorth: number
  /** Dagtarief (uitgaven per dag) voor de €→vrijheidstijd-omrekening. */
  dailyExpenseRate: number
  /** Of bedragen gemaskeerd zijn (privacy-modus). */
  masked: boolean
  /** Markeer de welkomsttekst als gezien (POST naar feature-visits) + lokaal weg. */
  onDismiss: () => void
}

export function ToekomstWelcome({
  visible,
  netWorth,
  dailyExpenseRate,
  masked,
  onDismiss,
}: ToekomstWelcomeProps) {
  // Portal pas na mount (document bestaat niet tijdens SSR).
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // Focus trap: bij openen focus op de primaire CTA, Tab blijft binnen de kaart,
  // en bij sluiten keert focus terug naar de vorige owner. `active` pas zodra de
  // kaart daadwerkelijk gerenderd is (visible && mounted) zodat de refs bestaan.
  const cardRef = useRef<HTMLDivElement>(null)
  const ctaRef = useRef<HTMLButtonElement>(null)
  useFocusTrap({ active: visible && mounted, containerRef: cardRef, initialFocusRef: ctaRef })

  // Bij eerste render één keer de marker zetten zodat de overlay nooit terugkomt
  // (ook niet als de gebruiker 'm niet expliciet wegklikt).
  const markedRef = useRef(false)
  useEffect(() => {
    if (!visible || markedRef.current) return
    markedRef.current = true
    // Fire-and-forget — bij failure verschijnt de overlay hooguit nog een keer.
    fetch('/api/feature-visits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature_slug: 'horizon_welcome_shown' }),
    }).catch(() => {})
  }, [visible])

  // Body-scroll-lock + Escape-to-dismiss zolang de overlay open is.
  useEffect(() => {
    if (!visible) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [visible, onDismiss])

  if (!visible || !mounted) return null

  const freedom =
    !masked && dailyExpenseRate > 0 && netWorth > 0
      ? formatWithFreedom(netWorth, dailyExpenseRate, {
          includeCurrency: false,
          format: 'long',
          includeDays: false,
        })
      : null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Welkom op je toekomst"
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
    >
      {/* Achtergrond: hele pagina vervaagt + dimt. Klik sluit (standaard modal). */}
      <div
        aria-hidden
        onClick={onDismiss}
        className="absolute inset-0 cursor-default bg-[var(--ink)]/30 backdrop-blur-md"
      />

      {/* Welkomstkaart — editorial, met horizon-accent. */}
      <div
        ref={cardRef}
        className="relative w-full max-w-lg bg-[var(--paper)] p-5 shadow-xl motion-safe:animate-sheet-enter sm:p-7"
        style={{
          border: '1px solid var(--ink)',
          borderLeftWidth: '4px',
          borderLeftColor: 'var(--module-active-500)',
        }}
      >
        {/* Kicker: 10px mono uppercase — -800 voor WCAG AA contrast. */}
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.20em] text-[var(--module-active-800)]">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          Welkom op je toekomst :)
        </div>

        <p
          className="mt-3 max-w-[60ch] text-[15px] italic leading-relaxed text-[var(--ink-2)]"
          style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
        >
          Je staat er nu zo voor — je netto vermogen is{' '}
          <span className="font-mono tabular-nums not-italic font-semibold text-[var(--ink)]">
            <MaskedAmount value={netWorth} tone="horizon" />
          </span>
          {freedom ? (
            <>
              , oftewel{' '}
              <span className="not-italic font-semibold text-[var(--module-active-700)]">
                {freedom} vrijheid
              </span>
            </>
          ) : null}
          . De prognose hierachter is een{' '}
          <span className="not-italic font-semibold text-[var(--ink)]">schatting</span> op
          basis van je gegevens en een paar slimme aannames — je instellingen staan
          al klaar, je hoeft niets eerst in te stellen. Wil je 'm scherper maken? Volg
          de tips bij de grafiek.
        </p>

        {/* Primaire afsluit-knop — onthult de grafiek + markers. */}
        <div className="mt-5 flex justify-end">
          <button
            ref={ctaRef}
            type="button"
            onClick={onDismiss}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-[var(--r-sm)] border border-[var(--module-active-300)] bg-[var(--module-active-50)] px-4 py-1.5 font-sans text-[13px] font-medium text-[var(--module-active-800)] transition-colors hover:bg-[var(--module-active-100)]"
          >
            Bekijk je grafiek
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {/* Sluit-knop rechtsboven. */}
        <button
          type="button"
          onClick={onDismiss}
          className="absolute right-2.5 top-2.5 inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--ink-4)] transition-colors hover:text-[var(--ink-2)]"
          aria-label="Welkomsttekst sluiten"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>,
    document.body,
  )
}
