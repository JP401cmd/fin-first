'use client'

/**
 * Aannamesregel — één regel onder het canvas, alleen in katern Plan (ADR 0179 D5):
 * waar de grafiek op rust, met één link naar Instellingen.
 *
 * "Op basis van: stopmoment zo vroeg mogelijk · plan tot je 90e · 2,0% inflatie ·
 * 5,0% rendement per jaar · 3 gebeurtenissen   Naar instellingen →"
 *
 * Kopij en segmenten komen uit `aannamesSegmenten` (katern-copy); inflatie en
 * rendement staan in `HideInSimple` (ADR 0026), samen met hun scheidingsteken.
 * Presentational: de getallen komen van de host (plan-invoer), hier wordt niets berekend.
 */

import Link from 'next/link'
import { Fragment } from 'react'
import { HideInSimple } from '@/components/app/hide-in-simple'
import {
  AANNAMES_LINK_LABEL,
  AANNAMES_PREFIX,
  aannamesSegmenten,
  type AannamesInput,
} from '@/lib/horizon/katern-copy'

export interface AannamesregelProps {
  aannames: AannamesInput
  /** Bestemming van "Naar instellingen", bv. `/toekomst/instellingen`. */
  instellingenHref: string
  className?: string
}

export function Aannamesregel({ aannames, instellingenHref, className = '' }: AannamesregelProps) {
  const segmenten = aannamesSegmenten(aannames)
  return (
    <p
      className={`flex flex-wrap items-center gap-x-3 font-serif text-[12px] leading-snug text-[var(--ink-3)] ${className}`}
      data-testid="aannamesregel"
    >
      <span>
        {AANNAMES_PREFIX}{' '}
        {segmenten.map((s, i) => {
          const deel = (
            <>
              {i > 0 && <span aria-hidden="true"> · </span>}
              <span data-segment={s.key}>{s.tekst}</span>
            </>
          )
          return s.alleenVolledig ? (
            <HideInSimple key={s.key}>{deel}</HideInSimple>
          ) : (
            <Fragment key={s.key}>{deel}</Fragment>
          )
        })}
      </span>
      <Link
        href={instellingenHref}
        className="inline-flex min-h-[44px] items-center gap-1 font-sans text-[12px] font-medium text-horizon-700 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] lg:min-h-0"
      >
        {AANNAMES_LINK_LABEL}
        <span aria-hidden="true">→</span>
      </Link>
    </p>
  )
}
