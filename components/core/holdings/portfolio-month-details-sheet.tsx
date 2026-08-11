'use client'

/**
 * Kassabon achter één maandbalk van de portefeuille-waardegrafiek.
 *
 * De balkweergave op `/core/assets/holdings` stapelt per maandanker één segment
 * per positie. Deze sheet is de leesbare kant van diezelfde stapel: welke
 * posities droegen die maand welk bedrag, en — even belangrijk — waaróp die
 * waardering rustte. Dat laatste is geen extraatje maar het eerlijkheidscontract
 * van de grafiek: een deel van de historische waarde komt van een échte
 * slotkoers, een deel van de laatst bekende transactieprijs, een deel van de
 * aankoopprijs. `tier` draagt dat per positie, en elke rij zegt het.
 *
 * Alle bedragen komen kant-en-klaar uit `GET /api/holdings/value-history`; deze
 * sheet rekent niets uit behalve het aandeel van een positie in het maandtotaal
 * (consume, don't recompute — CLAUDE.md). De vrijheidstijd-regel loopt via de
 * canonieke helpers in `lib/format.ts`.
 *
 * Vorm gespiegeld op `components/app/horizon/horizon-year-details-sheet.tsx`
 * (kassabon-stijl, geen OK-knop — sluiten via de ✕ van ShellOverlay).
 */

import { memo, useCallback, useMemo } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { OVERLAY_QUERY_KEYS } from '@/lib/navigation'
import {
  calculateFreedomTime,
  formatFreedomTimeString,
  formatMaskedCurrency,
} from '@/lib/format'

// ── Contract van de databron ─────────────────────────────────────
//
// Deze twee typen wonen hier (en niet in de grafiek) zodat de import-richting
// één kant op loopt: de grafiek kent de sheet, de sheet kent de grafiek niet.
// `portfolio-value-chart.tsx` her-exporteert ze voor consumers.

export type PortfolioValueHoldingSlice = {
  /** `investment_holdings.id` — de sleutel waarmee de detail-pane opent. */
  id: string
  /** Naam, of ticker, of 'Onbekende positie'. */
  name: string
  ticker: string | null
  /** Marktwaarde van DEZE positie op de peildatum, EUR. */
  value: number
  /** Waar de waardering op rustte: echte slotkoers, transactieprijs, kostprijs. */
  tier: 'market' | 'transaction' | 'cost'
}

/** De staart buiten de top-12 — als één regel samengevat. */
export type PortfolioValueRest = { count: number; value: number }

export type PortfolioMonthDetails = {
  /** 'YYYY-MM-01' (of de datum van het laatste punt: vandaag). */
  date: string
  /** Marktwaarde van alle open posities op die datum, EUR. */
  marketValue: number
  byHolding: PortfolioValueHoldingSlice[]
  rest: PortfolioValueRest | null
}

export type PortfolioMonthDetailsSheetProps = {
  open: boolean
  onClose: () => void
  /** Het maandpunt waarvan de posities getoond worden; `null` = niets te tonen. */
  details: PortfolioMonthDetails | null
  /**
   * Dagelijkse essentiële uitgaven (€/dag) uit `dailyExpenseRate`. 0 of
   * ontbrekend verbergt de vrijheidstijd-regel — liever geen duiding dan een
   * verzonnen dagtarief.
   */
  dailyExpenses?: number
}

// ── Weergave-helpers (puur presentatie, geen financiële logica) ──

