'use client'

import { useState, useId } from 'react'
import { parseBedrag } from '@/lib/check/use-check-draft'
import type { CheckDraft } from '@/lib/check/use-check-draft'
import type { RiskProfile } from '@/lib/check/types'

interface Props {
  intake: CheckDraft['intake']
  onChange: (patch: Partial<CheckDraft['intake']>) => void
  onNext: () => void
  onBack: () => void
}

const RISK_OPTIONS: { value: RiskProfile; label: string; sub: string }[] = [
  { value: 'defensief', label: 'Defensief', sub: '~4–5% verwacht rendement, laag risico' },
  { value: 'neutraal', label: 'Neutraal', sub: '~6–7% verwacht rendement, mix' },
  { value: 'offensief', label: 'Offensief', sub: '~8–9% verwacht rendement, hoog risico' },
]

export function StepPensioen({ intake, onChange, onNext, onBack }: Props) {
  const [rawAow, setRawAow] = useState(() =>
    intake.pension?.aowExpectedMonthly ? String(intake.pension.aowExpectedMonthly) : '',
  )
  const [rawReturn, setRawReturn] = useState(() =>
    intake.pension?.expectedReturnPct ? String(intake.pension.expectedReturnPct) : '',
  )
  const aowId = useId()
  const retId = useId()

  const pension = intake.pension ?? {}

  function patchPension(patch: Partial<CheckDraft['intake']['pension']>) {
    onChange({ pension: { ...pension, ...patch } })
  }

  return (
    <div className="space-y-7">
      <p className="font-serif text-sm italic text-[var(--ink-3)]">
        Optioneel — maar hoe meer je invult, hoe accurater de toekomst-secties in je rapport.
      </p>

      {/* AOW verwacht */}
      <div>
        <label htmlFor={aowId} className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
          Geschatte AOW per maand{' '}
          <span className="text-xs font-normal italic text-[var(--ink-3)]">(optioneel)</span>
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-[var(--ink-4)]">
            &euro;
          </span>
          <input
            id={aowId}
            type="text"
            inputMode="decimal"
            value={rawAow}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9.,]/g, '')
              setRawAow(v)
              const n = parseBedrag(v)
              patchPension({ aowExpectedMonthly: n > 0 ? n : null })
            }}
            placeholder="1.400"
            className="w-full border border-[var(--border-ed)] bg-[var(--subtle)] py-2.5 pr-3 pl-7 font-mono text-sm tabular-nums text-[var(--ink)] outline-none focus:border-horizon-500 focus:ring-1 focus:ring-horizon-500"
          />
        </div>
        <p className="mt-1 font-serif text-xs italic text-[var(--ink-3)]">
          Alleenstaande AOW 2025 ≈ €1.433 / maand. Je kunt dit ook via mijnpensioenoverzicht.nl inzien.
        </p>
      </div>

      {/* Risicoprofiel */}
      <div>
        <p className="mb-2 text-sm font-medium text-[var(--ink-2)]">
          Beleggingsrisico-profiel{' '}
          <span className="text-xs font-normal italic text-[var(--ink-3)]">(optioneel)</span>
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {RISK_OPTIONS.map((opt) => {
            const selected = pension?.riskProfile === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() =>
                  patchPension({
                    riskProfile: selected ? null : opt.value,
                  })
                }
                aria-pressed={selected}
                className={`flex flex-col items-start border px-4 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-horizon-500 ${
                  selected
                    ? 'border-horizon-600 bg-horizon-50 text-[var(--ink)]'
                    : 'border-[var(--border-ed)] bg-[var(--subtle)] text-[var(--ink-2)] hover:border-horizon-400 hover:bg-horizon-50/50'
                }`}
              >
                <span className="font-display text-sm font-semibold leading-tight">
                  {opt.label}
                </span>
                <span className="mt-0.5 font-serif text-xs italic text-[var(--ink-3)]">
                  {opt.sub}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Verwacht rendement override */}
      <div>
        <label htmlFor={retId} className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
          Verwacht jaarrendement{' '}
          <span className="text-xs font-normal italic text-[var(--ink-3)]">(optioneel — overschrijft profiel)</span>
        </label>
        <div className="relative">
          <input
            id={retId}
            type="text"
            inputMode="decimal"
            value={rawReturn}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9.,]/g, '')
              setRawReturn(v)
              const n = parseBedrag(v)
              patchPension({ expectedReturnPct: n > 0 ? n : null })
            }}
            placeholder="7,0"
            className="w-full border border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-2.5 pr-8 font-mono text-sm tabular-nums text-[var(--ink)] outline-none focus:border-horizon-500 focus:ring-1 focus:ring-horizon-500"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs text-[var(--ink-4)]">
            %
          </span>
        </div>
        <p className="mt-1 font-serif text-xs italic text-[var(--ink-3)]">
          Historisch gemiddeld reëel rendement wereldaandelen ≈ 7% per jaar.
        </p>
      </div>

      <div className="flex flex-col gap-2 pt-2">
        <button
          type="button"
          onClick={onNext}
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
