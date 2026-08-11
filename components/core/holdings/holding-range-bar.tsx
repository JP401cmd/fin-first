'use client'

/**
 * 52-weeks bereikstrook — het detail ín een holding-rij dat een kale koers van
 * context voorziet.
 *
 * "€ 208" zegt iets heel anders naast een jaarbereik van € 61–€ 330 dan naast
 * € 200–€ 215. De strook toont waar de huidige koers staat tussen de laagste en
 * hoogste koers van de afgelopen 52 weken (laag links, hoog rechts, marker op
 * vandaag) plus de afstand tot de jaartop in procenten.
 *
 * Wat de strook NIET doet is even belangrijk:
 *  - **NULL = niets tonen.** `fifty_two_week_high`/`_low` staan leeg tot de
 *    eerstvolgende koersvernieuwing, en niet elke positie noteert (turbo's,
 *    handmatige regels). Een lege strook zou een bereik suggereren dat niemand
 *    gemeten heeft.
 *  - **Inconsistente data = niets tonen.** `high <= low`, of een koers buiten
 *    het bereik: dan is de meting zichzelf tegengesproken, en is niets eerlijker
 *    dan een marker die buiten de balk hangt.
 *
 * Bedragen volgen `useMaskedAmounts()`: in privacy-modus verdwijnen de twee
 * eindkoersen en blijft alleen de vorm + het percentage staan — een percentage
 * is geen bedrag en verklapt de orde van grootte van de portefeuille niet.
 *
 * Geen vrijheidstijd hier: dit is een koers per stuk (de eenheidsprijs naast
 * zijn eigen jaarbereik), geen vermogensbedrag. De marktwaarde van de rij
 * draagt die duiding, niet deze strook.
 *
 * Kleur uitsluitend via module-/ink-tokens. Bewust géén rood/groen: onder de
 * jaartop staan is geen fout en boven het jaardieptepunt geen prestatie — het
 * is positie-informatie, geen oordeel.
 */

import { useMaskedAmounts } from '@/lib/hooks/use-privacy'

export type HoldingRangeBarProps = {
  /** Laagste koers in 52 weken, zelfde valuta/eenheid als `current`. */
  low: number | null | undefined
  /** Hoogste koers in 52 weken, zelfde valuta/eenheid als `current`. */
  high: number | null | undefined
  /** Huidige koers per eenheid. */
  current: number
  /** Valuta van de koers; leeg/ontbrekend = EUR. */
  currency?: string | null
  testId?: string
}

/**
 * Weergave-model van de strook, of `null` wanneer er niets te tonen valt.
 * Puur presentatie: geen financiële motor, alleen de positie binnen een bereik
 * dat de koersfeed al heeft vastgesteld.
 */
export function rangeBarModel(
  low: number | null | undefined,
  high: number | null | undefined,
  current: number,
): { positionPct: number; belowHighPct: number } | null {
  if (low == null || high == null) return null
  if (!Number.isFinite(low) || !Number.isFinite(high) || !Number.isFinite(current)) return null
  // Een niet-positief bereik is geen koersbereik; ook de afstand-tot-de-top zou
  // er door nul delen.
  if (high <= 0) return null
  if (high <= low) return null
  if (current < low || current > high) return null

  return {
    positionPct: ((current - low) / (high - low)) * 100,
    belowHighPct: ((high - current) / high) * 100,
  }
}

export function HoldingRangeBar({
  low,
  high,
  current,
  currency,
  testId,
}: HoldingRangeBarProps) {
  const { masked } = useMaskedAmounts()
  const model = rangeBarModel(low, high, current)
  if (!model) return null

  const { positionPct, belowHighPct } = model
  const onTop = belowHighPct < 0.05
  const topLabel = onTop ? 'op de jaartop' : `${formatPct(belowHighPct)} onder de top`

  const lowText = formatUnitPrice(low as number, currency)
  const highText = formatUnitPrice(high as number, currency)
  const currentText = formatUnitPrice(current, currency)

  // `role="img"` + één label: de losse cijfers eromheen zijn de visuele vorm van
  // dezelfde zin, en zouden los voorgelezen als losse fragmenten langskomen.
  const ariaLabel = masked
    ? `Koers binnen het 52-weeks bereik, ${topLabel}.`
    : `Koers ${currentText} binnen het 52-weeks bereik ${lowText} tot ${highText}, ${topLabel}.`

  return (
    <div
      className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1"
      role="img"
      aria-label={ariaLabel}
      data-testid={testId}
    >
      <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--ink-4)]">
        52 wk
      </span>
      {!masked && (
        <span className="font-mono text-[10px] tabular-nums text-[var(--ink-3)]">
          {lowText}
        </span>
      )}
      <span className="relative h-[3px] min-w-[56px] flex-1 bg-[var(--rule-soft)]">
        {/* Afgelegde weg vanaf het jaardieptepunt — zachte module-tint. */}
        <span
          className="absolute inset-y-0 left-0 bg-[var(--module-active-300)]"
          style={{ width: `${positionPct}%` }}
        />
        {/* Marker op de huidige koers — smalle ink-tick, leest ook op 3px hoogte. */}
        <span
          className="absolute h-[9px] w-[2px] bg-[var(--ink)]"
          style={{ left: `${positionPct}%`, top: '50%', transform: 'translate(-50%, -50%)' }}
          data-testid={testId ? `${testId}-marker` : undefined}
        />
      </span>
      {!masked && (
        <span className="font-mono text-[10px] tabular-nums text-[var(--ink-3)]">
          {highText}
        </span>
      )}
      <span className="font-mono text-[10px] tabular-nums text-[var(--ink-3)]">
        {topLabel}
      </span>
    </div>
  )
}

/** Percentage in nl-notatie, één decimaal — '8,3%'. */
function formatPct(value: number): string {
  return `${value.toFixed(1).replace('.', ',')}%`
}

/**
 * Koers per eenheid, twee decimalen (anders verdwijnt het verschil tussen
 * € 61,20 en € 61,80 op goedkope fondsen). Valt terug op een kale notatie
 * wanneer de browser de ISO-code niet kent — spiegelt `formatCurrencyOf` in
 * `investment-holding-pane.tsx`.
 */
function formatUnitPrice(value: number, currency?: string | null): string {
  const cur = currency && currency.trim() !== '' ? currency : 'EUR'
  try {
    return new Intl.NumberFormat('nl-NL', {
      style: 'currency',
      currency: cur,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    return `${value.toFixed(2)} ${cur}`
  }
}
