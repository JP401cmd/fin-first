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
 * Editorial typemachine-strook (richting A). Géén eigen avatar — WillHome legt
 * de enige Will-avatar rechtsboven in de platen-kop. Body-klik opent de chat;
 * × en CTA stoppen propagatie zodat ze niet doorvallen naar de body-klik.
 */
export function CoachMelding({
  headerLabel, shown, showCursor, done, cta, ctaHref, onClose, onCtaActivate, onOpenChat,
}: CoachMeldingProps) {
  return (
    <div
      className="relative w-80 max-w-[calc(100vw-2rem)] border border-[var(--border-ed)] bg-[var(--paper)] shadow-[var(--s2)]"
      role="complementary"
      aria-label={headerLabel}
    >
      {/* platen-kop: label links, rechts ruimte voor de avatar */}
      <div className="flex min-h-[2.75rem] items-center border-b border-[var(--border-ed)] pl-3.5 pr-12">
        <span className="min-w-0 truncate font-mono text-[10px] uppercase tracking-[0.2em] text-wil-700">
          {headerLabel}
        </span>
      </div>

      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClose() }}
        aria-label="Sluiten"
        className="absolute right-14 top-2.5 z-10 p-1 text-[var(--ink-4)] transition-colors hover:text-[var(--ink-2)]"
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
