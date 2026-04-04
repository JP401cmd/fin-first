'use client'

import { useMemo, useState } from 'react'
import { formatCurrency } from '@/lib/format'
import { NL_SWR } from '@/lib/constants'

// ── Types ────────────────────────────────────────────────────

interface PerpetualRow {
  year: number
  age: number
  startBalance: number
  withdrawal: number
  remainder: number
  growth: number
  endBalance: number
}

// ── Helpers ──────────────────────────────────────────────────

function samplePerpetualRows(rows: PerpetualRow[]): PerpetualRow[] {
  if (rows.length <= 20) return rows
  const result: PerpetualRow[] = rows.slice(0, 5)
  for (let i = 5; i < rows.length - 3; i++) {
    if (i % 5 === 0) result.push(rows[i])
  }
  result.push(...rows.slice(-3))
  return result
}

/** Life expectancy remaining years (simplified Dutch CBS-based). */
function lifeExpectancyYears(age: number): number {
  return Math.max(1, 90 - age)
}

/** Variable Percentage Withdrawal rate based on annuity formula. */
function vpwRate(remainingYears: number, realReturn: number): number {
  if (remainingYears <= 1) return 1
  if (realReturn === 0) return 1 / remainingYears
  return realReturn / (1 - Math.pow(1 + realReturn, -remainingYears))
}

// ── Main Component ───────────────────────────────────────────

