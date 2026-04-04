'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { NL_AOW_AGE, NL_AOW_MONTHLY, NL_AOW_MONTHLY_SAMENWONEND, NL_SWR } from '@/lib/constants'

// ── Types ────────────────────────────────────────────────────

interface PensionRow {
  year: number
  age: number
  expenses: number
  aowIncome: number
  withdrawal: number
  startBalance: number
  growth: number
  endBalance: number
  /** Optional: VPW rate for this year */
  withdrawalRate?: number
  /** Optional: remaining life expectancy years */
  remainingYears?: number
}

// ── Helpers ──────────────────────────────────────────────────

function sampleRows(rows: PensionRow[]): PensionRow[] {
  if (rows.length <= 20) return rows
  const result: PensionRow[] = rows.slice(0, 5)
  for (let i = 5; i < rows.length - 3; i++) {
    if (i % 5 === 0) result.push(rows[i])
  }
  result.push(...rows.slice(-3))
  return result
}

function remainingLifeYears(age: number): number {
  return Math.max(1, 100 - age)
}

function vpwRate(remainingYears: number, realReturn: number): number {
  if (remainingYears <= 1) return 1
  if (realReturn === 0) return 1 / remainingYears
  return realReturn / (1 - Math.pow(1 + realReturn, -remainingYears))
}

/**
 * Compute inflation-adjusted yearly expenses at a given age.
 * Base = yearlyExpenses at current age, inflated forward.
 */
function inflatedExpenses(yearlyExpenses: number, yearsFromNow: number, inflationRate: number): number {
  return yearlyExpenses * Math.pow(1 + inflationRate, yearsFromNow)
}

// ── Main Component ───────────────────────────────────────────

