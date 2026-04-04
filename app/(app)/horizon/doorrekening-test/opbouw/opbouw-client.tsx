'use client'

import { useMemo, useState, useCallback } from 'react'
import { formatCurrency } from '@/lib/format'
import { projectAsset } from '@/lib/asset-data'
import { ASSET_TYPE_LABELS, type Asset, type AssetType } from '@/lib/asset-data'
import { DEBT_TYPE_LABELS, type Debt, type DebtType } from '@/lib/debt-data'
import type { FireParams } from '@/lib/fire-params'

// ── Projection helpers ────────────────────────────────────────

const DEFAULT_PROJECTION_YEARS = 30

interface YearRow {
  year: number
  value: number
  growth: number
  contribution: number
}

function projectAssetYearly(asset: Asset, years: number): YearRow[] {
  const months = projectAsset(
    Number(asset.current_value),
    Number(asset.expected_return),
    Number(asset.monthly_contribution),
    years * 12,
  )

  const rows: YearRow[] = []
  for (let y = 1; y <= years; y++) {
    const idx = y * 12 - 1
    const prevIdx = (y - 1) * 12 - 1
    const prev = prevIdx >= 0 ? months[prevIdx].value : Number(asset.current_value)
    const curr = months[idx]?.value ?? prev
    const yearContrib = Number(asset.monthly_contribution) * 12
    rows.push({
      year: y,
      value: Math.round(curr),
      growth: Math.round(curr - prev - yearContrib),
      contribution: Math.round(yearContrib),
    })
  }
  return rows
}

function projectDebtYearly(debt: Debt, years: number): YearRow[] {
  const monthlyRate = Number(debt.interest_rate) / 100 / 12
  const monthly = Number(debt.monthly_payment)
  let balance = Number(debt.current_balance)
  const rows: YearRow[] = []

  for (let y = 1; y <= years; y++) {
    let yearInterest = 0
    let yearPayment = 0
    for (let m = 0; m < 12; m++) {
      if (balance <= 0) break
      const interest = balance * monthlyRate
      yearInterest += interest
      const payment = Math.min(monthly, balance + interest)
      yearPayment += payment
      balance = Math.max(0, balance + interest - payment)
    }
    rows.push({
      year: y,
      value: Math.round(balance),
      growth: Math.round(yearInterest),
      contribution: Math.round(-yearPayment),
    })
  }
  return rows
}

// ── Grouped types ────────────────────────────────────────────

function groupAssetsByType(assets: Asset[]) {
  const groups = new Map<AssetType, Asset[]>()
  for (const a of assets) {
    const list = groups.get(a.asset_type) ?? []
    list.push(a)
    groups.set(a.asset_type, list)
  }
  return groups
}

function groupDebtsByType(debts: Debt[]) {
  const groups = new Map<DebtType, Debt[]>()
  for (const d of debts) {
    const list = groups.get(d.debt_type) ?? []
    list.push(d)
    groups.set(d.debt_type, list)
  }
  return groups
}

// ── Mini summary chart (SVG) ─────────────────────────────────

