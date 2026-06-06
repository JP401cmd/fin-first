'use client'

import { useState, useMemo, useCallback } from 'react'
import { Pencil, TrendingUp, Target } from 'lucide-react'
import { Kicker } from '@/components/editorial'
import { MaskedAmount } from '@/components/app/masked-amount'
import { recomputeFireFromSettings } from '@/lib/cashflow-settings'
import type { CashflowSettingsData } from '@/lib/cashflow-settings-data'

export function CashflowInstellingenBlok({ data }: { data: CashflowSettingsData }) {
  const [monthlyIncome, setMonthlyIncome] = useState(
    data.netMonthlyIncome > 0
      ? data.netMonthlyIncome
      : Math.round(data.estimatedAnnualIncome / 12),
  )
  const [monthlyExpenses, setMonthlyExpenses] = useState(data.estimatedMonthlyExpenses)
  const [targetRate, setTargetRate] = useState<number | null>(data.targetSavingsRate)
  const [editing, setEditing] = useState<null | 'income' | 'expenses' | 'target'>(null)
  const [saving, setSaving] = useState(false)

  const projection = useMemo(
    () =>
      recomputeFireFromSettings(
        data.fireInput,
        { monthlyIncome, monthlyExpenses },
        {
          grossReturn: data.grossReturn,
          effectiveSwr: data.effectiveSwr,
          inflationRate: data.inflationRate,
          retirementMethod: data.retirementExpenseMethod,
          retirementCustomAmount: data.retirementCustomAmount,
          budgetingActive: data.budgetingActive,
          yearlyMustExpenses: data.fireInput.yearlyMustExpenses,
          fireStrategy: data.fireStrategy,
        },
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, monthlyIncome, monthlyExpenses],
  )

  const persist = useCallback(async (patch: Record<string, number | null>) => {
    setSaving(true)
    try {
      await fetch('/api/parameters', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
    } finally {
      setSaving(false)
    }
  }, [])

  return (
    <section className="mt-5 sm:mt-8">
      <div className="mb-4">
        <Kicker>Instellingen &amp; toekomst</Kicker>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        {/* Geschat jaarinkomen */}
        <div className="card-editorial p-4">
          <div className="mb-1 flex items-center gap-1.5 text-[var(--ink-3)]">
            <TrendingUp className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-[0.08em]">
              Geschat jaarinkomen
            </span>
          </div>
          {editing === 'income' ? (
            <input
              autoFocus
              type="number"
              value={monthlyIncome}
              onChange={(e) => setMonthlyIncome(Number(e.target.value))}
              onBlur={() => {
                setEditing(null)
                void persist({ net_monthly_income: monthlyIncome })
              }}
              className="w-full border-b border-kern-400 bg-transparent font-mono text-xl tabular-nums outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditing('income')}
              className="group flex items-baseline gap-2"
            >
              <span className="font-mono text-xl font-bold tabular-nums text-[var(--ink)]">
                <MaskedAmount value={monthlyIncome * 12} tone="kern" />
              </span>
              <Pencil className="h-3.5 w-3.5 text-[var(--ink-4)] opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          )}
          <p className="mt-1 text-[11px] italic text-[var(--ink-4)]">
            €{monthlyIncome.toLocaleString('nl-NL')}/mnd
          </p>
        </div>

        {/* Spaarquote + doel */}
        <div className="card-editorial p-4">
          <div className="mb-1 flex items-center gap-1.5 text-[var(--ink-3)]">
            <Target className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-[0.08em]">Spaarquote</span>
          </div>
          <p className="font-mono text-xl font-bold tabular-nums text-[var(--ink)]">
            {data.savingsRate6m.toFixed(0)}%
          </p>
          {editing === 'target' ? (
            <input
              autoFocus
              type="number"
              value={targetRate ?? ''}
              onChange={(e) =>
                setTargetRate(e.target.value === '' ? null : Number(e.target.value))
              }
              onBlur={() => {
                setEditing(null)
                void persist({ target_savings_rate: targetRate })
              }}
              className="mt-1 w-full border-b border-kern-400 bg-transparent text-sm outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditing('target')}
              className="group mt-1 flex items-center gap-1.5 text-[11px] text-[var(--ink-3)]"
            >
              <span>doel: {targetRate != null ? `${targetRate}%` : 'instellen'}</span>
              <Pencil className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          )}
        </div>

        {/* Geschatte uitgaven */}
        <div className="card-editorial p-4">
          <div className="mb-1 text-[var(--ink-3)]">
            <span className="text-xs font-semibold uppercase tracking-[0.08em]">
              Geschatte uitgaven
            </span>
          </div>
          {editing === 'expenses' ? (
            <input
              autoFocus
              type="number"
              value={monthlyExpenses}
              onChange={(e) => setMonthlyExpenses(Number(e.target.value))}
              onBlur={() => {
                setEditing(null)
                void persist({ estimated_monthly_expenses: monthlyExpenses })
              }}
              className="w-full border-b border-kern-400 bg-transparent font-mono text-xl tabular-nums outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditing('expenses')}
              className="group flex items-baseline gap-2"
            >
              <span className="font-mono text-xl font-bold tabular-nums text-[var(--ink)]">
                <MaskedAmount value={monthlyExpenses} tone="kern" />
              </span>
              <Pencil className="h-3.5 w-3.5 text-[var(--ink-4)] opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          )}
          <p className="mt-1 text-[11px] italic text-[var(--ink-4)]">
            {data.budgetingActive ? 'per maand' : 'schatting (geen budgetten)'}
          </p>
        </div>
      </div>

      {/* Live FIRE-preview op basis van de huidige inkomen/uitgaven-waarden */}
      <div className="mt-3 flex items-center gap-2 rounded-[var(--r)] border-l-2 border-[var(--module-active-500)] bg-[var(--subtle)]/40 px-3 py-2">
        <span className="text-sm">&#x26A1;</span>
        <p className="text-sm text-[var(--ink-2)]">
          Met deze waarden bereik je volledige vrijheid{' '}
          <strong className="font-semibold text-[var(--ink)]">
            {projection.fireAge != null
              ? `rond je ${Math.round(projection.fireAge)}e (${projection.fireDate})`
              : projection.fireDate}
          </strong>
          {saving && (
            <span className="ml-2 text-[11px] text-[var(--ink-4)]">opslaan…</span>
          )}
        </p>
      </div>
    </section>
  )
}
