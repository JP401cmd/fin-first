'use client'

import { useMemo, useState } from 'react'
import { formatCurrency } from '@/lib/format'
import { NL_AOW_AGE, NL_AOW_MONTHLY, NL_AOW_MONTHLY_SAMENWONEND } from '@/lib/constants'

// ── Types ────────────────────────────────────────────────────

interface WithdrawalRow {
  year: number
  age: number
  startBalance: number
  withdrawal: number
  aowIncome: number
  growth: number
  endBalance: number
}

interface VpwRow {
  year: number
  age: number
  startBalance: number
  remainingYears: number
  vpwPct: number
  withdrawal: number
  aowIncome: number
  growth: number
  endBalance: number
}

interface BucketRow {
  year: number
  age: number
  cash: number
  bonds: number
  equity: number
  total: number
  withdrawal: number
}

// ── Constants ────────────────────────────────────────────────

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

// ── Annuity helper ──────────────────────────────────────────

/** Compute level annuity payment that fully depletes portfolio over n years at rate r. */
function annuityPayment(portfolio: number, realReturn: number, years: number): number {
  if (years <= 0 || portfolio <= 0) return 0
  if (realReturn === 0) return portfolio / years
  return portfolio * realReturn / (1 - Math.pow(1 + realReturn, -years))
}

// ── Schedule computation helpers ────────────────────────────

/** SWR-based depletion: annuity formula gives a fixed annual withdrawal that reaches €0 at endAge. */
function computeDepleteSwrSchedule(
  startPortfolio: number,
  retirementAge: number,
  endAge: number,
  grossReturn: number,
  inflationRate: number,
  hasPartner: boolean,
): WithdrawalRow[] {
  const totalYears = endAge - retirementAge
  if (totalYears <= 0 || startPortfolio <= 0) return []

  const realReturn = (1 + grossReturn) / (1 + inflationRate) - 1
  const aowYearly = (hasPartner ? NL_AOW_MONTHLY_SAMENWONEND : NL_AOW_MONTHLY) * 12
  const baseWithdrawal = annuityPayment(startPortfolio, realReturn, totalYears)

  const schedule: WithdrawalRow[] = []
  let balance = startPortfolio

  for (let y = 0; y < totalYears; y++) {
    const age = retirementAge + y
    const startBalance = balance
    const aow = age >= NL_AOW_AGE ? aowYearly : 0
    const neededFromPortfolio = Math.max(0, baseWithdrawal - aow)
    const withdrawal = Math.min(neededFromPortfolio, balance)
    const remaining = balance - withdrawal
    const growth = remaining * realReturn
    const endBalance = remaining + growth

    schedule.push({
      year: y + 1, age,
      startBalance: Math.round(startBalance),
      withdrawal: Math.round(withdrawal),
      aowIncome: Math.round(aow),
      growth: Math.round(growth),
      endBalance: Math.max(0, Math.round(endBalance)),
    })
    balance = Math.max(0, endBalance)
    if (balance <= 0) break
  }
  return schedule
}

/** Guardrails: variable withdrawal with +/- 20% bands around annuity rate, depleting to €0. */
function computeDepleteGuardrailsSchedule(
  startPortfolio: number,
  retirementAge: number,
  endAge: number,
  grossReturn: number,
  inflationRate: number,
  hasPartner: boolean,
): WithdrawalRow[] {
  const totalYears = endAge - retirementAge
  if (totalYears <= 0 || startPortfolio <= 0) return []

  const realReturn = (1 + grossReturn) / (1 + inflationRate) - 1
  const aowYearly = (hasPartner ? NL_AOW_MONTHLY_SAMENWONEND : NL_AOW_MONTHLY) * 12
  const annuityRate = realReturn === 0
    ? 1 / totalYears
    : realReturn / (1 - Math.pow(1 + realReturn, -totalYears))
  const initialWithdrawal = annuityPayment(startPortfolio, realReturn, totalYears)
  const ceiling = annuityRate * (1 + GUARDRAIL_BAND)
  const floor = annuityRate * (1 - GUARDRAIL_BAND)

  const schedule: WithdrawalRow[] = []
  let balance = startPortfolio
  let currentWithdrawal = initialWithdrawal

  for (let y = 0; y < totalYears; y++) {
    const age = retirementAge + y
    const startBalance = balance
    const aow = age >= NL_AOW_AGE ? aowYearly : 0

    // Apply guardrail check: ratio of withdrawal to current balance
    if (balance > 0) {
      const ratio = currentWithdrawal / balance
      if (ratio > ceiling) {
        currentWithdrawal = ceiling * balance
      } else if (ratio < floor) {
        currentWithdrawal = floor * balance
      }
    }

    const neededFromPortfolio = Math.max(0, currentWithdrawal - aow)
    const withdrawal = Math.min(neededFromPortfolio, balance)
    const remaining = balance - withdrawal
    const growth = remaining * realReturn
    const endBalance = remaining + growth

    schedule.push({
      year: y + 1, age,
      startBalance: Math.round(startBalance),
      withdrawal: Math.round(withdrawal),
      aowIncome: Math.round(aow),
      growth: Math.round(growth),
      endBalance: Math.max(0, Math.round(endBalance)),
    })
    balance = Math.max(0, endBalance)
    if (balance <= 0) break
  }
  return schedule
}

