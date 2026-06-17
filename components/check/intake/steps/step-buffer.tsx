'use client'

import { useState, useId } from 'react'
import { parseBedrag } from '@/lib/check/use-check-draft'
import type { CheckDraft } from '@/lib/check/use-check-draft'
import { formatCurrency } from '@/lib/format'

interface Props {
  intake: CheckDraft['intake']
  onChange: (patch: Partial<CheckDraft['intake']>) => void
  onNext: () => void
  onBack: () => void
}

export function StepBuffer({ intake, onChange, onNext, onBack }: Props) {
  const [submitted, setSubmitted] = useState(false)
  const [raw, setRaw] = useState(() =>
    typeof intake.emergencyFund === 'number' ? String(intake.emergencyFund) : '',
  )
  const id = useId()

  const val = parseBedrag(raw)
  const isConfirmed = typeof intake.emergencyFund === 'number'

  // Bereken maanden dekking indien we ook maanduitgaven kennen
  const monthlyExp = intake.expenses?.totaalMaand ?? 0
  const coverageMonths = val > 0 && monthlyExp > 0 ? Math.round((val / monthlyExp) * 10) / 10 : null

  const error =
    submitted && typeof intake.emergencyFund !== 'number'
      ? 'Vul een bedrag in, of kies "Geen buffer"'
      : null

  function confirmValue(v: number) {
    onChange({ emergencyFund: v })
  }

  function handleNext() {
    setSubmitted(true)
    if (typeof intake.emergencyFund !== 'number') return
    onNext()
  }

  function handleNoBuffer() {
    confirmValue(0)
    onNext()
  }

  return (
    <div className="space-y-6">
      <p className="font-serif text-sm italic text-[var(--ink-3)]">
        Dit is het bedrag dat je direct beschikbaar hebt voor onverwachte uitgaven — op een
        spaarrekening of aparte buffer, niet je gewone rekening.
      </p>

      <div>
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
          Saldo noodfonds / buffer
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-[var(--ink-4)]">
            &euro;
          </span>
          <input
            id={id}
            type="text"
            inputMode="decimal"
            value={raw}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9.,]/g, '')
              setRaw(v)
              const n = parseBedrag(v)
              if (n >= 0) confirmValue(n)
            }}
            placeholder="5.000"
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
            Schat gerust — dit kun je later aanpassen in de app.
          </p>
        )}
      </div>

      {/* Coverage-preview */}
      {coverageMonths !== null && (
        <div className="border border-[var(--border-ed)] bg-kern-50/40 px-4 py-3">
          <p className="font-serif text-sm text-[var(--ink-2)]">
            {formatCurrency(val)} dekt{' '}
            <span className="font-mono font-medium tabular-nums text-[var(--ink)]">
              {coverageMonths} {coverageMonths === 1 ? 'maand' : 'maanden'}
            </span>{' '}
            aan uitgaven.{' '}
            {coverageMonths >= 3 ? (
              <span className="italic text-[var(--ink-3)]">Dat is een gezonde buffer.</span>
            ) : (
              <span className="italic text-[var(--ink-3)]">
                Vuistregel: drie maanden is een veilige bodem.
              </span>
            )}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2 pt-2">
        <button
          type="button"
          onClick={handleNext}
          className="w-full min-h-11 bg-[var(--ink)] px-6 py-3 text-sm font-medium text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)]"
        >
          Verder
        </button>
        {!isConfirmed && (
          <button
            type="button"
            onClick={handleNoBuffer}
            className="w-full min-h-11 border border-[var(--border-ed)] px-6 py-2.5 text-sm text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)]"
          >
            Geen noodfonds (ook nuttig om te weten)
          </button>
        )}
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
