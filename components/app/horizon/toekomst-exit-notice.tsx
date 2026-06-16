'use client'

import { useEffect } from 'react'
import { X, Lightbulb } from 'lucide-react'

/**
 * ToekomstExitNotice — rustige, dismissible notice die verschijnt zodra de
 * gebruiker het tip-/bubbel-overlay-scherm op /toekomst verlaat (Tips-toggle
 * uit, of de overlay sluit via ✕/Escape/achtergrond).
 *
 * Bewust GEEN modal: dit is een kalme inline-banner bovenaan de pagina, geen
 * overlay over de zwevende nav-pill. Daarom een bescheiden z-index die niet
 * met de pill (`z-[60]`) botst en geen `--mobile-nav-clearance` nodig heeft —
 * de banner staat boven de content, niet onderaan het scherm.
 *
 * Eén nette melding per exit:
 *  - auto-dismiss na ~9s (timer reset bij her-trigger via de `key`-reset in
 *    de parent, niet hier — deze component mount opnieuw per exit)
 *  - handmatige ✕-knop (toetsenbord-bereikbaar, aria-label)
 *  - Escape sluit ook
 *
 * Horizon-accent via `--module-active-*` (op /toekomst = horizon). Geen losse
 * hexen of Tailwind-standaardkleuren.
 */
export function ToekomstExitNotice({ onClose }: { onClose: () => void }) {
  // Auto-dismiss na ~9s.
  useEffect(() => {
    const t = window.setTimeout(onClose, 9000)
    return () => window.clearTimeout(t)
  }, [onClose])

  // Escape sluit de notice.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      role="status"
      aria-live="polite"
      className="relative z-[10] mb-5 flex items-start gap-3 rounded-[var(--r-lg)] border px-4 py-3"
      style={{
        borderColor: 'var(--module-active-200)',
        background: 'var(--module-active-50, var(--color-horizon-50))',
      }}
    >
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
        style={{ background: 'var(--module-active-100, var(--color-horizon-100))', color: 'var(--module-active-700)' }}
      >
        <Lightbulb className="h-4 w-4" />
      </span>
      <div className="flex-1 min-w-0 pr-1">
        <p className="text-[13px] font-semibold leading-tight text-[var(--ink)]">Tips verborgen</p>
        <p className="mt-1 text-[13px] leading-snug text-[var(--ink-2)]">
          Je vindt deze tips altijd terug: ga naar{' '}
          <strong className="font-semibold" style={{ color: 'var(--module-active-800)' }}>
            Toekomst
          </strong>{' '}
          en zet{' '}
          <strong className="font-semibold" style={{ color: 'var(--module-active-800)' }}>
            Tips
          </strong>{' '}
          weer aan. Wil je rustig op gang komen? Op{' '}
          <strong className="font-semibold" style={{ color: 'var(--module-active-800)' }}>
            Overzicht
          </strong>{' '}
          staat een kort stappenplan om met de app te starten.
        </p>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Melding sluiten"
        className="-mr-1 -mt-0.5 shrink-0 rounded-full p-1.5 text-[var(--ink-3)] transition-colors hover:text-[var(--ink-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ outlineColor: 'var(--module-active-400)' }}
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  )
}
