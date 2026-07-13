'use client'

/**
 * ToekomstExitNotice — gecentreerde modal die verschijnt zodra de gebruiker het
 * tip-/bubbel-overlay-scherm op /toekomst verlaat (Tips-toggle uit, of de
 * overlay sluit via ✕/Escape/achtergrond).
 *
 * Verschijnt MIDDEN in beeld als echte modal — vóórdat de tips-overlay
 * verdwijnt — en wacht op een expliciete keuze (GEEN auto-dismiss):
 *   • "Sluiten"            → modal dicht + overlay sluit. Niet-persistent:
 *                            de melding komt bij een volgende exit terug.
 *   • "Niet meer weergeven" → modal dicht + overlay sluit + persistent verbergen
 *                            (cross-device via user_feature_visits).
 * Escape/achtergrond-klik gedragen zich als "Sluiten" (niet-persistent).
 *
 * Modal-conventie (CLAUDE.md): portal naar document.body, `fixed inset-0
 * z-[70]` (boven de zwevende nav-pill), `role=dialog aria-modal`, backdrop-blur,
 * focus-trap, Escape + body-scroll-lock. Blueprint = ToekomstWelcome.
 *
 * Horizon-accent via `--module-active-*` (op /toekomst = horizon). Geen losse
 * hexen of Tailwind-standaardkleuren.
 */

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Lightbulb } from 'lucide-react'
import { EditorialHeadline } from '@/components/editorial'
import { useFocusTrap } from '@/lib/hooks/use-focus-trap'
import { acquireOverlay } from '@/lib/overlay-signal'

export interface ToekomstExitNoticeProps {
  /** Of de modal zichtbaar is (door de parent bepaald per exit). */
  visible: boolean
  /**
   * Niet-persistent sluiten: modal dicht + tips-overlay sluit. Gebruikt door de
   * "Sluiten"-knop, Escape en een klik op de achtergrond. De melding verschijnt
   * bij een volgende exit weer.
   */
  onClose: () => void
  /**
   * Persistent sluiten ("Niet meer weergeven"): modal dicht + tips-overlay sluit
   * + markeer de melding als blijvend verborgen (POST naar feature-visits in de
   * parent). Verschijnt nooit meer bij toekomstige exits.
   */
  onDismissForever: () => void
}

export function ToekomstExitNotice({ visible, onClose, onDismissForever }: ToekomstExitNoticeProps) {
  // Portal pas na mount (document bestaat niet tijdens SSR).
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // Focus trap: bij openen focus op de primaire ("Sluiten")-knop, Tab blijft
  // binnen de kaart, en bij sluiten keert focus terug naar de vorige owner.
  const cardRef = useRef<HTMLDivElement>(null)
  const primaryRef = useRef<HTMLButtonElement>(null)
  useFocusTrap({ active: visible && mounted, containerRef: cardRef, initialFocusRef: primaryRef })

  // Verberg de zwevende nav-pill zolang deze modal open is (ADR 0039). Bewust
  // géén BottomSheet-migratie: bespoke editorial kaart met eigen
  // backdrop-dismiss; alleen het pill-signaal wordt gedeeld. Zie overlay-signal.ts.
  useEffect(() => {
    if (!visible) return
    return acquireOverlay()
  }, [visible])

  // Body-scroll-lock + Escape (= niet-persistent sluiten) zolang de modal open is.
  useEffect(() => {
    if (!visible) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [visible, onClose])

  if (!visible || !mounted) return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="exit-notice-title"
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
    >
      {/* Achtergrond: hele pagina vervaagt + dimt. Klik = niet-persistent sluiten. */}
      <div
        aria-hidden
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-[var(--ink)]/30 backdrop-blur-md"
      />

      {/* Melding-kaart — editorial, met horizon-accent. */}
      <div
        ref={cardRef}
        className="relative w-full max-w-md bg-[var(--paper)] p-5 shadow-xl motion-safe:animate-sheet-enter sm:p-7"
        style={{
          border: '1px solid var(--ink)',
          borderLeftWidth: '4px',
          borderLeftColor: 'var(--module-active-500)',
        }}
      >
        {/* Kicker: 10px mono uppercase — -800 voor WCAG AA contrast. */}
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.20em] text-[var(--module-active-800)]">
          <Lightbulb className="h-3.5 w-3.5" aria-hidden />
          Tips verborgen
        </div>

        <div id="exit-notice-title">
          <EditorialHeadline level="h2" size="sm" emphasis="tips" className="mt-3">
            Je tips zijn nu verborgen
          </EditorialHeadline>
        </div>

        <p
          className="mt-3 max-w-[60ch] text-[15px] italic leading-relaxed text-[var(--ink-2)]"
          style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
        >
          Je vindt deze tips altijd terug: ga naar{' '}
          <span className="not-italic font-semibold text-[var(--module-active-800)]">
            Toekomst
          </span>{' '}
          en zet{' '}
          <span className="not-italic font-semibold text-[var(--module-active-800)]">
            Tips
          </span>{' '}
          weer aan. Wil je rustig op gang komen? Op{' '}
          <span className="not-italic font-semibold text-[var(--module-active-800)]">
            Overzicht
          </span>{' '}
          staat een kort stappenplan om met de app te starten.
        </p>

        {/* Knoppen — GEEN auto-dismiss; de gebruiker kiest expliciet. */}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          <button
            type="button"
            onClick={onDismissForever}
            title="Verbergt deze melding voortaan op al je apparaten"
            className="inline-flex min-h-[40px] items-center justify-center rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-1.5 font-sans text-[13px] font-medium text-[var(--ink-3)] transition-colors hover:text-[var(--ink-2)]"
          >
            Niet meer weergeven
          </button>
          <button
            ref={primaryRef}
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-[var(--r-sm)] border border-[var(--module-active-300)] bg-[var(--module-active-50)] px-4 py-1.5 font-sans text-[13px] font-medium text-[var(--module-active-800)] transition-colors hover:bg-[var(--module-active-100)]"
          >
            Sluiten
          </button>
        </div>

        {/* Sluit-knop rechtsboven (= niet-persistent sluiten). */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-2.5 top-2.5 inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--ink-4)] transition-colors hover:text-[var(--ink-2)]"
          aria-label="Melding sluiten"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>,
    document.body,
  )
}
