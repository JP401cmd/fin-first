'use client'

import Link from 'next/link'
import { type RetirementExpenseMethod } from '@/lib/budget-utils'
import { MaskedAmount } from '@/components/app/masked-amount'

export interface FireRetirementExpensePanelValue {
  method: RetirementExpenseMethod
  customAmount: string
}

export interface FireRetirementExpensePanelProps {
  value: FireRetirementExpensePanelValue
  onChange: (next: FireRetirementExpensePanelValue) => void
  /** Toon de "→ Stel je uitgaven gedetailleerd samen" deeplink onderin. Default true. */
  showDeepLink?: boolean
}

const OPTIONS: { value: RetirementExpenseMethod; label: string; subtitle: string }[] = [
  { value: 'essential_budgets', label: 'Essentiële budgetten', subtitle: 'Gebaseerd op je must-budgetten' },
  { value: 'custom_amount', label: 'Eigen bedrag', subtitle: 'Voer een eigen jaarbedrag in' },
  { value: 'current_income', label: 'Huidig inkomen', subtitle: 'Gebaseerd op je inkomen' },
]

export function FireRetirementExpensePanel({ value, onChange, showDeepLink = true }: FireRetirementExpensePanelProps) {
  const { method, customAmount } = value

  return (
    <div className="mb-6">
      <p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">Jaarlijkse uitgave na retirement</p>
      <p className="mb-4 font-sans text-sm text-[var(--ink-3)]">
        Hoeveel je per jaar uitgeeft nadat je financieel vrij bent. Dit bepaalt je FIRE-doel en vrijheidsdagen.
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {OPTIONS.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange({ ...value, method: opt.value })}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors text-left ${
              method === opt.value
                ? 'border-zinc-900 bg-zinc-900 text-white'
                : 'border-[var(--border-md)] text-[var(--ink-2)] hover:border-zinc-400'
            }`}
          >
            <div className="font-semibold">{opt.label}</div>
            <div className={`text-xs mt-0.5 ${method === opt.value ? 'text-zinc-300' : 'text-[var(--ink-3)]'}`}>
              {opt.subtitle}
            </div>
          </button>
        ))}
      </div>
      {method === 'custom_amount' && (
        <div className="mt-4">
          <label htmlFor="retirementCustomAmount" className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-3)]">
            Jaarlijks bedrag na retirement (&euro;)
          </label>
          <input
            id="retirementCustomAmount"
            type="number"
            min={0}
            step={500}
            value={customAmount}
            onChange={e => onChange({ ...value, customAmount: e.target.value })}
            placeholder="bv. 30000"
            className="mt-1.5 w-full rounded-lg border border-[var(--border-md)] bg-[var(--subtle)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 font-mono"
          />
          {customAmount && !isNaN(Number(customAmount)) && Number(customAmount) > 0 && (
            <p className="mt-1.5 font-sans text-[11px] text-[var(--ink-3)]">
              &asymp; <MaskedAmount value={Number(customAmount) / 12} tone="ink" />/maand &middot; dagprijs <MaskedAmount value={Number(customAmount) / 365} tone="ink" />
            </p>
          )}
        </div>
      )}
      {method === 'current_income' && (
        <p className="mt-3 font-sans text-[11px] text-[var(--ink-3)]">
          Gebaseerd op je geschat jaarinkomen uit de afgelopen 12 maanden transacties. Voor wie na retirement dezelfde levensstijl wil handhaven.
        </p>
      )}
      <p className="mt-3 font-sans text-[11px] text-[var(--ink-3)]">
        De gekozen methode bepaalt het FIRE-doel, alle vrijheidsdagen-berekeningen en de dagprijs in De Kern, De Horizon en de belastingpagina.
      </p>
      {showDeepLink && (
        <p className="mt-2 font-sans text-[11px]">
          <Link href="/horizon?uitgaven=open" className="text-[var(--ink-2)] underline decoration-dotted underline-offset-4 hover:text-[var(--ink)]">
            &rarr; Stel je uitgaven gedetailleerd samen in De Horizon
          </Link>
        </p>
      )}
    </div>
  )
}
