'use client'

import type { ReactNode } from 'react'
import { Kicker, EditorialHeadline } from '@/components/editorial'
import { PageInfoButton } from '@/components/editorial/page-info-button'

/**
 * PhaseIntro — herbruikbaar intro-/uitlegblok bovenaan elke fase-modal
 * (opbouw / overgang / onttrekking).
 *
 * Legt in de filosofie "Geld is opgeslagen tijd" uit wát de fase is en wáárom
 * de gebruiker deze analyses ziet. De PageInfoButton ("Wat zie ik hier?") staat
 * rechtsboven; de body geeft 1-2 zinnen context in editorial-serif.
 *
 * Eén component, drie fases — fase-specifieke copy komt via props, geen duplicatie.
 */
export function PhaseIntro({
  kicker,
  title,
  body,
  infoDescription,
  className = '',
}: {
  /** Korte mono-kicker, bijv. "OPBOUWFASE". */
  kicker: string
  /** Editorial-kop, bijv. "Geld is opgeslagen tijd". */
  title: string
  /** 1-2 zinnen uitleg (serif). */
  body: ReactNode
  /** Tekst in de "Wat zie ik hier?"-popover. */
  infoDescription: string
  className?: string
}) {
  return (
    <div className={`relative pr-9 ${className}`}>
      <PageInfoButton description={infoDescription} className="absolute right-0 top-0" />
      <Kicker size="small">{kicker}</Kicker>
      <div className="mt-1">
        <EditorialHeadline level="h2" size="sm">
          {title}
        </EditorialHeadline>
      </div>
      <p
        className="mt-2 text-[13px] leading-relaxed text-[var(--ink-2)]"
        style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
      >
        {body}
      </p>
    </div>
  )
}
