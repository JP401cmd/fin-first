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
  /** Optional: VPW withdrawal rate for this year (0–1 fraction) */
  withdrawalRate?: number
  /** Optional: remaining life expectancy years used for VPW */
  remainingYears?: number
  /** Optional: which guardrail is active this period */
  guardrail?: 'upper' | 'lower' | 'normal'
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

/** Remaining years until age 100 (VPW planning horizon). */
function remainingLifeYears(age: number): number {
  return Math.max(1, 100 - age)
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
  activeWithdrawalStrategy,
}: {
  startPortfolio: number
  retirementAge: number
  endAge: number
  yearlyExpenses: number
  grossReturn: number
  inflationRate: number
  hasPartner: boolean
  activeWithdrawalStrategy?: string
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
  // Portfolio-based triggers: upper at 120% start, lower at 80% start
  // Withdrawal adjusts ±10% when guardrails hit
  const guardrailsRows = useMemo(() => {
    const rows: PerpetualRow[] = []
    let balance = startPortfolio
    let currentWithdrawal = startPortfolio * NL_SWR
    const upperThreshold = startPortfolio * 1.2  // portfolio > 120% of start
    const lowerThreshold = startPortfolio * 0.8  // portfolio < 80% of start

    for (let y = 0; y < totalYears && balance > 0; y++) {
      const age = retirementAge + y
      let guardrail: 'upper' | 'lower' | 'normal' = 'normal'

      if (balance > upperThreshold) {
        // Strong growth: increase withdrawal by 10%
        currentWithdrawal = currentWithdrawal * 1.1
        guardrail = 'upper'
      } else if (balance < lowerThreshold) {
        // Decline: decrease withdrawal by 10%
        currentWithdrawal = currentWithdrawal * 0.9
        guardrail = 'lower'
      }

      const withdrawal = Math.min(currentWithdrawal, balance)
      const remainder = balance - withdrawal
      const growth = remainder * realReturn
      rows.push({
        year: y + 1, age, startBalance: Math.round(balance),
        withdrawal: Math.round(withdrawal), remainder: Math.round(remainder),
        growth: Math.round(growth), endBalance: Math.round(remainder + growth),
        guardrail,
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
      const remYears = remainingLifeYears(age)
      const rate = vpwRate(remYears, realReturn)
      const withdrawal = Math.min(balance * rate, balance)
      const remainder = balance - withdrawal
      const growth = remainder * realReturn
      rows.push({
        year: y + 1, age, startBalance: Math.round(balance),
        withdrawal: Math.round(withdrawal), remainder: Math.round(remainder),
        growth: Math.round(growth), endBalance: Math.round(remainder + growth),
        withdrawalRate: rate,
        remainingYears: remYears,
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
    { key: 'guardrails', label: 'Guardrails', subtitle: `Basisonttrekking NL SWR (${(NL_SWR * 100).toFixed(2)}%). Portfolio > 120% start → +10%, < 80% → −10%`, rows: guardrailsRows, showGuardrailColumn: true },
    { key: 'vpw', label: 'VPW (Variable Percentage Withdrawal)', subtitle: 'Jaarlijks herberekend op basis van resterende jaren tot 100 en verwacht rendement', rows: vpwRows, showVpwColumns: true },
    { key: 'bucket', label: 'Bucket (Emmer-strategie)', subtitle: '3 emmers: cash (2j), obligaties (5j), aandelen (rest)', rows: bucketRows },
  ]

  return (
    <>
      {strategies.map((strat) => (
        <PerpetualSubTable key={strat.key} label={strat.label} subtitle={strat.subtitle} rows={strat.rows} showVpwColumns={strat.showVpwColumns} showGuardrailColumn={strat.showGuardrailColumn} isActive={strat.key === activeWithdrawalStrategy} />
      ))}
    </>
  )
}

// ── Sub-table Component ──────────────────────────────────────

function PerpetualSubTable({ label, subtitle, rows, showVpwColumns, showGuardrailColumn, isActive }: { label: string; subtitle: string; rows: PerpetualRow[]; showVpwColumns?: boolean; showGuardrailColumn?: boolean; isActive?: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const displayRows = useMemo(() => expanded ? rows : samplePerpetualRows(rows), [rows, expanded])
  const hasTooMany = rows.length > 20

  return (
    <div className={`rounded-xl border bg-[var(--paper)] overflow-hidden ${isActive ? 'border-horizon-400 ring-2 ring-horizon-200' : 'border-[var(--border-ed)]'}`}>
      <div className={`border-b px-4 py-2.5 ${isActive ? 'border-horizon-300 bg-horizon-50/60' : 'border-[var(--border-ed)] bg-[var(--subtle)]/50'}`}>
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-bold text-[var(--ink)]">{label}</h4>
          {isActive && (
            <span className="rounded-full bg-horizon-500 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
              Actief
            </span>
          )}
        </div>
        <p className="text-[11px] text-[var(--ink-3)]">{subtitle}</p>
      </div>

      {rows.length > 0 ? (
        <div className="overflow-auto max-h-[60vh]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-[var(--border-ed)] bg-[var(--subtle)]">
                <th className="px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Jaar</th>
                <th className="px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Leeftijd</th>
                {showVpwColumns && (
                  <>
                    <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Rest. jaren</th>
                    <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">VPW %</th>
                  </>
                )}
                <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Portfoliowaarde</th>
                <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Onttrekking</th>
                <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Restant</th>
                <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Rendement</th>
                {showGuardrailColumn && (
                  <th className="px-3 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Guardrail</th>
                )}
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
                  {showVpwColumns && (
                    <>
                      <td className="px-3 py-1 text-right font-mono tabular-nums text-[var(--ink-2)]">
                        {row.remainingYears ?? '—'}
                      </td>
                      <td className="px-3 py-1 text-right font-mono tabular-nums text-horizon-600 font-medium">
                        {row.withdrawalRate != null ? `${(row.withdrawalRate * 100).toFixed(2)}%` : '—'}
                      </td>
                    </>
                  )}
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
                  {showGuardrailColumn && (
                    <td className="px-3 py-1 text-center text-[11px] font-medium">
                      {row.guardrail === 'upper' ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">▲ +10%</span>
                      ) : row.guardrail === 'lower' ? (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-700">▼ −10%</span>
                      ) : (
                        <span className="text-[var(--ink-4)]">—</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-[var(--border-ed)] bg-[var(--subtle)]">
                <td colSpan={showVpwColumns ? 4 : 2} className="px-3 py-1.5 font-bold text-[var(--ink)]">Totaal ({rows.length}j)</td>
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
                {showGuardrailColumn && <td className="px-3 py-1.5" />}
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