export function PerpetualStrategyTables({
  startPortfolio,
  retirementAge,
  endAge,
  yearlyExpenses,
  grossReturn,
  inflationRate,
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

  // ── SWR Strategy ──
  const swrRows = useMemo(() => {
    const rows: PerpetualRow[] = []
    let balance = startPortfolio
    for (let y = 0; y < totalYears && balance > 0; y++) {
      const age = retirementAge + y
      const withdrawal = Math.min(balance * NL_SWR, balance)
      const remainder = balance - withdrawal
      const growth = remainder * realReturn
      rows.push({
        year: y + 1, age, startBalance: Math.round(balance),
        withdrawal: Math.round(withdrawal), remainder: Math.round(remainder),
        growth: Math.round(growth), endBalance: Math.round(remainder + growth),
      })
      balance = remainder + growth
    }
    return rows
  }, [startPortfolio, totalYears, retirementAge, realReturn])

  // ── Guardrails Strategy ──
  const guardrailsRows = useMemo(() => {
    const rows: PerpetualRow[] = []
    let balance = startPortfolio
    let baseWithdrawal = startPortfolio * NL_SWR
    const floor = baseWithdrawal * 0.9
    const ceiling = baseWithdrawal * 1.1
    for (let y = 0; y < totalYears && balance > 0; y++) {
      const age = retirementAge + y
      const impliedWithdrawal = balance * NL_SWR
      if (impliedWithdrawal > ceiling) {
        baseWithdrawal = ceiling
      } else if (impliedWithdrawal < floor) {
        baseWithdrawal = floor
      } else {
        baseWithdrawal = impliedWithdrawal
      }
      const withdrawal = Math.min(baseWithdrawal, balance)
      const remainder = balance - withdrawal
      const growth = remainder * realReturn
      rows.push({
        year: y + 1, age, startBalance: Math.round(balance),
        withdrawal: Math.round(withdrawal), remainder: Math.round(remainder),
        growth: Math.round(growth), endBalance: Math.round(remainder + growth),
      })
      balance = remainder + growth
    }
    return rows
  }, [startPortfolio, totalYears, retirementAge, realReturn])

  // ── VPW Strategy ──
  const vpwRows = useMemo(() => {
    const rows: PerpetualRow[] = []
    let balance = startPortfolio
    for (let y = 0; y < totalYears && balance > 0; y++) {
      const age = retirementAge + y
      const remainingYears = lifeExpectancyYears(age)
      const rate = vpwRate(remainingYears, realReturn)
      const withdrawal = Math.min(balance * rate, balance)
      const remainder = balance - withdrawal
      const growth = remainder * realReturn
      rows.push({
        year: y + 1, age, startBalance: Math.round(balance),
        withdrawal: Math.round(withdrawal), remainder: Math.round(remainder),
        growth: Math.round(growth), endBalance: Math.round(remainder + growth),
      })
      balance = remainder + growth
    }
    return rows
  }, [startPortfolio, totalYears, retirementAge, realReturn])

  // ── Bucket Strategy ──
  const bucketRows = useMemo(() => {
    const rows: PerpetualRow[] = []
    const cashBucket = yearlyExpenses * 2
    const bondBucket = yearlyExpenses * 5
    const stockBucket = Math.max(0, startPortfolio - cashBucket - bondBucket)
    let totalBalance = startPortfolio
    let cashBalance = Math.min(cashBucket, startPortfolio)
    let bondBalance = Math.min(bondBucket, Math.max(0, startPortfolio - cashBucket))
    let stockBalance = stockBucket
    const bondReturn = realReturn * 0.3
    for (let y = 0; y < totalYears && totalBalance > 0; y++) {
      const age = retirementAge + y
      const startBal = totalBalance
      const withdrawal = Math.min(yearlyExpenses, totalBalance)
      const fromCash = Math.min(withdrawal, cashBalance)
      cashBalance -= fromCash
      const fromBonds = Math.min(withdrawal - fromCash, bondBalance)
      bondBalance -= fromBonds
      const fromStocks = withdrawal - fromCash - fromBonds
      stockBalance = Math.max(0, stockBalance - fromStocks)
      const stockGrowth = stockBalance * realReturn
      const bondGrowth = bondBalance * bondReturn
      stockBalance += stockGrowth
      bondBalance += bondGrowth
      const cashTarget = Math.min(yearlyExpenses * 2, stockBalance + bondBalance + cashBalance)
      if (cashBalance < cashTarget && stockBalance > 0) {
        const refill = Math.min(cashTarget - cashBalance, stockBalance)
        cashBalance += refill
        stockBalance -= refill
      }
      totalBalance = cashBalance + bondBalance + stockBalance
      const growth = Math.round(stockGrowth + bondGrowth)
      rows.push({
        year: y + 1, age, startBalance: Math.round(startBal),
        withdrawal: Math.round(withdrawal), remainder: Math.round(totalBalance - growth),
        growth, endBalance: Math.round(totalBalance),
      })
    }
    return rows
  }, [startPortfolio, totalYears, retirementAge, yearlyExpenses, realReturn])

  const strategies = [
    { key: 'swr', label: 'SWR (Safe Withdrawal Rate)', subtitle: `Onttrekking = ${(NL_SWR * 100).toFixed(3)}% van portfolio per jaar`, rows: swrRows },
    { key: 'guardrails', label: 'Guardrails', subtitle: 'Variabele onttrekking met boven- en ondergrenzen (\u00b110%)', rows: guardrailsRows },
    { key: 'vpw', label: 'VPW (Variable Percentage Withdrawal)', subtitle: 'Jaarlijks herberekend % op basis van resterende levensverwachting', rows: vpwRows },
    { key: 'bucket', label: 'Bucket (Emmer-strategie)', subtitle: '3 emmers: cash (2j), obligaties (5j), aandelen (rest)', rows: bucketRows },
  ]

  return (
    <>
      {strategies.map((strat) => (
        <PerpetualSubTable key={strat.key} label={strat.label} subtitle={strat.subtitle} rows={strat.rows} />
      ))}
    </>
  )
}

// ── Sub-table Component ──────────────────────────────────────

function PerpetualSubTable({ label, subtitle, rows }: { label: string; subtitle: string; rows: PerpetualRow[] }) {
  const [expanded, setExpanded] = useState(false)
  const displayRows = useMemo(() => expanded ? rows : samplePerpetualRows(rows), [rows, expanded])
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
                <th className="px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Jaar</th>
                <th className="px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Leeftijd</th>
                <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Portfoliowaarde</th>
                <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Onttrekking</th>
                <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Restant</th>
                <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Rendement</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row, idx) => (
                <tr
                  key={row.year}
                  className={`border-b border-[var(--border-ed)]/50 ${
                    row.endBalance <= 0 ? 'bg-amber-50/50' : idx % 2 === 1 ? 'bg-[var(--subtle)]/30' : ''
                  }`}
                >
                  <td className="px-3 py-1 font-medium text-[var(--ink)]">{row.year}</td>
                  <td className="px-3 py-1 text-[var(--ink)]">{row.age}j</td>
                  <td className="px-3 py-1 text-right font-mono tabular-nums text-[var(--ink)]">
                    {formatCurrency(row.startBalance)}
                  </td>
                  <td className="px-3 py-1 text-right font-mono tabular-nums text-red-600">
                    -{formatCurrency(row.withdrawal)}
                  </td>
                  <td className="px-3 py-1 text-right font-mono tabular-nums text-[var(--ink-2)]">
                    {formatCurrency(row.remainder)}
                  </td>
                  <td className={`px-3 py-1 text-right font-mono tabular-nums ${row.growth >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {row.growth >= 0 ? '+' : ''}{formatCurrency(row.growth)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-[var(--border-ed)] bg-[var(--subtle)]">
                <td colSpan={2} className="px-3 py-1.5 font-bold text-[var(--ink)]">Totaal ({rows.length}j)</td>
                <td className="px-3 py-1.5 text-right font-mono font-bold tabular-nums text-[var(--ink)]">
                  {formatCurrency(rows[0]?.startBalance ?? 0)}
                </td>
                <td className="px-3 py-1.5 text-right font-mono font-bold tabular-nums text-red-600">
                  -{formatCurrency(rows.reduce((s, r) => s + r.withdrawal, 0))}
                </td>
                <td className="px-3 py-1.5" />
                <td className="px-3 py-1.5 text-right font-mono font-bold tabular-nums text-emerald-600">
                  +{formatCurrency(rows.reduce((s, r) => s + r.growth, 0))}
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
