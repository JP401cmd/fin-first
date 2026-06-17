'use client'

import { useState, useId, useCallback } from 'react'
import { parseBedrag } from '@/lib/check/use-check-draft'
import type { CheckDraft } from '@/lib/check/use-check-draft'
import { formatCurrency } from '@/lib/format'

interface Props {
  intake: CheckDraft['intake']
  onChange: (patch: Partial<CheckDraft['intake']>) => void
  onNext: () => void
  onBack: () => void
}

type ExpField = 'wonen' | 'vasteLasten' | 'vrijBesteedbaar'

const FIELDS: { key: ExpField; label: string; hint: string; placeholder: string }[] = [
  {
    key: 'wonen',
    label: 'Wonen',
    hint: 'Huur of hypotheekbetaling, energie, water.',
    placeholder: '1.200',
  },
  {
    key: 'vasteLasten',
    label: 'Vaste lasten',
    hint: 'Verzekeringen, abonnementen, telefoon, boodschappen.',
    placeholder: '800',
  },
  {
    key: 'vrijBesteedbaar',
    label: 'Vrij besteedbaar',
    hint: 'Uit eten, kleding, vrije tijd, cadeaus.',
    placeholder: '600',
  },
]

export function StepUitgaven({ intake, onChange, onNext, onBack }: Props) {
  const [submitted, setSubmitted] = useState(false)
  const [touched, setTouched] = useState<Partial<Record<ExpField | 'totaal', boolean>>>({})

  const expenses = intake.expenses ?? { wonen: 0, vasteLasten: 0, vrijBesteedbaar: 0, totaalMaand: 0 }

  // Raw string state voor elk veld
  const [raws, setRaws] = useState<Record<ExpField, string>>({
    wonen: expenses.wonen ? String(expenses.wonen) : '',
    vasteLasten: expenses.vasteLasten ? String(expenses.vasteLasten) : '',
    vrijBesteedbaar: expenses.vrijBesteedbaar ? String(expenses.vrijBesteedbaar) : '',
  })
  const [rawTotaal, setRawTotaal] = useState<string>(
    expenses.totaalMaand ? String(expenses.totaalMaand) : '',
  )

  const deelValues = {
    wonen: parseBedrag(raws.wonen),
    vasteLasten: parseBedrag(raws.vasteLasten),
    vrijBesteedbaar: parseBedrag(raws.vrijBesteedbaar),
  }
  const autoSum = deelValues.wonen + deelValues.vasteLasten + deelValues.vrijBesteedbaar
  const totaalVal = parseBedrag(rawTotaal) || autoSum

  const id = useId()

  const handleFieldChange = useCallback(
    (key: ExpField, raw: string) => {
      setRaws((prev) => ({ ...prev, [key]: raw }))
      const vals = {
        wonen: key === 'wonen' ? parseBedrag(raw) : deelValues.wonen,
        vasteLasten: key === 'vasteLasten' ? parseBedrag(raw) : deelValues.vasteLasten,
        vrijBesteedbaar: key === 'vrijBesteedbaar' ? parseBedrag(raw) : deelValues.vrijBesteedbaar,
      }
      const sum = vals.wonen + vals.vasteLasten + vals.vrijBesteedbaar
      onChange({
        expenses: {
          ...vals,
          totaalMaand: rawTotaal ? parseBedrag(rawTotaal) : sum,
        },
      })
    },
    [deelValues, rawTotaal, onChange],
  )

  const handleTotaalChange = useCallback(
    (raw: string) => {
      setRawTotaal(raw)
      const tot = parseBedrag(raw)
      onChange({
        expenses: {
          wonen: deelValues.wonen,
          vasteLasten: deelValues.vasteLasten,
          vrijBesteedbaar: deelValues.vrijBesteedbaar,
          totaalMaand: tot || autoSum,
        },
      })
    },
    [deelValues, autoSum, onChange],
  )

  const totaalError =
    (submitted || touched.totaal) && totaalVal <= 0
      ? 'Vul je maandelijkse totaaluitgaven in'
      : (submitted || touched.totaal) && totaalVal > 500000
        ? 'Voer een realistisch bedrag in'
        : null

  function handleNext() {
    setSubmitted(true)
    if (totaalVal <= 0) return
    onChange({
      expenses: {
        wonen: deelValues.wonen,
        vasteLasten: deelValues.vasteLasten,
        vrijBesteedbaar: deelValues.vrijBesteedbaar,
        totaalMaand: totaalVal,
      },
    })
    onNext()
  }

  return (
    <div className="space-y-6">
      <p className="font-serif text-sm italic text-[var(--ink-3)]">
        Schat de drie categorieën — ze tellen automatisch op. Of vul alleen het totaal in.
      </p>

      {FIELDS.map((f) => (
        <div key={f.key}>
          <label
            htmlFor={`${id}-${f.key}`}
            className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]"
          >
            {f.label}{' '}
            <span className="text-xs font-normal italic text-[var(--ink-3)]">(optioneel)</span>
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-[var(--ink-4)]">
              &euro;
            </span>
            <input
              id={`${id}-${f.key}`}
              type="text"
              inputMode="decimal"
              value={raws[f.key]}
              onChange={(e) => handleFieldChange(f.key, e.target.value.replace(/[^0-9.,]/g, ''))}
              onBlur={() => setTouched((t) => ({ ...t, [f.key]: true }))}
              placeholder={f.placeholder}
              autoComplete="off"
              className="w-full border border-[var(--border-ed)] bg-[var(--subtle)] py-2.5 pr-3 pl-7 font-mono text-base tabular-nums text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500 sm:text-sm"
            />
          </div>
          <p className="mt-1 font-serif text-xs italic text-[var(--ink-3)]">{f.hint}</p>
        </div>
      ))}

      {/* Auto-som tonen als meer dan één veld gevuld */}
      {autoSum > 0 && (
        <p className="border-l-2 border-kern-400 pl-3 font-mono text-sm tabular-nums text-[var(--ink-2)]">
          Subtotaal: {formatCurrency(autoSum)} / maand
        </p>
      )}

      {/* Totaal-override */}
      <div>
        <label
          htmlFor={`${id}-totaal`}
          className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]"
        >
          Totale maanduitgaven
          {autoSum > 0 && (
            <span className="ml-2 font-mono text-xs font-normal tabular-nums text-[var(--ink-4)]">
              (of laat berekend: {formatCurrency(autoSum)})
            </span>
          )}
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-[var(--ink-4)]">
            &euro;
          </span>
          <input
            id={`${id}-totaal`}
            type="text"
            inputMode="decimal"
            value={rawTotaal}
            onChange={(e) => handleTotaalChange(e.target.value.replace(/[^0-9.,]/g, ''))}
            onBlur={() => setTouched((t) => ({ ...t, totaal: true }))}
            placeholder={autoSum > 0 ? String(autoSum) : '2.600'}
            autoComplete="off"
            aria-invalid={!!totaalError}
            aria-describedby={totaalError ? `${id}-totaal-err` : `${id}-totaal-hint`}
            className={`w-full border bg-[var(--subtle)] py-2.5 pr-3 pl-7 font-mono text-base tabular-nums text-[var(--ink)] outline-none focus:ring-1 sm:text-sm ${
              totaalError
                ? 'border-red-400 focus:border-red-500 focus:ring-red-500'
                : 'border-[var(--border-ed)] focus:border-kern-500 focus:ring-kern-500'
            }`}
          />
        </div>
        {totaalError ? (
          <p id={`${id}-totaal-err`} className="mt-1 text-xs text-red-500" role="alert">
            {totaalError}
          </p>
        ) : (
          <p id={`${id}-totaal-hint`} className="mt-1 font-serif text-xs italic text-[var(--ink-3)]">
            Alles bij elkaar — wonen, eten, vrije tijd, alles.
          </p>
        )}
      </div>

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
