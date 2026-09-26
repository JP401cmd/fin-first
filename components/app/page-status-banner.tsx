'use client'

import { Sparkles } from 'lucide-react'
import { usePageStatusContext } from '@/components/app/page-status-provider'
import { BesprekMetWillButton } from '@/components/app/chat/bespreek-met-fin-button'
import {
  PageStatusBannerBody,
  statusBannerTone,
} from '@/components/app/page-status-banner-body'

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
 * CTA-rij: optionele actie-deeplink + altijd "Bespreek met Fin". De zichtbare
 * kaart is `PageStatusBannerBody`, gedeeld met `KaternMelding` op /toekomst
 * (één uiterlijk, geen tweede variant); deze host houdt de context en de altijd
 * gemounte live-regio.
 *
 * Top-of-page, dus géén --mobile-nav-clearance nodig.
 */
export function PageStatusBanner() {
  const { info, display, minimize } = usePageStatusContext()

  const status = info?.status ?? 'neutral'
  const isFreedom = info?.kind === 'freedom'
  const isAlarm = status === 'warn' || status === 'bad'
  // Kleur volgt de STATUS, niet de soort melding: een freedom-banner is alleen
  // informatief (horizon-accent) zolang hij niets alarmeert. Sinds ADR 0129
  // draagt het stop-anker met een tekort status 'warn' — dan hoort de streep
  // amber te zijn, want stoplicht-status volgt de accentkeuze niet (CLAUDE.md).
  const isInformational = isFreedom && !isAlarm
  // De kicker blijft bij een freedom-banner de titel: die benoemt het anker
  // ("Je rekent met stoppen op 48") en dat draagt meer dan het woord 'Aandacht'.
  const kicker = isFreedom
    ? info?.title ?? 'Mijlpaal'
    : status === 'bad'
      ? 'Actie nodig'
      : 'Aandacht'
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
        <PageStatusBannerBody
          tone={statusBannerTone(status, isInformational)}
          kicker={kicker}
          kickerIcon={isFreedom ? <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> : undefined}
          title={info.reason}
          explanation={info.remedy}
          action={info.action ?? null}
          extraActions={
            <BesprekMetWillButton
              onderwerp={info.will.onderwerp}
              detail={info.will.detail}
              className="py-2.5"
            />
          }
          onMinimize={minimize}
        />
      )}
    </section>
  )
}