function SummaryChart({ assetTotals, debtTotals, netTotals, projectionYears }: {
  assetTotals: number[]
  debtTotals: number[]
  netTotals: number[]
  projectionYears: number
}) {
  const allValues = [...assetTotals, ...debtTotals, ...netTotals]
  const maxVal = Math.max(...allValues, 1)
  const minVal = Math.min(...allValues, 0)
  const range = maxVal - minVal || 1

  const w = 600
  const h = 200
  const px = 40
  const py = 20

  const numPoints = projectionYears
  const toX = (i: number) => px + (i / Math.max(numPoints - 1, 1)) * (w - 2 * px)
  const toY = (v: number) => py + (1 - (v - minVal) / range) * (h - 2 * py)

  const makePath = (values: number[]) =>
    values.map((v, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ')

  // Generate sensible x-axis labels based on projection years
  const xLabels: number[] = []
  const step = projectionYears <= 10 ? 1 : projectionYears <= 20 ? 5 : projectionYears <= 40 ? 5 : 10
  for (let yr = 0; yr <= projectionYears; yr += step) {
    xLabels.push(yr)
  }
  if (xLabels[xLabels.length - 1] !== projectionYears) {
    xLabels.push(projectionYears)
  }

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full max-w-2xl" aria-label="Projectie grafiek">
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
        const yy = py + frac * (h - 2 * py)
        const val = maxVal - frac * range
        return (
          <g key={frac}>
            <line x1={px} y1={yy} x2={w - px} y2={yy} stroke="var(--border-ed)" strokeWidth={0.5} />
            <text x={px - 4} y={yy + 3} textAnchor="end" fontSize={8} fill="var(--ink-4)" className="font-mono">
              {formatCurrency(val)}
            </text>
          </g>
        )
      })}
      {/* X axis labels */}
      {xLabels.map((yr) => (
        <text key={yr} x={toX(yr)} y={h - 4} textAnchor="middle" fontSize={8} fill="var(--ink-4)" className="font-mono">
          {yr}j
        </text>
      ))}
      {/* Asset line */}
      <path d={makePath(assetTotals)} fill="none" stroke="var(--color-emerald-500)" strokeWidth={2} />
      {/* Debt line */}
      <path d={makePath(debtTotals)} fill="none" stroke="var(--color-red-400)" strokeWidth={2} />
      {/* Net line */}
      <path d={makePath(netTotals)} fill="none" stroke="var(--color-horizon-500)" strokeWidth={2.5} strokeDasharray="6 3" />
      {/* Legend */}
      <circle cx={px + 10} cy={12} r={4} fill="var(--color-emerald-500)" />
      <text x={px + 18} y={15} fontSize={9} fill="var(--ink-2)">Bezittingen</text>
      <circle cx={px + 100} cy={12} r={4} fill="var(--color-red-400)" />
      <text x={px + 108} y={15} fontSize={9} fill="var(--ink-2)">Schulden</text>
      <circle cx={px + 180} cy={12} r={4} fill="var(--color-horizon-500)" />
      <text x={px + 188} y={15} fontSize={9} fill="var(--ink-2)">Netto vermogen</text>
    </svg>
  )
}

// ── Data table component ─────────────────────────────────────

function getDisplayYears(projectionYears: number): number[] {
  if (projectionYears <= 10) {
    return Array.from({ length: projectionYears }, (_, i) => i + 1)
  }
  const years: number[] = [1]
  const step = projectionYears <= 20 ? 5 : projectionYears <= 40 ? 5 : 10
  for (let y = step; y <= projectionYears; y += step) {
    years.push(y)
  }
  if (years[years.length - 1] !== projectionYears) {
    years.push(projectionYears)
  }
  return years
}