export function PensionStrategyTables({
  portfolioAtAow,
  currentAge,
  yearlyExpenses,
  grossReturn,
  inflationRate,
  hasPartner,
  activeWithdrawalStrategy,
}: {
  /** Portfolio value projected to AOW age */
  portfolioAtAow: number
  currentAge: number
  yearlyExpenses: number
  grossReturn: number
  inflationRate: number
  hasPartner: boolean
  activeWithdrawalStrategy?: string
}) {
  const aowAge = NL_AOW_AGE
  const endAge = 100
  const totalYears = Math.max(0, endAge - aowAge)
  const realReturn = (1 + grossReturn) / (1 + inflationRate) - 1
  const aowYearly = (hasPartner ? NL_AOW_MONTHLY_SAMENWONEND : NL_AOW_MONTHLY) * 12
  const yearsToAow = Math.max(0, aowAge - currentAge)

  // ── SWR Strategy ──
  const swrRows = useMemo(() => {
    const rows: PensionRow[] = []
    let balance = portfolioAtAow
    for (let y = 0; y < totalYears && balance > 0; y++) {
      const age = aowAge + y
      const expenses = inflatedExpenses(yearlyExpenses, yearsToAow + y, inflationRate)
      const neededFromPortfolio = Math.max(0, expenses - aowYearly)
      const swrAmount = balance * NL_SWR
      const withdrawal = Math.min(Math.max(swrAmount, neededFromPortfolio), balance)
      const remaining = balance - withdrawal
      const growth = remaining * realReturn
      rows.push({
        year: y + 1, age, expenses: Math.round(expenses),
        aowIncome: Math.round(aowYearly),
        withdrawal: Math.round(withdrawal),
        startBalance: Math.round(balance),
        growth: Math.round(growth),
        endBalance: Math.round(remaining + growth),
      })
      balance = remaining + growth
    }
    return rows
  }, [portfolioAtAow, totalYears, aowAge, yearsToAow, yearlyExpenses, inflationRate, aowYearly, realReturn])

  // ── Guardrails Strategy ──
  const guardrailsRows = useMemo(() => {
    const rows: PensionRow[] = []
    let balance = portfolioAtAow
    let baseWithdrawal = portfolioAtAow * NL_SWR
    const floor = baseWithdrawal * 0.9
    const ceiling = baseWithdrawal * 1.1
    for (let y = 0; y < totalYears && balance > 0; y++) {
      const age = aowAge + y
      const expenses = inflatedExpenses(yearlyExpenses, yearsToAow + y, inflationRate)
      const neededFromPortfolio = Math.max(0, expenses - aowYearly)
      const impliedWithdrawal = balance * NL_SWR
      if (impliedWithdrawal > ceiling) {
        baseWithdrawal = ceiling
      } else if (impliedWithdrawal < floor) {
        baseWithdrawal = floor
      } else {
        baseWithdrawal = impliedWithdrawal
      }
      const withdrawal = Math.min(Math.max(baseWithdrawal, neededFromPortfolio), balance)
      const remaining = balance - withdrawal
      const growth = remaining * realReturn
      rows.push({
        year: y + 1, age, expenses: Math.round(expenses),
        aowIncome: Math.round(aowYearly),
        withdrawal: Math.round(withdrawal),
        startBalance: Math.round(balance),
        growth: Math.round(growth),
        endBalance: Math.round(remaining + growth),
      })
      balance = remaining + growth
    }
    return rows
  }, [portfolioAtAow, totalYears, aowAge, yearsToAow, yearlyExpenses, inflationRate, aowYearly, realReturn])

  // ── VPW Strategy ──
  const vpwRows = useMemo(() => {
    const rows: PensionRow[] = []
    let balance = portfolioAtAow
    for (let y = 0; y < totalYears && balance > 0; y++) {
      const age = aowAge + y
      const expenses = inflatedExpenses(yearlyExpenses, yearsToAow + y, inflationRate)
      const neededFromPortfolio = Math.max(0, expenses - aowYearly)
      const remYears = remainingLifeYears(age)
      const rate = vpwRate(remYears, realReturn)
      const vpwAmount = balance * rate
      const withdrawal = Math.min(Math.max(vpwAmount, neededFromPortfolio), balance)
      const remaining = balance - withdrawal
      const growth = remaining * realReturn
      rows.push({
        year: y + 1, age, expenses: Math.round(expenses),
        aowIncome: Math.round(aowYearly),
        withdrawal: Math.round(withdrawal),
        startBalance: Math.round(balance),
        growth: Math.round(growth),
        endBalance: Math.round(remaining + growth),
        withdrawalRate: rate,
        remainingYears: remYears,
      })
      balance = remaining + growth
    }
    return rows
  }, [portfolioAtAow, totalYears, aowAge, yearsToAow, yearlyExpenses, inflationRate, aowYearly, realReturn])

  // ── Bucket Strategy ──
  const bucketRows = useMemo(() => {
    const rows: PensionRow[] = []
    const initExpenses = inflatedExpenses(yearlyExpenses, yearsToAow, inflationRate)
    const cashBucket = initExpenses * 2
    const bondBucket = initExpenses * 5
    const stockBucket = Math.max(0, portfolioAtAow - cashBucket - bondBucket)
    let cashBalance = Math.min(cashBucket, portfolioAtAow)
    let bondBalance = Math.min(bondBucket, Math.max(0, portfolioAtAow - cashBucket))
    let stockBalance = stockBucket
    let totalBalance = portfolioAtAow
    const bondReturn = realReturn * 0.3

    for (let y = 0; y < totalYears && totalBalance > 0; y++) {
      const age = aowAge + y
      const expenses = inflatedExpenses(yearlyExpenses, yearsToAow + y, inflationRate)
      const neededFromPortfolio = Math.max(0, expenses - aowYearly)
      const startBal = totalBalance
      const withdrawal = Math.min(neededFromPortfolio, totalBalance)

      // Withdraw from cash first, then bonds, then stocks
      const fromCash = Math.min(withdrawal, cashBalance)
      cashBalance -= fromCash
      const fromBonds = Math.min(withdrawal - fromCash, bondBalance)
      bondBalance -= fromBonds
      const fromStocks = withdrawal - fromCash - fromBonds
      stockBalance = Math.max(0, stockBalance - fromStocks)

      // Growth
      const stockGrowth = stockBalance * realReturn
      const bondGrowth = bondBalance * bondReturn
      stockBalance += stockGrowth
      bondBalance += bondGrowth

      // Refill cash bucket from stocks
      const cashTarget = Math.min(neededFromPortfolio * 2, stockBalance + bondBalance + cashBalance)
      if (cashBalance < cashTarget && stockBalance > 0) {
        const refill = Math.min(cashTarget - cashBalance, stockBalance)
        cashBalance += refill
        stockBalance -= refill
      }

      totalBalance = cashBalance + bondBalance + stockBalance
      const growth = Math.round(stockGrowth + bondGrowth)

      rows.push({
        year: y + 1, age, expenses: Math.round(expenses),
        aowIncome: Math.round(aowYearly),
        withdrawal: Math.round(withdrawal),
        startBalance: Math.round(startBal),
        growth,
        endBalance: Math.round(totalBalance),
      })
    }
    return rows
  }, [portfolioAtAow, totalYears, aowAge, yearsToAow, yearlyExpenses, inflationRate, aowYearly, realReturn])

  const strategies = [
    { key: 'swr', label: 'SWR (Safe Withdrawal Rate)', subtitle: `Onttrekking = max(${(NL_SWR * 100).toFixed(3)}% portfolio, benodigde uitgaven − AOW)`, rows: swrRows },
    { key: 'guardrails', label: 'Guardrails', subtitle: 'Variabele onttrekking met boven- en ondergrenzen (±10%), minimaal uitgaven − AOW', rows: guardrailsRows },
    { key: 'vpw', label: 'VPW (Variable Percentage Withdrawal)', subtitle: 'Herberekend op basis van resterende levensjaren, minimaal uitgaven − AOW', rows: vpwRows, showVpwColumns: true },
    { key: 'bucket', label: 'Bucket (Emmer-strategie)', subtitle: '3 emmers: cash (2j), obligaties (5j), aandelen (rest) — onttrekking = uitgaven − AOW', rows: bucketRows },
  ]

  return (
    <>
      {/* Info strip */}
      <div className="rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)]/50 px-4 py-2.5">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--ink-4)]">Startleeftijd</p>
            <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-[var(--ink)]">{aowAge}j (AOW)</p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--ink-4)]">Eindleeftijd</p>
            <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-[var(--ink)]">{endAge}j</p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--ink-4)]">Vermogen op {aowAge}j</p>
            <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-[var(--ink)]">{formatCurrency(portfolioAtAow)}</p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--ink-4)]">AOW-uitkering /jr</p>
            <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-emerald-600">+{formatCurrency(aowYearly)}</p>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-[var(--ink-3)]">
          Benodigde onttrekking = noodzakelijke uitgaven (gecorrigeerd voor inflatie) minus AOW-uitkering.
          Elke strategie bepaalt het onttrekkingsbedrag op basis van het portfolio, met het benodigde bedrag als minimum.
        </p>
      </div>

      {strategies.map((strat) => (
        <PensionSubTable
          key={strat.key}
          label={strat.label}
          subtitle={strat.subtitle}
          rows={strat.rows}
          showVpwColumns={strat.showVpwColumns}
          isActive={strat.key === activeWithdrawalStrategy}
        />
      ))}
    </>
  )
}

