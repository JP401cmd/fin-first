'use client'

import { LEVERAGE_STATUS_DOT, LEVERAGE_STATUS_LABEL } from '@/lib/leverage-status'
import { usePageStatusContext } from '@/components/app/page-status-provider'

/**
 * PageStatusDot — de geminimaliseerde vorm van de `PageStatusBanner`: een klein
 * rond knopje met een gekleurde status-dot, dat naast de pagina-'i'
 * (`PageInfoButton`) verschijnt zodra de gebruiker de banner heeft
 * geminimaliseerd. Klik → banner weer uitklappen.
 *
 * Spiegelt de vorm/plaatsing van `InsightToggleButton` (h-7 w-7 rounded-full,
 * zelfde border) zodat de knop een koppel vormt met de 'i'. De dot binnenin
 * draagt de status-kleur (amber/red) via LEVERAGE_STATUS_DOT — semantisch
 * stoplicht, géén module-accent.
 *
 * Rendert ALLEEN wanneer de provider `display === 'minimized'` zegt (en er een
 * `info` is). Positie via de `className`-prop (absolute offset per pagina).
 */

interface PageStatusDotProps {
  /** Extra CSS-classes op de wrapper (absolute positie-override per pagina). */
  className?: string
}

export function PageStatusDot({ className = '' }: PageStatusDotProps) {
  const { info, display, restore } = usePageStatusContext()

  if (!info || display !== 'minimized') return null

  // Freedom-banner is informatief (geen stoplicht): horizon-accent dot + eigen
  // label. Leverage-banner houdt de stoplichtkleur + status-label.
  const isFreedom = info.kind === 'freedom'
  const label = isFreedom
    ? `${info.title} — toon melding`
    : `${LEVERAGE_STATUS_LABEL[info.status]} — toon melding`
  const dotClass = isFreedom ? 'bg-horizon-500' : LEVERAGE_STATUS_DOT[info.status]

  return (
    <div className={className}>
      <button
        type="button"
        onClick={restore}
        aria-label={label}
        title={label}
        className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border-ed)] bg-[var(--paper)] transition-all hover:border-[var(--module-active-500)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
      >
        <span
          className={`h-2.5 w-2.5 rounded-full ${dotClass}`}
          aria-hidden="true"
        />
      </button>
    </div>
  )
}
