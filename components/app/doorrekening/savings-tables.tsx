'use client'

/**
 * Gedeelde tabel-componenten voor de spaarquote-sectie op
 * `/horizon/doorrekening-test/opbouw` én — in volgende fases — de
 * `overzicht`-pagina en de `year-details-sheet` modal.
 *
 * Fase G4 (`kun-je-een-mogelijkheid-glittery-waterfall.md`) heeft deze
 * componenten letterlijk verplaatst uit `opbouw-client.tsx` (r1024 +
 * r1094). Geen gedragswijziging — alleen verhuizing zodat meerdere
 * plekken ze kunnen hergebruiken zonder de grote opbouw-client te
 * importeren.
 *
 * ── Verantwoordelijkheid ────────────────────────────────────────────
 *  - `SavingsRateTable`  — 6 metrics-grid: geschat jaarinkomen,
 *    spaarquote 6m, inleg bezittingen, aflossing schulden, berekende
 *    spaarquote, verschil.
 *  - `SavingsProjectionTable` — maand-op-maand spaar-doorrekening met
 *    samengesteld crossover-gedrag (FIRE-kruispunt markeert stop-inleg).
 *
 * ── Design language ────────────────────────────────────────────────
 * Krant-esthetiek (scherpe hoeken behalve op de container-rand), DM
 * Mono + `tabular-nums` voor alle bedragen, uppercase kickers met
 * `text-[10px] tracking-wider`, horizon-50/30 kop-band, subtiele zebra
 * via `var(--subtle)/30`.
 *
 * ── Dependencies ───────────────────────────────────────────────────
 *  - `formatCurrency` (`@/lib/format`) — NL-locale valuta-formatting.
 *  - `Asset` / `Debt` types uit asset-data / debt-data — alleen type-
 *    imports, geen runtime-dependency.
 *
 * Niet verplaatst: `DebtAmortizationTable` (blijft in opbouw-client
 * zolang het alleen daar wordt gebruikt).
 */

import { useMemo } from 'react'
import { formatCurrency } from '@/lib/format'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'

// ── SavingsRateTable ────────────────────────────────────────────────

export interface SavingsRateTableProps {
  assets: Asset[]
  debts: Debt[]
  profileMonthlyIncome: number
  profileSavingsRate: number
  estimatedYearlyIncome: number
  savingsRate6m: number
}