// ── Sub-table Component ──────────────────────────────────────

function PensionSubTable({
  label,
  subtitle,
  rows,
  showVpwColumns,
  isActive,
}: {
  label: string
  subtitle: string
  rows: PensionRow[]
  showVpwColumns?: boolean
  isActive?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const displayRows = useMemo(() => (expanded ? rows : sampleRows(rows)), [rows, expanded])
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
                <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Uitgaven</th>
                <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Onttrekking</th>
                <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Portfoliowaarde</th>
                <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Restant</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row, idx) => (
                <tr
                  key={row.year}
                  className={`border-b border-[var(--border-ed)]/50 hover:bg-[var(--subtle)]/50 ${
                    row.endBalance <= 0 ? 'bg-amber-50/50' : idx % 2 === 1 ? 'bg-[var(--subtle)]/30' : ''
                  }`}
                >
                  <td className="px-3 py-1 font-mono tabular-nums font-medium text-[var(--ink)]">{row.year}</td>
                  <td className="px-3 py-1 font-mono tabular-nums text-[var(--ink)]">{row.age}j</td>
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
                  <td className="px-3 py-1 text-right font-mono tabular-nums text-[var(--ink-2)]">
                    {formatCurrency(row.expenses)}
                  </td>
                  <td className="px-3 py-1 text-right font-mono tabular-nums text-red-600">
                    -{formatCurrency(row.withdrawal)}
                  </td>
                  <td className="px-3 py-1 text-right font-mono tabular-nums text-[var(--ink)]">
                    {formatCurrency(row.startBalance)}
                  </td>
                  <td className={`px-3 py-1 text-right font-mono tabular-nums ${
                    row.endBalance <= 0 ? 'text-amber-600 font-semibold' : 'text-[var(--ink)]'
                  }`}>
                    {row.endBalance <= 0 ? `${formatCurrency(0)} ⚠` : formatCurrency(row.endBalance)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-[var(--border-ed)] bg-[var(--subtle)]">
                <td colSpan={showVpwColumns ? 4 : 2} className="px-3 py-1.5 font-bold text-[var(--ink)]">
                  Totaal ({rows.length}j)
                </td>
                <td className="px-3 py-1.5 text-right font-mono font-bold tabular-nums text-[var(--ink-2)]">
                  {formatCurrency(rows.reduce((s, r) => s + r.expenses, 0))}
                </td>
                <td className="px-3 py-1.5 text-right font-mono font-bold tabular-nums text-red-600">
                  -{formatCurrency(rows.reduce((s, r) => s + r.withdrawal, 0))}
                </td>
                <td className="px-3 py-1.5 text-right font-mono font-bold tabular-nums text-[var(--ink)]">
                  {formatCurrency(rows[0]?.startBalance ?? 0)}
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
