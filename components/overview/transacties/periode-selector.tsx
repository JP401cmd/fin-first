'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { CategoryTabs } from '@/components/core/category-tabs'
import type { PeriodKind } from '@/lib/transaction-insights'

/**
 * PeriodeSelector — periode-keuze + kalender-navigatie voor de
 * transactie-analysepagina (/overzicht/cashflow/transacties).
 *
 * Presentational: alle state (period/offset/label/canGoForward) komt van de
 * orchestrator; dit component rendert enkel de controls en propt wijzigingen
 * terug via `onPeriodChange` / `onOffsetChange`.
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

  // Het rollende 30-dagen-venster kent geen kalender-navigatie.
  const showNav = period !== '30d'

  return (
    <div className="space-y-2.5">
      <CategoryTabs
        tabs={PERIOD_TABS}
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
