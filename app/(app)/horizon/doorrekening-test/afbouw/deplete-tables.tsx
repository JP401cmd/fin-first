'use client'

import { useMemo, useState, useCallback } from 'react'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'

/** Masked-aware currency formatter hook used across this file's tables. */
function useFc() {
  const { masked } = useMaskedAmounts()
  return useCallback((v: number) => formatMaskedCurrency(v, masked), [masked])
}
import { NL_AOW_AGE } from '@/lib/constants'
import {
  computeTableSchedule,
  type TableScheduleRow,
} from '../calc/afbouw-table-schedules'

// ── Types & Constants ──────────────────────────────────────────

/** Row-alias voor de twee sub-tables met standaard/VPW-kolommen. */
type WithdrawalRow = TableScheduleRow
type VpwRow = TableScheduleRow

/** Bucket-row shape matching sub-table render contract. Gemapped uit
 * `TableScheduleRow` met `bucketCash/Bonds/Equity` velden. */
interface BucketRow {
  year: number
  age: number
  cash: number
  bonds: number
  equity: number
  total: number
  withdrawal: number
}

const BOND_RETURN = 0.02
const GUARDRAIL_BAND = 0.20

// ── Sampling helper ─────────────────────────────────────────

function sampleRows<T extends { year: number }>(rows: T[]): T[] {
  if (rows.length <= 20) return rows
  const result: T[] = rows.slice(0, 5)
  for (let i = 5; i < rows.length - 3; i++) {
    if (i % 5 === 0) result.push(rows[i])
  }
  result.push(...rows.slice(-3))
  return result
}

/** Map een TableScheduleRow met bucket-velden naar de BucketRow-shape. */
function toBucketRow(r: TableScheduleRow): BucketRow {
  return {
    year: r.year,
    age: r.age,
    cash: r.bucketCash ?? 0,
    bonds: r.bucketBonds ?? 0,
    equity: r.bucketEquity ?? 0,
    total: r.startBalance,
    withdrawal: r.withdrawal,
  }
}

// ── Sub-table: standard withdrawal columns ──────────────────

