'use client'

import { useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { CategoryTabs } from '@/components/core/category-tabs'
import { useDisplayMode, type DisplayMode } from '@/lib/hooks/use-display-mode'
import type { PeriodKind } from '@/lib/transaction-insights'

/**
 * PeriodeSelector — periode-keuze + kalender-navigatie voor de
 * transactie-analysepagina (/overzicht/budget/transacties).
 *
 * Presentational op één punt na: de weergavemodus leest hij zélf uit
 * `useDisplayMode()` (het enige leespad — geen prop-drilling van de rauwe
 * waarde). Alle overige state (period/offset/label/canGoForward) komt van de
 * orchestrator; wijzigingen gaan terug via `onPeriodChange` / `onOffsetChange`.
 *
 * WEERGAVEMODUS (TXN-2, herzien 10 aug 2026): in **Eenvoudig** zijn er drie
 * periodes — "30 dagen", "Maand" en "Jaar". De oorspronkelijke reductie liet
 * alleen 30 dagen en jaar staan, maar een kalendermaand is voor de meeste
 * mensen juist de natuurlijke eenheid ("wat gaf ik in juli uit") — en omdat
 * Eenvoudig de standaard is voor nieuwe profielen, was dat de eerste ervaring.
 * Maand hoort dus bij de rust, niet bij de diepte. Alleen **Kwartaal** blijft
 * diepte en staat uitsluitend in Volledig, waar alle vier de tabs ongewijzigd
 * blijven. Dit is puur een keuze-reductie: hoe een periode wordt berekend
 * (`resolvePeriodWindow`) blijft in beide modi identiek.
 *
 * Design (Editorial Finance):
 * - Hergebruikt `CategoryTabs` (krant-kicker-stijl tab-strip) voor de
 *   periode-keuze, zodat de tabs identiek aan de rest van de app ogen.
 * - Onder de tabs een `‹ {label} ›`-navigatierij. Voor het rollende
 *   '30d'-venster heeft kalender-navigatie geen betekenis → de rij wordt
 *   verborgen en enkel het label getoond.
 * - Touch-targets ≥ 44px (WCAG) op de chevron-knoppen.
 */

const PERIOD_TABS: { key: PeriodKind; label: string }[] = [
  { key: '30d', label: '30 dagen' },
  { key: 'month', label: 'Maand' },
  { key: 'quarter', label: 'Kwartaal' },
  { key: 'year', label: 'Jaar' },
]

/** De periodes die in Eenvoudig bestaan (TXN-2). Volgorde = tab-volgorde. */
export const SIMPLE_PERIOD_KEYS: readonly PeriodKind[] = ['30d', 'month', 'year']

/**
 * De periode die in deze modus daadwerkelijk getoond kan worden.
 *
 * Nodig omdat de keuze bewaard blijft: wie in Volledig "Kwartaal" koos en
 * daarna naar Eenvoudig schakelt, heeft een periode geselecteerd die daar geen
 * tab meer heeft. Zonder terugval zou de tab-strip niets actiefs tonen. We
 * vallen terug op '30d' — het dichtstbijzijnde venster én de standaard van de
 * pagina.
 *
 * Bewust een PURE functie op de bewaarde keuze in plaats van een effect dat de
 * state overschrijft: terugschakelen naar Volledig levert zo weer exact de
 * oorspronkelijke keuze op ("Volledig blijft ongewijzigd").
 */
export function resolvePeriodForMode(period: PeriodKind, mode: DisplayMode): PeriodKind {
  if (mode !== 'simple') return period
  return SIMPLE_PERIOD_KEYS.includes(period) ? period : '30d'
}

export function PeriodeSelector({
  period,
  offset,
  label,
  canGoForward,
  onPeriodChange,
  onOffsetChange,
}: {
  period: PeriodKind
  offset: number
  label: string
  canGoForward: boolean
  onPeriodChange: (p: PeriodKind) => void
  onOffsetChange: (delta: number) => void
}) {
  // 'offset' is onderdeel van de publieke prop-API zodat de orchestrator de
  // huidige selectie kan doorgeven; de navigatierij stuurt via relatieve
  // deltas (-1 / +1) i.p.v. de absolute offset, dus we lezen 'offset' hier
  // niet rechtstreeks uit. Void-referentie houdt de lint-regel tevreden.
  void offset

  const { mode } = useDisplayMode()

  // Eenvoudig: drie periodes (kwartaal is diepte). Volledig: alle vier — ongewijzigd.
  const tabs = useMemo(
    () =>
      mode === 'simple'
        ? PERIOD_TABS.filter((t) => SIMPLE_PERIOD_KEYS.includes(t.key))
        : PERIOD_TABS,
    [mode],
  )

  // Het rollende 30-dagen-venster kent geen kalender-navigatie.
  const showNav = period !== '30d'

  return (
    <div className="space-y-2.5">
      <CategoryTabs
        tabs={tabs}
        activeKey={period}
        onChange={(key) => onPeriodChange(key as PeriodKind)}
      />

      {showNav ? (
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => onOffsetChange(-1)}
            aria-label="Vorige periode"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center text-[var(--ink-3)] transition-colors hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <span className="min-w-0 flex-1 truncate text-center text-sm font-medium capitalize text-[var(--ink)]">
            {label}
          </span>

          <button
            type="button"
            onClick={() => onOffsetChange(1)}
            disabled={!canGoForward}
            aria-label="Volgende periode"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center text-[var(--ink-3)] transition-colors hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] disabled:cursor-default disabled:opacity-30 disabled:hover:text-[var(--ink-3)]"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      ) : (
        <p className="px-1 text-sm font-medium text-[var(--ink-2)]">{label}</p>
      )}
    </div>
  )
}
