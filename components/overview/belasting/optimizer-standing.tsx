'use client'

import { SectionLabel, FiguresStrip } from '@/components/editorial'
import { PerspectiveContextLabel } from '@/components/app/perspective-context-label'
import { VerdelingStaaf } from './verdeling-staaf'
import { BOX3_PARAMS, type TaxYear } from '@/lib/box3-data'
import type { OptimizerCurrentStanding } from '@/lib/tax-optimizer'

const PLAYFAIR = 'var(--font-playfair, Georgia, serif)'
const SOURCE_SERIF = 'var(--font-source-serif, Georgia, serif)'

/** Percentage in NL-notatie. De `*Pct`-velden dragen al een percentage-getal. */
function pct(value: number, digits = 2): string {
  return `${value.toLocaleString('nl-NL', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`
}

/**
 * Katern I — "Waar je nu staat". De referentie waar elk scenario in katern II
 * tegen afzet: de heffing van nu, de effectieve druk, hoeveel van de vrijstelling
 * benut is en wat de heffing je in vrijheidsdagen kost.
 *
 * Puur presentatie: alle cijfers komen uit `standing` (buildCurrentStanding, op
 * basis van de canonieke Box 3-motor). De forfait-percentages in de legenda
 * komen uit BOX3_PARAMS — de bron die de motor zélf gebruikt.
 */
export function OptimizerStanding({
  standing,
  year,
  perspectiveAware,
  fc,
}: {
  standing: OptimizerCurrentStanding
  year: TaxYear
  perspectiveAware: boolean
  fc: (v: number) => string
}) {
  const params = BOX3_PARAMS[year]
  // Zelfde noemer én kleurbron als de canonieke Box3Mix (box3-mix.tsx): de
  // staaf toont uitsluitend spaargeld + beleggingen — de mix die het forfait
  // bepaalt en waarover ook "Effectieve druk" hierboven rekent
  // (estimateBox3TaxDrag deelt door dezelfde som). Schulden staan als aparte
  // aftrekregel ónder de staaf, niet als positief segment erin.
  const segments = [
    {
      label: `Spaargeld · forfait ${pct(params.forfaitSpaargeld * 100)}`,
      value: standing.totaalSpaargeld,
      colorVar: 'var(--module-active-600)',
    },
    {
      label: `Beleggingen · forfait ${pct(params.forfaitBeleggingen * 100)}`,
      value: standing.totaalBeleggingen,
      colorVar: 'var(--module-active-400)',
    },
  ]
  const mixTotal = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0)

  return (
    <section id="optimizer-nu" className="scroll-mt-24">
      <SectionLabel num="I">Uitgangspunt</SectionLabel>
      <div className="-mt-3 mb-4">
        <h2
          className="text-[22px] sm:text-[26px] font-black leading-tight tracking-[-0.02em] text-[var(--ink)]"
          style={{ fontFamily: PLAYFAIR }}
        >
          Waar je{' '}
          <em className="font-normal italic" style={{ color: 'var(--module-active-700)' }}>
            nu
          </em>{' '}
          staat
        </h2>
        <p
          className="mt-1.5 max-w-[64ch] text-sm italic leading-snug text-[var(--ink-2)]"
          style={{ fontFamily: SOURCE_SERIF }}
        >
          De referentie waar elke keuze tegen afzet: je Box 3-mix, wat je dit jaar betaalt en
          hoeveel van je vrijstelling je benut.
        </p>
      </div>

      {perspectiveAware && (
        <div className="mb-2">
          <PerspectiveContextLabel />
        </div>
      )}

      <FiguresStrip
        cols={4}
        figures={[
          {
            kicker: 'Heffing nu',
            amount: fc(standing.tax),
            sub: `Box 3 · per jaar (${year})`,
            // Hoofduitkomst van dit katern → verplichte highlight-marker
            // (quality-checklist: één per sectie, alleen op het ankergetal).
            variant: 'winner',
          },
          {
            kicker: 'Effectieve druk',
            amount: pct(standing.effectieveDrukPct),
            sub: 'van je Box 3-vermogen',
          },
          {
            kicker: 'Heffingsvrij benut',
            amount: pct(standing.vrijstellingBenutPct, 0),
            sub: `van ${fc(standing.heffingsvrijVermogen)}${
              standing.hasPartner ? ' (samen met je fiscaal partner)' : ''
            }`,
          },
          {
            kicker: 'Kost je per jaar',
            amount: `${standing.taxFreedomDays} dagen`,
            sub: 'vrijheid, tegen je dagtarief',
          },
        ]}
      />

      {mixTotal > 0 && (
        <div className="mt-5">
          <VerdelingStaaf segments={segments} showLegend={false} />
          <ul className="mt-3 space-y-1.5">
            {segments.map((s) => {
              const share = mixTotal > 0 ? Math.round((Math.max(0, s.value) / mixTotal) * 100) : 0
              return (
                <li key={s.label} className="flex items-center gap-2.5">
                  <span
                    aria-hidden
                    className="block h-2.5 w-2.5 shrink-0 border border-[var(--ink)]"
                    style={{ backgroundColor: s.colorVar }}
                  />
                  <span className="min-w-0 flex-1 text-xs text-[var(--ink-2)]">{s.label}</span>
                  <span className="shrink-0 font-mono text-[10px] tabular-nums text-[var(--ink-4)]">
                    {share}%
                  </span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--ink)]">
                    {fc(s.value)}
                  </span>
                </li>
              )
            })}
            {standing.totaalBox3Schulden > 0 && (
              <li className="flex items-center gap-2.5 border-t border-dotted border-[var(--rule-soft)] pt-1.5">
                <span
                  aria-hidden
                  className="block h-2.5 w-2.5 shrink-0 border border-[var(--ink)] bg-transparent"
                />
                <span className="min-w-0 flex-1 text-xs text-[var(--ink-2)]">
                  Box 3-schulden · aftrekbaar boven de drempel
                </span>
                <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--ink-2)]">
                  − {fc(standing.totaalBox3Schulden)}
                </span>
              </li>
            )}
          </ul>
        </div>
      )}
    </section>
  )
}
