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
  CalculatorOutput,
  OutputFormat,
} from '@/lib/calculator/types'
import type { PrefillValues } from '@/lib/calculator/user-data-keys'

/**
 * CalculatorRunner — interactieve weergave van één CalculatorDefinition.
 * Beheert input-state, evalueert live bij elke wijziging, en toont:
 *  - narrative (1-zinnige conclusie boven)
 *  - derived (context-strook)
 *  - scenario-tabs met applicability-dot + description
 *  - outputs gegroepeerd per section, met style (warn/good/total) + hint
 *  - boolean/enum inputs naast euro/percent/years/number
 *
 * Alle nieuwe velden zijn optioneel. Calculators uit de oude flow (zonder
 * narrative/derived/section/etc.) blijven identiek renderen.
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
  scenarioKey,
}: {
  input: CalculatorInput
  value: number
  onChange: (v: number) => void
  scenarioKey: string
}) {
  // Booleaanse toggle
  if (input.kind === 'boolean') {
    const on = value >= 1
    return (
      <div className="block">
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="text-xs font-semibold text-[var(--ink-2)]">{input.label}</span>
          <button
            type="button"
            onClick={() => onChange(on ? 0 : 1)}
            aria-pressed={on}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md border text-[10px] uppercase tracking-[0.1em] font-bold transition-colors ${
              on
                ? 'bg-[var(--ink)] text-white border-[var(--ink)]'
                : 'bg-transparent text-[var(--ink-3)] border-[var(--border-ed)]'
            }`}
          >
            {on ? 'ja' : 'nee'}
          </button>
        </div>
        {input.hint && (
          <p className="text-[11px] italic text-[var(--ink-3)] leading-snug">{input.hint}</p>
        )}
        <RelevanceBadge input={input} scenarioKey={scenarioKey} />
      </div>
    )
  }

  // Enum / segmented control
  if (input.kind === 'enum' && input.options && input.options.length > 0) {
    return (
      <div className="block">
        <div className="flex items-baseline justify-between gap-2 mb-1.5">
          <span className="text-xs font-semibold text-[var(--ink-2)]">{input.label}</span>
        </div>
        <div className="inline-flex rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] overflow-hidden">
          {input.options.map((opt) => {
            const active = Math.abs(value - opt.value) < 1e-9
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onChange(opt.value)}
                className={`px-3 py-1.5 text-[11px] font-medium border-r border-[var(--border-ed)] last:border-r-0 transition-colors ${
                  active
                    ? 'bg-[var(--ink)] text-white'
                    : 'text-[var(--ink-2)] hover:bg-[var(--subtle)]/60'
                }`}
                title={opt.hint}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
        {input.hint && (
          <p className="mt-1.5 text-[11px] italic text-[var(--ink-3)] leading-snug">{input.hint}</p>
        )}
        <RelevanceBadge input={input} scenarioKey={scenarioKey} />
      </div>
    )
  }

  // Numerieke sliders / inputs
  const display =
    input.kind === 'percent' ? `${(value * 100).toFixed(1)}%` : formatInputDisplay(input.kind, value)
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
      {input.hint && (
        <p className="mt-1 text-[11px] italic text-[var(--ink-3)] leading-snug">{input.hint}</p>
      )}
      <RelevanceBadge input={input} scenarioKey={scenarioKey} />
    </label>
  )
}

function RelevanceBadge({
  input,
  scenarioKey,
}: {
  input: CalculatorInput
  scenarioKey: string
}) {
  if (!input.relevantFor || input.relevantFor.length === 0) return null
  if (input.relevantFor.includes(scenarioKey)) return null
  return (
    <span className="mt-1 inline-block text-[9px] uppercase tracking-[0.1em] font-semibold text-[var(--ink-3)] border border-dashed border-[var(--border-ed)] px-1.5 py-0.5 rounded">
      alleen voor: {input.relevantFor.join(', ')}
    </span>
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

const APPLIC_COLORS: Record<string, string> = {
  yes: 'bg-emerald-500',
  maybe: 'bg-amber-400',
  no: 'bg-red-500',
}

const STYLE_ROW_CLASS: Record<string, string> = {
  normal: '',
  subtotal: 'font-semibold border-t border-[var(--ink-3)]',
  total: 'font-bold border-t-2 border-[var(--ink)] border-b-2 border-double',
  warn: 'bg-red-50/40 text-red-900',
  good: 'bg-emerald-50/40 text-emerald-900',
}

export function CalculatorRunner({
  definition,
  prefill,
  footer,
  readOnly = false,
}: {
  definition: CalculatorDefinition
  prefill: PrefillValues
  footer?: (state: {
    inputs: Record<string, number>
    winner: string | null
    values: Record<string, Record<string, number | null>>
  }) => React.ReactNode
  readOnly?: boolean
}) {
  const [inputs, setInputs] = useState<Record<string, number>>(() =>
    resolveInitialInputs(definition, prefill),
  )
  // Actieve scenario — bepaalt welke relevantFor-hints zichtbaar zijn.
  // De vergelijkings-tabel toont alle scenarios; deze tab stuurt alleen
  // de input-context.
  const [activeScenario, setActiveScenario] = useState<string>(
    () => definition.scenarios[0]?.key ?? '',
  )

  const result = useMemo(
    () => evaluateCalculator(definition, inputs, prefill),
    [definition, inputs, prefill],
  )

  const activeScenarioDef = definition.scenarios.find((s) => s.key === activeScenario)
  const hasScenarioMeta = definition.scenarios.some(
    (s) => s.description || s.appliesWhen,
  )

  // Outputs groeperen op section (volgorde-behoudend).
  const outputSections = useMemo(() => {
    const groups: Array<{ section: string | null; outputs: CalculatorOutput[] }> = []
    for (const o of definition.outputs) {
      const section = o.section ?? null
      const last = groups[groups.length - 1]
      if (last && last.section === section) {
        last.outputs.push(o)
      } else {
        groups.push({ section, outputs: [o] })
      }
    }
    return groups
  }, [definition.outputs])

  return (
    <div className="space-y-5">
      {definition.description && (
        <p className="text-sm text-[var(--ink-2)] leading-relaxed">
          {definition.description}
        </p>
      )}

      {/* Narrative — 1-zinnige conclusie / pull-quote */}
      {result.narrative && (
        <blockquote className="relative pl-4 border-l-2 border-amber-400 italic text-[15px] text-[var(--ink)] leading-snug">
          {result.narrative}
        </blockquote>
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
              scenarioKey={activeScenario}
            />
          ))}
        </div>
      )}

      {/* Derived context-strook */}
      {result.derived.length > 0 && (
        <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--subtle)]/40 px-4 py-3">
          <div className="text-[9px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)] mb-2">
            Context
          </div>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
            {result.derived.map((d) => {
              const row = definition.derived?.find((r) => r.key === d.key)
              return (
                <div key={d.key} className="flex items-baseline justify-between gap-3 text-xs">
                  <dt className="text-[var(--ink-2)]">
                    {d.label}
                    {row?.hint && (
                      <span className="ml-1.5 italic text-[var(--ink-3)]">{row.hint}</span>
                    )}
                  </dt>
                  <dd className="font-mono tabular-nums text-[var(--ink)] font-semibold">
                    {formatOutput(d.value, row?.format ?? 'number')}
                  </dd>
                </div>
              )
            })}
          </dl>
        </div>
      )}

      {/* Scenario-tabs met applicability-dot + description */}
      {hasScenarioMeta && definition.scenarios.length > 1 && (
        <div>
          <div role="tablist" className="flex flex-wrap gap-1 border-b border-[var(--border-ed)]">
            {definition.scenarios.map((s) => {
              const isActive = s.key === activeScenario
              const app = result.applicability[s.key]
              return (
                <button
                  key={s.key}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveScenario(s.key)}
                  className={`relative px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
                    isActive
                      ? 'border-violet-600 text-[var(--ink)]'
                      : 'border-transparent text-[var(--ink-3)] hover:text-[var(--ink-2)]'
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {app && (
                      <span
                        title={app.reason}
                        className={`inline-block w-1.5 h-1.5 rounded-full ${APPLIC_COLORS[app.status]}`}
                        aria-label={`status: ${app.status}`}
                      />
                    )}
                    {s.label}
                  </span>
                </button>
              )
            })}
          </div>
          {activeScenarioDef?.description && (
            <p className="mt-2 text-xs text-[var(--ink-2)] leading-relaxed italic pl-1">
              {activeScenarioDef.description}
            </p>
          )}
          {result.applicability[activeScenario]?.status === 'no' &&
            result.applicability[activeScenario]?.reason && (
              <p className="mt-2 flex items-start gap-1.5 text-[11px] text-red-800 bg-red-50/60 border border-red-200 rounded-md px-2 py-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{result.applicability[activeScenario]!.reason}</span>
              </p>
            )}
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
              {definition.scenarios.map((s) => {
                const app = result.applicability[s.key]
                return (
                  <th
                    key={s.key}
                    className="text-right px-4 py-3 text-xs font-semibold text-[var(--ink)]"
                  >
                    <span className="inline-flex items-center gap-1">
                      {app && (
                        <span
                          title={app.reason}
                          className={`inline-block w-1.5 h-1.5 rounded-full ${APPLIC_COLORS[app.status]}`}
                          aria-label={`status: ${app.status}`}
                        />
                      )}
                      {result.winner === s.key && (
                        <Trophy className="w-3.5 h-3.5 text-amber-500" aria-hidden="true" />
                      )}
                      {s.label}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {outputSections.map((group, gi) => (
              <SectionRows
                key={gi}
                group={group}
                scenarios={definition.scenarios}
                values={result.values}
                compareKey={definition.compare?.outputKey}
                winnerKey={result.winner}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Keuze-conclusie (alleen tonen als er geen narrative is) */}
      {!result.narrative && result.winner && definition.compare && (
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

      {!readOnly && footer?.({ inputs, winner: result.winner, values: result.values })}

      {/* Wft-disclaimer */}
      <p className="text-[11px] italic text-[var(--ink-3)] leading-snug">
        Deze rekenhulp is een educatief hulpmiddel, geen persoonlijk financieel
        of belastingadvies. Controleer de aannames en raadpleeg bij twijfel een
        erkend financieel adviseur.
      </p>
    </div>
  )
}

function SectionRows({
  group,
  scenarios,
  values,
  compareKey,
  winnerKey,
}: {
  group: { section: string | null; outputs: CalculatorOutput[] }
  scenarios: CalculatorDefinition['scenarios']
  values: Record<string, Record<string, number | null>>
  compareKey?: string
  winnerKey: string | null
}) {
  return (
    <>
      {group.section && (
        <tr>
          <td
            colSpan={1 + scenarios.length}
            className="px-4 pt-3 pb-1 text-[9px] uppercase tracking-[0.14em] font-bold text-[var(--ink-3)] border-b border-dashed border-[var(--border-ed)]"
          >
            {group.section}
          </td>
        </tr>
      )}
      {group.outputs.map((output) => {
        const isCompareRow = compareKey === output.key
        const styleClass = STYLE_ROW_CLASS[output.style ?? 'normal'] ?? ''
        return (
          <tr
            key={output.key}
            className={`border-b border-[var(--border-ed)] last:border-0 ${
              isCompareRow ? 'bg-violet-50/40' : ''
            } ${styleClass}`}
          >
            <td className="px-4 py-3 text-[var(--ink-2)]">
              <div>{output.label}</div>
              {output.hint && (
                <div className="text-[11px] italic text-[var(--ink-3)] leading-snug">
                  {output.hint}
                </div>
              )}
              {isCompareRow && (
                <span className="text-[10px] uppercase tracking-[0.06em] text-violet-700 font-semibold">
                  keuze
                </span>
              )}
            </td>
            {scenarios.map((s) => {
              const v = values[s.key]?.[output.key] ?? null
              const isWinnerCell = isCompareRow && winnerKey === s.key
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
    </>
  )
}
