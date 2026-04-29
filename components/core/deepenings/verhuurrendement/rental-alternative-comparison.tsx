'use client'

/**
 * `RentalAlternativeComparison` — kerntabel die het verhuurd vastgoed
 * naast aandelen (MSCI World) en spaargeld zet, zodat de gebruiker ziet
 * wat het echte alternatief-rendement is voor "hetzelfde eigen geld".
 *
 * Vier rijen, samengeplaatst:
 *  1. Vastgoed (forfaitair)  — totaal-rendement op eigen geld
 *  2. Vastgoed (werkelijk)   — idem, na werkelijk Box 3
 *  3. Aandelen (MSCI World)  — historisch ~7% bruto, na Box 3 ~5% netto
 *  4. Spaarrekening          — typisch 2,5%, na Box 3 ~0,5% netto
 *
 * Transparantie:
 *  - Per rij staat de bron expliciet bij het kerncijfer (bijv. "MSCI World
 *    laatste 30 jr"). De gebruiker kan zelf inschatten of het cijfer voor
 *    hem realistisch is.
 *  - Rendementen zijn netto-na-Box-3 zodat de vergelijking eerlijk is.
 *  - "Jaarlijks verschil" is ten opzichte van het beste vastgoed-scenario
 *    (forfaitair of werkelijk, welke gunstiger uitvalt) — krant-stijl
 *    feitelijke kop boven, geen oordeel.
 *
 * UX:
 *  - Tabel met krant-conventies: header in `text-[10px] uppercase`,
 *    horizontale borders, getallen rechts uitgelijnd in DM Mono.
 *  - Geen kleurpaden voor "beste" rij — wel `text-positive`/`text-negative`
 *    op de delta-kolom. Het cijfer doet het werk.
 */

import { useMemo } from 'react'
import { formatCurrency } from '@/lib/format'
import {
  BOX3_TARIEF,
  NL_FICTIEF_BELEGGINGEN,
} from '@/lib/horizon-data'
import type { RentalCalculation } from './calc'

// ── Constants ────────────────────────────────────────────────

/**
 * MSCI World gemiddeld geannualiseerd rendement laatste 30 jaar (in EUR,
 * USD-hedged). Conservatieve benadering — past bij de "geen aandelen-
 * propaganda" toon. Bron: MSCI factsheet.
 */
const MSCI_WORLD_GROSS_RETURN_PCT = 7

/**
 * Spaargeld-rendement — typisch deposito-tarief 2,5%. Aansluitend op
 * `TYPICAL_RETURNS.savings` in `lib/asset-data.ts`.
 */
const SAVINGS_GROSS_RETURN_PCT = 2.5

// ── Types ────────────────────────────────────────────────────

interface RentalAlternativeComparisonProps {
  /** Berekende cijfers van het pand — eigen geld + cashflow-rendement. */
  calc: RentalCalculation
  /** Totaal eigen geld dat alternatief belegd kan worden. Default: `calc.ownEquity`. */
  capital?: number
}

interface ComparisonRow {
  label: string
  source: string
  /** Bruto rendement (cashflow + waardestijging op eigen geld). */
  grossPct: number
  /** Belasting in € per jaar over dit kapitaal. */
  taxAmount: number
  /** Netto rendement (€) per jaar. */
  netAmount: number
  /** Netto rendement (%) op kapitaal. */
  netPct: number
}

// ── Component ────────────────────────────────────────────────

