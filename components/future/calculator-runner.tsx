'use client'

import { useMemo, useState } from 'react'
import { Trophy, AlertTriangle, Info } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import {
  evaluateCalculator,
  resolveInitialInputs,
} from '@/lib/calculator/evaluate'
import type {
  CalculatorDefinition,
  CalculatorInput,
  OutputFormat,
} from '@/lib/calculator/types'
import type { PrefillValues } from '@/lib/calculator/user-data-keys'

/**
 * CalculatorRunner — interactieve weergave van één CalculatorDefinition.
 * Beheert input-state, evalueert live bij elke wijziging, en toont een
 * scenario×output-vergelijking met winnaar-badge. Pure presentatie +
 * `evaluateCalculator` — geen data-fetching.
 *
 * De optionele `footer`-render-prop laat de host acties toevoegen
 * (Opslaan, Maak levensgebeurtenis, Verfijnen).
 */

function formatOutput(value: number | null, format: OutputFormat, unit?: string): string {
  if (value == null) return '—'
  switch (format) {
    case 'euro':
      return formatCurrency(Math.round(value))
    case 'percent':
      return `${(value * 100).toFixed(1)}%`
    case 'years': {
      const y = Math.floor(value)
      const m = Math.round((value - y) * 12)
      return m === 0 ? `${y} jr` : `${y} jr ${m} mnd`
    }
    default:
      return unit
      ? `${Math.round(value).toLocaleString('nl-NL')} ${unit}`
      : Math.round(value).toLocaleString('nl-NL')
  }
}

function InputField({
  input,
  value,
  onChange,
}: {
  input: CalculatorInput
  value: number
  onChange: (v: number) => void
}) {
  const display =
    input.kind === 'percent' ? `${(value * 100).toFixed(1)}%` : formatInputDisplay(input.kind, value)
  // Slider voor euro/percent/years met min/max; anders number-input.
  const hasRange = input.min != null && input.max != null
  return (
    <label className="block">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className="text-xs font-semibold text-[var(--ink-2)]">{input.label}</span>
        <span className="text-xs font-mono text-[var(--ink)] tabular-nums">{display}</span>
      </div>
      {hasRange ? (
        <input
          type="range"
          min={input.min}
          max={input.max}
          step={input.step ?? stepFor(input.kind)}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label={input.label}
          className="w-full accent-violet-600"
        />
      ) : (
        <input
          type="number"
          inputMode="decimal"
          step={input.step ?? stepFor(input.kind)}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label={input.label}
          className="w-full rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--ink-3)]"
        />
      )}
    </label>
  )
}

function formatInputDisplay(kind: CalculatorInput['kind'], value: number): string {
  if (kind === 'euro') return formatCurrency(Math.round(value))
  if (kind === 'years') return `${value} jr`
  return value.toLocaleString('nl-NL')
}

function stepFor(kind: CalculatorInput['kind']): number {
  if (kind === 'euro') return 100
  if (kind === 'percent') return 0.005
  if (kind === 'years') return 1
  return 1
}

export function CalculatorRunner({
  definition,
  prefill,
  footer,
}: {
  definition: CalculatorDefinition
  prefill: PrefillValues
  /** Optionele render-prop voor acties; krijgt huidige input-state,
   *  winnaar én de geëvalueerde waarden door zodat de host bv. een
   *  levensgebeurtenis kan destilleren. */
  footer?: (state: {
    inputs: Record<string, number>
    winner: string | null
    values: Record<string, Record<string, number | null>>
  }) => React.ReactNode
}) {
  const [inputs, setInputs] = useState<Record<string, number>>(() =>
    resolveInitialInputs(definition, prefill),
  )

  const result = useMemo(
    () => evaluateCalculator(definition, inputs, prefill),
    [definition, inputs, prefill],
  )

  return (
    <div className="space-y-5">
      {definition.description && (
        <p className="text-sm text-[var(--ink-2)] leading-relaxed">
          {definition.description}
        </p>
      )}

      {/* Inputs */}
      {definition.inputs.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4">
          {definition.inputs.map((input) => (
            <InputField
              key={input.key}
              input={input}
              value={inputs[input.key] ?? input.default}
              onChange={(v) => setInputs((prev) => ({ ...prev, [input.key]: v }))}
            />
          ))}
        </div>
      )}

      {/* Scenario × output vergelijking */}
      <div className="overflow-x-auto rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border-ed)]">
              <th className="text-left px-4 py-3 text-[10px] uppercase tracking-[0.08em] font-semibold text-[var(--ink-3)]">
                Uitkomst
              </th>
              {definition.scenarios.map((s) => (
                <th
                  key={s.key}
                  className="text-right px-4 py-3 text-xs font-semibold text-[var(--ink)]"
                >
                  <span className="inline-flex items-center gap-1">
                    {result.winner === s.key && (
                      <Trophy className="w-3.5 h-3.5 text-amber-500" aria-hidden="true" />
                    )}
                    {s.label}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {definition.outputs.map((output) => {
              const isCompareRow = definition.compare?.outputKey === output.key
              return (
                <tr
                  key={output.key}
                  className={`border-b border-[var(--border-ed)] last:border-0 ${isCompareRow ? 'bg-violet-50/40' : ''}`}
                >
                  <td className="px-4 py-3 text-[var(--ink-2)]">
                    {output.label}
                    {isCompareRow && (
                      <span className="ml-1.5 text-[10px] uppercase tracking-[0.06em] text-violet-700 font-semibold">
                        keuze
                      </span>
                    )}
                  </td>
                  {definition.scenarios.map((s) => {
                    const v = result.values[s.key]?.[output.key] ?? null
                    const isWinnerCell = isCompareRow && result.winner === s.key
                    return (
                      <td
                        key={s.key}
                        className={`px-4 py-3 text-right tabular-nums font-mono ${
                          isWinnerCell ? 'text-emerald-700 font-semibold' : 'text-[var(--ink)]'
                        }`}
                      >
                        {formatOutput(v, output.format, output.unit)}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Keuze-conclusie */}
      {result.winner && definition.compare && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <Trophy className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>
            Op basis van je invoer komt{' '}
            <strong>
              {definition.scenarios.find((s) => s.key === result.winner)?.label}
            </strong>{' '}
            er het gunstigst uit.
          </span>
        </div>
      )}

      {/* Evaluatie-fouten (defensief; zou bij gevalideerde defs niet moeten) */}
      {result.errors.length > 0 && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
        >
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <div className="font-semibold mb-0.5">Sommige uitkomsten konden niet berekend worden:</div>
            <ul className="list-disc list-inside space-y-0.5">
              {result.errors.slice(0, 4).map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Aannames */}
      {(definition.assumptions?.length ?? 0) > 0 && (
        <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--subtle)]/40 px-3 py-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <Info className="w-3.5 h-3.5 text-[var(--ink-3)]" aria-hidden="true" />
            <span className="text-[10px] uppercase tracking-[0.08em] font-semibold text-[var(--ink-3)]">
              Aannames
            </span>
          </div>
          <ul className="list-disc list-inside space-y-0.5 text-[11px] text-[var(--ink-2)] leading-snug">
            {definition.assumptions?.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      {footer?.({ inputs, winner: result.winner, values: result.values })}

      {/* Wft-disclaimer */}
      <p className="text-[11px] italic text-[var(--ink-3)] leading-snug">
        Deze rekenhulp is een educatief hulpmiddel, geen persoonlijk financieel
        of belastingadvies. Controleer de aannames en raadpleeg bij twijfel een
        erkend financieel adviseur.
      </p>
    </div>
  )
}
