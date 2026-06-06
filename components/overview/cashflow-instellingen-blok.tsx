'use client'

import { useState, useMemo, useCallback } from 'react'
import { TrendingUp, Target, ShoppingCart, Check, PencilLine } from 'lucide-react'
import { Kicker } from '@/components/editorial'
import { MaskedAmount } from '@/components/app/masked-amount'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { KassabonShell } from '@/components/app/kassabon-shell'
import { recomputeFireFromSettings } from '@/lib/cashflow-settings'
import { recomputeTriple, type LastEdited } from '@/lib/cashflow-overrides'
import type { CashflowSettingsData } from '@/lib/cashflow-settings-data'

type Sheet = null | 'income' | 'expenses' | 'savings'

export function CashflowInstellingenBlok({ data }: { data: CashflowSettingsData }) {
  const computedIncome = Math.round(data.estimatedAnnualIncome / 12)
  const computedExpenses = data.computedMonthlyExpenses // transactie-berekend (NIET de manual estimatedMonthlyExpenses)
  // Spaarquote = afgeleid van het getoonde inkomen − uitgaven, zodat "gebruik
  // berekend" precies op het getoonde % uitkomt (geen sprong). Dit blijft
  // consistent met de inkomen/uitgaven-driehoek (recomputeTriple).
  const computedRate = computedIncome > 0 ? ((computedIncome - computedExpenses) / computedIncome) * 100 : 0

  const [triple, setTriple] = useState({
    monthlyIncome: data.incomeSource === 'manual' && data.netMonthlyIncome > 0 ? data.netMonthlyIncome : computedIncome,
    monthlyExpenses: data.expensesSource === 'manual' ? data.estimatedMonthlyExpenses : computedExpenses,
    savingsRate: computedRate,
  })
  const [lastEdited, setLastEdited] = useState<LastEdited>('expenses')
  const [incomeManual, setIncomeManual] = useState(data.incomeSource === 'manual')
  const [expensesManual, setExpensesManual] = useState(data.expensesSource === 'manual')
  const [sheet, setSheet] = useState<Sheet>(null)
  const [saving, setSaving] = useState(false)

  const persist = useCallback(async (patch: Record<string, number | string | null>) => {
    setSaving(true)
    try {
      await fetch('/api/parameters', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      })
    } finally { setSaving(false) }
  }, [])

  const editField = (field: 'income' | 'expenses' | 'savingsRate', value: number) => {
    const base = { ...triple }
    if (field === 'income') base.monthlyIncome = value
    if (field === 'expenses') base.monthlyExpenses = value
    if (field === 'savingsRate') base.savingsRate = value
    const { next, lastEdited: le } = recomputeTriple(base, field, lastEdited)
    setTriple(next); setLastEdited(le)
    if (field === 'income') { setIncomeManual(true); void persist({ net_monthly_income: Math.round(next.monthlyIncome), income_source: 'manual' }) }
    else { setExpensesManual(true); void persist({ estimated_monthly_expenses: Math.round(next.monthlyExpenses), expenses_source: 'manual' }) }
  }

  const useComputed = (field: 'income' | 'expenses') => {
    if (field === 'income') {
      const { next } = recomputeTriple({ ...triple, monthlyIncome: computedIncome }, 'income', lastEdited)
      setTriple(next); setIncomeManual(false); void persist({ income_source: 'auto' })
    } else {
      const { next } = recomputeTriple({ ...triple, monthlyExpenses: computedExpenses }, 'expenses', lastEdited)
      setTriple(next); setExpensesManual(false); void persist({ expenses_source: 'auto' })
    }
  }

  const projection = useMemo(() => recomputeFireFromSettings(
    data.fireInput,
    { monthlyIncome: triple.monthlyIncome, monthlyExpenses: triple.monthlyExpenses },
    {
      grossReturn: data.grossReturn, effectiveSwr: data.effectiveSwr, inflationRate: data.inflationRate,
      retirementMethod: data.retirementExpenseMethod, retirementCustomAmount: data.retirementCustomAmount,
      budgetingActive: data.budgetingActive, yearlyMustExpenses: data.fireInput.yearlyMustExpenses,
      fireStrategy: data.fireStrategy,
    },
  ), [data, triple])

  return (
    <section className="mt-5 sm:mt-8">
      <div className="mb-4"><Kicker>Instellingen &amp; toekomst</Kicker></div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <SettingCard icon={<TrendingUp className="h-4 w-4" />} label="Geschat jaarinkomen"
          value={<MaskedAmount value={triple.monthlyIncome * 12} tone="kern" />} manual={incomeManual}
          sub={`€${Math.round(triple.monthlyIncome).toLocaleString('nl-NL')}/mnd`} onClick={() => setSheet('income')} />
        <SettingCard icon={<Target className="h-4 w-4" />} label="Spaarquote"
          value={`${Math.round(triple.savingsRate)}%`} manual={expensesManual}
          sub={data.budgetingActive ? '6-mnd gemiddelde' : 'schatting'} onClick={() => setSheet('savings')} />
        <SettingCard icon={<ShoppingCart className="h-4 w-4" />} label="Geschatte uitgaven"
          value={<MaskedAmount value={triple.monthlyExpenses} tone="kern" />} manual={expensesManual}
          sub="per maand" onClick={() => setSheet('expenses')} />
      </div>

      <div className="mt-3 flex items-center gap-2 rounded-[var(--r)] border-l-2 border-[var(--module-active-500)] bg-[var(--subtle)]/40 px-3 py-2">
        <span className="text-sm">&#x26A1;</span>
        <p className="text-sm text-[var(--ink-2)]">
          Met deze waarden bereik je volledige vrijheid{' '}
          <strong className="font-semibold text-[var(--ink)]">
            {projection.fireAge != null ? `rond je ${Math.round(projection.fireAge)}e (${projection.fireDate})` : projection.fireDate}
          </strong>
          {saving && <span className="ml-2 text-[11px] text-[var(--ink-4)]">opslaan…</span>}
        </p>
      </div>

      <BottomSheet open={sheet === 'income'} onClose={() => setSheet(null)} title="Geschat jaarinkomen">
        <div className="space-y-3 p-4">
          <KassabonShell>
            <div className="flex items-center justify-between"><span>Berekend (12 mnd)</span>
              <span className="font-bold tabular-nums"><MaskedAmount value={data.estimatedAnnualIncome} tone="kern" /></span></div>
            <p className="mt-1 text-[10px] text-[var(--ink-4)]">≈ €{computedIncome.toLocaleString('nl-NL')}/mnd</p>
          </KassabonShell>
          <ChoiceRow computedLabel={`Gebruik berekend (€${computedIncome.toLocaleString('nl-NL')}/mnd)`}
            isManual={incomeManual} onUseComputed={() => useComputed('income')}
            manualValue={Math.round(triple.monthlyIncome)} onManual={(v) => editField('income', v)} unit="€/mnd" />
        </div>
      </BottomSheet>

      <BottomSheet open={sheet === 'expenses'} onClose={() => setSheet(null)} title="Geschatte uitgaven">
        <div className="space-y-3 p-4">
          <KassabonShell>
            <div className="flex items-center justify-between"><span>Berekend</span>
              <span className="font-bold tabular-nums"><MaskedAmount value={computedExpenses} tone="kern" /></span></div>
          </KassabonShell>
          <ChoiceRow computedLabel={`Gebruik berekend (€${Math.round(computedExpenses).toLocaleString('nl-NL')}/mnd)`}
            isManual={expensesManual} onUseComputed={() => useComputed('expenses')}
            manualValue={Math.round(triple.monthlyExpenses)} onManual={(v) => editField('expenses', v)} unit="€/mnd" />
        </div>
      </BottomSheet>

      <BottomSheet open={sheet === 'savings'} onClose={() => setSheet(null)} title="Spaarquote">
        <div className="space-y-3 p-4">
          <KassabonShell>
            <div className="flex items-center justify-between"><span>Inkomen</span><span className="tabular-nums"><MaskedAmount value={triple.monthlyIncome} tone="kern" /></span></div>
            <div className="flex items-center justify-between"><span>Uitgaven</span><span className="tabular-nums">−<MaskedAmount value={triple.monthlyExpenses} tone="kern" /></span></div>
            <div className="mt-2 flex items-center justify-between border-t border-dashed border-[var(--border-md)] pt-2 font-bold">
              <span>Spaarquote</span><span className="tabular-nums">{Math.round(triple.savingsRate)}%</span></div>
          </KassabonShell>
          <ChoiceRow computedLabel={`Gebruik berekend (${Math.round(computedRate)}%)`}
            isManual={expensesManual} onUseComputed={() => useComputed('expenses')}
            manualValue={Math.round(triple.savingsRate)} onManual={(v) => editField('savingsRate', v)} unit="%" />
          <p className="text-[11px] text-[var(--ink-4)]">Een handmatige spaarquote past je geschatte uitgaven aan (inkomen blijft gelijk).</p>
        </div>
      </BottomSheet>
    </section>
  )
}

