'use client'

import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { formatCurrency } from '@/lib/format'
import { ModuleTipStrip } from './module-tip-strip'

interface FireProgressStripProps {
  /** Of de module `toekomstplannen` actief is. Bij `false` wordt een tip-strip getoond. */
  moduleActive: boolean
  /** Huidig (effectief) netto vermogen in EUR. */
  currentValue: number
  /**
   * FIRE-doel in EUR (target). 0 of negatief = onbekend → toon "Stel je
   * FIRE-doel in" prompt in plaats van progress.
   */
  targetAmount: number
  /**
   * Doeljaar waarop de gebruiker FIRE bereikt op basis van zijn projectie.
   * Optional — wanneer ontbreekt of <= huidig jaar wordt het label vereenvoudigd.
   */
  freedomYear?: number | null
  /** Jaren-tot-vrijheid (afgerond, ≥0). Optional. */
  yearsToFreedom?: number | null
  /** Optionele klik — bv. open FIRE-kassabon. */
  onClick?: () => void
}

/**
 * Eenregelige FIRE-voortgangsbar in de hero-onderzijde.
 *
 * Design (UX-skill):
 * - Kicker UPPERCASE 11px, label-pair met percentage en doelbedrag.
 * - Bar 6px hoog, kern-bruin gradient, scherpe hoeken.
 * - Animatie via `useInViewAnimation` — fill-in op viewport-intrede.
 * - Bij module uit: subtiele `<ModuleTipStrip />` — registratie blijft volwaardig.
 *
 * Single source of truth voor FIRE-progress in de Kern-hero. Parent levert
 * alle berekende waardes — strip is presentation-only.
 */
export function FireProgressStrip({
  moduleActive,
  currentValue,
  targetAmount,
  freedomYear,
  yearsToFreedom,
  onClick,
}: FireProgressStripProps) {
  if (!moduleActive) {
    return (
      <ModuleTipStrip
        copy="Activeer Toekomstplannen om je FIRE-voortgang en vrijheidsdatum te zien."
        linkLabel="Instellingen"
      />
    )
  }

  // Module aan, maar geen target ingesteld — stuur naar instellingen.
  if (targetAmount <= 0) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-ed)] px-4 py-3">
        <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
          FIRE-voortgang
        </p>
        <p className="font-serif italic text-sm text-[var(--ink-3)]">
          Stel je FIRE-doel in via Instellingen.
        </p>
      </div>
    )
  }

  const pct = Math.min(100, Math.max(0, (currentValue / targetAmount) * 100))
  const pctRounded = Math.round(pct * 10) / 10

  // Jaar-label: "Vrij in 2038 (12 jaar)" / "Vrij over 12 jaar" / "Vrij"
  const freedomLabel = (() => {
    if (yearsToFreedom == null || yearsToFreedom <= 0) return 'FIRE bereikt'
    if (freedomYear) {
      return `Vrij in ${freedomYear} (${yearsToFreedom} ${yearsToFreedom === 1 ? 'jaar' : 'jaar'})`
    }
    return `Vrij over ${yearsToFreedom} ${yearsToFreedom === 1 ? 'jaar' : 'jaar'}`
  })()

  const Wrapper = onClick ? 'button' : 'div'
  const wrapperProps = onClick
    ? {
        type: 'button' as const,
        onClick,
        className:
          'group flex w-full flex-col gap-1.5 border-t border-[var(--border-ed)] px-4 py-3 text-left transition-colors hover:bg-[var(--subtle)]/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]',
      }
    : {
        className:
          'flex w-full flex-col gap-1.5 border-t border-[var(--border-ed)] px-4 py-3',
      }

  return (
    <Wrapper {...wrapperProps}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
          {freedomLabel}
        </span>
        <span className="font-mono text-xs tabular-nums text-[var(--ink-3)]">
          <span className="font-semibold text-[var(--ink-2)]">{pctRounded}%</span>
          <span className="mx-1.5 text-[var(--ink-4)]">·</span>
          <span>{formatCurrency(targetAmount)}</span>
        </span>
      </div>
      <FireProgressBar pct={pct} />
    </Wrapper>
  )
}

// ── Subcomponent: progress-bar met in-view fill ──────────────

function FireProgressBar({ pct }: { pct: number }) {
  const { ref, hasEntered } = useInViewAnimation({ duration: 700 })

  return (
    <div
      ref={ref}
      className="h-[6px] w-full overflow-hidden bg-[var(--subtle)]"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-label="FIRE-voortgang"
    >
      <div
        className="h-full bg-gradient-to-r from-kern-400 to-kern-600"
        style={{
          width: hasEntered ? `${pct}%` : '0%',
          transition: 'width 700ms cubic-bezier(.22,1,.36,1)',
        }}
      />
    </div>
  )
}
