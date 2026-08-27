'use client'

/**
 * concept-terugrekening.tsx — geparametriseerd concept-diagram voor hoofdstuk 2.
 *
 * Toont schematisch dat het benodigd vermogen (V_nodig) DAALT met de leeftijd:
 * een kortere te overbruggen periode + AOW/pensioen als inkomensbodem.
 * Geadapteerd uit de `Snijpunt`-SVG op /beheer/grafiek-werking (regel ~106-131),
 * hier gevoed met de eigen FIRE-leeftijd en het eigen ankerbedrag.
 *
 * Bewust illustratief: geen verzonnen per-jaar V_nodig-reeks — alleen een
 * dalende lijn die het echte ankerbedrag bij de FIRE-leeftijd benoemt.
 */

import { formatCurrency } from '@/lib/format'
import { HORIZON_MISSENDE_GEGEVENS_LABEL } from '@/lib/horizon/outcome-guard'
import { formatFireAgeShort } from '@/lib/horizon-data'

export interface ConceptTerugrekeningProps {
  /** Fractionele FIRE-leeftijd; bepaalt waar het ankerpunt op de x-as valt. */
  fireAgeFractional: number | null
  /**
   * Het echte benodigd vermogen (ankerbedrag) bij de FIRE-leeftijd. `null` wanneer
   * de aanroeper de M6-vangrail heeft laten vallen (`guardFireTarget`): het diagram
   * toont dan de gegevensmelding i.p.v. een bedrag. De guard-BESLISSING hoort bij de
   * aanroeper — dit component beslist niets, het volgt.
   */
  requiredFirePortfolio: number | null
  /** Of er een AOW/pensioen-inkomensbodem meespeelt (beïnvloedt de bijschrift). */
  hasIncomeFloor: boolean
}

export function ConceptTerugrekening({
  fireAgeFractional,
  requiredFirePortfolio,
  hasIncomeFloor,
}: ConceptTerugrekeningProps) {
  const ageLabel = fireAgeFractional !== null ? formatFireAgeShort(fireAgeFractional) : 'jouw leeftijd'
  const bedrag =
    requiredFirePortfolio === null
      ? HORIZON_MISSENDE_GEGEVENS_LABEL
      : formatCurrency(requiredFirePortfolio)

  // Ankerpunt op de dalende lijn (illustratief midden-rechts).
  const anchorX = 250
  const anchorY = 95

  return (
    <figure className="my-1">
      <svg
        viewBox="0 0 480 180"
        className="w-full max-w-[480px]"
        role="img"
        aria-label={
          requiredFirePortfolio === null
            ? 'Terugrekening: het benodigd vermogen daalt met de leeftijd; we missen gegevens om jouw bedrag te berekenen'
            : `Terugrekening: het benodigd vermogen daalt met de leeftijd; bij ${ageLabel} heb je ongeveer ${bedrag} nodig`
        }
      >
        {/* assen */}
        <line x1="40" y1="20" x2="40" y2="150" stroke="var(--ink-4)" strokeWidth="1" />
        <line x1="40" y1="150" x2="450" y2="150" stroke="var(--ink-4)" strokeWidth="1" />

        {/* benodigd vermogen — DAALT met de leeftijd */}
        <line
          x1="40" y1="55" x2="430" y2="125"
          stroke="var(--color-kern-700)" strokeWidth="2.5" strokeDasharray="5 3"
        />

        {/* ankerpunt: het echte benodigd bedrag bij de FIRE-leeftijd */}
        <circle cx={anchorX} cy={anchorY} r="5" fill="var(--color-kern-700)" />
        <line
          x1={anchorX} y1={anchorY} x2={anchorX} y2="150"
          stroke="var(--ink-4)" strokeWidth="1" strokeDasharray="3 3"
        />
        <text
          x={anchorX} y="166" textAnchor="middle"
          className="fill-[var(--color-horizon-700)]" fontSize="10" fontFamily="var(--font-dm-mono, monospace)"
        >
          {ageLabel}
        </text>

        {/* bedrag-label bij ankerpunt */}
        <text
          x={anchorX + 10} y={anchorY - 6}
          className="fill-[var(--ink)]" fontSize="11" fontWeight="600"
          fontFamily="var(--font-dm-mono, monospace)"
        >
          {bedrag}
        </text>

        {/* lijn-bijschrift */}
        <text
          x="434" y="125"
          className="fill-[var(--color-kern-700)]" fontSize="10"
          fontFamily="var(--font-inter, sans-serif)" fontWeight="600"
        >
          benodigd ↓
        </text>

        {/* as-labels — #8: kleinste fontSize 9→10 zodat labels ≥9px effectief
            blijven op volle mobiele breedte (360px) binnen de sheet. */}
        <text x="40" y="168" textAnchor="middle" className="fill-[var(--ink-4)]" fontSize="10" fontFamily="var(--font-dm-mono, monospace)">nu</text>
        <text x="450" y="168" textAnchor="end" className="fill-[var(--ink-4)]" fontSize="10" fontFamily="var(--font-dm-mono, monospace)">leeftijd →</text>
        <text
          x="36" y="28" textAnchor="end"
          className="fill-[var(--ink-4)]" fontSize="10" fontFamily="var(--font-dm-mono, monospace)"
        >
          €
        </text>
      </svg>
      <figcaption className="mt-1 text-center text-[11px] italic leading-relaxed text-[var(--ink-3)]">
        Hoe later je stopt, hoe minder je nog nodig hebt: de periode die je moet overbruggen wordt korter
        {hasIncomeFloor ? ' en AOW/pensioen leggen een groeiende inkomensbodem' : ''}. Daarom daalt het
        benodigd vermogen met de leeftijd.
      </figcaption>
    </figure>
  )
}