function SettingCard({ icon, label, value, sub, manual, onClick }: {
  icon: React.ReactNode; label: string; value: React.ReactNode; sub: string; manual: boolean; onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} className="card-editorial p-4 text-left transition-all hover:shadow-[var(--s1)]">
      <div className="mb-1 flex items-center gap-1.5 text-[var(--ink-3)]">
        {icon}<span className="text-xs font-semibold uppercase tracking-[0.08em]">{label}</span>
        {manual && <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-[var(--module-active-100)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--module-active-700)]"><PencilLine className="h-2.5 w-2.5" />handmatig</span>}
      </div>
      <p className="font-mono text-xl font-bold tabular-nums text-[var(--ink)]">{value}</p>
      <p className="mt-1 text-[11px] italic text-[var(--ink-4)]">{sub}</p>
    </button>
  )
}

function ChoiceRow({ computedLabel, isManual, onUseComputed, manualValue, onManual, unit }: {
  computedLabel: string; isManual: boolean; onUseComputed: () => void; manualValue: number; onManual: (v: number) => void; unit: string
}) {
  const [draft, setDraft] = useState(String(manualValue))
  return (
    <div className="space-y-2">
      <button type="button" onClick={onUseComputed}
        className={`flex w-full items-center gap-2 rounded-[var(--r)] border px-3 py-2 text-sm ${!isManual ? 'border-kern-400 bg-kern-50 text-[var(--ink)]' : 'border-[var(--border-md)] text-[var(--ink-2)]'}`}>
        {!isManual && <Check className="h-4 w-4 text-kern-600" />}{computedLabel}
      </button>
      <div className={`flex items-center gap-2 rounded-[var(--r)] border px-3 py-2 ${isManual ? 'border-kern-400 bg-kern-50' : 'border-[var(--border-md)]'}`}>
        <span className="text-sm text-[var(--ink-2)]">Eigen {unit === '%' ? 'percentage' : 'bedrag'}</span>
        <input type="number" value={draft} onChange={(e) => setDraft(e.target.value)}
          onBlur={() => { const n = Number(draft); if (Number.isFinite(n)) onManual(n) }}
          className="ml-auto w-28 border-b border-kern-400 bg-transparent text-right font-mono tabular-nums outline-none" />
        <span className="text-xs text-[var(--ink-3)]">{unit}</span>
      </div>
    </div>
  )
}