function WithdrawalSubTable({
  label,
  subtitle,
  rows,
}: {
  label: string
  subtitle: string
  rows: WithdrawalRow[]
}) {
  const fc = useFc()
  const [expanded, setExpanded] = useState(false)
  const displayRows = useMemo(() => expanded ? rows : sampleRows(rows), [rows, expanded])
  const hasTooMany = rows.length > 20

  return (
    <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] overflow-hidden">
      <div className="border-b border-[var(--border-ed)] bg-[var(--subtle)]/50 px-4 py-2.5">
        <h4 className="text-sm font-bold text-[var(--ink)]">{label}</h4>
        <p className="text-[11px] text-[var(--ink-3)]">{subtitle}</p>
      </div>

      {rows.length > 0 ? (
        <div className="overflow-auto max-h-[60vh]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-[var(--border-ed)] bg-[var(--subtle)]">
                <th className="px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Leeftijd</th>
                <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Startbalans</th>
                <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Onttrekking</th>
                <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">AOW</th>
                <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Rendement</th>
                <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Eindbalans</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row, idx) => (
                <tr
                  key={row.year}
                  className={`border-b border-[var(--border-ed)]/50 hover:bg-[var(--subtle)]/50 ${idx % 2 === 1 ? 'bg-[var(--subtle)]/30' : ''}`}
                >
                  <td className="px-3 py-1 font-mono tabular-nums font-medium text-[var(--ink)]">
                    {row.age}j
                    {row.age === NL_AOW_AGE && (
                      <span className="ml-1 text-[10px] text-emerald-600 font-medium">AOW</span>
                    )}
                  </td>
                  <td className="px-3 py-1 text-right font-mono tabular-nums text-[var(--ink)]">
                    {fc(row.startBalance)}
                  </td>
                  <td className="px-3 py-1 text-right font-mono tabular-nums text-red-600">
                    -{fc(row.withdrawal)}
                  </td>
                  <td className="px-3 py-1 text-right font-mono tabular-nums text-emerald-600">
                    {row.aowIncome > 0 ? `+${fc(row.aowIncome)}` : '\u2014'}
                  </td>
                  <td className={`px-3 py-1 text-right font-mono tabular-nums ${row.growth >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {row.growth >= 0 ? '+' : ''}{fc(row.growth)}
                  </td>
                  <td className="px-3 py-1 text-right font-mono font-semibold tabular-nums text-[var(--ink)]">
                    {fc(row.endBalance)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-[var(--border-ed)] bg-[var(--subtle)]">
                <td className="px-3 py-1.5 font-bold text-[var(--ink)]">Totaal ({rows.length}j)</td>
                <td className="px-3 py-1.5 text-right font-mono font-bold tabular-nums text-[var(--ink)]">
                  {fc(rows[0]?.startBalance ?? 0)}
                </td>
                <td className="px-3 py-1.5 text-right font-mono font-bold tabular-nums text-red-600">
                  -{fc(rows.reduce((s, r) => s + r.withdrawal, 0))}
                </td>
                <td className="px-3 py-1.5 text-right font-mono font-bold tabular-nums text-emerald-600">
                  +{fc(rows.reduce((s, r) => s + r.aowIncome, 0))}
                </td>
                <td className="px-3 py-1.5 text-right font-mono font-bold tabular-nums text-emerald-600">
                  +{fc(rows.reduce((s, r) => s + r.growth, 0))}
                </td>
                <td className="px-3 py-1.5 text-right font-mono font-bold tabular-nums text-[var(--ink)]">
                  {fc(rows[rows.length - 1]?.endBalance ?? 0)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <div className="px-4 py-6 text-center text-sm text-[var(--ink-3)]">Geen data beschikbaar.</div>
      )}

      {hasTooMany && (
        <div className="border-t border-[var(--border-ed)] px-3 py-1.5 text-center">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[11px] font-medium text-horizon-600 hover:text-horizon-700"
          >
            {expanded ? 'Minder rijen tonen' : `Alle ${rows.length} rijen tonen`}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Sub-table: VPW columns (with remaining years + percentage) ──

function VpwSubTable({
  label,
  subtitle,
  rows,
}: {
  label: string
  subtitle: string
  rows: VpwRow[]
}) {
  const fc = useFc()
  const [expanded, setExpanded] = useState(false)
  const displayRows = useMemo(() => expanded ? rows : sampleRows(rows), [rows, expanded])
  const hasTooMany = rows.length > 20

  return (
    <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] overflow-hidden">
      <div className="border-b border-[var(--border-ed)] bg-[var(--subtle)]/50 px-4 py-2.5">
        <h4 className="text-sm font-bold text-[var(--ink)]">{label}</h4>
        <p className="text-[11px] text-[var(--ink-3)]">{subtitle}</p>
      </div>

      {rows.length > 0 ? (
        <div className="overflow-auto max-h-[60vh]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-[var(--border-ed)] bg-[var(--subtle)]">
                <th className="px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Leeftijd</th>
                <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Startbalans</th>
                <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Rest. jaren</th>
                <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">VPW %</th>
                <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Onttrekking</th>
                <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">AOW</th>
                <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Rendement</th>
                <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Eindbalans</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row, idx) => (
                <tr
                  key={row.year}
                  className={`border-b border-[var(--border-ed)]/50 hover:bg-[var(--subtle)]/50 ${idx % 2 === 1 ? 'bg-[var(--subtle)]/30' : ''}`}
                >
                  <td className="px-3 py-1 font-mono tabular-nums font-medium text-[var(--ink)]">
                    {row.age}j
                    {row.age === NL_AOW_AGE && (
                      <span className="ml-1 text-[10px] text-emerald-600 font-medium">AOW</span>
                    )}
                  </td>
                  <td className="px-3 py-1 text-right font-mono tabular-nums text-[var(--ink)]">
                    {fc(row.startBalance)}
                  </td>
                  <td className="px-3 py-1 text-right font-mono tabular-nums text-[var(--ink-3)]">
                    {row.remainingYears ?? '\u2014'}
                  </td>
                  <td className="px-3 py-1 text-right font-mono tabular-nums text-[var(--ink-2)]">
                    {(row.vpwRate ?? 0).toFixed(1)}%
                  </td>
                  <td className="px-3 py-1 text-right font-mono tabular-nums text-red-600">
                    -{fc(row.withdrawal)}
                  </td>
                  <td className="px-3 py-1 text-right font-mono tabular-nums text-emerald-600">
                    {row.aowIncome > 0 ? `+${fc(row.aowIncome)}` : '\u2014'}
                  </td>
                  <td className={`px-3 py-1 text-right font-mono tabular-nums ${row.growth >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {row.growth >= 0 ? '+' : ''}{fc(row.growth)}
                  </td>
                  <td className="px-3 py-1 text-right font-mono font-semibold tabular-nums text-[var(--ink)]">
                    {fc(row.endBalance)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-[var(--border-ed)] bg-[var(--subtle)]">
                <td className="px-3 py-1.5 font-bold text-[var(--ink)]">Totaal ({rows.length}j)</td>
                <td className="px-3 py-1.5 text-right font-mono font-bold tabular-nums text-[var(--ink)]">
                  {fc(rows[0]?.startBalance ?? 0)}
                </td>
                <td colSpan={2} />
                <td className="px-3 py-1.5 text-right font-mono font-bold tabular-nums text-red-600">
                  -{fc(rows.reduce((s, r) => s + r.withdrawal, 0))}
                </td>
                <td className="px-3 py-1.5 text-right font-mono font-bold tabular-nums text-emerald-600">
                  +{fc(rows.reduce((s, r) => s + r.aowIncome, 0))}
                </td>
                <td className="px-3 py-1.5 text-right font-mono font-bold tabular-nums text-emerald-600">
                  +{fc(rows.reduce((s, r) => s + r.growth, 0))}
                </td>
                <td className="px-3 py-1.5 text-right font-mono font-bold tabular-nums text-[var(--ink)]">
                  {fc(rows[rows.length - 1]?.endBalance ?? 0)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <div className="px-4 py-6 text-center text-sm text-[var(--ink-3)]">Geen data beschikbaar.</div>
      )}

      {hasTooMany && (
        <div className="border-t border-[var(--border-ed)] px-3 py-1.5 text-center">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[11px] font-medium text-horizon-600 hover:text-horizon-700"
          >
            {expanded ? 'Minder rijen tonen' : `Alle ${rows.length} rijen tonen`}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Sub-table: bucket columns ───────────────────────────────

function BucketSubTable({
  label,
  subtitle,
  rows,
}: {
  label: string
  subtitle: string
  rows: BucketRow[]
}) {
  const fc = useFc()
  const [expanded, setExpanded] = useState(false)
  const displayRows = useMemo(() => expanded ? rows : sampleRows(rows), [rows, expanded])
  const hasTooMany = rows.length > 20

  return (
    <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] overflow-hidden">
      <div className="border-b border-[var(--border-ed)] bg-[var(--subtle)]/50 px-4 py-2.5">
        <h4 className="text-sm font-bold text-[var(--ink)]">{label}</h4>
        <p className="text-[11px] text-[var(--ink-3)]">{subtitle}</p>
      </div>

      {rows.length > 0 ? (
        <div className="overflow-auto max-h-[60vh]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-[var(--border-ed)] bg-[var(--subtle)]">
                <th className="px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Leeftijd</th>
                <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Cash</th>
                <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Obligaties</th>
                <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Aandelen</th>
                <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Totaal</th>
                <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Onttrekking</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row, idx) => (
                <tr
                  key={row.year}
                  className={`border-b border-[var(--border-ed)]/50 hover:bg-[var(--subtle)]/50 ${idx % 2 === 1 ? 'bg-[var(--subtle)]/30' : ''}`}
                >
                  <td className="px-3 py-1 font-mono tabular-nums font-medium text-[var(--ink)]">
                    {row.age}j
                    {row.age === NL_AOW_AGE && (
                      <span className="ml-1 text-[10px] text-emerald-600 font-medium">AOW</span>
                    )}
                  </td>
                  <td className="px-3 py-1 text-right font-mono tabular-nums text-[var(--ink)]">
                    {fc(row.cash)}
                  </td>
                  <td className="px-3 py-1 text-right font-mono tabular-nums text-[var(--ink)]">
                    {fc(row.bonds)}
                  </td>
                  <td className="px-3 py-1 text-right font-mono tabular-nums text-[var(--ink)]">
                    {fc(row.equity)}
                  </td>
                  <td className="px-3 py-1 text-right font-mono font-semibold tabular-nums text-[var(--ink)]">
                    {fc(row.total)}
                  </td>
                  <td className="px-3 py-1 text-right font-mono tabular-nums text-red-600">
                    -{fc(row.withdrawal)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-[var(--border-ed)] bg-[var(--subtle)]">
                <td className="px-3 py-1.5 font-bold text-[var(--ink)]">Totaal ({rows.length}j)</td>
                <td colSpan={4} />
                <td className="px-3 py-1.5 text-right font-mono font-bold tabular-nums text-red-600">
                  -{fc(rows.reduce((s, r) => s + r.withdrawal, 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <div className="px-4 py-6 text-center text-sm text-[var(--ink-3)]">Geen data beschikbaar.</div>
      )}

      {hasTooMany && (
        <div className="border-t border-[var(--border-ed)] px-3 py-1.5 text-center">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[11px] font-medium text-horizon-600 hover:text-horizon-700"
          >
            {expanded ? 'Minder rijen tonen' : `Alle ${rows.length} rijen tonen`}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────

export function DepleteStrategyTables({
  startPortfolio,
  retirementAge,
  endAge,
  yearlyExpenses,
  grossReturn,
  inflationRate,
  hasPartner,
}: {
  startPortfolio: number
  retirementAge: number
  endAge: number
  yearlyExpenses: number
  grossReturn: number
  inflationRate: number
  hasPartner: boolean
}) {
  const fc = useFc()
  const totalYears = Math.max(0, endAge - retirementAge)
  const realReturn = (1 + grossReturn) / (1 + inflationRate) - 1

  // Annuity withdrawal that fully depletes portfolio at endAge (display only).
  const annuityAnnual = totalYears > 0 && startPortfolio > 0
    ? (realReturn === 0
      ? startPortfolio / totalYears
      : (startPortfolio * realReturn) / (1 - Math.pow(1 + realReturn, -totalYears)))
    : 0

  // Gedeelde input-shape voor `computeTableSchedule`. Alle 4 schedules delen
  // dezelfde parameters — de engine kiest het juiste formule-pad.
  const tableInputs = useMemo(() => ({
    startPortfolio,
    retirementAge,
    endAge,
    yearlyExpenses,
    grossReturn,
    inflationRate,
    hasPartner,
    aowAge: NL_AOW_AGE,
    legacyAmount: 0,
  }), [startPortfolio, retirementAge, endAge, yearlyExpenses, grossReturn, inflationRate, hasPartner])

  const swrRows = useMemo<WithdrawalRow[]>(() =>
    computeTableSchedule('deplete', 'swr', tableInputs),
    [tableInputs],
  )

  const guardrailsRows = useMemo<WithdrawalRow[]>(() =>
    computeTableSchedule('deplete', 'guardrails', tableInputs),
    [tableInputs],
  )

  const vpwRows = useMemo<VpwRow[]>(() =>
    computeTableSchedule('deplete', 'vpw', tableInputs),
    [tableInputs],
  )

  const bucketRows = useMemo<BucketRow[]>(
    () => computeTableSchedule('deplete', 'bucket', tableInputs).map(toBucketRow),
    [tableInputs],
  )

  return (
    <>
      <WithdrawalSubTable
        label="A. Annuiteit — Vaste jaarlijkse onttrekking"
        subtitle={`Annuïtaire onttrekking: portfolio × r / (1 \u2212 (1+r)^(\u2212n)) = ${fc(Math.round(annuityAnnual))}/jr. Vermogen is exact ${fc(0)} bij leeftijd ${endAge}.`}
        rows={swrRows}
      />

      <WithdrawalSubTable
        label="B. Guardrails — Variabele onttrekking met bandbreedte"
        subtitle={`Start met annuïtaire onttrekking, met \u00b1${Math.round(GUARDRAIL_BAND * 100)}% bandbreedte. Past automatisch aan bij marktuitslagen, gericht op volledige opgebruik.`}
        rows={guardrailsRows}
      />

      <VpwSubTable
        label="C. VPW — Variabele percentage-onttrekking"
        subtitle="Elk jaar: vermogen / resterende jaren. Onttrekkingspercentage stijgt naarmate het einde nadert; vermogen daalt geleidelijk naar nul."
        rows={vpwRows}
      />

      <BucketSubTable
        label="D. Bucket — Emmerstrategie (zonder buffer)"
        subtitle={`Drie emmers zonder nalatenschapsbuffer. Cash (2j, 0%), Obligaties (5j, ${(BOND_RETURN * 100).toFixed(0)}%), Aandelen (rest). Volledige opgebruik.`}
        rows={bucketRows}
      />
    </>
  )
}
