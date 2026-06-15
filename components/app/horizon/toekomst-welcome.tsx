'use client'

/**
 * ToekomstWelcome — eenmalige welkomsttekst bovenaan de /toekomst-grafiek.
 *
 * STAAT LOS van de ballonnen-overlay: dit is een editorial banner (eigen
 * element), geen ballon. Toont bij het eerste bezoek:
 *   • een korte begroeting,
 *   • DIRECT het netto vermogen als eerste concrete waarde — in euro's én in
 *     vrijheidstijd (Geld is opgeslagen tijd),
 *   • dat de prognose een schatting is (jouw gegevens + slimme aannames),
 *   • dat de instellingen al voor je klaarstaan (geen aparte setup nodig).
 *
 * First-visit-only: de parent geeft `visible` (afgeleid van de server-marker
 * `hasSeenWelcome`) en markeert bij eerste render de slug `horizon_welcome_shown`.
 * Verdwijnt na dismiss en komt NIET terug via de overlay-toggle.
 *
 * Geen eigen rekenlogica — netto vermogen + dagtarief komen van de parent.
 */

import { useEffect, useRef } from 'react'
import { Sparkles, X } from 'lucide-react'
import { formatWithFreedom } from '@/lib/format'
import { MaskedAmount } from '@/components/app/masked-amount'

export interface ToekomstWelcomeProps {
  /** Of de banner zichtbaar is (first-visit-only, door parent bepaald). */
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
  // Bij eerste render één keer de marker zetten zodat de banner nooit terugkomt
  // (ook niet als de gebruiker 'm niet expliciet wegklikt).
  const markedRef = useRef(false)
  useEffect(() => {
    if (!visible || markedRef.current) return
    markedRef.current = true
    // Fire-and-forget — bij failure verschijnt de banner hooguit nog een keer.
    fetch('/api/feature-visits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature_slug: 'horizon_welcome_shown' }),
    }).catch(() => {})
  }, [visible])

  if (!visible) return null

  const freedom =
    !masked && dailyExpenseRate > 0 && netWorth > 0
      ? formatWithFreedom(netWorth, dailyExpenseRate, {
          includeCurrency: false,
          format: 'long',
          includeDays: false,
        })
      : null

  return (
    /* role="note" + aria-label zodat screenreaders de banner identificeren.
       De sluit-knop staat visueel rechtsboven (absolute) maar staat in de DOM
       NA de inhoud — zo hoort een SR-gebruiker eerst de tekst, dan de knop. */
    <div
      role="note"
      aria-label="Welkomsttekst"
      className="relative mb-5 bg-[var(--paper)] p-4 sm:p-5"
      style={{
        border: '1px solid var(--ink)',
        borderLeftWidth: '4px',
        borderLeftColor: 'var(--module-active-500)',
      }}
    >
      {/* Kicker: 10px mono uppercase — gebruik -800 voor WCAG AA contrast op lichte achtergrond. */}
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.20em] text-[var(--module-active-800)]">
        <Sparkles className="h-3.5 w-3.5" aria-hidden />
        Welkom op je toekomst :)
      </div>

      <p
        className="mt-2 max-w-[60ch] text-[15px] italic leading-relaxed text-[var(--ink-2)]"
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
        . De prognose hieronder is een <span className="not-italic font-semibold text-[var(--ink)]">schatting</span> op
        basis van je gegevens en een paar slimme aannames — je instellingen staan
        al klaar, je hoeft niets eerst in te stellen. Wil je 'm scherper maken?
        Volg de tips bij de grafiek.
      </p>

      {/* Sluit-knop staat in DOM ná de inhoud zodat screenreader-gebruikers
          eerst de boodschap horen; visueel rechtsboven via absolute positioning. */}
      <button
        type="button"
        onClick={onDismiss}
        className="absolute right-2.5 top-2.5 inline-flex h-7 w-7 items-center justify-center rounded-full text-[var(--ink-4)] transition-colors hover:text-[var(--ink-2)]"
        aria-label="Welkomsttekst sluiten"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  )
}
