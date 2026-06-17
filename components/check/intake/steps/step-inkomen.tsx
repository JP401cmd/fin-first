'use client'

import { useState, useId } from 'react'
import { parseBedrag } from '@/lib/check/use-check-draft'
import type { CheckDraft } from '@/lib/check/use-check-draft'

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
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
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
          className={`w-full border bg-[var(--subtle)] py-2.5 pr-3 pl-7 font-mono text-base tabular-nums text-[var(--ink)] outline-none focus:ring-1 sm:text-sm ${
            error
              ? 'border-red-400 focus:border-red-500 focus:ring-red-500'
              : 'border-[var(--border-ed)] focus:border-kern-500 focus:ring-kern-500'
          }`}
        />
      </div>
      {error ? (
        <p id={`${id}-err`} className="mt-1 text-xs text-red-500" role="alert">
          {error}
        </p>
      ) : (
        <p id={`${id}-hint`} className="mt-1 font-serif text-xs italic text-[var(--ink-3)]">
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
  const grossId = useId()

  // Raw strings voor de velden (worden bij submit geparsed naar numbers)
  const [rawNet, setRawNet] = useState(() =>
    intake.monthlyIncomeNet ? String(intake.monthlyIncomeNet) : '',
  )
  const [rawGross, setRawGross] = useState(() =>
    intake.yearlyIncomeGross ? String(intake.yearlyIncomeGross) : '',
  )

  const netVal = parseBedrag(rawNet)
  const grossVal = rawGross ? parseBedrag(rawGross) : null

  const netError =
    (submitted || touched['net']) && !rawNet
      ? 'Vul je netto maandinkomen in'
      : (submitted || touched['net']) && netVal <= 0
        ? 'Voer een bedrag groter dan nul in'
        : (submitted || touched['net']) && netVal > 100000
          ? 'Voer een realistisch maandinkomen in'
          : null

  const grossError =
    rawGross && (submitted || touched['gross']) && grossVal !== null && grossVal <= 0
      ? 'Voer een realistisch bruto jaarinkomen in'
      : null

  function handleNext() {
    setSubmitted(true)
    const net = parseBedrag(rawNet)
    if (!rawNet || net <= 0 || net > 100000) return
    if (rawGross) {
      const gross = parseBedrag(rawGross)
      if (gross <= 0) return
      onChange({ monthlyIncomeNet: net, yearlyIncomeGross: gross })
    } else {
      onChange({ monthlyIncomeNet: net, yearlyIncomeGross: null })
    }
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

      <AmountInput
        id={grossId}
        label="Bruto jaarinkomen"
        hint="Voor belasting, incl. bijdragen werkgever. Helpt bij de benchmark-vergelijking."
        value={rawGross}
        onChange={(v) => {
          setRawGross(v)
          const g = parseBedrag(v)
          if (g > 0) onChange({ yearlyIncomeGross: g })
        }}
        onBlur={() => setTouched((t) => ({ ...t, gross: true }))}
        error={grossError}
        placeholder="60.000"
      />

      <div className="flex flex-col gap-2 pt-2">
        <button
          type="button"
          onClick={handleNext}
          className="w-full min-h-11 bg-[var(--ink)] px-6 py-3 text-sm font-medium text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)]"
        >
          Verder
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
