'use client'

import { useId } from 'react'
import type { CheckDraft } from '@/lib/check/use-check-draft'
import { primaryBtn, backBtn, fieldLabel, inputBase } from '../intake-styles'

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
        <label htmlFor={id} className={fieldLabel}>
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
          className={`${inputBase('horizon')} resize-none px-3 py-2.5 font-serif text-sm`}
        />
      </div>

      {/* Suggesties */}
      <div>
        <p className="label-editorial mb-2 font-mono text-[var(--ink-meta)]">
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
        <button type="button" onClick={onNext} className={primaryBtn('horizon')}>
          {value ? 'Verder' : 'Overslaan'}
        </button>
        <button type="button" onClick={onBack} className={backBtn}>
          Terug
        </button>
      </div>
    </div>
  )
}
