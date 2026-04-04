'use client'

import { useMemo, useState } from 'react'
import { Settings, TrendingUp, Minus } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import type { FireParams } from '@/lib/fire-params'
import type { LifeEvent } from '@/lib/horizon-data'
import { NL_SWR, BOX3_TARIEF, NL_FICTIEF_BELEGGINGEN } from '@/lib/horizon-data'
import type { SimCashflow } from '@/lib/fire-simulation'

// ── Types ──────────────────────────────────────────────────────

interface Asset {
  id: string
  name: string
  current_value: number
  expected_return: number
  monthly_contribution: number
  asset_type: string
  [key: string]: unknown
}

interface Debt {
  id: string
  name: string
  current_balance: number
  interest_rate: number
  monthly_payment: number
  [key: string]: unknown
}

// ── Projection Logic ───────────────────────────────────────────

interface ProjectionYear {
  year: number
  age: number | null
  totalAssets: number
  totalDebts: number
  netWorth: number
  annualSavings: number
  annualReturn: number
  box3Tax: number
  cumulativeTax: number
}

function computeProjection({
  assets,
  debts,
  grossReturn,
  inflationRate,
  currentAge,
  projectionYears,
  monthlyIncome,
  savingsRate,
  yearlyExpenses,
}: {
  assets: Asset[]
  debts: Debt[]
  grossReturn: number
  inflationRate: number
  currentAge: number | null
  projectionYears: number
  monthlyIncome: number
  savingsRate: number
  yearlyExpenses: number
}): ProjectionYear[] {
  const rows: ProjectionYear[] = []

  // Initial values
  let assetTotal = assets.reduce((s, a) => s + a.current_value, 0)
  let debtTotal = debts.reduce((s, d) => s + d.current_balance, 0)
  let cumulativeTax = 0
  const annualContributions = assets.reduce((s, a) => s + (a.monthly_contribution ?? 0) * 12, 0)
  const annualDebtPayments = debts.reduce((s, d) => s + (d.monthly_payment ?? 0) * 12, 0)
  const annualSavings = monthlyIncome * (savingsRate / 100) * 12

  // Heffingsvrij vermogen
  const heffingsvrij = 59357

  for (let y = 0; y <= projectionYears; y++) {
    const netWorth = assetTotal - debtTotal

    // Box 3 tax
    const taxableBase = Math.max(0, netWorth - heffingsvrij - cumulativeTax)
    const box3Tax = y === 0 ? 0 : taxableBase * NL_FICTIEF_BELEGGINGEN * BOX3_TARIEF

    rows.push({
      year: y,
      age: currentAge != null ? currentAge + y : null,
      totalAssets: assetTotal,
      totalDebts: debtTotal,
      netWorth: netWorth - cumulativeTax,
      annualSavings: y === 0 ? 0 : annualSavings,
      annualReturn: y === 0 ? 0 : assetTotal * grossReturn,
      box3Tax,
      cumulativeTax,
    })

    cumulativeTax += box3Tax

    // Grow assets
    assetTotal = assetTotal * (1 + grossReturn) + annualContributions

    // Pay down debts: compute per-debt with individual interest rates
    if (debtTotal > 0) {
      let newDebtTotal = 0
      for (const debt of debts) {
        // interest_rate is stored as percentage (e.g., 4.5 = 4.5%)
        const annualRate = Number(debt.interest_rate ?? 0) / 100
        const annualPayment = Number(debt.monthly_payment ?? 0) * 12
        const yearsFromNow = y + 1
        const balance = debt.current_balance
        // Use annuity formula: balance * (1+r)^t - payment * ((1+r)^t - 1) / r
        if (annualRate > 0) {
          const factor = Math.pow(1 + annualRate, yearsFromNow)
          const remaining = balance * factor - annualPayment * (factor - 1) / annualRate
          newDebtTotal += Math.max(0, remaining)
        } else {
          const remaining = balance - annualPayment * yearsFromNow
          newDebtTotal += Math.max(0, remaining)
        }
      }
      debtTotal = newDebtTotal
    }
  }

  return rows
}

// ── Chart Component ────────────────────────────────────────────

