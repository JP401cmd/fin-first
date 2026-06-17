'use client'

import { useId } from 'react'
import type { CheckDraft } from '@/lib/check/use-check-draft'

interface Props {
  intake: CheckDraft['intake']
  onChange: (patch: Partial<CheckDraft['intake']>) => void
  onNext: () => void
  onBack: () => void
}

const DOEL_SUGGESTIONS = [
  'Stoppen met werken voor mijn 55e',
  'Schuldenvrij binnen vijf jaar',
  'Eerder onafhankelijk dan de AOW-leeftijd',
  'Mijn kinderen een vliegende start geven',
  'Een extra inkomensbron opbouwen',
]

export function StepDoel({ intake, onChange, onNext, onBack }: Props) {
  const id = useId()
  const value = intake.goal?.label ?? ''

  return (
    <div className="space-y-6">
      <p className="font-serif text-sm italic text-[var(--ink-3)]">
        Dit is optioneel — maar het geeft je rapport een persoonlijk richtsnoer. Wat wil jij
        uiteindelijk bereiken?
      </p>

      <div>
        <label htmlFor={id} className="mb-2 block text-sm font-medium text-[var(--ink-2)]">
          Je grootste financiële doel{' '}
          <span className="text-xs font-normal italic text-[var(--ink-3)]">(optioneel, vrij)</span>
        </label>
        <textarea
          id={id}
          rows={3}
          value={value}
          onChange={(e) =>
            onChange({
              goal: e.target.value.trim() ? { label: e.target.value } : null,
            })
          }
          placeholder="Bijv. financieel onafhankelijk zijn op mijn 50e en drie maanden per jaar reizen."
          className="w-full resize-none border border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-2.5 font-serif text-sm text-[var(--ink)] outline-none focus:border-horizon-500 focus:ring-1 focus:ring-horizon-500"
        />
      </div>

      {/* Suggesties */}
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--ink-4)]">
          Of kies een richting
        </p>
        <div className="flex flex-wrap gap-2">
          {DOEL_SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onChange({ goal: { label: s } })}
              className={`border px-3 py-1.5 font-serif text-xs italic transition-colors ${
                value === s
                  ? 'border-horizon-600 bg-horizon-50 text-[var(--ink)]'
                  : 'border-[var(--border-ed)] text-[var(--ink-2)] hover:border-horizon-400 hover:bg-horizon-50/50'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2 pt-2">
        <button
          type="button"
          onClick={onNext}
          className="w-full min-h-11 bg-[var(--ink)] px-6 py-3 text-sm font-medium text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)]"
        >
          {value ? 'Verder' : 'Overslaan'}
        </button>
        <button
          type="button"
          onClick={onBack}
          className="w-full min-h-11 px-6 py-2 text-sm text-[var(--ink-3)] underline-offset-4 hover:text-[var(--ink)] hover:underline"
        >
          Terug
        </button>
      </div>
    </div>
  )
}