function ProjectionTable({ title, columns, color, projectionYears }: {
  title: string
  columns: { label: string; rows: YearRow[] }[]
  color: string
  projectionYears: number
}) {
  if (columns.length === 0) return null

  const displayYears = getDisplayYears(projectionYears)

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border-ed)] bg-[var(--paper)]">
      <div className={`border-b border-[var(--border-ed)] px-4 py-3 ${color}`}>
        <h3 className="text-sm font-semibold text-[var(--ink)]">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-[var(--border-ed)] bg-[var(--subtle)]">
              <th className="px-3 py-2 text-left font-medium text-[var(--ink-3)]">Jaar</th>
              {columns.map((col) => (
                <th key={col.label} className="px-3 py-2 text-right font-medium text-[var(--ink-3)]">
                  {col.label}
                </th>
              ))}
              <th className="px-3 py-2 text-right font-medium text-[var(--ink-2)]">Totaal</th>
            </tr>
          </thead>
          <tbody>
            {displayYears.map((yr) => {
              const total = columns.reduce((sum, col) => sum + (col.rows[yr - 1]?.value ?? 0), 0)
              return (
                <tr key={yr} className="border-b border-[var(--border-ed)] last:border-b-0 hover:bg-[var(--subtle)]/50">
                  <td className="px-3 py-2 font-mono tabular-nums text-[var(--ink-3)]">{yr}</td>
                  {columns.map((col) => (
                    <td key={col.label} className="px-3 py-2 text-right font-mono tabular-nums text-[var(--ink-2)]">
                      {formatCurrency(col.rows[yr - 1]?.value ?? 0)}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold text-[var(--ink)]">
                    {formatCurrency(total)}
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

// ── Savings rate table ───────────────────────────────────────

function SavingsRateTable({ assets, debts, profileMonthlyIncome, profileSavingsRate }: {
  assets: Asset[]
  debts: Debt[]
  profileMonthlyIncome: number
  profileSavingsRate: number
}) {
  const totalContributions = assets.reduce((sum, a) => sum + Number(a.monthly_contribution), 0)
  const totalDebtPayments = debts.reduce((sum, d) => sum + Number(d.monthly_payment), 0)
  const monthlySavings = totalContributions + totalDebtPayments
  const computedRate = profileMonthlyIncome > 0 ? (monthlySavings / profileMonthlyIncome) * 100 : 0

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border-ed)] bg-[var(--paper)]">
      <div className="border-b border-[var(--border-ed)] bg-horizon-50/30 px-4 py-3">
        <h3 className="text-sm font-semibold text-[var(--ink)]">Spaarquote</h3>
      </div>
      <div className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-5">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--ink-4)]">Netto inkomen</p>
          <p className="mt-1 font-mono tabular-nums text-sm font-semibold text-[var(--ink)]">
            {formatCurrency(profileMonthlyIncome)}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--ink-4)]">Inleg bezittingen</p>
          <p className="mt-1 font-mono tabular-nums text-sm font-semibold text-emerald-600">
            {formatCurrency(totalContributions)}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--ink-4)]">Aflossing schulden</p>
          <p className="mt-1 font-mono tabular-nums text-sm font-semibold text-red-500">
            {formatCurrency(totalDebtPayments)}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--ink-4)]">Berekende spaarquote</p>
          <p className="mt-1 font-mono tabular-nums text-sm font-semibold text-horizon-600">
            {computedRate.toFixed(1)}%
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--ink-4)]">Profiel spaarquote</p>
          <p className="mt-1 font-mono tabular-nums text-sm font-semibold text-[var(--ink-2)]">
            {profileSavingsRate.toFixed(1)}%
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Total overview table ─────────────────────────────────────