/** VPW: each year withdraw balance / remaining years. Naturally depletes to €0. */
function computeDepleteVpwSchedule(
  startPortfolio: number,
  retirementAge: number,
  endAge: number,
  grossReturn: number,
  inflationRate: number,
  hasPartner: boolean,
): VpwRow[] {
  const totalYears = endAge - retirementAge
  if (totalYears <= 0 || startPortfolio <= 0) return []

  const realReturn = (1 + grossReturn) / (1 + inflationRate) - 1
  const aowYearly = (hasPartner ? NL_AOW_MONTHLY_SAMENWONEND : NL_AOW_MONTHLY) * 12

  const schedule: VpwRow[] = []
  let balance = startPortfolio

  for (let y = 0; y < totalYears; y++) {
    const age = retirementAge + y
    const startBalance = balance
    const aow = age >= NL_AOW_AGE ? aowYearly : 0
    const remainingYears = Math.max(1, totalYears - y)

    const vpwWithdrawal = balance / remainingYears
    const vpwPct = balance > 0 ? (vpwWithdrawal / balance) * 100 : 0
    const neededFromPortfolio = Math.max(0, vpwWithdrawal - aow)
    const withdrawal = Math.min(neededFromPortfolio, balance)
    const remaining = balance - withdrawal
    const growth = remaining * realReturn
    const endBalance = remaining + growth

    schedule.push({
      year: y + 1, age,
      startBalance: Math.round(startBalance),
      remainingYears,
      vpwPct: Math.round(vpwPct * 100) / 100,
      withdrawal: Math.round(withdrawal),
      aowIncome: Math.round(aow),
      growth: Math.round(growth),
      endBalance: Math.max(0, Math.round(endBalance)),
    })
    balance = Math.max(0, endBalance)
    if (balance <= 0) break
  }
  return schedule
}