/** 'Maart 2026' — UTC-parse zodat een tijdzone de maand niet laat verspringen. */
export function monthTitle(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`)
  if (isNaN(d.getTime())) return 'Maand'
  const label = d.toLocaleDateString('nl-NL', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

/** Waar de waardering van deze positie op rustte — in gewone taal. */
const TIER_LABEL: Record<PortfolioValueHoldingSlice['tier'], string> = {
  market: 'slotkoers',
  transaction: 'laatst bekende transactieprijs',
  cost: 'aankoopprijs',
}

/** Aandeel in het maandtotaal: één decimaal onder 10%, heel daarboven. */
function sharePct(value: number, total: number): string | null {
  if (!(total > 0)) return null
  const pct = (value / total) * 100
  if (!Number.isFinite(pct)) return null
  return pct >= 10 ? `${Math.round(pct)}%` : `${pct.toFixed(1).replace('.', ',')}%`
}

// ── De sheet ─────────────────────────────────────────────────────

export const PortfolioMonthDetailsSheet = memo(function PortfolioMonthDetailsSheet({
  open,
  onClose,
  details,
  dailyExpenses = 0,
}: PortfolioMonthDetailsSheetProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { masked } = useMaskedAmounts()
  const fc = useCallback((v: number) => formatMaskedCurrency(v, masked), [masked])

  const title = details ? monthTitle(details.date) : 'Maand'
  const total = details?.marketValue ?? 0
  const slices = details?.byHolding ?? []
  const rest = details?.rest ?? null

  /**
   * Opent de bestaande `InvestmentHoldingPane` door alleen `?holding=<id>` aan
   * de huidige route toe te voegen; overige query-state (bv. een `?asset=`-
   * filter) blijft staan. `replace` in plaats van `push` zodat het doorklikken
   * vanuit de kassabon de history niet vervuilt — zelfde keuze als de
   * holdings-lijst zelf maakt.
   */
  const openHolding = useCallback(
    (id: string) => {
      const params = new URLSearchParams(searchParams?.toString() ?? '')
      params.set(OVERLAY_QUERY_KEYS.holding, id)
      onClose()
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    },
    [router, pathname, searchParams, onClose],
  )

  // Vrijheidstijd van de maandwaarde — geld is opgeslagen tijd. Bij masking valt
  // de regel weg: hij zou de orde van grootte alsnog verklappen.
  const freedomText = useMemo(() => {
    if (dailyExpenses <= 0 || total <= 0) return null
    const breakdown = calculateFreedomTime(total, dailyExpenses)
    if (breakdown.isInfinite) return null
    return formatFreedomTimeString(breakdown, 'long')
  }, [dailyExpenses, total])

  return (
    <ShellOverlay open={open} onClose={onClose} kind="sheet" size="md" title={title}>
      <article className="px-5 pb-6 pt-2 sm:px-7" data-testid="portfolio-month-details">
        {/* Editorial kicker met streep */}
        <div className="mb-3 flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--ink-3)]">
          <span
            aria-hidden
            className="inline-block h-px w-7 shrink-0"
            style={{ background: 'var(--module-active-500)' }}
          />
          {/* Tel de staart mee: `slices` is afgekapt op de top-12, dus zonder
              `rest` zou de kop "12 posities" zeggen boven een kassabon die zelf
              "nog 28 posities" vermeldt. */}
          Kassabon · {(() => {
            const totaal = slices.length + (details?.rest?.count ?? 0)
            return totaal === 1 ? '1 positie' : `${totaal} posities`
          })()}
        </div>

        {/* Meta-strip: het maandtotaal als hoofdcijfer */}
        <div className="mb-5 flex items-baseline justify-between gap-3 border-t border-b border-[var(--ink)] py-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
            Marktwaarde
          </p>
          <p
            className="font-mono text-xl font-bold tabular-nums tracking-[-0.01em] text-[var(--ink)]"
            style={{
              background: 'linear-gradient(transparent 60%, var(--module-active-200) 60%)',
              display: 'inline-block',
              paddingLeft: '0.15em',
              paddingRight: '0.15em',
            }}
            data-testid="portfolio-month-total"
          >
            {fc(total)}
          </p>
        </div>

        {freedomText && !masked && (
          <p
            className="mb-5 border-l-2 border-[var(--module-active-500)] pl-3 font-serif text-[13px] italic leading-relaxed text-[var(--ink-2)]"
            data-testid="portfolio-month-freedom"
          >
            Op je essentiële uitgaven stond dit toen voor{' '}
            <span className="whitespace-nowrap font-mono not-italic tabular-nums text-[var(--ink)]">
              {freedomText}
            </span>{' '}
            vrijheid.
          </p>
        )}

        {slices.length === 0 ? (
          <p className="font-serif text-[13px] italic leading-relaxed text-[var(--ink-3)]">
            Voor deze maand zijn geen losse posities bekend.
          </p>
        ) : (
          <section>
            <div className="flex items-baseline justify-between gap-3 border-b border-[var(--border-ed)] pb-1.5">
              <h4 className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink)]">
                Posities
              </h4>
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-3)]">
                Aandeel
              </span>
            </div>
            <ul className="mt-1">
              {slices.map(slice => {
                const pct = sharePct(slice.value, total)
                return (
                  <li
                    key={slice.id}
                    className="border-b border-dotted border-[var(--border-ed)]/70 last:border-b-0"
                  >
                    <button
                      type="button"
                      onClick={() => openHolding(slice.id)}
                      className="flex w-full min-h-[44px] items-start justify-between gap-3 py-2.5 text-left transition-colors hover:bg-[var(--subtle)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--module-active-500)]"
                      data-testid={`portfolio-month-row-${slice.id}`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold text-[var(--ink)]">
                          {slice.name}
                        </span>
                        <span className="mt-0.5 block text-[10px] leading-snug text-[var(--ink-4)]">
                          {slice.ticker && (
                            <span className="font-mono uppercase tracking-[0.08em]">
                              {slice.ticker}
                              <span className="mx-1.5" aria-hidden>
                                ·
                              </span>
                            </span>
                          )}
                          <span className="italic">
                            gewaardeerd op {TIER_LABEL[slice.tier]}
                          </span>
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block font-mono text-sm font-semibold tabular-nums text-[var(--ink)]">
                          {fc(slice.value)}
                        </span>
                        {pct && (
                          <span className="mt-0.5 block font-mono text-[10px] tabular-nums text-[var(--ink-3)]">
                            {pct}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                )
              })}

              {/* Slotregel: de staart buiten de getoonde posities. Geen knop —
                  er is geen enkele positie om naartoe te navigeren. */}
              {rest && rest.count > 0 && (
                <li
                  className="flex items-start justify-between gap-3 border-t border-[var(--border-ed)] py-2.5"
                  data-testid="portfolio-month-rest"
                >
                  <span className="min-w-0 flex-1 text-[13px] text-[var(--ink-3)]">
                    nog {rest.count} {rest.count === 1 ? 'positie' : 'posities'}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-mono text-sm tabular-nums text-[var(--ink-2)]">
                      {fc(rest.value)}
                    </span>
                    {sharePct(rest.value, total) && (
                      <span className="mt-0.5 block font-mono text-[10px] tabular-nums text-[var(--ink-3)]">
                        {sharePct(rest.value, total)}
                      </span>
                    )}
                  </span>
                </li>
              )}
            </ul>

            <p className="mt-4 border-t border-dotted border-[var(--rule-soft)] pt-2.5 font-serif text-[12px] italic leading-relaxed text-[var(--ink-3)]">
              Tik een positie om haar volledige verhaal te openen.
            </p>
          </section>
        )}

        {/* Ornament-colophon */}
        <p className="pt-4 text-center text-[10px] italic text-[var(--ink-4)]">
          Trifinity ✦ Portefeuille ✦ {title}
        </p>
      </article>
    </ShellOverlay>
  )
})
