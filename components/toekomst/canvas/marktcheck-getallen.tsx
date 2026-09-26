'use client'

/**
 * MarktcheckGetallen — drie vrijheidsleeftijden onder de Marktcheck-band (spec §7.6,
 * kopij-toets §7): "als het tegenzit 55 · in het midden 52 · als het meezit 49".
 *
 * Hele jaren via `heroFireAgeYear` (dezelfde afronding als het kopgetal). De drie
 * leeftijden komen van de host uit één marktcheck-run; hier wordt niets berekend.
 * Haalt een stand de vrijheid niet binnen de horizon (`null`), dan blijft de regel
 * staan met "niet binnen je plan" op die plek (kopij-toets §7, aanvulling 26 sep).
 * Geen regel bij een vast stop-anker (prop `null`) of als alle drie onbereikbaar zijn
 * — dat beslist `marktcheckGetallenRegel`, de enige bron van de tekst. De
 * Marktcheck-laag bestaat niet in Eenvoudig, dus de regel staat in `HideInSimple`
 * (spec §4.7) — ook als een host hem per ongeluk daar rendert.
 */

import { HideInSimple } from '@/components/app/hide-in-simple'
import {
  MARKTCHECK_STAND_LABEL,
  MARKTCHECK_STAND_VOLGORDE,
  marktcheckGetallenRegel,
  marktcheckStandWaarde,
  type MarktcheckLeeftijden,
} from '@/lib/horizon/katern-copy'

export interface MarktcheckGetallenProps {
  /**
   * Vrijheidsleeftijd per marktverloop (`null` per stand = niet binnen je plan);
   * `null` als geheel = vast stop-anker, geen regel.
   */
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
        {MARKTCHECK_STAND_VOLGORDE.map((stand, i) => {
          const age = leeftijden[stand]
          return (
            <span key={stand} aria-hidden="true" className="inline-flex items-baseline gap-1">
              {i > 0 && <span className="pr-1">·</span>}
              <span>{MARKTCHECK_STAND_LABEL[stand]}</span>
              {age == null ? (
                // Woorden, geen getal: serif zoals het label, niet de mono-cijferstijl.
                <span className="text-[var(--ink-2)]" data-stand-onbereikbaar={stand}>
                  {marktcheckStandWaarde(null)}
                </span>
              ) : (
                <span
                  className={`font-mono tabular-nums ${stand === 'midden' ? 'font-medium text-[var(--ink)]' : 'text-[var(--ink-2)]'}`}
                >
                  {marktcheckStandWaarde(age)}
                </span>
              )}
            </span>
          )
        })}
      </p>
    </HideInSimple>
  )
}
