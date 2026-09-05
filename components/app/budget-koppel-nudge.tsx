'use client'

/**
 * BudgetKoppelNudge — eenmalige popup direct ná het doorlopen van de
 * budget-setup (AppSetupGate) op /overzicht/cashflow/budget.
 *
 * Zodra de gebruiker de setup voltooit rendert de server-page BudgetsClient op
 * dezelfde URL. Dat "na het doorlopen"-moment is precies waar deze nudge de
 * gebruiker de volgende stap wijst: om te zien hoeveel vrijheid elke euro kost,
 * heeft TriFinity transacties nodig. Twee directe wegen:
 *   • Bank koppelen (PSD2/TrueLayer, alleen-lezen)  → /core/cash/connect
 *   • Transacties importeren (CSV/MT940/OFX)          → /core/cash/import
 * Deze twee routes zijn de canonieke bestemmingen — identiek aan
 * components/overview/koppel-rekening-banner.tsx.
 *
 * First-time-only: de parent geeft `visible` (server-afgeleid: marker afwezig
 * ÉN 0 bank_accounts ÉN 0 transacties). Bij eerste render POST'en we de slug
 * `budget_koppel_nudge_shown` naar /api/feature-visits — server-side + RLS
 * user-scoped, dus cross-device (géén localStorage).
 *
 * Rendert via de gedeelde <BottomSheet> (z-[70], boven de nav-pill, met
 * focus-trap/scroll-lock/drag-dismiss). Module-accent volgt de route: op
 * /overzicht is --module-active-* de Kern-kleur.
 */

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Sparkles, Link2, Upload, ArrowRight } from 'lucide-react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { EditorialHeadline } from '@/components/editorial'

/** Feature-slug in user_feature_visits die bijhoudt of deze nudge al is
 *  getoond. Eenmalig cross-device — zelfde patroon als
 *  HORIZON_EXIT_NOTICE_DISMISSED_SLUG. */
export const BUDGET_KOPPEL_NUDGE_SHOWN_SLUG = 'budget_koppel_nudge_shown'

export function BudgetKoppelNudge({ visible }: { visible: boolean }) {
  const [open, setOpen] = useState(visible)

  // Bij eerste render één keer de marker zetten zodat de nudge nooit terugkomt
  // (ook niet als de gebruiker 'm niet expliciet wegklikt).
  const markedRef = useRef(false)
  useEffect(() => {
    if (!visible || markedRef.current) return
    markedRef.current = true
    // Fire-and-forget — bij failure verschijnt de nudge hooguit nog een keer.
    fetch('/api/feature-visits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature_slug: BUDGET_KOPPEL_NUDGE_SHOWN_SLUG }),
    }).catch(() => {})
  }, [visible])

  if (!visible) return null

  return (
    <BottomSheet open={open} onClose={() => setOpen(false)} size="md" closeOnBackdropClick>
      <div className="px-5 py-5 sm:px-7 sm:py-7">
        {/* Kicker: 10px mono uppercase — -800 voor WCAG AA contrast. */}
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.20em] text-[var(--module-active-800)]">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          Je budget staat klaar
        </div>

        <EditorialHeadline level="h2" size="sm" emphasis="uitgaven" className="mt-3">
          Nu je uitgaven erbij
        </EditorialHeadline>

        <p
          className="mt-3 max-w-[60ch] text-[15px] italic leading-relaxed text-[var(--ink-2)]"
          style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
        >
          Je budgetten zijn ingesteld. Om te zien hoeveel{' '}
          <span className="not-italic font-semibold text-[var(--module-active-700)]">
            vrijheid
          </span>{' '}
          elke euro je kost, heeft TriFinity je transacties nodig. Kies hoe je begint:
        </p>

        {/* CTA 1 (primair): bank koppelen — transacties komen automatisch binnen. */}
        <div className="mt-5 flex flex-col gap-2.5">
          <Link
            href="/core/cash/connect"
            onClick={() => setOpen(false)}
            data-testid="nudge-cta-connect"
            className="group inline-flex items-center gap-3 rounded-[var(--r-sm)] border border-[var(--ink)] bg-[var(--ink)] px-4 py-3 text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)]"
          >
            <Link2 className="h-5 w-5 shrink-0" aria-hidden />
            <span className="flex-1 min-w-0">
              <span className="block font-sans text-sm font-semibold">Bank koppelen</span>
              <span className="block text-xs text-[var(--paper)]/75">
                Transacties komen automatisch binnen — veilig en alleen-lezen via TrueLayer
              </span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>

          {/* CTA 2 (secundair): handmatig importeren (CSV/MT940/OFX). */}
          <Link
            href="/core/cash/import"
            onClick={() => setOpen(false)}
            data-testid="nudge-cta-import"
            className="group inline-flex items-center gap-3 rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3 text-[var(--ink)] transition-colors hover:border-[var(--ink-3)]"
          >
            <Upload className="h-5 w-5 shrink-0 text-[var(--ink-3)]" aria-hidden />
            <span className="flex-1 min-w-0">
              <span className="block font-sans text-sm font-semibold">Transacties importeren</span>
              <span className="block text-xs text-[var(--ink-3)]">
                Upload zelf een bestand uit je bank (CSV, MT940 of OFX)
              </span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-[var(--ink-3)] transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
        </div>

        {/* Tertiair: later — sluit de nudge zonder te navigeren. */}
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => setOpen(false)}
            data-testid="nudge-later"
            className="font-sans text-[13px] text-[var(--ink-3)] underline-offset-2 transition-colors hover:text-[var(--ink-2)] hover:underline"
          >
            Later
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}
