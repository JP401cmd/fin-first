'use client'

import { memo, useMemo, useState } from 'react'
import { SankeyDiagram, type SankeyNode, type SankeyLink } from '@/components/app/sankey-diagram'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import type { SimRow } from '@/lib/fire-simulation'
import type { UnifiedProjectionRow } from '@/lib/unified-projection'
import { buildBreakdown, type BreakdownLayer, type BreakdownRow } from '@/lib/income-expense-breakdown'
import type { Debt } from '@/lib/debt-data'

interface Props {
  simRows: SimRow[]
  unifiedRows?: UnifiedProjectionRow[] | null
  debts?: Debt[] | null
  currentAge: number
  fireAge?: number | null
}

// Income shades — Horizon-palet (gold/warm).
const INCOME_PALETTE = ['#a37a3a', '#c4a06b', '#7d6230', '#d8be93', '#8b6730', '#e0c79a']

// Expense shades — warm-grey.
const EXPENSE_PALETTE = ['#5b5450', '#7a746f', '#9e9893', '#b5afaa', '#6b6661', '#8a8580']

// Vaste id-mappings — overige id's vallen in palette-rotatie.
const INCOME_HEX_BY_ID: Record<string, string> = {
  growth: '#c4a06b',    // Rendement: horizon-500
  savings: '#a37a3a',   // Besparingen: horizon-700
}

const EXPENSE_HEX_BY_ID: Record<string, string> = {
  withdrawal: '#5b5450',  // Levensonderhoud
  box3: '#9e9893',        // Box 3 belasting
}

const DEBT_INTEREST_HEX = '#a86c5e'  // warm-rood, past bij ink-warm

const CENTER_COLOR = '#3a3530'

function colorForIncome(id: string, idx: number): string {
  return INCOME_HEX_BY_ID[id] ?? INCOME_PALETTE[idx % INCOME_PALETTE.length]
}

function colorForExpense(id: string, idx: number): string {
  if (id.startsWith('debt-interest-')) return DEBT_INTEREST_HEX
  return EXPENSE_HEX_BY_ID[id] ?? EXPENSE_PALETTE[idx % EXPENSE_PALETTE.length]
}

interface SourceItem {
  id: string
  label: string
  amount: number
}

/** Synthesize breakdown van SimRow-totalen als unifiedRows ontbreken. */
function synthesizeFromSimRow(row: SimRow): { income: SourceItem[]; expense: SourceItem[] } {
  const income: SourceItem[] = []
  const expense: SourceItem[] = []

  if (row.savings > 0) {
    income.push({ id: 'savings', label: 'Besparingen', amount: row.savings })
  }
  if (row.growth > 0) {
    income.push({ id: 'growth', label: 'Rendement', amount: row.growth })
  }
  const cfIncome = Math.max(0, row.cashflowNet) + Math.max(0, row.oneTimeNet)
  if (cfIncome > 0) {
    income.push({ id: 'cashflow', label: 'Inkomsten', amount: cfIncome })
  }

  if (row.withdrawal > 0) {
    expense.push({ id: 'withdrawal', label: 'Levensonderhoud', amount: row.withdrawal })
  }
  const cfExpense = Math.abs(Math.min(0, row.cashflowNet)) + Math.abs(Math.min(0, row.oneTimeNet))
  if (cfExpense > 0) {
    expense.push({ id: 'cashflow-expense', label: 'Cashflow uitgaven', amount: cfExpense })
  }
  // Residu in flowOut = box3 + debt-interest + overige
  const knownExpense = (row.withdrawal ?? 0) + cfExpense
  const otherExpense = Math.max(0, (row.flowOut ?? 0) - knownExpense)
  if (otherExpense > 0) {
    expense.push({ id: 'box3', label: 'Belasting & rente', amount: Math.round(otherExpense) })
  }

  return { income, expense }
}

