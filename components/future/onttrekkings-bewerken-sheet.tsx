'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { WithdrawalStrategyType } from '@/lib/withdrawal-strategy'

/**
 * OnttrekkingsBewerkenSheet — inline-editor voor onttrekkings-strategie
 * op /toekomst Voorkeuren-tab.
 *
 * Plan §6.3 Tab 4: "Inline-editor voor deze voorkeuren komt in volgende
 * iteratie." Tweede stap na inflatie/rendement: selectie-veld voor de
 * vier strategieën in de withdrawal-engine:
 *
 *  - static: klassiek 4% SWR, inflatie-geïndexeerd
 *  - guardrails: dynamische bandbreedte (verlaagt bij dip, verhoogt bij top)
 *  - vpw: Variable Percentage Withdrawal — leeftijd-afhankelijk
 *  - bucket: cash-buffer + lange-termijn portfolio gescheiden
 *
 * Persist via supabase.from('profiles').update({ withdrawal_strategy }).
 * Guardrail-percentages tunen blijft op /identity/parameters totdat de
 * Voorkeuren-tab een geavanceerde sheet krijgt.
 */

type StrategyMeta = {
  label: string
  description: string
}

const STRATEGY_OPTIONS: Record<WithdrawalStrategyType, StrategyMeta> = {
  static: {
    label: 'Vast (4%)',
    description:
      'Klassiek SWR — neem elk jaar 4% van je startportfolio op, inflatie-geïndexeerd. Geen reactie op marktbewegingen.',
  },
  guardrails: {
    label: 'Guardrails',
    description:
      'Dynamische bandbreedte. Verlaagt opname bij slechte returns, verhoogt bij goede. Robuust tegen sequence-of-returns-risk.',
  },
  vpw: {
    label: 'VPW',
    description:
      'Variable Percentage Withdrawal — percentage stijgt met je leeftijd. Maximaliseert consumptie, vermogen op = vermogen op.',
  },
  bucket: {
    label: 'Bucket',
    description:
      'Cash-buffer + lange-termijn portfolio gescheiden. Pak je uitgaven uit cash, herbalanceer in bull-jaren.',
  },
}

export function OnttrekkingsBewerkenSheet({
  currentStrategy,
  onClose,
}: {
  currentStrategy: WithdrawalStrategyType
  onClose: () => void
}) {
  const [selected, setSelected] = useState<WithdrawalStrategyType>(currentStrategy)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (selected === currentStrategy) {
      onClose()
      return
    }
    setSaving(true)
    setError(null)
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setError('Niet ingelogd.')
      setSaving(false)
      return
    }
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ withdrawal_strategy: selected })
      .eq('id', user.id)
    if (updateError) {
      setError(`Opslaan mislukt: ${updateError.message}`)
      setSaving(false)
      return
    }
    setSaving(false)
    onClose()
    router.refresh()
  }

  return (
    <div
      role="dialog"
      aria-label="Onttrekkingsstrategie kiezen"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-5 sm:p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
              Voorkeur bewerken
            </div>
            <h2 className="font-serif text-lg text-[var(--ink)] mt-0.5">
              Onttrekkingsstrategie
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Sluiten"
            className="inline-flex items-center justify-center w-8 h-8 rounded-full text-[var(--ink-3)] hover:bg-[var(--subtle)] transition-colors"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </header>

        {error && (
          <div
            role="alert"
            className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
          >
            {error}
          </div>
        )}

        <div className="space-y-2">
          {(Object.keys(STRATEGY_OPTIONS) as WithdrawalStrategyType[]).map(
            (key) => {
              const meta = STRATEGY_OPTIONS[key]
              const active = selected === key
              return (
                <label
                  key={key}
                  className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-all ${
                    active
                      ? 'border-[var(--ink-2)] bg-[var(--subtle)]/50'
                      : 'border-[var(--border-ed)] hover:border-[var(--ink-3)]'
                  }`}
                >
                  <input
                    type="radio"
                    name="strategy"
                    value={key}
                    checked={active}
                    onChange={() => setSelected(key)}
                    className="sr-only"
                  />
                  <span
                    className={`mt-0.5 inline-flex items-center justify-center w-5 h-5 rounded-full border-2 shrink-0 ${
                      active
                        ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
                        : 'border-[var(--border-md)]'
                    }`}
                    aria-hidden="true"
                  >
                    {active && <Check className="w-3 h-3" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-[var(--ink)]">
                      {meta.label}
                    </div>
                    <p className="mt-0.5 text-[11px] text-[var(--ink-2)] leading-snug">
                      {meta.description}
                    </p>
                  </div>
                </label>
              )
            },
          )}
        </div>

        <p className="mt-4 text-[10px] italic text-[var(--ink-4)]">
          Guardrail-percentages tunen blijft op /identity/parameters.
        </p>

        <div className="flex items-center justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-3 py-2 text-sm font-medium text-[var(--ink-3)] hover:text-[var(--ink-2)] transition-colors"
          >
            Annuleer
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-[var(--ink)] px-4 py-2 text-sm font-semibold text-[var(--paper)] hover:bg-[var(--ink-2)] transition-colors disabled:opacity-50"
          >
            {saving ? 'Opslaan…' : 'Opslaan'}
          </button>
        </div>
      </form>
    </div>
  )
}
