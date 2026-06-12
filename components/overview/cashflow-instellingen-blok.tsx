'use client'

import { useState, useMemo, useCallback } from 'react'
import { TrendingUp, Target, ShoppingCart, Check, PencilLine } from 'lucide-react'
import { Kicker } from '@/components/editorial'
import { MaskedAmount } from '@/components/app/masked-amount'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { KassabonShell } from '@/components/app/kassabon-shell'
import { recomputeTriple, type LastEdited } from '@/lib/cashflow-overrides'
import type { CashflowSettingsData } from '@/lib/cashflow-settings-data'

type Sheet = null | 'income' | 'expenses' | 'savings'

export function CashflowInstellingenBlok({ data }: { data: CashflowSettingsData }) {
  const computedIncome = Math.round(data.estimatedAnnualIncome / 12)
  const computedExpenses = data.computedMonthlyExpenses // transactie-berekend (NIET de manual estimatedMonthlyExpenses)
  // rawSavingsRate voedt de interactieve driehoek (recomputeTriple): rate =
  // (inkomen − uitgaven) / inkomen. De GETOONDE "berekend"-spaarquote is echter
  // de canonieke 6-maands savingsRate6m (zelfde getal als de rest van de app),
  // die ook spaarbudgetten + schuldaflossing meerekent.
  const rawSavingsRate = computedIncome > 0 ? ((computedIncome - computedExpenses) / computedIncome) * 100 : 0

  // 6-maands basis voor de spaarquote-kassabon: som van inkomsten/uitgaven over
  // de laatste 6 maand-slots (transacties). Dit maakt de getoonde spaarquote
  // herleidbaar tot een echte 6-maands transactie-grondslag i.p.v. een enkel
  // maandgemiddelde. De laatste 6 entries zijn de meest recente (oudste →
  // nieuwste reeks).
  const sixMonth = useMemo(() => {
    const last6 = data.monthlyBreakdown.slice(-6)
    const income = last6.reduce((s, m) => s + m.income, 0)
    const expenses = last6.reduce((s, m) => s + m.expenses, 0)
    const saved = income - expenses
    const rate = income > 0 ? (saved / income) * 100 : 0
    return { months: last6, income, expenses, saved, rate }
  }, [data.monthlyBreakdown])

  // Initial triple respecteert de bron-keuze (handmatig vs berekend). De
  // savingsRate moet uit DEZELFDE effectieve waarden volgen — een verse
  // gebruiker met alleen onboarding-schattingen (geen transacties) heeft
  // anders 0% staan terwijl inkomen/uitgaven wél gevuld zijn.
  const initIncome = data.incomeSource === 'manual' && data.netMonthlyIncome > 0 ? data.netMonthlyIncome : computedIncome
  const initExpenses = data.expensesSource === 'manual' ? data.estimatedMonthlyExpenses : computedExpenses
  const [triple, setTriple] = useState({
    monthlyIncome: initIncome,
    monthlyExpenses: initExpenses,
    savingsRate: initIncome > 0 ? ((initIncome - initExpenses) / initIncome) * 100 : 0,
  })
  const [lastEdited, setLastEdited] = useState<LastEdited>('expenses')
  const [incomeManual, setIncomeManual] = useState(data.incomeSource === 'manual')
  const [expensesManual, setExpensesManual] = useState(data.expensesSource === 'manual')
  const [sheet, setSheet] = useState<Sheet>(null)

  const persist = useCallback(async (patch: Record<string, number | string | null>) => {
    await fetch('/api/parameters', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    })
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

  return (
    <section className="mt-5 sm:mt-8">
      <div className="mb-4"><Kicker>Instellingen &amp; toekomst</Kicker></div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <SettingCard icon={<TrendingUp className="h-4 w-4" />} label="Geschat jaarinkomen"
          value={<MaskedAmount value={triple.monthlyIncome * 12} tone="kern" />} manual={incomeManual}
          sub={`€${Math.round(triple.monthlyIncome).toLocaleString('nl-NL')}/mnd`} onClick={() => setSheet('income')} />
        <SettingCard icon={<Target className="h-4 w-4" />} label="Spaarquote"
          value={`${expensesManual ? Math.round(triple.savingsRate) : Math.round(data.savingsRate6m)}%`} manual={expensesManual}
          sub="laatste 6 maanden" onClick={() => setSheet('savings')} />
        <SettingCard icon={<ShoppingCart className="h-4 w-4" />} label="Geschatte uitgaven"
          value={<MaskedAmount value={triple.monthlyExpenses} tone="kern" />} manual={expensesManual}
          sub="per maand" onClick={() => setSheet('expenses')} />
      </div>

      <BottomSheet open={sheet === 'income'} onClose={() => setSheet(null)} title="Geschat jaarinkomen">
        <div className="space-y-3 p-4">
          <p className="text-[11px] text-[var(--ink-3)]">Berekend uit je transacties van de afgelopen 12 maanden.</p>
          <KassabonShell>
            <div className="space-y-1.5">
              {data.monthlyBreakdown.map((m, i) => (
                <div key={`${m.label}-${i}`} className="flex items-center justify-between">
                  <span className="text-[var(--ink-2)] capitalize">{m.label}</span>
                  <span className="tabular-nums"><MaskedAmount value={m.income} tone="kern" /></span>
                </div>
              ))}
              <div className="mt-2 border-t border-dashed border-[var(--border-md)] pt-2">
                <div className="flex items-center justify-between font-bold">
                  <span>Totaal (12 mnd)</span>
                  <span className="tabular-nums"><MaskedAmount value={data.estimatedAnnualIncome} tone="kern" /></span>
                </div>
                <p className="mt-1 text-[10px] text-[var(--ink-4)]">≈ €{computedIncome.toLocaleString('nl-NL')}/mnd</p>
              </div>
            </div>
          </KassabonShell>
          <ChoiceRow computedLabel={`Gebruik berekend (€${computedIncome.toLocaleString('nl-NL')}/mnd)`}
            isManual={incomeManual} onUseComputed={() => useComputed('income')}
            manualValue={Math.round(triple.monthlyIncome)} onManual={(v) => editField('income', v)} unit="€/mnd" />
        </div>
      </BottomSheet>

      <BottomSheet open={sheet === 'expenses'} onClose={() => setSheet(null)} title="Geschatte uitgaven">
        <div className="space-y-3 p-4">
          <p className="text-[11px] text-[var(--ink-3)]">Gemiddelde over je transacties van de afgelopen 6 maanden.</p>
          <KassabonShell>
            <div className="space-y-1.5">
              {data.monthlyBreakdown.slice(-6).map((m, i) => (
                <div key={`${m.label}-${i}`} className="flex items-center justify-between text-[var(--ink-3)]">
                  <span className="capitalize">{m.label}</span>
                  <span className="tabular-nums"><MaskedAmount value={m.expenses} tone="kern" className="text-[11px]" /></span>
                </div>
              ))}
              <div className="mt-2 border-t border-dashed border-[var(--border-md)] pt-2">
                <div className="flex items-center justify-between font-bold">
                  <span>Σ Uitgaven (6 mnd)</span>
                  <span className="tabular-nums"><MaskedAmount value={data.monthlyBreakdown.slice(-6).reduce((s, m) => s + m.expenses, 0)} tone="kern" /></span>
                </div>
                <p className="mt-1 text-[10px] text-[var(--ink-4)]">≈ €{Math.round(computedExpenses).toLocaleString('nl-NL')}/mnd</p>
              </div>
            </div>
          </KassabonShell>
          <ChoiceRow computedLabel={`Gebruik berekend (€${Math.round(computedExpenses).toLocaleString('nl-NL')}/mnd)`}
            isManual={expensesManual} onUseComputed={() => useComputed('expenses')}
            manualValue={Math.round(triple.monthlyExpenses)} onManual={(v) => editField('expenses', v)} unit="€/mnd" />
        </div>
      </BottomSheet>

      <BottomSheet open={sheet === 'savings'} onClose={() => setSheet(null)} title="Spaarquote">
        <div className="space-y-3 p-4">
          <p className="text-[11px] text-[var(--ink-3)]">Berekend over je transacties van de afgelopen 6 maanden.</p>
          <KassabonShell>
            <div className="space-y-1.5">
              {sixMonth.months.map((m, i) => {
                const net = m.income - m.expenses
                return (
                  <div key={`${m.label}-${i}`} className="flex items-center justify-between text-[var(--ink-3)]">
                    <span className="capitalize">{m.label}</span>
                    <span className="tabular-nums">
                      <MaskedAmount value={net} tone="kern" signPrefix={net >= 0 ? '+' : ''} className="text-[11px]" />
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="mt-2 space-y-1 border-t border-dashed border-[var(--border-md)] pt-2">
              <div className="flex items-center justify-between"><span>Σ Inkomen (6 mnd)</span><span className="tabular-nums"><MaskedAmount value={sixMonth.income} tone="kern" /></span></div>
              <div className="flex items-center justify-between"><span>Σ Uitgaven (6 mnd)</span><span className="tabular-nums">−<MaskedAmount value={sixMonth.expenses} tone="kern" /></span></div>
              {data.savingsBudgetTotal6m > 0 && (
                <div className="flex items-center justify-between text-[var(--ink-3)]"><span>+ Sparen in budgetten</span><span className="tabular-nums"><MaskedAmount value={data.savingsBudgetTotal6m} tone="kern" /></span></div>
              )}
              {data.debtAflossingTotal6m > 0 && (
                <div className="flex items-center justify-between text-[var(--ink-3)]"><span>+ Schuldaflossing</span><span className="tabular-nums"><MaskedAmount value={data.debtAflossingTotal6m} tone="kern" /></span></div>
              )}
              <div className="flex items-center justify-between"><span>Gespaard</span><span className="tabular-nums"><MaskedAmount value={sixMonth.saved + data.savingsBudgetTotal6m + data.debtAflossingTotal6m} tone="kern" signPrefix={(sixMonth.saved + data.savingsBudgetTotal6m + data.debtAflossingTotal6m) >= 0 ? '+' : ''} /></span></div>
              <div className="mt-1 flex items-center justify-between border-t border-dashed border-[var(--border-md)] pt-1.5 font-bold">
                <span>Spaarquote</span><span className="tabular-nums">{Math.round(data.savingsRate6m)}%</span></div>
            </div>
          </KassabonShell>
          <ChoiceRow computedLabel={`Gebruik berekend (${Math.round(data.savingsRate6m)}%)`}
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