export const HorizonCashflowSankey = memo(function HorizonCashflowSankey({
  simRows,
  unifiedRows,
  debts,
  currentAge,
  fireAge,
}: Props) {
  const { masked } = useMaskedAmounts()

  const minAge = simRows[0]?.age ?? Math.floor(currentAge)
  const maxAge = simRows[simRows.length - 1]?.age ?? Math.floor(currentAge) + 40

  const [year, setYear] = useState<number>(() =>
    Math.max(minAge, Math.min(Math.floor(currentAge), maxAge)),
  )

  // Compute rich breakdown (gebruikt UnifiedProjectionRow voor debt-rente + per-asset Box 3).
  const breakdown = useMemo(() => {
    if (!unifiedRows?.length || !simRows.length) return null
    return buildBreakdown(unifiedRows, simRows, debts ?? undefined)
  }, [unifiedRows, simRows, debts])

  const breakdownRow: BreakdownRow | null = useMemo(() => {
    if (!breakdown) return null
    return (
      breakdown.rows.find((r) => r.age === year) ??
      [...breakdown.rows].reverse().find((r) => r.age <= year) ??
      null
    )
  }, [breakdown, year])

  const simRow = useMemo(
    () =>
      simRows.find((r) => r.age === year) ??
      [...simRows].reverse().find((r) => r.age <= year),
    [simRows, year],
  )

  // Map breakdown → SourceItem[] met label-lookup uit layers + amount > 0 filter.
  const { incomeItems, expenseItems } = useMemo(() => {
    // Pad 1: rich breakdown beschikbaar
    if (breakdown && breakdownRow) {
      const labelOf = (layers: BreakdownLayer[], id: string): string =>
        layers.find((l) => l.id === id)?.label ?? id
      const inc: SourceItem[] = Object.entries(breakdownRow.incomeBySource)
        .filter(([, amt]) => amt > 0)
        .map(([id, amt]) => ({ id, label: labelOf(breakdown.incomeLayers, id), amount: amt }))
      const exp: SourceItem[] = Object.entries(breakdownRow.expenseBySource)
        .filter(([, amt]) => amt > 0)
        .map(([id, amt]) => ({ id, label: labelOf(breakdown.expenseLayers, id), amount: amt }))
      return { incomeItems: inc, expenseItems: exp }
    }
    // Pad 2: synthesize uit SimRow-totalen
    if (simRow) {
      const { income, expense } = synthesizeFromSimRow(simRow)
      return { incomeItems: income, expenseItems: expense }
    }
    return { incomeItems: [], expenseItems: [] }
  }, [breakdown, breakdownRow, simRow])

  const incomeTotal = useMemo(
    () => incomeItems.reduce((s, it) => s + it.amount, 0),
    [incomeItems],
  )
  const expenseTotal = useMemo(
    () => expenseItems.reduce((s, it) => s + it.amount, 0),
    [expenseItems],
  )
  const saldo = incomeTotal - expenseTotal

  const { nodes, links } = useMemo(() => {
    const nodes: SankeyNode[] = []
    const links: SankeyLink[] = []

    if (incomeItems.length === 0 && expenseItems.length === 0) {
      return { nodes, links }
    }

    const centerValue = Math.max(incomeTotal, expenseTotal, 1)
    const centerNode: SankeyNode = {
      id: 'flow-center',
      label: 'Vermogen',
      value: centerValue,
      color: CENTER_COLOR,
      column: 1,
    }

    incomeItems.forEach((item, idx) => {
      const color = colorForIncome(item.id, idx)
      const nodeId = `inc-${item.id}-${idx}`
      nodes.push({
        id: nodeId,
        label: item.label,
        value: item.amount,
        color,
        column: 0,
      })
      links.push({
        source: nodeId,
        target: 'flow-center',
        value: item.amount,
        color,
      })
    })

    nodes.push(centerNode)

    expenseItems.forEach((item, idx) => {
      const color = colorForExpense(item.id, idx)
      const nodeId = `exp-${item.id}-${idx}`
      nodes.push({
        id: nodeId,
        label: item.label,
        value: item.amount,
        color,
        column: 2,
      })
      links.push({
        source: 'flow-center',
        target: nodeId,
        value: item.amount,
        color,
      })
    })

    return { nodes, links }
  }, [incomeItems, expenseItems, incomeTotal, expenseTotal])

  const currentAgeInt = Math.floor(currentAge)
  const fireAgeInt = fireAge != null ? Math.floor(fireAge) : null
  const yearLabel = new Date().getFullYear() + (year - currentAgeInt)
  const saldoTone = saldo >= 0 ? 'text-positive' : 'text-negative'
  const saldoMeta = saldo >= 0 ? 'opbouw' : 'intering'
  const saldoSign = saldo >= 0 ? '+' : ''

  const phaseLabel = simRow?.phase === 'retirement' ? 'Afbouw' : 'Opbouw'
  const isCurrent = year === currentAgeInt
  const isFire = fireAgeInt != null && year === fireAgeInt

  return (
    <div className="space-y-6">
      {/* ── Hoofdcijfer-strip ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 border-t border-b border-[var(--ink)]">
        <div className="p-4 sm:p-5 border-b border-[var(--rule-soft)] sm:border-b-0 sm:border-r sm:border-[var(--rule-soft)]">
          <p className="text-[10px] uppercase tracking-[0.20em] text-[var(--ink-3)] mb-1.5 font-mono">
            <span className="inline-block w-7 h-px bg-[var(--module-active-500)] mr-2.5 align-middle" />
            Inkomsten
          </p>
          <p className="font-serif font-black text-[22px] sm:text-[24px] leading-none tracking-[-0.02em] tabular-nums text-[var(--ink)]">
            {formatMaskedCurrency(incomeTotal, masked)}
          </p>
          <p className="font-serif italic text-[11px] text-[var(--ink-3)] mt-1.5">
            {incomeItems.length === 0
              ? '—'
              : incomeItems.length === 1
              ? '1 bron'
              : `${incomeItems.length} bronnen`}
          </p>
        </div>
        <div className="p-4 sm:p-5 border-b border-[var(--rule-soft)] sm:border-b-0 sm:border-r sm:border-[var(--rule-soft)]">
          <p className="text-[10px] uppercase tracking-[0.20em] text-[var(--ink-3)] mb-1.5 font-mono">
            Uitgaven
          </p>
          <p className="font-serif font-black text-[22px] sm:text-[24px] leading-none tracking-[-0.02em] tabular-nums text-[var(--ink)]">
            {formatMaskedCurrency(expenseTotal, masked)}
          </p>
          <p className="font-serif italic text-[11px] text-[var(--ink-3)] mt-1.5">
            {expenseItems.length === 0
              ? '—'
              : expenseItems.length === 1
              ? '1 categorie'
              : `${expenseItems.length} categorieën`}
          </p>
        </div>
        <div className="p-4 sm:p-5">
          <p className="text-[10px] uppercase tracking-[0.20em] text-[var(--ink-3)] mb-1.5 font-mono">
            Saldo
          </p>
          <p
            className={`font-serif font-black text-[22px] sm:text-[24px] leading-none tracking-[-0.02em] tabular-nums ${saldoTone}`}
          >
            <span className="bg-[linear-gradient(transparent_60%,var(--module-active-200)_60%)] inline px-0.5">
              {saldoSign}
              {formatMaskedCurrency(saldo, masked)}
            </span>
          </p>
          <p className="font-serif italic text-[11px] text-[var(--ink-3)] mt-1.5">
            {saldoMeta}
          </p>
        </div>
      </div>

      {/* ── Sankey-diagram ─────────────────────────────────────────── */}
      <div className="relative">
        {nodes.length > 0 ? (
          <SankeyDiagram
            nodes={nodes}
            links={links}
            aspectRatio={2.0}
            showAnimatedCoins={false}
          />
        ) : (
          <div className="flex h-[200px] items-center justify-center text-center px-6">
            <p className="font-serif italic text-sm text-[var(--ink-3)]">
              Geen geldstroom-data voor leeftijd {year}
            </p>
          </div>
        )}
      </div>

      {/* ── Year-slider ────────────────────────────────────────────── */}
      <div>
        <input
          type="range"
          min={minAge}
          max={maxAge}
          step={1}
          value={year}
          onChange={(e) => setYear(parseInt(e.target.value, 10))}
          className="slider-module"
          aria-label="Selecteer leeftijd"
          aria-valuemin={minAge}
          aria-valuemax={maxAge}
          aria-valuenow={year}
          aria-valuetext={`Leeftijd ${year}, jaar ${yearLabel}`}
        />
        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <div className="flex items-baseline gap-2">
            <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)] font-mono">
              <span className="inline-block w-7 h-px bg-[var(--module-active-500)] mr-2.5 align-middle" />
              Leeftijd
            </p>
            <p className="font-mono tabular-nums text-sm text-[var(--ink)]">
              {year}
              {isCurrent && (
                <span className="ml-2 text-[10px] text-[var(--ink-3)] uppercase tracking-[0.1em]">
                  vandaag
                </span>
              )}
              {isFire && !isCurrent && (
                <span className="ml-2 text-[10px] text-[var(--module-active-700)] uppercase tracking-[0.1em]">
                  fire
                </span>
              )}
            </p>
          </div>
          <p className="font-serif italic text-[12px] text-[var(--ink-3)]">
            jaar {yearLabel} · {phaseLabel}
          </p>
        </div>
      </div>
    </div>
  )
})