function TotalTable({ assetTotals, debtTotals, netTotals, projectionYears }: {
  assetTotals: number[]
  debtTotals: number[]
  netTotals: number[]
  projectionYears: number
}) {
  const displayYears = getDisplayYears(projectionYears)

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border-ed)] bg-[var(--paper)]">
      <div className="border-b border-[var(--border-ed)] bg-horizon-50/30 px-4 py-3">
        <h3 className="text-sm font-semibold text-[var(--ink)]">Totaaloverzicht</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-[var(--border-ed)] bg-[var(--subtle)]">
              <th className="px-3 py-2 text-left font-medium text-[var(--ink-3)]">Jaar</th>
              <th className="px-3 py-2 text-right font-medium text-emerald-600">Bezittingen</th>
              <th className="px-3 py-2 text-right font-medium text-red-500">Schulden</th>
              <th className="px-3 py-2 text-right font-medium text-horizon-600">Netto vermogen</th>
            </tr>
          </thead>
          <tbody>
            {displayYears.map((yr) => (
              <tr key={yr} className="border-b border-[var(--border-ed)] last:border-b-0 hover:bg-[var(--subtle)]/50">
                <td className="px-3 py-2 font-mono tabular-nums text-[var(--ink-3)]">{yr}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-emerald-600">
                  {formatCurrency(assetTotals[yr - 1])}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-red-500">
                  {formatCurrency(debtTotals[yr - 1])}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold text-horizon-600">
                  {formatCurrency(netTotals[yr - 1])}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Main component ───────────────────────────────────────────

export function OpbouwClient({ assets, debts, profile, fireParams }: {
  assets: Asset[]
  debts: Debt[]
  profile: Record<string, unknown> | null
  fireParams: FireParams
}) {
  // ── Profile-derived values with safe defaults (feature #628) ──
  const profileMonthlyIncome = Number(profile?.net_monthly_income ?? 0)
  const profileSavingsRate = Number(profile?.savings_rate ?? 0)

  const [projectionYears, setProjectionYears] = useState(DEFAULT_PROJECTION_YEARS)

  const handleYearsChange = useCallback((value: number) => {
    setProjectionYears(Math.max(1, Math.min(60, value)))
  }, [])

  // Group and project
  const assetGroups = useMemo(() => groupAssetsByType(assets), [assets])
  const debtGroups = useMemo(() => groupDebtsByType(debts), [debts])

  const assetProjections = useMemo(() => {
    const result: { type: AssetType; label: string; columns: { label: string; rows: YearRow[] }[] }[] = []
    for (const [type, group] of assetGroups) {
      result.push({
        type,
        label: ASSET_TYPE_LABELS[type],
        columns: group.map((a) => ({
          label: a.name,
          rows: projectAssetYearly(a, projectionYears),
        })),
      })
    }
    return result
  }, [assetGroups, projectionYears])

  const debtProjections = useMemo(() => {
    const result: { type: DebtType; label: string; columns: { label: string; rows: YearRow[] }[] }[] = []
    for (const [type, group] of debtGroups) {
      result.push({
        type,
        label: DEBT_TYPE_LABELS[type],
        columns: group.map((d) => ({
          label: d.name,
          rows: projectDebtYearly(d, projectionYears),
        })),
      })
    }
    return result
  }, [debtGroups, projectionYears])

  // Compute yearly totals for summary chart
  const { assetTotals, debtTotals, netTotals } = useMemo(() => {
    const aTotals: number[] = []
    const dTotals: number[] = []
    const nTotals: number[] = []

    for (let yr = 0; yr < projectionYears; yr++) {
      let assetSum = 0
      for (const group of assetProjections) {
        for (const col of group.columns) {
          assetSum += col.rows[yr]?.value ?? 0
        }
      }

      let debtSum = 0
      for (const group of debtProjections) {
        for (const col of group.columns) {
          debtSum += col.rows[yr]?.value ?? 0
        }
      }

      aTotals.push(assetSum)
      dTotals.push(debtSum)
      nTotals.push(assetSum - debtSum)
    }

    return { assetTotals: aTotals, debtTotals: dTotals, netTotals: nTotals }
  }, [assetProjections, debtProjections, projectionYears])

  const hasAssets = assets.length > 0
  const hasDebts = debts.length > 0

  return (
    <div className="space-y-8">
      {/* Section: Summary header */}
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--ink-4)]">Huidige bezittingen</p>
          <p className="font-mono tabular-nums text-lg font-bold text-emerald-600">
            {formatCurrency(assets.reduce((s, a) => s + Number(a.current_value), 0))}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--ink-4)]">Huidige schulden</p>
          <p className="font-mono tabular-nums text-lg font-bold text-red-500">
            {formatCurrency(debts.reduce((s, d) => s + Number(d.current_balance), 0))}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--ink-4)]">Netto vermogen</p>
          <p className="font-mono tabular-nums text-lg font-bold text-horizon-600">
            {formatCurrency(
              assets.reduce((s, a) => s + Number(a.current_value), 0) -
              debts.reduce((s, d) => s + Number(d.current_balance), 0)
            )}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--ink-4)]">Netto inkomen</p>
          <p className="font-mono tabular-nums text-sm font-semibold text-[var(--ink)]">
            {formatCurrency(profileMonthlyIncome)}<span className="text-[var(--ink-4)] text-[10px] ml-1">/mnd</span>
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--ink-4)]">Spaarquote (profiel)</p>
          <p className="font-mono tabular-nums text-sm font-semibold text-horizon-600">
            {profileSavingsRate.toFixed(1)}%
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--ink-4)]">Rendement / Inflatie</p>
          <p className="font-mono tabular-nums text-sm font-semibold text-[var(--ink-2)]">
            {(fireParams.grossReturn * 100).toFixed(1)}% / {(fireParams.inflationRate * 100).toFixed(1)}%
          </p>
        </div>
      </div>

      {/* Section: Time horizon selector */}
      <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-4">
        <div className="flex flex-wrap items-center gap-4">
          <label className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-3)]">
            Tijdshorizon
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={60}
              step={1}
              value={projectionYears}
              onChange={(e) => handleYearsChange(Number(e.target.value))}
              className="h-2 w-40 cursor-pointer appearance-none rounded-full bg-[var(--subtle)] accent-horizon-500 sm:w-56"
            />
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={1}
                max={60}
                value={projectionYears}
                onChange={(e) => handleYearsChange(Number(e.target.value))}
                className="w-16 rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-2 py-1.5 text-center font-mono tabular-nums text-sm text-[var(--ink)] focus:border-horizon-500 focus:outline-none focus:ring-1 focus:ring-horizon-500"
              />
              <span className="text-sm text-[var(--ink-3)]">jaar</span>
            </div>
          </div>
          {projectionYears !== DEFAULT_PROJECTION_YEARS && (
            <button
              onClick={() => setProjectionYears(DEFAULT_PROJECTION_YEARS)}
              className="text-[11px] text-horizon-600 underline underline-offset-2 hover:text-horizon-700"
            >
              Reset naar {DEFAULT_PROJECTION_YEARS} jaar
            </button>
          )}
        </div>
      </div>

      {/* Section: Summary chart */}
      {(hasAssets || hasDebts) && (
        <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-4">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--ink-3)]">
            Samenvattende grafiek — {projectionYears} jaar projectie
          </h2>
          <SummaryChart assetTotals={assetTotals} debtTotals={debtTotals} netTotals={netTotals} projectionYears={projectionYears} />
        </div>
      )}

      {/* Section: Asset tables by type */}
      {hasAssets && (
        <div className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
            Bezittingen per categorie
          </h2>
          {assetProjections.map((group) => (
            <ProjectionTable
              key={group.type}
              title={group.label}
              columns={group.columns}
              color="bg-emerald-50/40"
              projectionYears={projectionYears}
            />
          ))}
        </div>
      )}

      {/* Section: Debt tables by type */}
      {hasDebts && (
        <div className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-red-500">
            Schulden per categorie
          </h2>
          {debtProjections.map((group) => (
            <ProjectionTable
              key={group.type}
              title={group.label}
              columns={group.columns}
              color="bg-red-50/30"
              projectionYears={projectionYears}
            />
          ))}
        </div>
      )}

      {/* Section: Savings rate */}
      <SavingsRateTable
        assets={assets}
        debts={debts}
        profileMonthlyIncome={profileMonthlyIncome}
        profileSavingsRate={profileSavingsRate}
      />

      {/* Section: Total overview */}
      {(hasAssets || hasDebts) && (
        <TotalTable assetTotals={assetTotals} debtTotals={debtTotals} netTotals={netTotals} projectionYears={projectionYears} />
      )}

      {/* Empty state */}
      {!hasAssets && !hasDebts && (
        <div className="rounded-xl border border-dashed border-[var(--border-md)] p-8 text-center">
          <p className="text-sm text-[var(--ink-3)]">
            Nog geen bezittingen of schulden gevonden. Voeg eerst je financiële gegevens toe via{' '}
            <a href="/core/assets" className="text-horizon-600 underline underline-offset-2">Bezittingen</a>{' '}
            of{' '}
            <a href="/core/debts" className="text-horizon-600 underline underline-offset-2">Schulden</a>.
          </p>
        </div>
      )}
    </div>
  )
}
