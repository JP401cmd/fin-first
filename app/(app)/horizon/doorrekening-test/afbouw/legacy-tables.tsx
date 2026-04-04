'use client'

import { useMemo, useState } from 'react'
import { formatCurrency } from '@/lib/format'
import { NL_AOW_AGE, NL_AOW_MONTHLY, NL_AOW_MONTHLY_SAMENWONEND, NL_SWR } from '@/lib/constants'

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

// ── Schedule computation helpers ────────────────────────────

/** SWR-based withdrawal: fixed annual amount = (portfolio - PV(legacy)) x SWR. */
function computeLegacySwrSchedule(
  startPortfolio: number,
  retirementAge: number,
  endAge: number,
  grossReturn: number,
  inflationRate: number,
  hasPartner: boolean,
  legacyAmount: number,
): WithdrawalRow[] {
  const totalYears = endAge - retirementAge
  if (totalYears <= 0 || startPortfolio <= 0) return []

  const realReturn = (1 + grossReturn) / (1 + inflationRate) - 1
  const aowYearly = (hasPartner ? NL_AOW_MONTHLY_SAMENWONEND : NL_AOW_MONTHLY) * 12
  const pvLegacy = legacyAmount / Math.pow(1 + realReturn, totalYears)
  const baseWithdrawal = Math.max(0, (startPortfolio - pvLegacy) * NL_SWR)

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

/** Guardrails: variable withdrawal with +/- 20% bands around base SWR, preserving legacy PV. */
function computeLegacyGuardrailsSchedule(
  startPortfolio: number,
  retirementAge: number,
  endAge: number,
  grossReturn: number,
  inflationRate: number,
  hasPartner: boolean,
  legacyAmount: number,
): WithdrawalRow[] {
  const totalYears = endAge - retirementAge
  if (totalYears <= 0 || startPortfolio <= 0) return []

  const realReturn = (1 + grossReturn) / (1 + inflationRate) - 1
  const aowYearly = (hasPartner ? NL_AOW_MONTHLY_SAMENWONEND : NL_AOW_MONTHLY) * 12
  const pvLegacy = legacyAmount / Math.pow(1 + realReturn, totalYears)
  const initialWithdrawal = Math.max(0, (startPortfolio - pvLegacy) * NL_SWR)
  const ceiling = NL_SWR * (1 + GUARDRAIL_BAND)
  const floor = NL_SWR * (1 - GUARDRAIL_BAND)

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

/** VPW: each year withdraw (portfolio - PV_remaining_legacy) / remaining_years. */
function computeLegacyVpwSchedule(
  startPortfolio: number,
  retirementAge: number,
  endAge: number,
  grossReturn: number,
  inflationRate: number,
  hasPartner: boolean,
  legacyAmount: number,
): WithdrawalRow[] {
  const totalYears = endAge - retirementAge
  if (totalYears <= 0 || startPortfolio <= 0) return []

  const realReturn = (1 + grossReturn) / (1 + inflationRate) - 1
  const aowYearly = (hasPartner ? NL_AOW_MONTHLY_SAMENWONEND : NL_AOW_MONTHLY) * 12

  const schedule: WithdrawalRow[] = []
  let balance = startPortfolio

  for (let y = 0; y < totalYears; y++) {
    const age = retirementAge + y
    const startBalance = balance
    const aow = age >= NL_AOW_AGE ? aowYearly : 0
    const remainingYears = Math.max(1, totalYears - y)

    // PV of legacy decreases as we get closer to end age
    const pvLegacyNow = legacyAmount / Math.pow(1 + realReturn, remainingYears)
    const vpwWithdrawal = Math.max(0, (balance - pvLegacyNow) / remainingYears)
    const neededFromPortfolio = Math.max(0, vpwWithdrawal - aow)
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

/** Bucket strategy: 3 buckets with legacy buffer in equity that is never touched. */
function computeLegacyBucketSchedule(
  startPortfolio: number,
  retirementAge: number,
  endAge: number,
  yearlyExpenses: number,
  grossReturn: number,
  inflationRate: number,
  hasPartner: boolean,
  legacyBuffer: number,
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

    // Withdraw from cash first, then bonds, then available equity (above buffer)
    let toWithdraw = withdrawal
    const fromCash = Math.min(toWithdraw, cash)
    cash -= fromCash
    toWithdraw -= fromCash

    const fromBonds = Math.min(toWithdraw, bonds)
    bonds -= fromBonds
    toWithdraw -= fromBonds

    const availableEquity = Math.max(0, equity - legacyBuffer)
    const fromEquity = Math.min(toWithdraw, availableEquity)
    equity -= fromEquity

    // Apply returns per bucket
    bonds = bonds * (1 + BOND_RETURN)
    equity = equity * (1 + realReturn)

    // Refill cascade: equity -> bonds -> cash
    const bondShortfall = Math.max(0, bondTarget - bonds)
    const equityForRefill = Math.max(0, equity - legacyBuffer)
    const bondRefill = Math.min(bondShortfall, equityForRefill)
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
  isActive,
}: {
  label: string
  subtitle: string
  rows: WithdrawalRow[]
  isActive?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const displayRows = useMemo(() => expanded ? rows : sampleRows(rows), [rows, expanded])
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

// ── Sub-table: bucket columns ───────────────────────────────

function BucketSubTable({
  label,
  subtitle,
  rows,
  isActive,
}: {
  label: string
  subtitle: string
  rows: BucketRow[]
  isActive?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const displayRows = useMemo(() => expanded ? rows : sampleRows(rows), [rows, expanded])
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

export function LegacyStrategyTables({
  startPortfolio,
  retirementAge,
  endAge,
  yearlyExpenses,
  grossReturn,
  inflationRate,
  hasPartner,
  legacyAmount,
  activeWithdrawalStrategy,
}: {
  startPortfolio: number
  retirementAge: number
  endAge: number
  yearlyExpenses: number
  grossReturn: number
  inflationRate: number
  hasPartner: boolean
  legacyAmount: number
  activeWithdrawalStrategy?: string
}) {
  const totalYears = Math.max(0, endAge - retirementAge)
  const realReturn = (1 + grossReturn) / (1 + inflationRate) - 1

  // Present value of legacy at retirement age
  const pvLegacy = totalYears > 0
    ? legacyAmount / Math.pow(1 + realReturn, totalYears)
    : legacyAmount
  const availableForWithdrawal = Math.max(0, startPortfolio - pvLegacy)
  const swrAnnual = availableForWithdrawal * NL_SWR

  // ── Compute all four schedules ──
  const swrRows = useMemo(() =>
    computeLegacySwrSchedule(startPortfolio, retirementAge, endAge, grossReturn, inflationRate, hasPartner, legacyAmount),
    [startPortfolio, retirementAge, endAge, grossReturn, inflationRate, hasPartner, legacyAmount],
  )

  const guardrailsRows = useMemo(() =>
    computeLegacyGuardrailsSchedule(startPortfolio, retirementAge, endAge, grossReturn, inflationRate, hasPartner, legacyAmount),
    [startPortfolio, retirementAge, endAge, grossReturn, inflationRate, hasPartner, legacyAmount],
  )

  const vpwRows = useMemo(() =>
    computeLegacyVpwSchedule(startPortfolio, retirementAge, endAge, grossReturn, inflationRate, hasPartner, legacyAmount),
    [startPortfolio, retirementAge, endAge, grossReturn, inflationRate, hasPartner, legacyAmount],
  )

  const bucketRows = useMemo(() =>
    computeLegacyBucketSchedule(startPortfolio, retirementAge, endAge, yearlyExpenses, grossReturn, inflationRate, hasPartner, legacyAmount),
    [startPortfolio, retirementAge, endAge, yearlyExpenses, grossReturn, inflationRate, hasPartner, legacyAmount],
  )

  return (
    <>
      {/* Info strip with key figures */}
      <div className="rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)]/50 px-4 py-2.5 text-xs text-[var(--ink-3)]">
        Vier onttrekkingsmethoden die een doelvermogen van{' '}
        <span className="font-semibold text-[var(--ink-2)]">{formatCurrency(legacyAmount)}</span>{' '}
        nalaten bij leeftijd {endAge}. Contante waarde bij pensioen:{' '}
        <span className="font-semibold text-[var(--ink-2)]">{formatCurrency(Math.round(pvLegacy))}</span>.{' '}
        Beschikbaar voor onttrekking:{' '}
        <span className="font-semibold text-[var(--ink-2)]">{formatCurrency(Math.round(availableForWithdrawal))}</span>.
      </div>

      <WithdrawalSubTable
        label="A. SWR — Vaste onttrekking (met nalatenschap)"
        subtitle={`Jaarlijkse onttrekking: (portfolio \u2212 CW nalatenschap) \u00d7 SWR (${(NL_SWR * 100).toFixed(2)}%) = ${formatCurrency(Math.round(swrAnnual))}/jr`}
        rows={swrRows}
        isActive={activeWithdrawalStrategy === 'swr'}
      />

      <WithdrawalSubTable
        label="B. Guardrails — Variabele onttrekking met bandbreedte"
        subtitle={`Start met SWR op beschikbaar deel, met \u00b1${Math.round(GUARDRAIL_BAND * 100)}% bandbreedte. Past automatisch aan bij marktuitslagen.`}
        rows={guardrailsRows}
        isActive={activeWithdrawalStrategy === 'guardrails'}
      />

      <WithdrawalSubTable
        label="C. VPW — Variabele percentage-onttrekking"
        subtitle="Elk jaar: (portfolio \u2212 CW resterende nalatenschap) / resterende jaren. Meer beschikbaar naarmate einddatum nadert."
        rows={vpwRows}
        isActive={activeWithdrawalStrategy === 'vpw'}
      />

      <BucketSubTable
        label="D. Bucket — Emmerstrategie (met nalatenschapsbuffer)"
        subtitle={`Drie emmers + buffer van ${formatCurrency(legacyAmount)} in aandelen. Cash (2j, 0%), Obligaties (5j, ${(BOND_RETURN * 100).toFixed(0)}%), Aandelen (rest).`}
        rows={bucketRows}
        isActive={activeWithdrawalStrategy === 'bucket'}
      />
    </>
  )
}