export function SavingsRateTable({
  assets,
  debts,
  profileMonthlyIncome,
  profileSavingsRate,
  estimatedYearlyIncome,
  savingsRate6m,
}: SavingsRateTableProps) {
  // Monthly contributions/debt-payments worden via `Number()`-coercie
  // gesommeerd: de DB-kolommen zijn numeric en komen als string binnen.
  const totalContributions = assets.reduce((sum, a) => sum + Number(a.monthly_contribution), 0)
  const totalDebtPayments = debts.reduce((sum, d) => sum + Number(d.monthly_payment), 0)
  const monthlySavings = totalContributions + totalDebtPayments
  const computedRate = profileMonthlyIncome > 0 ? (monthlySavings / profileMonthlyIncome) * 100 : 0
  const monthlyFromYearly = estimatedYearlyIncome / 12

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border-ed)] bg-[var(--paper)]">
      <div className="border-b border-[var(--border-ed)] bg-horizon-50/30 px-4 py-3">
        <h3 className="text-sm font-semibold text-[var(--ink)]">Spaarquote</h3>
        <p className="mt-0.5 text-[10px] text-[var(--ink-4)]">
          Gegevens uit de kern pagina — geschat jaarinkomen en 6-maands spaarquote
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3 lg:grid-cols-6">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--ink-4)]">Geschat jaarinkomen</p>
          <p className="mt-1 font-mono tabular-nums text-sm font-semibold text-[var(--ink)]">
            {formatCurrency(estimatedYearlyIncome)}
          </p>
          <p className="mt-0.5 text-[10px] text-[var(--ink-4)]">
            {formatCurrency(monthlyFromYearly)}/mnd
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--ink-4)]">Spaarquote (6m)</p>
          <p className="mt-1 font-mono tabular-nums text-sm font-semibold text-horizon-600">
            {savingsRate6m.toFixed(1)}%
          </p>
          <p className="mt-0.5 text-[10px] text-[var(--ink-4)]">
            {formatCurrency((monthlyFromYearly * savingsRate6m) / 100)}/mnd
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--ink-4)]">Inleg bezittingen</p>
          <p className="mt-1 font-mono tabular-nums text-sm font-semibold text-emerald-600">
            {formatCurrency(totalContributions)}
          </p>
          <p className="mt-0.5 text-[10px] text-[var(--ink-4)]">per maand</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--ink-4)]">Aflossing schulden</p>
          <p className="mt-1 font-mono tabular-nums text-sm font-semibold text-red-500">
            {formatCurrency(totalDebtPayments)}
          </p>
          <p className="mt-0.5 text-[10px] text-[var(--ink-4)]">per maand</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--ink-4)]">Berekende spaarquote</p>
          <p className="mt-1 font-mono tabular-nums text-sm font-semibold text-[var(--ink-2)]">
            {computedRate.toFixed(1)}%
          </p>
          <p className="mt-0.5 text-[10px] text-[var(--ink-4)]">inleg + aflossing / inkomen</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--ink-4)]">Verschil</p>
          <p
            className={`mt-1 font-mono tabular-nums text-sm font-semibold ${
              Math.abs(savingsRate6m - computedRate) < 1 ? 'text-emerald-600' : 'text-amber-600'
            }`}
          >
            {savingsRate6m - computedRate >= 0 ? '+' : ''}
            {(savingsRate6m - computedRate).toFixed(1)}%
          </p>
          <p className="mt-0.5 text-[10px] text-[var(--ink-4)]">6m vs berekend</p>
        </div>
      </div>
    </div>
  )
}

// ── SavingsProjectionTable ──────────────────────────────────────────

export interface SavingsProjectionTableProps {
  profileMonthlyIncome: number
  profileSavingsRate: number
  projectionYears: number
  crossoverMonth: number | null
}

