'use client'

import { useState, useId } from 'react'
import { parseBedrag } from '@/lib/check/use-check-draft'
import type { CheckDraft } from '@/lib/check/use-check-draft'
import { primaryBtn, backBtn, fieldLabel, inputBase, inputError, errorText, hintText } from '../intake-styles'

interface Props {
  intake: CheckDraft['intake']
  onChange: (patch: Partial<CheckDraft['intake']>) => void
  onNext: () => void
  onBack: () => void
}

function AmountInput({
  id,
  label,
  hint,
  value,
  onChange,
  onBlur,
  error,
  required,
  placeholder,
}: {
  id: string
  label: string
  hint: string
  value: string
  onChange: (v: string) => void
  onBlur?: () => void
  error?: string | null
  required?: boolean
  placeholder?: string
}) {
  return (
    <div>
      <label htmlFor={id} className={fieldLabel}>
        {label}{' '}
        {!required && (
          <span className="text-xs font-normal italic text-[var(--ink-3)]">(optioneel)</span>
        )}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-[var(--ink-4)]">
          &euro;
        </span>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9.,]/g, ''))}
          onBlur={onBlur}
          placeholder={placeholder ?? '0'}
          autoComplete="off"
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-err` : `${id}-hint`}
          className={`${inputBase('kern')} py-2.5 pr-3 pl-7 font-mono text-base tabular-nums sm:text-sm ${error ? inputError : ''}`}
        />
      </div>
      {error ? (
        <p id={`${id}-err`} className={errorText} role="alert">
          {error}
        </p>
      ) : (
        <p id={`${id}-hint`} className={hintText}>
          {hint}
        </p>
      )}
    </div>
  )
}

export function StepInkomen({ intake, onChange, onNext, onBack }: Props) {
  const [submitted, setSubmitted] = useState(false)
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const incomeId = useId()

  // Raw strings voor de velden (worden bij submit geparsed naar numbers)
  const [rawNet, setRawNet] = useState(() =>
    intake.monthlyIncomeNet ? String(intake.monthlyIncomeNet) : '',
  )

  const netVal = parseBedrag(rawNet)

  const netError =
    (submitted || touched['net']) && !rawNet
      ? 'Vul je netto maandinkomen in'
      : (submitted || touched['net']) && netVal <= 0
        ? 'Voer een bedrag groter dan nul in'
        : (submitted || touched['net']) && netVal > 100000
          ? 'Voer een realistisch maandinkomen in'
          : null

  function handleNext() {
    setSubmitted(true)
    const net = parseBedrag(rawNet)
    if (!rawNet || net <= 0 || net > 100000) return
    onChange({ monthlyIncomeNet: net })
    onNext()
  }

  // Preview: jaarbedrag op basis van netto maand
  const yearlyPreview = netVal > 0 ? Math.round(netVal * 12) : null

  return (
    <div className="space-y-6">
      <AmountInput
        id={incomeId}
        label="Netto maandinkomen"
        hint="Na belasting, inclusief vakantiegeld gedeeld door 12."
        value={rawNet}
        onChange={(v) => {
          setRawNet(v)
          const n = parseBedrag(v)
          if (n > 0) onChange({ monthlyIncomeNet: n })
        }}
        onBlur={() => setTouched((t) => ({ ...t, net: true }))}
        error={netError}
        required
        placeholder="3.500"
      />

      {yearlyPreview !== null && (
        <p className="border border-[var(--border-ed)] bg-kern-50/40 px-4 py-3 font-serif text-sm italic text-[var(--ink-2)]">
          Dat is{' '}
          <span className="font-mono font-medium not-italic tabular-nums text-[var(--ink)]">
            {new Intl.NumberFormat('nl-NL', {
              style: 'currency',
              currency: 'EUR',
              maximumFractionDigits: 0,
            }).format(yearlyPreview)}
          </span>{' '}
          per jaar netto.
        </p>
      )}

      <div className="flex flex-col gap-2 pt-2">
        <button type="button" onClick={handleNext} className={primaryBtn('kern')}>
          Verder
        </button>
        <button type="button" onClick={onBack} className={backBtn}>
          Terug
        </button>
      </div>
    </div>
  )
}
