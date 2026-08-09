'use client'

import { useMemo } from 'react'
import { TrendingDown, TrendingUp, Minus } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import type { RecurringTransaction } from '@/lib/recurring-data'
import { buildForecast, FORECAST_MONTHS } from '@/lib/cashflow-forecast-math'
import { useDisplayMode } from '@/lib/hooks/use-display-mode'
import { ForecastSparkline } from './cashflow-forecast-sparkline'

/**
 * CashflowForecast — 6-maanden-vooruitblik op kasstroom. Voor elke
 * toekomstige maand toont een rij: verwacht in / verwacht uit / netto
 * delta / cumulatief saldo (startend bij huidig saldo of 0).
 *
 * Plan-context: backlog "Cashflow Sankey-chart, forecast, kalender uit
 * cash-overview". Tweede item — kalender doet vooruitblik op dag-niveau,
 * forecast aggregeert op maand-niveau zodat de tendens zichtbaar wordt
 * over een langer venster.
 *
 * Aannames:
 *  - Baseline = avgIncome6m + avgExpenses6m (uit BudgetsData), repeat
 *    iedere maand
 *  - Recurring transactions worden bovenop de baseline opgeteld in de
 *    maand waar ze vallen (frequency-aware: monthly elke maand, weekly
 *    geschat ×4.33, quarterly ÷3, yearly ÷12 — voor MVP simpel)
 *  - Cumulatief saldo loopt door — start = `startingBalance` (default 0)
 *
 * Gebruikt geen Monte Carlo of inflatie; voor scenario-diepere
 * forecasting verwijst de footer naar /toekomst Tijdas.
 *
 * euro-view: exempt (D12) — de vooruitblik loopt 6 maanden en rekent bewust
 * ZONDER inflatie (`lib/cashflow-forecast-math.ts`): de bedragen zijn de
 * huidige maandlasten en -inkomsten, doorgetrokken. Ze staan dus al in euro's
 * van vandaag en er is geen kernelrij met een `inflationFactor` om mee te
 * deflateren. Op een half jaar zou een koopkrachtcorrectie bovendien kleiner
 * zijn dan de ruis in de baseline zelf.
 *
 * WEERGAVEMODUS (FC-1, docs/eenvoudige-weergave-audit.md §7) — in "Eenvoudig"
 * verdwijnen de vier kopstatistieken en de zes tabelrijen ten gunste van één
 * eindregel ("Over 6 maanden") plus een sparkline over hetzelfde cumulatieve
 * saldo. Presentatie-reductie, geen tweede rekenpad: beide modi lezen dezelfde
 * `buildForecast`-rijen, en de eindregel toont exact het getal dat in Volledig
 * als "Saldo na 6m" boven de tabel staat. In "Volledig" verandert er niets.
 */