export function SavingsProjectionTable({
  profileMonthlyIncome,
  profileSavingsRate,
  projectionYears,
  crossoverMonth,
}: SavingsProjectionTableProps) {
  const totalMonths = projectionYears * 12
  const savingsRateFrac = profileSavingsRate / 100
  const monthlySavings = profileMonthlyIncome * savingsRateFrac

  // Voor lange horizons tonen we gesamplede rijen in plaats van elke
  // maand — anders wordt de tabel onoverzichtelijk bij 20+ jaar.
  const displayMonths: number[] = useMemo(() => {
    if (totalMonths <= 24) {
      // Toon elke maand bij ≤ 2 jaar horizon.
      return Array.from({ length: totalMonths }, (_, i) => i + 1)
    }
    // Eerste 3 maanden + elke 6 maanden + laatste maand. Crossover-
    // maand altijd expliciet toegevoegd zodat die rij zichtbaar is.
    const months: number[] = [1, 2, 3]
    for (let m = 6; m <= totalMonths; m += 6) {
      if (!months.includes(m)) months.push(m)
    }
    if (
      crossoverMonth != null &&
      crossoverMonth >= 1 &&
      crossoverMonth <= totalMonths &&
      !months.includes(crossoverMonth)
    ) {
      months.push(crossoverMonth)
    }
    if (!months.includes(totalMonths)) months.push(totalMonths)
    return months.sort((a, b) => a - b)
  }, [totalMonths, crossoverMonth])

  if (profileMonthlyIncome <= 0 || profileSavingsRate <= 0) {
    return (
      <div className="overflow-hidden rounded-xl border border-[var(--border-ed)] bg-[var(--paper)]">
        <div className="border-b border-[var(--border-ed)] bg-horizon-50/30 px-4 py-3">
          <h3 className="text-sm font-semibold text-[var(--ink)]">
            Spaarquote doorrekening — maand-op-maand
          </h3>
        </div>
        <div className="p-4 text-center text-sm text-[var(--ink-3)]">
          Vul je netto inkomen en spaarquote in bij je profiel om de doorrekening te zien.
        </div>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border-ed)] bg-[var(--paper)]">
      <div className="border-b border-[var(--border-ed)] bg-horizon-50/30 px-4 py-3">
        <h3 className="text-sm font-semibold text-[var(--ink)]">
          Spaarquote doorrekening — maand-op-maand
        </h3>
        <p className="mt-0.5 text-[10px] text-[var(--ink-4)]">
          {formatCurrency(monthlySavings)}/mnd bij {profileSavingsRate.toFixed(1)}% spaarquote
        </p>
      </div>
      <div className="overflow-auto max-h-[70vh]">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-[var(--border-ed)] bg-[var(--subtle)]">
              <th className="px-3 py-1.5 text-left font-medium text-[var(--ink-3)]">Maand</th>
              <th className="px-3 py-1.5 text-right font-medium text-[var(--ink-3)]">Inkomen (mnd)</th>
              <th className="px-3 py-1.5 text-right font-medium text-[var(--ink-3)]">Spaarquote %</th>
              <th className="px-3 py-1.5 text-right font-medium text-[var(--ink-3)]">Spaarbedrag</th>
              <th className="px-3 py-1.5 text-right font-medium text-horizon-600">Cumulatief</th>
            </tr>
          </thead>
          <tbody>
            {displayMonths.map((month, idx) => {
              const isAfterCrossover = crossoverMonth != null && month > crossoverMonth
              const isCrossoverMonth = crossoverMonth != null && month === crossoverMonth
              // Cumulatief: groeit tot crossover, daarna vlak.
              const effectiveMonths = crossoverMonth != null ? Math.min(month, crossoverMonth) : month
              const cumulative = monthlySavings * effectiveMonths
              const effectiveSavings = isAfterCrossover ? 0 : monthlySavings
              const effectiveRate = isAfterCrossover ? 0 : profileSavingsRate
              const effectiveIncome = isAfterCrossover ? 0 : profileMonthlyIncome
              return (
                <tr
                  key={month}
                  className={`border-b border-[var(--border-ed)] last:border-b-0 hover:bg-[var(--subtle)]/50 ${
                    isCrossoverMonth
                      ? 'bg-horizon-50/60'
                      : isAfterCrossover
                        ? 'bg-[var(--subtle)]/15'
                        : idx % 2 === 1
                          ? 'bg-[var(--subtle)]/30'
                          : ''
                  }`}
                >
                  <td className="px-3 py-1 font-mono tabular-nums text-[var(--ink-3)]">
                    {month}
                    {isCrossoverMonth && (
                      <span className="ml-1 text-[9px] font-semibold text-horizon-600">⚡ kruispunt</span>
                    )}
                  </td>
                  <td
                    className={`px-3 py-1 text-right font-mono tabular-nums ${
                      isAfterCrossover ? 'text-[var(--ink-4)]' : 'text-[var(--ink-2)]'
                    }`}
                  >
                    {formatCurrency(effectiveIncome)}
                  </td>
                  <td
                    className={`px-3 py-1 text-right font-mono tabular-nums ${
                      isAfterCrossover ? 'text-[var(--ink-4)]' : 'text-[var(--ink-2)]'
                    }`}
                  >
                    {effectiveRate.toFixed(1)}%
                  </td>
                  <td
                    className={`px-3 py-1 text-right font-mono tabular-nums ${
                      isAfterCrossover ? 'text-[var(--ink-4)]' : 'text-emerald-600'
                    }`}
                  >
                    {formatCurrency(effectiveSavings)}
                  </td>
                  <td className="px-3 py-1 text-right font-mono tabular-nums font-semibold text-horizon-600">
                    {formatCurrency(cumulative)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
