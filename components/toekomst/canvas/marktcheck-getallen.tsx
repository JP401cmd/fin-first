'use client'

/**
 * MarktcheckGetallen — drie vrijheidsleeftijden onder de Marktcheck-band (spec §7.6,
 * kopij-toets §7): "als het tegenzit 55 · in het midden 52 · als het meezit 49".
 *
 * Hele jaren via `heroFireAgeYear` (dezelfde afronding als het kopgetal). De drie
 * leeftijden komen van de host uit één marktcheck-run; hier wordt niets berekend.
 * Ontbreekt er één, dan geen regel (een halve regel suggereert dat de markt maar één
 * kant op kan). De Marktcheck-laag bestaat niet in Eenvoudig, dus de regel staat in
 * `HideInSimple` (spec §4.7) — ook als een host hem per ongeluk daar rendert.
 */

import { HideInSimple } from '@/components/app/hide-in-simple'
import { heroFireAgeYear } from '@/lib/horizon/hero-fire-age'
import {
  MARKTCHECK_STAND_LABEL,
  MARKTCHECK_STAND_VOLGORDE,
  marktcheckGetallenRegel,
  type MarktcheckLeeftijden,
} from '@/lib/horizon/katern-copy'

export interface MarktcheckGetallenProps {
  /** Vrijheidsleeftijd per marktverloop; `null` (of één `null`-waarde) = geen regel. */
  leeftijden: MarktcheckLeeftijden | null
  className?: string
}

export function MarktcheckGetallen({ leeftijden, className = '' }: MarktcheckGetallenProps) {
  if (leeftijden == null) return null
  const regel = marktcheckGetallenRegel(leeftijden)
  if (regel == null) return null
  return (
    <HideInSimple>
      <p
        className={`flex flex-wrap items-baseline gap-x-2 font-serif text-[12px] text-[var(--ink-3)] ${className}`}
        data-testid="marktcheck-getallen"
      >
        <span className="sr-only">{regel}</span>
        {MARKTCHECK_STAND_VOLGORDE.map((stand, i) => (
          <span key={stand} aria-hidden="true" className="inline-flex items-baseline gap-1">
            {i > 0 && <span className="pr-1">·</span>}
            <span>{MARKTCHECK_STAND_LABEL[stand]}</span>
            <span
              className={`font-mono tabular-nums ${stand === 'midden' ? 'font-medium text-[var(--ink)]' : 'text-[var(--ink-2)]'}`}
            >
              {heroFireAgeYear(leeftijden[stand] as number)}
            </span>
          </span>
        ))}
      </p>
    </HideInSimple>
  )
}
