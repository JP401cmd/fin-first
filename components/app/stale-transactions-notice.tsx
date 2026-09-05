'use client'

import Link from 'next/link'
import { AlertTriangle, Minus } from 'lucide-react'
import { useStaleNotice } from '@/components/app/stale-notice-provider'

/**
 * StaleNoticeCard — de zichtbare vorm van de "Gegevens verouderd"-melding.
 *
 * Gescheiden van `stale-transactions-banner.tsx` omdat dát bestand het
 * VERSHEIDSOORDEEL doet (en dus `new Date()` server-side moet blijven draaien):
 * een client-component die zelf de klok leest, rekent bij SSR én bij hydration
 * opnieuw en kan op een maandwissel een hydration-mismatch geven. Hier komen
 * alleen nog kant-en-klare strings binnen.
 *
 * COMPACT (B-015): één regel lopende tekst i.p.v. vier. De melding staat
 * bovenaan élk bezoek van /overzicht zolang er niet geïmporteerd is; ze mag dus
 * geen blok zijn. Wat overblijft is de kern — wélke maand, en de uitweg.
 *
 * MINIMALISEERBAAR: de knop verschijnt alleen wanneer er een
 * `StaleNoticeProvider` boven hangt die de keuze server-side kan onthouden.
 * Zónder provider (bv. /overzicht/cashflow) blijft de melding uitgeklapt en is
 * er geen knop die niets doet.
 */
export function StaleNoticeCard({
  latestMonthLabel,
  ageLabel,
  className = '',
}: {
  /** De jongste transactiemaand in gewone taal ('maart 2026'). */
  latestMonthLabel: string
  /** De leeftijd in gewone taal ('5 maanden geleden'), of null bij < 1 maand. */
  ageLabel: string | null
  className?: string
}) {
  const { display, canMinimize, minimize } = useStaleNotice()

  // De aria-live-regio is ALTIJD gemount, zodat een screenreader de regio al
  // observeert vóór de toestandswissel — spiegel van `PageStatusBanner`.
  return (
    <section role="status" aria-live="polite" className={className}>
      {display === 'minimized' && (
        <span className="sr-only">
          Melding geminimaliseerd. Activeer de gekleurde stip naast de
          informatie-knop om de melding opnieuw te tonen.
        </span>
      )}
      {display === 'expanded' && (
        // `flex-wrap` + een basis van 12rem op de tekst: op een breed scherm
        // staat alles op één regel, op mobiel zakt de knop naar een eigen
        // regel (ml-auto = rechts uitgelijnd) i.p.v. de zin tot een smalle
        // kolom te knijpen.
        <div
          className="flex flex-wrap items-start gap-x-2.5 gap-y-1.5 border border-[var(--module-active-300)] bg-[var(--module-active-50)]/60 px-3 py-2"
          data-testid="stale-transactions-warning"
        >
          <AlertTriangle
            className="mt-[3px] h-3.5 w-3.5 shrink-0 text-[var(--module-active-700)]"
            aria-hidden="true"
          />
          <p className="min-w-0 flex-1 basis-48 font-serif text-[13px] leading-snug text-[var(--ink-2)]">
            <span className="mr-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--module-active-700)]">
              Gegevens verouderd
            </span>
            Laatste boeking{' '}
            <span className="font-mono font-semibold text-[var(--ink)]">
              {latestMonthLabel}
            </span>
            {ageLabel ? ` (${ageLabel})` : ''} — de cijfers hieronder rekenen daar nog
            mee.{' '}
            <Link
              href="/core/cash/import"
              className="font-medium text-[var(--module-active-700)] underline underline-offset-2"
            >
              Transacties importeren
            </Link>
          </p>
          {canMinimize && (
            // Zichtbaar label (niet icon-only) zodat de actie als "inklappen",
            // niet "wegklikken" leest — identiek aan `PageStatusBanner`.
            <button
              type="button"
              onClick={minimize}
              aria-label="Minimaliseren"
              title="Minimaliseren"
              className="-mr-1 ml-auto inline-flex shrink-0 items-center gap-1 border border-[var(--border-ed)] bg-[var(--paper)] px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-3)] transition-colors hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
            >
              <Minus className="h-3.5 w-3.5" aria-hidden="true" />
              Minimaliseren
            </button>
          )}
        </div>
      )}
    </section>
  )
}
