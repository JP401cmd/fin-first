import { formatCurrency } from '@/lib/format'
import {
  marginalRateAt,
  BOX1_PARAMS,
  type Box1TaxYear,
} from '@/lib/box1-tax'
import {
  MarginaleDrukCurve,
  type MarginaleDrukPunt,
  type MarginaleDrukCliff,
} from './marginale-druk-curve'
import { Kicker } from '@/components/editorial'

/**
 * Box1MarginaleCurveCard — samplet het marginale Box 1-tarief over een
 * inkomensbereik en toont het via <MarginaleDrukCurve>.
 *
 * Filosofie: de marginale druk laat zien hoeveel van élke extra verdiende
 * euro naar de schatkist gaat — dus hoeveel "opgeslagen tijd" je per extra
 * euro werkelijk overhoudt. De curve maakt de schijfgrenzen én de afbouw van
 * heffingskortingen zichtbaar als knikken/cliffs.
 *
 * Vormgeving: editorial — papier + ink-hiërarchie, scherpe hoeken, Kicker +
 * Playfair eigen-tarief-callout. Server-compatible (geen hooks). marginalRateAt
 * is een pure functie, dus de sampling kan veilig op de server gebeuren.
 * Box 1-kleur amber (#b45309).
 */

const BOX1_COLOR = '#b45309'
const SAMPLE_MAX = 120_000
const SAMPLE_STEP = 2_000

export function Box1MarginaleCurveCard({
  year = 2026,
  /** Eigen bruto-inkomen om als positie-markering op de curve te tonen. */
  grossYearlyIncome,
  aow = false,
}: {
  year?: Box1TaxYear
  grossYearlyIncome?: number
  aow?: boolean
}) {
  // Sample 0 … 120.000 in stappen van 2.000.
  const data: MarginaleDrukPunt[] = []
  for (let income = 0; income <= SAMPLE_MAX; income += SAMPLE_STEP) {
    data.push({ income, rate: marginalRateAt(income, year, aow) })
  }

  const params = BOX1_PARAMS[year]
  const schijven = aow ? params.schijvenAow : params.schijven

  // Cliffs op de schijfgrenzen + de afbouw-zones van de heffingskortingen.
  const cliffs: MarginaleDrukCliff[] = []
  // Schijfgrenzen (alle behalve de open bovenste).
  for (const schijf of schijven) {
    if (schijf.tot != null && schijf.tot <= SAMPLE_MAX) {
      cliffs.push({ income: schijf.tot, label: 'Schijf' })
    }
  }
  // Afbouw-zones: hier verspringt het marginale tarief omhoog.
  if (params.algemeneHeffingskorting.afbouwStart <= SAMPLE_MAX) {
    cliffs.push({
      income: params.algemeneHeffingskorting.afbouwStart,
      label: 'Afbouw alg.',
    })
  }
  if (params.arbeidskorting.afbouwStart <= SAMPLE_MAX) {
    cliffs.push({
      income: params.arbeidskorting.afbouwStart,
      label: 'Afbouw arb.',
    })
  }

  // Eigen-inkomen markering (als geldige positie binnen het bereik).
  const eigenInkomen =
    grossYearlyIncome != null &&
    grossYearlyIncome > 0 &&
    grossYearlyIncome <= SAMPLE_MAX
      ? grossYearlyIncome
      : null
  if (eigenInkomen != null) {
    cliffs.push({ income: eigenInkomen, label: 'Jij' })
  }

  const eigenMarginaal =
    eigenInkomen != null ? marginalRateAt(eigenInkomen, year, aow) : null

  return (
    <div className="bg-[var(--paper)] border border-[var(--border-ed)] p-5 sm:p-6">
      <Kicker>Marginale druk over je inkomen</Kicker>
      <p
        className="mt-2 mb-4 text-sm italic text-[var(--ink-2)] leading-snug max-w-[60ch]"
        style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
      >
        Van élke extra verdiende euro houd je niet alles. Deze curve toont
        hoeveel naar de schatkist gaat op elk inkomensniveau — inclusief de
        schijfgrenzen en de afbouw van heffingskortingen.
      </p>

      <MarginaleDrukCurve
        data={data}
        cliffs={cliffs}
        referenceRate={0.5}
        colorVar={BOX1_COLOR}
      />

      {eigenMarginaal != null && eigenInkomen != null && (
        <div className="mt-4 flex flex-wrap items-baseline gap-x-2.5 gap-y-1 border-t border-[var(--border-ed)] pt-3 text-sm text-[var(--ink-2)]">
          <span>
            Bij jouw geschatte inkomen van{' '}
            <span className="font-mono tabular-nums text-[var(--ink)]">
              {formatCurrency(eigenInkomen)}
            </span>{' '}
            is je marginale tarief
          </span>
          <span
            className="text-[22px] font-black tabular-nums tracking-[-0.01em] leading-none"
            style={{ fontFamily: 'var(--font-playfair, Georgia, serif)', color: BOX1_COLOR }}
          >
            {(eigenMarginaal * 100).toFixed(1)}%
          </span>
        </div>
      )}

      <p
        className="mt-3 text-[12px] italic text-[var(--ink-3)] leading-snug"
        style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
      >
        Indicatie, geen advies — o.b.v. de schijven en heffingskortingen {year}.
      </p>
    </div>
  )
}
