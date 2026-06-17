'use client'

import { useState, useId } from 'react'
import { parseBedrag } from '@/lib/check/use-check-draft'
import type { CheckDraft } from '@/lib/check/use-check-draft'
import { formatCurrency } from '@/lib/format'
import { primaryBtn, backBtn, ghostBtn, fieldLabel, inputBase, inputError, errorText, hintText } from '../intake-styles'

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
        <label htmlFor={id} className={fieldLabel}>
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
            className={`${inputBase('kern')} py-2.5 pr-3 pl-7 font-mono text-base tabular-nums sm:text-sm ${error ? inputError : ''}`}
          />
        </div>
        {error ? (
          <p id={`${id}-err`} className={errorText} role="alert">
            {error}
          </p>
        ) : (
          <p id={`${id}-hint`} className={hintText}>
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
        <button type="button" onClick={handleNext} className={primaryBtn('kern')}>
          Verder
        </button>
        {!isConfirmed && (
          <button type="button" onClick={handleNoBuffer} className={ghostBtn}>
            Geen noodfonds (ook nuttig om te weten)
          </button>
        )}
        <button type="button" onClick={onBack} className={backBtn}>
          Terug
        </button>
      </div>
    </div>
  )
}
