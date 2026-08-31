'use client'

import { X, ArrowRight } from 'lucide-react'
import Link from 'next/link'

export type CoachMeldingProps = {
  headerLabel: string
  shown: string
  showCursor: boolean
  done: boolean
  cta: string
  ctaHref?: string
  onClose: () => void
  onCtaActivate: () => void
  onOpenChat: () => void
}

const CTA_CLASS =
  'mt-1 inline-flex items-center gap-1.5 font-mono text-xs text-wil-700 underline underline-offset-4 hover:text-wil-600'

/**
 * Editorial typemachine-strook (richting A). Géén eigen avatar — FinHome legt
 * de enige Fin-avatar rechtsboven in de platen-kop. Body-klik opent de chat;
 * × en CTA stoppen propagatie zodat ze niet doorvallen naar de body-klik.
 */
export function CoachMelding({
  headerLabel, shown, showCursor, done, cta, ctaHref, onClose, onCtaActivate, onOpenChat,
}: CoachMeldingProps) {
  return (
    <div
      // `wh-melding-card` is de haak voor de mobiele dok-modus: onder lg rekt
      // fin-home.css de kaart tot volle breedte (UR2-08). De Tailwind-breedte
      // hier blijft de desktop-hoekkaart bedienen.
      className="wh-melding-card relative w-80 max-w-[calc(100vw-2rem)] border border-[var(--border-ed)] bg-[var(--paper)] shadow-[var(--s2)]"
      role="complementary"
      aria-label={headerLabel}
    >
      {/* platen-kop: label links, rechts ruimte voor de avatar */}
      {/* pr-24 = 96px: houdt de kop vrij van de 44px-tapzone (48-92px) én de
          avatar (0-46px), zodat labeltekst nooit ónder de sluitknop loopt. */}
      <div className="flex min-h-[2.75rem] items-center border-b border-[var(--border-ed)] pl-3.5 pr-24">
        <span className="min-w-0 truncate font-mono text-[10px] uppercase tracking-[0.2em] text-wil-700">
          {headerLabel}
        </span>
      </div>

      {/*
        Tapzone 44x44 (h-11 w-11) om het onveranderd kleine kruisje — de
        app-brede touch-target-eis. De rechteroffset is `right-12` (48px) en
        niet minder: de enige Fin-avatar hangt als los element op `right:10px`
        en is 36px breed, dus hij loopt tot 46px vanaf rechts. De knopbox
        begint daar net links van (48-92px) en raakt hem niet — zie de
        "Hoek-anker-element naast sluitknop"-regel in de ui-ux-patroonkaarten.
        `top-0 h-11` vult exact de platen-kop (min-h-[2.75rem]).
      */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClose() }}
        aria-label="Sluiten"
        className="absolute right-12 top-0 z-10 flex h-11 w-11 items-center justify-center text-[var(--ink-4)] transition-colors hover:text-[var(--ink-2)]"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      {/* body — klikbaar oppervlak → open chat */}
      <div
        data-testid="coach-melding-body"
        onClick={onOpenChat}
        className="cursor-pointer px-3.5 py-3"
      >
        <p className="font-mono text-[12px] leading-relaxed text-[var(--ink-2)]">
          {shown}
          {showCursor && <span aria-hidden className="wh-caret">▮</span>}
        </p>
        <div className="my-2.5 border-t border-dotted border-[var(--border-md)]" />
        {done && (
          ctaHref ? (
            <Link href={ctaHref} onClick={(e) => { e.stopPropagation(); onCtaActivate() }} className={CTA_CLASS}>
              {cta}
              <ArrowRight className="h-3 w-3" />
            </Link>
          ) : (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onCtaActivate() }}
              className={CTA_CLASS}
            >
              {cta}
              <ArrowRight className="h-3 w-3" />
            </button>
          )
        )}
      </div>
    </div>
  )
}
