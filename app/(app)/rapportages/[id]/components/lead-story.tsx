'use client'

import { useCallback } from 'react'
import type { ReportKernSection } from '@/lib/report-data'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { useResolvedModuleColor } from '@/lib/hooks/use-resolved-module-color'
import { EditorialHeadline, EditorialDeck, Kicker } from '@/components/editorial'
import { ReportSparkline } from './report-sparkline'

export function LeadStory({
  kern,
  accentColor = '#6b4339',
}: {
  kern: ReportKernSection
  /**
   * Hex-fallback for the sparkline stroke; needed because SVG attributes don't
   * always resolve CSS-vars (especially across print engines). The component
   * resolves `--module-active-700` at runtime and uses that — falling back to
   * this hex when the var is unavailable or during print.
   */
  accentColor?: string
}) {
  const { masked } = useMaskedAmounts()
  const fc = useCallback((v: number) => formatMaskedCurrency(v, masked), [masked])
  const resolvedAccent = useResolvedModuleColor('--module-active-700', accentColor)
  const growth = kern.netWorthGrowth ?? 0
  const isPositive = growth > 0
  const isNegative = growth < 0

  // Headline shape: "Vermogen <em>groeit/daalt</em> met €X" — the verb carries
  // the editorial weight and gets the italic-em treatment via EditorialHeadline.
  // Stable verb-stays-zero ("stabiel") gets no emphasis — it's not a movement,
  // it's the absence of one, and italics would over-dramatize a flat period.
  const headlineText = isPositive
    ? `Vermogen groeit met ${fc(growth)}`
    : isNegative
      ? `Vermogen daalt met ${fc(Math.abs(growth))}`
      : 'Vermogen stabiel deze periode'
  const headlineEmphasis = isPositive
    ? 'groeit'
    : isNegative
      ? 'daalt'
      : undefined

  return (
    <div className="report-section mb-10">
      <Kicker className="mb-2">Vermogen</Kicker>
      <EditorialHeadline level="h2" size="lg" emphasis={headlineEmphasis}>
        {headlineText}
      </EditorialHeadline>

      <EditorialDeck className="mt-3">
        Een redactionele samenvatting. Wat er groeide, wat er kromp, wat er overbleef.
      </EditorialDeck>

      {kern.netWorthStart != null && kern.netWorthEnd != null && (
        <p className="mt-3 font-source-serif text-base text-[var(--ink-2)]">
          Van {fc(kern.netWorthStart)} naar {fc(kern.netWorthEnd)}
          {kern.netWorthGrowthPct != null && (
            <span className="ml-2 inline-flex items-center gap-1 font-dm-mono text-sm">
              {isPositive ? (
                <TrendingUp className="h-4 w-4 text-[var(--positive)]" />
              ) : isNegative ? (
                <TrendingDown className="h-4 w-4 text-[var(--negative)]" />
              ) : (
                <Minus className="h-4 w-4 text-[var(--ink-3)]" />
              )}
              <span className={isPositive ? 'text-[var(--positive)]' : isNegative ? 'text-[var(--negative)]' : 'text-[var(--ink-3)]'}>
                {isPositive ? '+' : ''}{kern.netWorthGrowthPct}%
              </span>
            </span>
          )}
        </p>
      )}

      {kern.netWorthByPeriod.length >= 2 && (
        <ReportSparkline
          values={kern.netWorthByPeriod.map(d => d.value)}
          color={resolvedAccent}
          height={64}
          showFill={true}
          className="mt-4"
        />
      )}

      {/* Savings rate sparkline */}
      {kern.savingsRateByPeriod && kern.savingsRateByPeriod.length >= 2 && (
        <div className="mt-3">
          <p className="font-inter text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)] mb-1">
            Spaarquote per maand
          </p>
          <ReportSparkline
            values={kern.savingsRateByPeriod.map(d => d.rate)}
            color={resolvedAccent}
            height={40}
            showFill={false}
          />
        </div>
      )}

      {/*
        FreedomTimeBadge is intentionally removed here: the FiguresStrip above
        already carries the vrijheidstijd as its winner-cell with a single
        highlight-marker. Showing the badge here too creates duplicate emphasis
        and breaks the "one highlight per page-section" rule from the UI/UX
        skill.
      */}
    </div>
  )
}