export function RentalAlternativeComparison({
  calc,
  capital,
}: RentalAlternativeComparisonProps) {
  // Default-kapitaal = eigen geld in het pand. Wanneer ownEquity = 0
  // gebruiken we de marktwaarde als proxy zodat de tabel toch leesbaar
  // is — anders zou alles op 0 staan.
  const investableCapital = capital != null ? capital : calc.ownEquity > 0 ? calc.ownEquity : calc.currentValue

  const rows = useMemo<ComparisonRow[]>(() => {
    // Vastgoed-rijen: nemen totaal-rendement op eigen geld over uit `calc`.
    // Belasting komt uit dezelfde berekening; het netAmount is een proxy
    // (totaalRendement % × kapitaal) — niet identiek aan de Box 3 belasting
    // zelf, maar wel een eerlijke euro-equivalent voor de gebruiker.
    const vastgoedForfaitairNetAmount =
      (calc.totaalRendementForfaitair / 100) * investableCapital
    const vastgoedWerkelijkNetAmount =
      (calc.totaalRendementWerkelijk / 100) * investableCapital

    // MSCI World: bruto 7%, Box 3 forfaitair (huidig stelsel) — ~2,12% drag.
    const msciTax = investableCapital * NL_FICTIEF_BELEGGINGEN * BOX3_TARIEF
    const msciGrossAmount = (MSCI_WORLD_GROSS_RETURN_PCT / 100) * investableCapital
    const msciNetAmount = msciGrossAmount - msciTax
    const msciNetPct = investableCapital > 0 ? (msciNetAmount / investableCapital) * 100 : 0

    // Spaargeld: bruto 2,5%, ook forfaitair belast (in NL gelijk aan beleggen).
    const savingsTax = investableCapital * NL_FICTIEF_BELEGGINGEN * BOX3_TARIEF
    const savingsGrossAmount = (SAVINGS_GROSS_RETURN_PCT / 100) * investableCapital
    const savingsNetAmount = savingsGrossAmount - savingsTax
    const savingsNetPct = investableCapital > 0 ? (savingsNetAmount / investableCapital) * 100 : 0

    return [
      {
        label: 'Vastgoed (forfaitair)',
        source: 'Dit pand · huidig Box 3',
        grossPct: calc.totaalRendementForfaitair,
        taxAmount: calc.forfaitairBelasting,
        netAmount: vastgoedForfaitairNetAmount,
        netPct: calc.totaalRendementForfaitair,
      },
      {
        label: 'Vastgoed (werkelijk)',
        source: 'Dit pand · vanaf 2027',
        grossPct: calc.totaalRendementWerkelijk,
        taxAmount: calc.werkelijkBelasting,
        netAmount: vastgoedWerkelijkNetAmount,
        netPct: calc.totaalRendementWerkelijk,
      },
      {
        label: 'Aandelen (MSCI World)',
        source: '~7% laatste 30 jr · forfaitair belast',
        grossPct: MSCI_WORLD_GROSS_RETURN_PCT,
        taxAmount: msciTax,
        netAmount: msciNetAmount,
        netPct: msciNetPct,
      },
      {
        label: 'Spaarrekening',
        source: '2,5% deposito-tarief · forfaitair belast',
        grossPct: SAVINGS_GROSS_RETURN_PCT,
        taxAmount: savingsTax,
        netAmount: savingsNetAmount,
        netPct: savingsNetPct,
      },
    ]
  }, [calc, investableCapital])

  // Beste vastgoed-scenario als referentie voor de delta-kolom — zo geven
  // we de eerlijkste vergelijking (we benadelen het object niet door
  // structureel forfaitair te kiezen wanneer werkelijk gunstiger is).
  const bestVastgoedNetAmount = Math.max(rows[0].netAmount, rows[1].netAmount)

  return (
    <section className="space-y-3">
      <header>
        <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
          Vergelijking met alternatieven
        </p>
        <p className="mt-1 font-serif italic text-[12px] leading-relaxed text-[var(--ink-3)]">
          Wat zou hetzelfde eigen geld opleveren in andere vermogensvormen?
          Alle cijfers zijn netto na Box 3.
        </p>
      </header>

      <div className="overflow-x-auto border border-[var(--border-ed)] bg-[var(--paper)]">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="border-b border-[var(--border-ed)]">
              <Th align="left">Vermogensvorm</Th>
              <Th align="right">Bruto</Th>
              <Th align="right">Belasting</Th>
              <Th align="right">Netto / jaar</Th>
              <Th align="right">Verschil</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const delta = row.netAmount - bestVastgoedNetAmount
              const isVastgoed = row.label.startsWith('Vastgoed')
              return (
                <tr
                  key={row.label}
                  className="border-b border-[var(--border-ed)] last:border-b-0 hover:bg-[var(--subtle)]/40"
                >
                  <td className="px-3 py-2.5">
                    <p className="font-medium text-[var(--ink)]">{row.label}</p>
                    <p className="mt-0.5 text-[10px] text-[var(--ink-4)]">
                      {row.source}
                    </p>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-[var(--ink-2)]">
                    {formatPercent(row.grossPct)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-[var(--ink-3)]">
                    −{formatCurrency(row.taxAmount)}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <p className="font-mono tabular-nums font-semibold text-[var(--ink)]">
                      {formatCurrency(row.netAmount)}
                    </p>
                    <p className="mt-0.5 text-[10px] font-mono tabular-nums text-[var(--ink-4)]">
                      {formatPercent(row.netPct)}
                    </p>
                  </td>
                  <td
                    className={`px-3 py-2.5 text-right font-mono tabular-nums ${
                      isVastgoed
                        ? 'text-[var(--ink-4)]'
                        : delta > 0
                          ? 'text-positive'
                          : delta < 0
                            ? 'text-negative'
                            : 'text-[var(--ink-3)]'
                    }`}
                  >
                    {isVastgoed
                      ? '—'
                      : `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${formatCurrency(Math.abs(delta))}`}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] leading-relaxed text-[var(--ink-3)]">
        Vergelijking op{' '}
        <span className="font-mono tabular-nums text-[var(--ink-2)]">
          {formatCurrency(investableCapital)}
        </span>{' '}
        eigen geld. Vastgoed-rendementen bevatten cashflow én waardestijging.
        Aandelen- en spaarrendementen zijn lange-termijn gemiddelden — feitelijke
        cijfers fluctueren per jaar.
      </p>
    </section>
  )
}

// ── Sub-components ───────────────────────────────────────────

function Th({
  children,
  align,
}: {
  children: React.ReactNode
  align: 'left' | 'right'
}) {
  return (
    <th
      className={`px-3 py-2 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-4)] ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
      scope="col"
    >
      {children}
    </th>
  )
}

// ── Helpers ──────────────────────────────────────────────────

function formatPercent(pct: number): string {
  if (!isFinite(pct)) return '—'
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(1)}%`
}
