'use client'

import Link from 'next/link'
import { Info, ArrowRight } from 'lucide-react'

interface ModuleTipStripProps {
  /** Tip text — actieve stem, sentence case, geen uitroepteken */
  copy: string
  /**
   * Doel-href voor de inline action. Default `/identity/instellingen` —
   * waar de moduleschakelaars staan. Override voor module-specifieke deeplinks.
   */
  href?: string
  /** Tekst van de inline link. Default "Instellingen" */
  linkLabel?: string
  /** Extra tailwind-classes (bijv. spacing in de hosting container) */
  className?: string
}

/**
 * Subtiele fallback-strip die verschijnt wanneer een verdiepings-module
 * uit staat maar er voor de huidige context wel een verdieping bestaat.
 *
 * Krant-toon: éénregel ⓘ + tip + inline-link naar Instellingen.
 * Geen lock-card, geen schreeuwerige call-to-upgrade — registratie is altijd
 * volwaardig. Dit strookje wijst alleen op een optionele aanvulling.
 *
 * `aria-live="polite"` zorgt dat screenreaders de tip oppikken zonder de
 * gebruiker te onderbreken; `role="status"` markeert het als aanvullende info
 * in plaats van een normale paragraaf.
 */
export function ModuleTipStrip({
  copy,
  href = '/identity/instellingen',
  linkLabel = 'Instellingen',
  className = '',
}: ModuleTipStripProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        'flex flex-wrap items-center gap-2 border-t border-[var(--border-ed)]',
        'bg-[var(--subtle)]/40 px-4 py-3 text-xs text-[var(--ink-3)]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Info className="h-3.5 w-3.5 shrink-0 text-[var(--ink-4)]" aria-hidden="true" />
      <span className="flex-1 leading-relaxed">{copy}</span>
      <Link
        href={href}
        className="inline-flex items-center gap-1 font-medium text-kern-700 transition-colors hover:text-kern-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
      >
        {linkLabel}
        <ArrowRight className="h-3 w-3" aria-hidden="true" />
      </Link>
    </div>
  )
}
