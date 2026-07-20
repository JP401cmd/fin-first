'use client'

import Link from 'next/link'
import { ArrowRight, Minus, Sparkles } from 'lucide-react'
import {
  leverageStatusBgClass,
  leverageStatusTextClass,
  LEVERAGE_STATUS_DOT,
} from '@/lib/leverage-status'
import { usePageStatusContext } from '@/components/app/page-status-provider'
import { BesprekMetWillButton } from '@/components/app/chat/bespreek-met-fin-button'

/**
 * PageStatusBanner — duidings-melding bovenaan een niet-groene pagina onder
 * /overzicht. Consumeert de gedeelde `PageStatusProvider` (één fetch per route;
 * gedeeld met de per-pagina `PageStatusDot`) — alléén warn/bad levert een
 * `info` en dus een banner; good/neutral/buiten-scope → géén banner.
 *
 * De banner kan worden geminimaliseerd: dan klapt 'ie in tot een gekleurde dot
 * naast de pagina-'i' (`PageStatusDot`). De provider bepaalt via
 * `display` of de banner expanded getoond wordt; bij escalatie (warn → bad)
 * klapt 'ie automatisch weer open.
 *
 * Stijl: editorial banner met een 3px statusstreep (semantisch stoplicht,
 * GEEN module-accent). Kicker → reason (prominente regel) → remedy (subtieler).
 * CTA-rij: optionele actie-deeplink + altijd "Bespreek met Fin".
 *
 * Top-of-page, dus géén --mobile-nav-clearance nodig.
 */
export function PageStatusBanner() {
  const { info, display, minimize } = usePageStatusContext()

  const status = info?.status ?? 'neutral'
  const isFreedom = info?.kind === 'freedom'
  // Freedom-banner is informatief (geen stoplicht): horizon-accent i.p.v. een
  // amber/rode stoplichtstreep, en een mijlpaal-kicker uit de titel.
  const kicker = isFreedom
    ? info?.title ?? 'Mijlpaal'
    : status === 'bad'
      ? 'Actie nodig'
      : 'Aandacht'
  const bgClass = isFreedom
    ? 'bg-gradient-to-r from-horizon-50 to-stone-50'
    : leverageStatusBgClass(status)
  const stripeClass = isFreedom ? 'bg-horizon-500' : LEVERAGE_STATUS_DOT[status]
  const kickerTextClass = isFreedom ? 'text-horizon-700' : leverageStatusTextClass(status)

  // De aria-live-regio is ALTIJD gemount (ook op groene pagina's), zodat een
  // screenreader de regio al observeert vóórdat de banner lazy verschijnt. De
  // zichtbare `<div>` is gated op `display === 'expanded'` — bij 'minimized'
  // (dot naast de 'i') of 'none' (geen banner) blijft de section 0px hoog.
  return (
    <section role="status" aria-live="polite">
      {/* Geminimaliseerd: de polite-regio kondigt de toestandswissel aan (de
          zichtbare banner verdween, er staat nu een stip naast de 'i'). */}
      {display === 'minimized' && (
        <span className="sr-only">
          Melding geminimaliseerd. Activeer de gekleurde stip naast de
          informatie-knop om de melding opnieuw te tonen.
        </span>
      )}
      {info && display === 'expanded' && (
        <div
          className={`mt-4 flex gap-3 rounded-[var(--r)] border border-[var(--border-md)] ${bgClass} p-4`}
        >
          {/* 3px verticale streep: stoplicht voor leverage, horizon-accent voor
              de informatieve vrijheidsbanner. */}
          <div
            className={`w-[3px] shrink-0 self-stretch rounded-full ${stripeClass}`}
            aria-hidden="true"
          />

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <p
                className={`flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] ${kickerTextClass}`}
              >
                {isFreedom && <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />}
                {kicker}
              </p>
              {/* Minimaliseren — klap de banner in tot de dot naast de 'i'.
                  Zichtbaar label (niet icon-only) zodat de actie als
                  "inklappen", niet "wegklikken" leest. */}
              <button
                type="button"
                onClick={minimize}
                aria-label="Minimaliseren"
                title="Minimaliseren"
                className="-mr-1 -mt-1 inline-flex shrink-0 items-center gap-1 rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--paper)] px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-3)] transition-colors hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
              >
                <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                Minimaliseren
              </button>
            </div>
            <p className="mt-1 font-sans text-sm font-semibold text-[var(--ink)]">
              {info.reason}
            </p>
            <p className="mt-1 font-serif text-sm text-[var(--ink-2)]">{info.remedy}</p>

            {/* CTA-rij: optionele actie + altijd Bespreek met Fin. */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {info.action && (
                <Link
                  href={info.action.href}
                  className="inline-flex items-center gap-1.5 rounded-[var(--r-sm)] bg-[var(--ink)] px-3 py-2.5 text-[12px] font-semibold text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
                >
                  {info.action.label}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              )}
              <BesprekMetWillButton
                onderwerp={info.will.onderwerp}
                detail={info.will.detail}
                className="py-2.5"
              />
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