function ProjectionChart({
  data,
  width = 800,
  height = 320,
}: {
  data: ProjectionYear[]
  width?: number
  height?: number
}) {
  if (data.length < 2) return null

  const padL = 70
  const padR = 20
  const padT = 20
  const padB = 40
  const chartW = width - padL - padR
  const chartH = height - padT - padB

  const values = data.map((d) => d.netWorth)
  const assetValues = data.map((d) => d.totalAssets)
  const debtValues = data.map((d) => d.totalDebts)

  const allValues = [...values, ...assetValues, ...debtValues]
  const minV = Math.min(0, ...allValues)
  const maxV = Math.max(...allValues)
  const range = maxV - minV || 1

  function x(i: number): number {
    return padL + (i / (data.length - 1)) * chartW
  }
  function y(v: number): number {
    return padT + chartH - ((v - minV) / range) * chartH
  }

  const netPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.netWorth).toFixed(1)}`).join(' ')
  const assetPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.totalAssets).toFixed(1)}`).join(' ')
  const debtPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.totalDebts).toFixed(1)}`).join(' ')

  // Area under net worth
  const areaPath = `${netPath} L${x(data.length - 1).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`

  // Grid lines (5 steps)
  const gridLines = Array.from({ length: 6 }, (_, i) => {
    const v = minV + (range / 5) * i
    return { v, yPos: y(v) }
  })

  // X-axis labels
  const step = data.length <= 15 ? 1 : data.length <= 35 ? 5 : 10
  const xLabels = data.filter((_, i) => i % step === 0 || i === data.length - 1)

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ maxHeight: `${height}px` }}>
      <defs>
        <linearGradient id="netGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--horizon-500, #8b5cf6)" stopOpacity="0.2" />
          <stop offset="100%" stopColor="var(--horizon-500, #8b5cf6)" stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {/* Grid lines */}
      {gridLines.map(({ v, yPos }, i) => (
        <g key={i}>
          <line x1={padL} x2={width - padR} y1={yPos} y2={yPos} stroke="var(--border-ed)" strokeWidth="0.5" strokeDasharray={v === 0 ? undefined : '4,4'} />
          <text x={padL - 8} y={yPos + 4} textAnchor="end" className="fill-[var(--ink-4)] text-[10px]">
            {v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)}
          </text>
        </g>
      ))}

      {/* Zero line */}
      {minV < 0 && (
        <line x1={padL} x2={width - padR} y1={y(0)} y2={y(0)} stroke="var(--ink-3)" strokeWidth="1" strokeDasharray="6,3" />
      )}

      {/* Area fill */}
      <path d={areaPath} fill="url(#netGrad)" />

      {/* Lines */}
      <path d={assetPath} fill="none" stroke="#10b981" strokeWidth="1.5" strokeDasharray="4,3" opacity="0.7" />
      <path d={debtPath} fill="none" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="4,3" opacity="0.7" />
      <path d={netPath} fill="none" stroke="var(--horizon-500, #8b5cf6)" strokeWidth="2.5" />

      {/* End dots */}
      {data.length > 0 && (
        <>
          <circle cx={x(data.length - 1)} cy={y(data[data.length - 1].netWorth)} r="4" fill="var(--horizon-500, #8b5cf6)" />
          <circle cx={x(data.length - 1)} cy={y(data[data.length - 1].totalAssets)} r="3" fill="#10b981" />
          <circle cx={x(data.length - 1)} cy={y(data[data.length - 1].totalDebts)} r="3" fill="#ef4444" />
        </>
      )}

      {/* X-axis labels */}
      {xLabels.map((d) => {
        const i = data.indexOf(d)
        const label = d.age != null ? `${d.age}j` : `${d.year}j`
        return (
          <text key={d.year} x={x(i)} y={height - 8} textAnchor="middle" className="fill-[var(--ink-4)] text-[10px]">
            {label}
          </text>
        )
      })}
    </svg>
  )
}

// ── Main Component ─────────────────────────────────────────────

export function OverzichtClient({
  assets,
  debts,
  profile,
  fireParams,
  netWorth,
  totalAssets,
  totalDebts,
  yearlyMustExpenses,
  lifeEvents,
  cashflows,
}: {
  assets: Asset[]
  debts: Debt[]
  profile: Record<string, unknown> | null
  fireParams: FireParams
  netWorth: number
  totalAssets: number
  totalDebts: number
  yearlyMustExpenses: number
  lifeEvents: LifeEvent[]
  cashflows: SimCashflow[]
}) {
  // Editable settings (local overrides)
  const profileReturn = fireParams.grossReturn * 100
  const profileInflation = fireParams.inflationRate * 100
  const profileIncome = Number(profile?.net_monthly_income ?? 0)
  const profileSavingsRate = Number(profile?.savings_rate ?? 0)
  const profileExpenses = Number(profile?.monthly_expenses ?? 0) || yearlyMustExpenses / 12

  const dateOfBirth = typeof profile?.date_of_birth === 'string' ? profile.date_of_birth : null
  const currentAge = dateOfBirth
    ? Math.floor((Date.now() - new Date(dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null

  const maxYears = currentAge != null ? 100 - currentAge : 60
  const defaultYears = currentAge != null ? maxYears : 30

  const [grossReturnPct, setGrossReturnPct] = useState(profileReturn)
  const [inflationPct, setInflationPct] = useState(profileInflation)
  const [projectionYears, setProjectionYears] = useState(defaultYears)
  const [monthlyIncome, setMonthlyIncome] = useState(profileIncome)
  const [savingsRate, setSavingsRate] = useState(profileSavingsRate)
  const [monthlyExpenses, setMonthlyExpenses] = useState(profileExpenses)

  // Computed projection
  const projection = useMemo(() => {
    return computeProjection({
      assets,
      debts,
      grossReturn: grossReturnPct / 100,
      inflationRate: inflationPct / 100,
      currentAge,
      projectionYears,
      monthlyIncome,
      savingsRate,
      yearlyExpenses: monthlyExpenses * 12,
    })
  }, [assets, debts, grossReturnPct, inflationPct, currentAge, projectionYears, monthlyIncome, savingsRate, monthlyExpenses])

  const finalRow = projection[projection.length - 1]
  const hasChanges = grossReturnPct !== profileReturn || inflationPct !== profileInflation ||
    projectionYears !== defaultYears || monthlyIncome !== profileIncome ||
    savingsRate !== profileSavingsRate || monthlyExpenses !== profileExpenses

  function resetToDefaults() {
    setGrossReturnPct(profileReturn)
    setInflationPct(profileInflation)
    setProjectionYears(defaultYears)
    setMonthlyIncome(profileIncome)
    setSavingsRate(profileSavingsRate)
    setMonthlyExpenses(profileExpenses)
  }

  return (
    <div className="space-y-6">
      {/* ── Settings Panel ── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Settings className="h-4 w-4 text-horizon-500" />
          <h3 className="text-base font-bold text-[var(--ink)]">Instellingen</h3>
          {hasChanges && (
            <button
              onClick={resetToDefaults}
              className="ml-auto rounded-lg border border-[var(--border-ed)] px-2.5 py-1 text-[11px] font-medium text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors"
            >
              Reset naar profiel
            </button>
          )}
        </div>

        <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-5">
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
            {/* Gross Return */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                Bruto rendement
              </label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={15}
                  step={0.5}
                  value={grossReturnPct}
                  onChange={(e) => setGrossReturnPct(Number(e.target.value))}
                  className="flex-1 accent-horizon-500"
                />
                <span className="w-[52px] font-mono text-sm font-semibold tabular-nums text-[var(--ink)]">
                  {grossReturnPct.toFixed(1)}%
                </span>
              </div>
            </div>

            {/* Inflation */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                Inflatie
              </label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={10}
                  step={0.25}
                  value={inflationPct}
                  onChange={(e) => setInflationPct(Number(e.target.value))}
                  className="flex-1 accent-horizon-500"
                />
                <span className="w-[52px] font-mono text-sm font-semibold tabular-nums text-[var(--ink)]">
                  {inflationPct.toFixed(1)}%
                </span>
              </div>
            </div>

            {/* Projection Years */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                Projectiejaren
              </label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="range"
                  min={1}
                  max={maxYears}
                  step={1}
                  value={projectionYears}
                  onChange={(e) => setProjectionYears(Number(e.target.value))}
                  className="flex-1 accent-horizon-500"
                />
                <span className="w-[52px] font-mono text-sm font-semibold tabular-nums text-[var(--ink)]">
                  {projectionYears}j
                </span>
              </div>
            </div>

            {/* Monthly Income */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                Netto inkomen (mnd)
              </label>
              <div className="mt-1">
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={monthlyIncome}
                  onChange={(e) => setMonthlyIncome(Number(e.target.value))}
                  className="w-full rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-1.5 font-mono text-sm tabular-nums text-[var(--ink)] focus:border-horizon-400 focus:outline-none"
                />
              </div>
            </div>

            {/* Savings Rate */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                Spaarquote
              </label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={savingsRate}
                  onChange={(e) => setSavingsRate(Number(e.target.value))}
                  className="flex-1 accent-horizon-500"
                />
                <span className="w-[52px] font-mono text-sm font-semibold tabular-nums text-[var(--ink)]">
                  {savingsRate.toFixed(0)}%
                </span>
              </div>
            </div>

            {/* Monthly Expenses */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                Maandelijkse uitgaven
              </label>
              <div className="mt-1">
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={monthlyExpenses}
                  onChange={(e) => setMonthlyExpenses(Number(e.target.value))}
                  className="w-full rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-1.5 font-mono text-sm tabular-nums text-[var(--ink)] focus:border-horizon-400 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Quick summary */}
          <div className="mt-4 flex flex-wrap gap-4 border-t border-[var(--border-ed)] pt-3 text-xs text-[var(--ink-3)]">
            <span>
              <span className="font-semibold text-[var(--ink-2)]">Reëel rendement:</span>{' '}
              <span className="font-mono tabular-nums">{(grossReturnPct - inflationPct).toFixed(1)}%</span>
            </span>
            <span>
              <span className="font-semibold text-[var(--ink-2)]">SWR:</span>{' '}
              <span className="font-mono tabular-nums">{(NL_SWR * 100).toFixed(3)}%</span>
            </span>
            <span>
              <span className="font-semibold text-[var(--ink-2)]">Box 3 druk:</span>{' '}
              <span className="font-mono tabular-nums">{(NL_FICTIEF_BELEGGINGEN * BOX3_TARIEF * 100).toFixed(2)}%</span>
            </span>
            <span>
              <span className="font-semibold text-[var(--ink-2)]">Bezittingen:</span>{' '}
              <span className="font-mono tabular-nums">{assets.length}</span>
            </span>
            <span>
              <span className="font-semibold text-[var(--ink-2)]">Schulden:</span>{' '}
              <span className="font-mono tabular-nums">{debts.length}</span>
            </span>
            <span>
              <span className="font-semibold text-[var(--ink-2)]">Levensgebeurtenissen:</span>{' '}
              <span className="font-mono tabular-nums">{lifeEvents.length}</span>
            </span>
          </div>
        </div>
      </section>

      {/* ── Projection Chart ── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="h-4 w-4 text-horizon-500" />
          <h3 className="text-base font-bold text-[var(--ink)]">Vermogensprojectie</h3>
        </div>

        <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-5">
          {/* Key metrics */}
          <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">Start netto vermogen</p>
              <p className="mt-0.5 font-mono text-base font-semibold tabular-nums text-[var(--ink)]">
                {formatCurrency(netWorth)}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                Eind netto vermogen ({projectionYears}j)
              </p>
              <p className={`mt-0.5 font-mono text-base font-semibold tabular-nums ${
                finalRow && finalRow.netWorth >= 0 ? 'text-emerald-600' : 'text-red-600'
              }`}>
                {finalRow ? formatCurrency(finalRow.netWorth) : '—'}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">Totaal bezittingen (eind)</p>
              <p className="mt-0.5 font-mono text-base font-semibold tabular-nums text-emerald-600">
                {finalRow ? formatCurrency(finalRow.totalAssets) : '—'}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">Cumulatief Box 3 belasting</p>
              <p className="mt-0.5 font-mono text-base font-semibold tabular-nums text-red-600">
                {finalRow ? formatCurrency(finalRow.cumulativeTax) : '—'}
              </p>
            </div>
          </div>

          {/* Chart */}
          <ProjectionChart data={projection} />

          {/* Legend */}
          <div className="mt-3 flex items-center gap-4 border-t border-[var(--border-ed)] pt-3 text-[11px] text-[var(--ink-3)]">
            <span className="flex items-center gap-1.5">
              <Minus className="h-3 w-5 text-[#8b5cf6]" strokeWidth={3} />
              Netto vermogen
            </span>
            <span className="flex items-center gap-1.5">
              <Minus className="h-3 w-5 text-emerald-500" strokeWidth={1.5} strokeDasharray="4,3" />
              Bezittingen
            </span>
            <span className="flex items-center gap-1.5">
              <Minus className="h-3 w-5 text-red-500" strokeWidth={1.5} strokeDasharray="4,3" />
              Schulden
            </span>
          </div>
        </div>
      </section>
    </div>
  )
}