/** Bucket strategy: 3 buckets, no legacy buffer — portfolio is fully consumed. */
function computeDepleteBucketSchedule(
  startPortfolio: number,
  retirementAge: number,
  endAge: number,
  yearlyExpenses: number,
  grossReturn: number,
  inflationRate: number,
  hasPartner: boolean,
): BucketRow[] {
  const totalYears = endAge - retirementAge
  if (totalYears <= 0 || startPortfolio <= 0) return []

  const realReturn = (1 + grossReturn) / (1 + inflationRate) - 1
  const aowYearly = (hasPartner ? NL_AOW_MONTHLY_SAMENWONEND : NL_AOW_MONTHLY) * 12

  const cashTarget = yearlyExpenses * 2
  const bondTarget = yearlyExpenses * 5

  let cash = Math.min(cashTarget, startPortfolio)
  let bonds = Math.min(bondTarget, Math.max(0, startPortfolio - cash))
  let equity = Math.max(0, startPortfolio - cash - bonds)

  const schedule: BucketRow[] = []

  for (let y = 0; y < totalYears; y++) {
    const age = retirementAge + y
    const aow = age >= NL_AOW_AGE ? aowYearly : 0
    const neededFromPortfolio = Math.max(0, yearlyExpenses - aow)
    const total = cash + bonds + equity
    const withdrawal = Math.min(neededFromPortfolio, total)

    schedule.push({
      year: y + 1, age,
      cash: Math.round(cash),
      bonds: Math.round(bonds),
      equity: Math.round(equity),
      total: Math.round(total),
      withdrawal: Math.round(withdrawal),
    })

    // Withdraw from cash first, then bonds, then all equity (no legacy buffer)
    let toWithdraw = withdrawal
    const fromCash = Math.min(toWithdraw, cash)
    cash -= fromCash
    toWithdraw -= fromCash

    const fromBonds = Math.min(toWithdraw, bonds)
    bonds -= fromBonds
    toWithdraw -= fromBonds

    const fromEquity = Math.min(toWithdraw, equity)
    equity -= fromEquity

    // Apply returns per bucket
    bonds = bonds * (1 + BOND_RETURN)
    equity = equity * (1 + realReturn)

    // Refill cascade: equity -> bonds -> cash
    const bondShortfall = Math.max(0, bondTarget - bonds)
    const bondRefill = Math.min(bondShortfall, equity)
    bonds += bondRefill
    equity -= bondRefill

    const cashShortfall = Math.max(0, cashTarget - cash)
    const cashRefill = Math.min(cashShortfall, bonds)
    cash += cashRefill
    bonds -= cashRefill

    if (cash + bonds + equity <= 0) break
  }
  return schedule
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
                  className={`border-b border-[var(--border-ed)]/50 ${idx % 2 === 1 ? 'bg-[var(--subtle)]/30' : ''}`}
                >
                  <td className="px-3 py-1 font-medium text-[var(--ink)]">
                    {row.age}j
                    {row.age === NL_AOW_AGE && (
                      <span className="ml-1 text-[10px] text-emerald-600 font-medium">AOW</span>
                    )}
                  </td>
                  <td className="px-3 py-1 text-right font-mono tabular-nums text-[var(--ink)]">
                    {formatCurrency(row.startBalance)}
                  </td>
                  <td className="px-3 py-1 text-right font-mono tabular-nums text-red-600">
                    -{formatCurrency(row.withdrawal)}
                  </td>
                  <td className="px-3 py-1 text-right font-mono tabular-nums text-emerald-600">
                    {row.aowIncome > 0 ? `+${formatCurrency(row.aowIncome)}` : '\u2014'}
                  </td>
                  <td className={`px-3 py-1 text-right font-mono tabular-nums ${row.growth >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {row.growth >= 0 ? '+' : ''}{formatCurrency(row.growth)}
                  </td>
                  <td className="px-3 py-1 text-right font-mono font-semibold tabular-nums text-[var(--ink)]">
                    {formatCurrency(row.endBalance)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-[var(--border-ed)] bg-[var(--subtle)]">
                <td className="px-3 py-1.5 font-bold text-[var(--ink)]">Totaal ({rows.length}j)</td>
                <td className="px-3 py-1.5 text-right font-mono font-bold tabular-nums text-[var(--ink)]">
                  {formatCurrency(rows[0]?.startBalance ?? 0)}
                </td>
                <td className="px-3 py-1.5 text-right font-mono font-bold tabular-nums text-red-600">
                  -{formatCurrency(rows.reduce((s, r) => s + r.withdrawal, 0))}
                </td>
                <td className="px-3 py-1.5 text-right font-mono font-bold tabular-nums text-emerald-600">
                  +{formatCurrency(rows.reduce((s, r) => s + r.aowIncome, 0))}
                </td>
                <td className="px-3 py-1.5 text-right font-mono font-bold tabular-nums text-emerald-600">
                  +{formatCurrency(rows.reduce((s, r) => s + r.growth, 0))}
                </td>
                <td className="px-3 py-1.5 text-right font-mono font-bold tabular-nums text-[var(--ink)]">
                  {formatCurrency(rows[rows.length - 1]?.endBalance ?? 0)}
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
                  className={`border-b border-[var(--border-ed)]/50 ${idx % 2 === 1 ? 'bg-[var(--subtle)]/30' : ''}`}
                >
                  <td className="px-3 py-1 font-medium text-[var(--ink)]">
                    {row.age}j
                    {row.age === NL_AOW_AGE && (
                      <span className="ml-1 text-[10px] text-emerald-600 font-medium">AOW</span>
                    )}
                  </td>
                  <td className="px-3 py-1 text-right font-mono tabular-nums text-[var(--ink)]">
                    {formatCurrency(row.startBalance)}
                  </td>
                  <td className="px-3 py-1 text-right font-mono tabular-nums text-[var(--ink-3)]">
                    {row.remainingYears}
                  </td>
                  <td className="px-3 py-1 text-right font-mono tabular-nums text-[var(--ink-2)]">
                    {row.vpwPct.toFixed(1)}%
                  </td>
                  <td className="px-3 py-1 text-right font-mono tabular-nums text-red-600">
                    -{formatCurrency(row.withdrawal)}
                  </td>
                  <td className="px-3 py-1 text-right font-mono tabular-nums text-emerald-600">
                    {row.aowIncome > 0 ? `+${formatCurrency(row.aowIncome)}` : '\u2014'}
                  </td>
                  <td className={`px-3 py-1 text-right font-mono tabular-nums ${row.growth >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {row.growth >= 0 ? '+' : ''}{formatCurrency(row.growth)}
                  </td>
                  <td className="px-3 py-1 text-right font-mono font-semibold tabular-nums text-[var(--ink)]">
                    {formatCurrency(row.endBalance)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-[var(--border-ed)] bg-[var(--subtle)]">
                <td className="px-3 py-1.5 font-bold text-[var(--ink)]">Totaal ({rows.length}j)</td>
                <td className="px-3 py-1.5 text-right font-mono font-bold tabular-nums text-[var(--ink)]">
                  {formatCurrency(rows[0]?.startBalance ?? 0)}
                </td>
                <td colSpan={2} />
                <td className="px-3 py-1.5 text-right font-mono font-bold tabular-nums text-red-600">
                  -{formatCurrency(rows.reduce((s, r) => s + r.withdrawal, 0))}
                </td>
                <td className="px-3 py-1.5 text-right font-mono font-bold tabular-nums text-emerald-600">
                  +{formatCurrency(rows.reduce((s, r) => s + r.aowIncome, 0))}
                </td>
                <td className="px-3 py-1.5 text-right font-mono font-bold tabular-nums text-emerald-600">
                  +{formatCurrency(rows.reduce((s, r) => s + r.growth, 0))}
                </td>
                <td className="px-3 py-1.5 text-right font-mono font-bold tabular-nums text-[var(--ink)]">
                  {formatCurrency(rows[rows.length - 1]?.endBalance ?? 0)}
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
                  className={`border-b border-[var(--border-ed)]/50 ${idx % 2 === 1 ? 'bg-[var(--subtle)]/30' : ''}`}
                >
                  <td className="px-3 py-1 font-medium text-[var(--ink)]">
                    {row.age}j
                    {row.age === NL_AOW_AGE && (
                      <span className="ml-1 text-[10px] text-emerald-600 font-medium">AOW</span>
                    )}
                  </td>
                  <td className="px-3 py-1 text-right font-mono tabular-nums text-[var(--ink)]">
                    {formatCurrency(row.cash)}
                  </td>
                  <td className="px-3 py-1 text-right font-mono tabular-nums text-[var(--ink)]">
                    {formatCurrency(row.bonds)}
                  </td>
                  <td className="px-3 py-1 text-right font-mono tabular-nums text-[var(--ink)]">
                    {formatCurrency(row.equity)}
                  </td>
                  <td className="px-3 py-1 text-right font-mono font-semibold tabular-nums text-[var(--ink)]">
                    {formatCurrency(row.total)}
                  </td>
                  <td className="px-3 py-1 text-right font-mono tabular-nums text-red-600">
                    -{formatCurrency(row.withdrawal)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-[var(--border-ed)] bg-[var(--subtle)]">
                <td className="px-3 py-1.5 font-bold text-[var(--ink)]">Totaal ({rows.length}j)</td>
                <td colSpan={4} />
                <td className="px-3 py-1.5 text-right font-mono font-bold tabular-nums text-red-600">
                  -{formatCurrency(rows.reduce((s, r) => s + r.withdrawal, 0))}
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
  const totalYears = Math.max(0, endAge - retirementAge)
  const realReturn = (1 + grossReturn) / (1 + inflationRate) - 1

  // Annuity withdrawal that fully depletes portfolio at endAge
  const annuityAnnual = annuityPayment(startPortfolio, realReturn, totalYears)

  // ── Compute all four schedules ──
  const swrRows = useMemo(() =>
    computeDepleteSwrSchedule(startPortfolio, retirementAge, endAge, grossReturn, inflationRate, hasPartner),
    [startPortfolio, retirementAge, endAge, grossReturn, inflationRate, hasPartner],
  )

  const guardrailsRows = useMemo(() =>
    computeDepleteGuardrailsSchedule(startPortfolio, retirementAge, endAge, grossReturn, inflationRate, hasPartner),
    [startPortfolio, retirementAge, endAge, grossReturn, inflationRate, hasPartner],
  )

  const vpwRows = useMemo(() =>
    computeDepleteVpwSchedule(startPortfolio, retirementAge, endAge, grossReturn, inflationRate, hasPartner),
    [startPortfolio, retirementAge, endAge, grossReturn, inflationRate, hasPartner],
  )

  const bucketRows = useMemo(() =>
    computeDepleteBucketSchedule(startPortfolio, retirementAge, endAge, yearlyExpenses, grossReturn, inflationRate, hasPartner),
    [startPortfolio, retirementAge, endAge, yearlyExpenses, grossReturn, inflationRate, hasPartner],
  )

  return (
    <>
      <WithdrawalSubTable
        label="A. Annuiteit — Vaste jaarlijkse onttrekking"
        subtitle={`Annuïtaire onttrekking: portfolio × r / (1 \u2212 (1+r)^(\u2212n)) = ${formatCurrency(Math.round(annuityAnnual))}/jr. Vermogen is exact ${formatCurrency(0)} bij leeftijd ${endAge}.`}
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
