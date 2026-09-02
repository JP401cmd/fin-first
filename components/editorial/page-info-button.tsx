'use client'

import { useState } from 'react'
import { Info } from 'lucide-react'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import type { PageInfoContent } from '@/lib/page-info-content'

/**
 * PageInfoButton — "Wat zie ik hier?" info-knop voor hoofdpagina's.
 *
 * Toont een klein i-icoon; bij klik/tap opent een ShellOverlay-sheet met
 * twee gelabelde secties: INZICHT (waarom deze pagina ertoe doet) en GRIP
 * (wat je hier concreet kunt doen) — de twee kernwoorden uit de belofte
 * "de vrijheid om met inzicht en grip keuzes te maken voor nu en de
 * toekomst".
 *
 * Positie: absoluut t.o.v. parent (parent moet `relative` zijn).
 * Consistent rechts-boven geplaatst op alle hoofdpagina's.
 *
 * Bouwt op het verplichte overlay-systeem (ADR 0039) i.p.v. een bespoke
 * popover — dat geeft focus-trap, scroll-lock, safe-area-padding en het
 * automatisch verbergen van de FloatingNavButton gratis mee, en de
 * sheet-titel rendert al als `<h3>` (ADR 0110-conform, `bottom-sheet.tsx`).
 */

interface PageInfoButtonProps {
  /** INZICHT + GRIP — zie lib/page-info-content.ts. */
  content: PageInfoContent
  /** Optionele titel boven de secties (default: "Wat zie ik hier?"). */
  label?: string
  /** Extra CSS-classes op de wrapper (bijv. voor positie-overrides). */
  className?: string
}

export function PageInfoButton({
  content,
  label = 'Wat zie ik hier?',
  className = '',
}: PageInfoButtonProps) {
  const [open, setOpen] = useState(false)

  const hasInsight = Boolean(content.insight)
  const hasGrip = Boolean(content.grip)

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        aria-haspopup="dialog"
        className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)] transition-all hover:border-[var(--module-active-500)] hover:text-[var(--module-active-700)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
      >
        <Info className="h-3.5 w-3.5" />
      </button>

      <ShellOverlay open={open} onClose={() => setOpen(false)} kind="sheet" size="sm" title={label}>
        <div className="space-y-5">
          {hasInsight && <InfoSection kicker="INZICHT" text={content.insight} />}
          {hasInsight && hasGrip && <div className="border-t border-[var(--border-ed)]" />}
          {hasGrip && <InfoSection kicker="GRIP" text={content.grip} />}
        </div>
      </ShellOverlay>
    </div>
  )
}

function InfoSection({ kicker, text }: { kicker: string; text: string }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <span
          aria-hidden
          className="inline-block h-px w-4"
          style={{ background: 'var(--module-active-500)' }}
        />
        <span className="text-[9px] uppercase tracking-[0.18em] font-mono text-[var(--module-active-700)]">
          {kicker}
        </span>
      </div>
      <p
        className="text-[13px] leading-relaxed text-[var(--ink-2)]"
        style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
      >
        {text}
      </p>
    </div>
  )
}
