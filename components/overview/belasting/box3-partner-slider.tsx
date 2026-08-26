'use client'

import { useState } from 'react'
import { Clock, Users } from 'lucide-react'
import { Box3SectionHeader } from './box3-section-header'
import { AandachtspuntActieButton } from './aandachtspunt-actie-button'
import { ScenarioCallout, FiguresStrip } from '@/components/editorial'
import {
  formatMaskedCurrency,
  calculateFreedomTime,
  formatFreedomTimeString,
} from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { calculatePartnerSplit, type PartnerAllocation, type TaxYear } from '@/lib/box3-data'

const SOURCE_SERIF = 'var(--font-source-serif, Georgia, serif)'

/**
 * box3-partner-slider (3.6) — Partner-allocatie verdeel-slider.
 *
 * ALLEEN household. Met één slider verschuif je het GECOMBINEERDE Box
 * 3-vermogen (spaargeld + beleggingen + schulden samen, dezelfde % voor elke
 * categorie) tussen partner 1 (jij) en partner 2. We rekenen de totale heffing
 * bij die verdeling live door via `calculatePartnerSplit` en zetten dat naast
 * de optimale verdeling (uit `optimizePartnerAllocation`).
 *
 * Caller geeft de gecombineerde categorie-totalen + de volledige
 * `optimalAllocation` + jaar door (alles perspectief-correct uit het
 * fundament). Privacy-bewust via formatMaskedCurrency.
 */

// Box-accent via de actieve module-context (de box-layout zet --module-active-*).
const ACCENT_700 = 'var(--module-active-700)'

export function Box3PartnerSlider({
  totaalSpaargeld,
  totaalBeleggingen,
  totaalBox3Schulden,
  optimalAllocation,
  year,
  dailyExpenses,
  currentUserName = 'Jij',
  partnerName = 'Partner',
}: {
  totaalSpaargeld: number
  totaalBeleggingen: number
  totaalBox3Schulden: number
  optimalAllocation: PartnerAllocation
  year: TaxYear
  dailyExpenses: number
  currentUserName?: string
  partnerName?: string | null
}) {
  const { masked } = useMaskedAmounts()
  const fc = (v: number) => formatMaskedCurrency(v, masked)
  // pct = aandeel van het vermogen dat bij partner 1 (jij) ligt.
  const [pct, setPct] = useState(50)

  const frac = pct / 100
  const p1s = totaalSpaargeld * frac
  const p1b = totaalBeleggingen * frac
  const p1sch = totaalBox3Schulden * frac

  const split = calculatePartnerSplit(
    p1s,
    p1b,
    p1sch,
    totaalSpaargeld - p1s,
    totaalBeleggingen - p1b,
    totaalBox3Schulden - p1sch,
    year,
  )

  const optimalTax = optimalAllocation.totalTax
  // Hoeveel je met de huidige slider-stand méér betaalt dan optimaal.
  const extraVsOptimal = Math.max(0, split.totalTax - optimalTax)
  const isOptimal = extraVsOptimal < 1

  // Optimale verdeling als percentage spaargeld bij partner 1 (indicatief —
  // gebruikt om de slider-context te duiden).
  const optimalPctP1 =
    totaalSpaargeld + totaalBeleggingen > 0
      ? Math.round(
          ((optimalAllocation.partner1Spaargeld + optimalAllocation.partner1Beleggingen) /
            (totaalSpaargeld + totaalBeleggingen)) *
            100,
        )
      : 50

  const partner = partnerName ?? 'Partner'

  return (
    <div className="border-t border-[var(--ink)] px-4 py-5 sm:px-7">
      <Box3SectionHeader num="3.6">
        <span className="inline-flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" style={{ color: ACCENT_700 }} aria-hidden="true" />
          Verdeel het vermogen
        </span>
      </Box3SectionHeader>
      <p
        className="mb-4 text-sm italic leading-snug text-[var(--ink-2)]"
        style={{ fontFamily: SOURCE_SERIF }}
      >
        Als fiscaal partners mag je het Box 3-vermogen onderling verdelen. Schuif om
        te zien hoe de totale heffing verandert — en hoe dicht je bij de optimale
        verdeling zit.
      </p>

      {/* Slider */}
      <div className="mb-4">
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <span className="text-xs text-[var(--ink-2)]">
            {currentUserName} <span className="font-mono tabular-nums">{pct}%</span>
          </span>
          <span className="text-xs text-[var(--ink-2)]">
            <span className="font-mono tabular-nums">{100 - pct}%</span> {partner}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={pct}
          onChange={(e) => setPct(Number(e.target.value))}
          className="w-full accent-[var(--module-active-500)]"
          aria-label={`Aandeel ${currentUserName}: ${pct} procent`}
        />
        <div className="mt-0.5 flex justify-between text-[10px] tabular-nums text-[var(--ink-4)]">
          <span>{fc(Math.round(p1s + p1b))}</span>
          <span>{fc(Math.round(totaalSpaargeld + totaalBeleggingen - p1s - p1b))}</span>
        </div>
      </div>

      {/* Live heffing vs. optimaal — via FiguresStrip (top/bottom-rule) */}
      <FiguresStrip
        cols={2}
        figures={[
          {
            kicker: 'Bij deze verdeling',
            amount: fc(split.totalTax),
          },
          {
            kicker: `Optimaal (≈ ${optimalPctP1}/${100 - optimalPctP1})`,
            amount: fc(optimalTax),
            variant: 'winner',
          },
        ]}
      />

      {/* Verdict */}
      {isOptimal ? (
        <p
          className="mt-4 text-base italic leading-snug text-[var(--positive)]"
          style={{ fontFamily: SOURCE_SERIF }}
        >
          Dit is de optimale verdeling — je benut beide heffingsvrije vermogens
          maximaal.
        </p>
      ) : (
        <p
          className="mt-4 text-base italic leading-snug text-[var(--ink)]"
          style={{ fontFamily: SOURCE_SERIF }}
        >
          Deze verdeling kost{' '}
          <span className="not-italic font-mono tabular-nums font-bold text-[var(--ink)]">
            {fc(Math.round(extraVsOptimal))}
          </span>{' '}
          meer dan optimaal
          {!masked && extraVsOptimal / Math.max(dailyExpenses, 1) >= 0.5 && (
            <span className="inline-flex items-center gap-1 not-italic text-[var(--ink-3)]">
              {' '}
              <Clock className="h-3 w-3" aria-hidden="true" />
              {formatFreedomTimeString(
                calculateFreedomTime(extraVsOptimal, dailyExpenses),
                'short',
              )}
            </span>
          )}
          .
        </p>
      )}

      {/* "Voeg toe als actie" — alleen wanneer de huidige verdeling suboptimaal
          is (er valt heffing terug te winnen door te herverdelen). */}
      {!isOptimal && extraVsOptimal >= 1 && (
        <div className="mt-3">
          <AandachtspuntActieButton
            id="tax:box3-partner-allocatie"
            domain="tax"
            title="Optimaliseer de Box 3-verdeling met je partner"
            // H24: dode `description` verwijderd — nooit uitgelezen.
            savings={Math.round(extraVsOptimal)}
            freedomDays={
              dailyExpenses > 0 ? Math.round(extraVsOptimal / dailyExpenses) : 0
            }
            href="/overzicht/belasting/box3"
          />
        </div>
      )}

      <ScenarioCallout title="Indicatie, geen advies." className="mt-4 text-xs">
        De verdeling verschuift spaargeld en beleggingen met hetzelfde percentage;
        in de aangifte mag je elke categorie vrij toewijzen.
      </ScenarioCallout>
    </div>
  )
}
