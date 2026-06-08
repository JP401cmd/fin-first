import { Clock } from 'lucide-react'
import { formatCurrency, calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'
import type { TaxOverviewResult } from '@/lib/tax-overview'
import { Kicker, HighlightMark } from '@/components/editorial'

const PLAYFAIR = 'var(--font-playfair, Georgia, serif)'

/**
 * HubTotaleDruk (C1) — editorial hero-cijfer met de totale belastingdruk over
 * de boxen.
 *
 * Het jaartotaal (Box 1 + Box 3 [+ Box 2 indien bekend]) krijgt het
 * Playfair-hero-formaat met de vrijheidstijd-subregel eronder ("Geld is
 * opgeslagen tijd": elk €-bedrag > €100 krijgt zijn vrijheidstijd-equivalent).
 * Daaronder effectief- en marginaal-tarief als mono-data.
 *
 * Bewust presentationeel/server-compatible: de hub-pagina rekent het overzicht
 * server-side uit (`buildTaxOverview`) en levert een kant-en-klaar resultaat +
 * dag-uitgaven (voor de vrijheidstijd) aan.
 *
 * De eerlijkheids-/perspectief-annotatie (Box 1 per persoon, Box 3 volgens
 * weergave, "excl. Box 2", "indicatie, geen advies") wordt nu één niveau hoger,
 * op de hub-pagina zelf, gerenderd als gedeelde `ScenarioCallout` onder de
 * druk-sectie. Daarom dragen `exclBox2`/`box3PerspectiveAware` hier geen eigen
 * UI meer — ze blijven in de prop-signatuur voor bron-compat en latere her-inzet.
 */
export function HubTotaleDruk({
  overview,
  dailyExpenses,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  exclBox2: _exclBox2,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  box3PerspectiveAware: _box3PerspectiveAware,
}: {
  overview: TaxOverviewResult
  /** Dag-uitgaven voor de vrijheidstijd-omrekening. */
  dailyExpenses: number
  /** Box 2 is relevant maar niet in het totaal meegerekend → annotatie (nu op hub-niveau). */
  exclBox2?: boolean
  /** Box 3 weerspiegelt het huishoud-/partner-perspectief → eerlijkheidsregel (nu op hub-niveau). */
  box3PerspectiveAware?: boolean
}) {
  const { total, effectiveRate, marginalRate } = overview

  const freedom = calculateFreedomTime(total, dailyExpenses)
  const freedomStr = formatFreedomTimeString(freedom)
  const showFreedom = total > 100 && (freedom.totalDays > 0 || freedom.isInfinite)

  const effPct = effectiveRate != null ? Math.round(effectiveRate * 1000) / 10 : null
  const margPct = marginalRate != null ? Math.round(marginalRate * 1000) / 10 : null

  return (
    <article className="bg-[var(--paper)] p-5 sm:p-6 flex flex-col">
      <Kicker>Totale druk · {new Date().getFullYear()}</Kicker>

      {/* Hero-cijfer in Playfair — papier-zwaar, tabular-nums. Op de hub is dit
          de gouden "universele uitkomst": HighlightMark zet er de gouden marker
          onder (--module-active-200 is hier de hub-highlight, niet box-codering). */}
      <div className="mt-4 flex items-baseline gap-3 flex-wrap">
        <HighlightMark>
          <span
            className="font-black leading-[0.9] tracking-[-0.03em] tabular-nums text-[40px] sm:text-[52px] text-[var(--ink)]"
            style={{ fontFamily: PLAYFAIR }}
          >
            {formatCurrency(Math.round(total))}
          </span>
        </HighlightMark>
        <span
          className="italic text-sm text-[var(--ink-3)]"
          style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
        >
          per jaar
        </span>
      </div>

      {/* Vrijheidstijd-subregel — verplicht bij elk groot bedrag. */}
      {showFreedom && (
        <div className="mt-2.5 flex items-center gap-1.5 text-xs text-[var(--ink-2)]">
          <Clock className="h-3.5 w-3.5 shrink-0 text-[var(--ink-3)]" aria-hidden="true" />
          <span>
            {freedom.isInfinite ? '∞ vrijheid' : freedomStr} per jaar opgeofferd aan belasting
          </span>
        </div>
      )}

      {(effPct != null || margPct != null) && (
        <div className="mt-auto pt-5 flex items-center gap-8 text-xs">
          {effPct != null && (
            <div>
              <div className="text-[10px] uppercase tracking-[0.16em] font-mono text-[var(--ink-3)]">
                Effectief
              </div>
              <div className="mt-1 font-mono tabular-nums text-lg font-semibold text-[var(--ink)]">
                {effPct}%
              </div>
            </div>
          )}
          {margPct != null && (
            <div>
              <div className="text-[10px] uppercase tracking-[0.16em] font-mono text-[var(--ink-3)]">
                Marginaal
              </div>
              <div className="mt-1 font-mono tabular-nums text-lg font-semibold text-[var(--ink)]">
                {margPct}%
              </div>
            </div>
          )}
        </div>
      )}
    </article>
  )
}