export function CashflowForecast({
  recurrings,
  baselineIncome,
  baselineExpenses,
  startingBalance,
}: {
  recurrings: RecurringTransaction[]
  /** Verwacht maandinkomen uit BudgetsData (avgIncome6m). */
  baselineIncome: number
  /** Verwachte maandlasten uit BudgetsData (avgExpenses6m). */
  baselineExpenses: number
  /** Huidig liquide saldo waarop cumulatief verder wordt gerekend.
   *  Default 0 als onbekend. */
  startingBalance?: number
}) {
  const { mode } = useDisplayMode()
  const rows = useMemo(
    () =>
      buildForecast(
        recurrings,
        baselineIncome,
        baselineExpenses,
        startingBalance ?? 0,
        new Date(),
      ),
    [recurrings, baselineIncome, baselineExpenses, startingBalance],
  )

  const totalIn = rows.reduce((s, r) => s + r.incoming, 0)
  const totalOut = rows.reduce((s, r) => s + r.outgoing, 0)
  const totalNet = totalIn - totalOut
  const lastCumulative = rows[rows.length - 1]?.cumulative ?? startingBalance ?? 0

  const hasBaseline = baselineIncome > 0 || baselineExpenses > 0
  const hasRecurrings = recurrings.length > 0

  if (!hasBaseline && !hasRecurrings) {
    return (
      <div className="space-y-4">
        <header>
          <ForecastHeading />
        </header>
        <div className="rounded-2xl border border-dashed border-[var(--border-md)] bg-[var(--paper)] p-6 text-center">
          <p className="text-sm text-[var(--ink-3)] italic leading-relaxed">
            Forecast vereist baseline-cijfers (inkomen + uitgaven over
            laatste 6 maanden) of recurring transactions. Voeg ze toe via{' '}
            <span className="font-medium">Cashflow → Vaste lasten</span>.
          </p>
        </div>
      </div>
    )
  }

  // ── Eenvoudig (FC-1): één eindregel + sparkline i.p.v. de zes tabelrijen. ──
  // Zelfde `rows`, zelfde `lastCumulative` als hieronder — alleen minder ervan
  // in beeld. De tabel blijft in Volledig ongewijzigd staan.
  if (mode === 'simple') {
    return (
      <div className="space-y-4">
        <header>
          <ForecastHeading />
        </header>
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4">
          <div>
            <div className="text-[11px] text-[var(--ink-3)]">
              Over {FORECAST_MONTHS} maanden
            </div>
            <div className="mt-1 font-serif text-2xl font-semibold tabular-nums text-[var(--ink)]">
              {formatCurrency(lastCumulative)}
            </div>
            <div className="mt-1 text-[11px] italic text-[var(--ink-3)]">
              {totalNet >= 0
                ? `${formatCurrency(totalNet)} erbij in die zes maanden`
                : `${formatCurrency(Math.abs(totalNet))} eraf in die zes maanden`}
            </div>
          </div>
          <ForecastSparkline
            values={rows.map((r) => r.cumulative)}
            testId="forecast-sparkline"
            className="shrink-0"
          />
        </div>
        <p className="text-[11px] italic text-[var(--ink-3)]">
          Een rechte doortrekking van je huidige inkomsten en lasten — zonder
          inflatie of schommelingen op de beurs. Wil je scenario&apos;s zien, kijk
          dan op{' '}
          <a href="/toekomst" className="underline hover:text-[var(--ink-2)]">
            Toekomst
          </a>
          .
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <header className="flex items-baseline justify-between gap-4 flex-wrap">
        <ForecastHeading />
        <div className="flex items-center gap-4 text-xs">
          <SummaryStat label="Totaal in" value={totalIn} positive />
          <SummaryStat label="Totaal uit" value={totalOut} negative />
          <SummaryStat
            label={totalNet >= 0 ? 'Overschot' : 'Tekort'}
            value={totalNet}
            positive={totalNet >= 0}
            negative={totalNet < 0}
          />
          <SummaryStat label={`Saldo na ${FORECAST_MONTHS}m`} value={lastCumulative} />
        </div>
      </header>

      <div className="overflow-x-auto rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.08em] font-semibold text-[var(--ink-3)] border-b border-[var(--border-ed)]">
              <th className="px-3 sm:px-4 py-2 text-left">Maand</th>
              <th className="px-3 sm:px-4 py-2 text-right">Verwacht in</th>
              <th className="px-3 sm:px-4 py-2 text-right">Verwacht uit</th>
              <th className="px-3 sm:px-4 py-2 text-right">Netto</th>
              <th className="px-3 sm:px-4 py-2 text-right">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const NetIcon =
                row.net > 0 ? TrendingUp : row.net < 0 ? TrendingDown : Minus
              const netClass =
                row.net > 0
                  ? 'text-emerald-700'
                  : row.net < 0
                    ? 'text-red-700'
                    : 'text-[var(--ink-3)]'
              const cumClass =
                row.cumulative < 0 ? 'text-red-700' : 'text-[var(--ink)]'
              return (
                <tr
                  key={row.monthIdx}
                  className="border-b border-[var(--border-ed)] last:border-b-0"
                >
                  <td className="px-3 sm:px-4 py-2 text-[var(--ink)] capitalize">
                    {row.label}
                  </td>
                  <td className="px-3 sm:px-4 py-2 text-right tabular-nums text-emerald-700">
                    {formatCurrency(row.incoming)}
                  </td>
                  <td className="px-3 sm:px-4 py-2 text-right tabular-nums text-red-700">
                    {formatCurrency(row.outgoing)}
                  </td>
                  <td
                    className={`px-3 sm:px-4 py-2 text-right tabular-nums font-semibold ${netClass}`}
                  >
                    <span className="inline-flex items-center gap-1">
                      <NetIcon className="w-3 h-3" aria-hidden="true" />
                      {formatCurrency(Math.abs(row.net))}
                    </span>
                  </td>
                  <td
                    className={`px-3 sm:px-4 py-2 text-right tabular-nums font-serif font-semibold ${cumClass}`}
                  >
                    {formatCurrency(row.cumulative)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] italic text-[var(--ink-3)]">
        Lineaire forecast — geen inflatie of marktvolatiliteit ingerekend.
        Voor scenario-diepere projectie zie{' '}
        <a href="/toekomst" className="underline hover:text-[var(--ink-2)]">
          /toekomst Tijdas
        </a>
        .
      </p>
    </div>
  )
}

/** Kicker + titel — identiek in de lege staat, in Eenvoudig en boven de tabel,
 *  zodat het blok in elke modus onder dezelfde kop staat. */
function ForecastHeading() {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
        Cashflow — forecast
      </div>
      <h2 className="font-serif text-xl text-[var(--ink)] mt-1">
        {FORECAST_MONTHS} maanden vooruit
      </h2>
    </div>
  )
}

function SummaryStat({
  label,
  value,
  positive,
  negative,
}: {
  label: string
  value: number
  positive?: boolean
  negative?: boolean
}) {
  const valueClass = positive
    ? 'text-emerald-700'
    : negative
      ? 'text-red-700'
      : 'text-[var(--ink)]'
  return (
    <div className="text-right">
      <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
        {label}
      </div>
      <div className={`font-serif font-semibold tabular-nums ${valueClass}`}>
        {formatCurrency(Math.abs(value))}
      </div>
    </div>
  )
}
