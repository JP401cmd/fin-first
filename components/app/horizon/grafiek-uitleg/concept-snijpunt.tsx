'use client'

/**
 * concept-snijpunt.tsx — geparametriseerd concept-diagram voor hoofdstuk 3.
 *
 * Toont schematisch het FIRE-snijpunt: de STIJGENDE opbouwlijn kruist de
 * DALENDE benodigd-lijn. Geadapteerd uit de `Snijpunt`-SVG op
 * /beheer/grafiek-werking, hier gevoed met de eigen FIRE-leeftijd + bedrag.
 *
 * Bewust illustratief: de exacte vorm komt uit de echte SimChart (apart
 * getoond); dit diagram maakt de abstracte "kruising" begrijpelijk.
 */

import { formatCurrency } from '@/lib/format'
import { formatFireAgeShort } from '@/lib/horizon-data'
import { useMediaQuery } from '@/lib/hooks/use-media-query'

export interface ConceptSnijpuntProps {
  /** Fractionele FIRE-leeftijd; bijschrift van het snijpunt. */
  fireAgeFractional: number | null
  /** Vermogen op het FIRE-moment (bijschrift). */
  firePortfolioAtFire: number
}

export function ConceptSnijpunt({ fireAgeFractional, firePortfolioAtFire }: ConceptSnijpuntProps) {
  const ageLabel = fireAgeFractional !== null ? formatFireAgeShort(fireAgeFractional) : 'jouw leeftijd'
  const bedrag = formatCurrency(firePortfolioAtFire)

  // #9: een eindeloze puls is precies wat reduced-motion-gebruikers willen
  // vermijden, en SMIL <animate> wordt NIET door CSS reduced-motion gegate.
  // Daarom: bij `reduce` de animatie weglaten en een statisch benadrukt punt
  // tonen. SSR-safe via useMediaQuery (server-snapshot = false → animatie aan).
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)')

  // Snijpunt (illustratief midden).
  const crossX = 250
  const crossY = 90

  return (
    <figure className="my-1">
      <svg
        viewBox="0 0 480 180"
        className="w-full max-w-[480px]"
        role="img"
        aria-label={`Snijpunt: je opbouw kruist het benodigd vermogen rond ${ageLabel}, bij ongeveer ${bedrag}`}
      >
        {/* assen */}
        <line x1="40" y1="20" x2="40" y2="150" stroke="var(--ink-4)" strokeWidth="1" />
        <line x1="40" y1="150" x2="450" y2="150" stroke="var(--ink-4)" strokeWidth="1" />

        {/* benodigd vermogen — daalt */}
        <line
          x1="40" y1="55" x2="430" y2="120"
          stroke="var(--color-kern-700)" strokeWidth="2" strokeDasharray="5 3"
        />
        {/* netto vermogen — stijgt door sparen + rendement */}
        <polyline
          points="40,150 150,125 250,90 430,40"
          fill="none" stroke="var(--color-horizon-700)" strokeWidth="2.5"
        />

        {/* snijpunt — statisch benadrukt punt (geen pulsanimatie bij reduced-motion) */}
        <circle cx={crossX} cy={crossY} r="6" fill="var(--color-horizon-700)" stroke="var(--paper)" strokeWidth="1.5" />
        {/* puls-halo — alleen wanneer beweging is toegestaan (#9) */}
        {!reduceMotion && (
          <circle cx={crossX} cy={crossY} r="6" fill="none" stroke="var(--color-horizon-700)" strokeWidth="2">
            <animate attributeName="r" from="6" to="18" dur="1.6s" repeatCount="indefinite" />
            <animate attributeName="opacity" from="0.7" to="0" dur="1.6s" repeatCount="indefinite" />
          </circle>
        )}

        <line
          x1={crossX} y1={crossY} x2={crossX} y2="150"
          stroke="var(--ink-4)" strokeWidth="1" strokeDasharray="3 3"
        />
        <text
          x={crossX} y="166" textAnchor="middle"
          className="fill-[var(--color-horizon-700)]" fontSize="10" fontFamily="var(--font-dm-mono, monospace)"
        >
          {ageLabel}
        </text>
        <text
          x={crossX + 12} y={crossY - 8}
          className="fill-[var(--ink)]" fontSize="11" fontWeight="600"
          fontFamily="var(--font-dm-mono, monospace)"
        >
          {bedrag}
        </text>

        {/* lijn-bijschriften */}
        <text x="434" y="40" className="fill-[var(--color-horizon-700)]" fontSize="10" fontFamily="var(--font-inter, sans-serif)" fontWeight="600">opbouw ↑</text>
        <text x="434" y="120" className="fill-[var(--color-kern-700)]" fontSize="10" fontFamily="var(--font-inter, sans-serif)" fontWeight="600">benodigd ↓</text>

        {/* as-labels — #8: kleinste fontSize 9→10 zodat labels ≥9px effectief
            blijven op volle mobiele breedte (360px) binnen de sheet. */}
        <text x="40" y="168" textAnchor="middle" className="fill-[var(--ink-4)]" fontSize="10" fontFamily="var(--font-dm-mono, monospace)">nu</text>
      </svg>
      <figcaption className="mt-1 text-center text-[11px] italic leading-relaxed text-[var(--ink-3)]">
        Vrijheid is precies daar waar je opbouw de terugrekening inhaalt — het eerste moment dat je genoeg hebt.
      </figcaption>
    </figure>
  )
}
