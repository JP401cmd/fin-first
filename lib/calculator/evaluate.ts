import { Parser } from 'expr-eval'
import type { CalculatorDefinition } from './types'
import type { PrefillValues } from './user-data-keys'

/**
 * Rekenhulp — veilige formule-evaluator.
 *
 * Gebruikt `expr-eval` (pure math-parser, GEEN JS-eval / code-exec). Een
 * formule heeft alleen toegang tot:
 *   - input-waarden (de actuele slider-stand)
 *   - voorgevulde gebruikersdata (PrefillValues)
 *   - de actieve scenario-key als string-constante `scenario`
 *   - een whitelisted set financiële functies (zie WHITELIST_FNS)
 *
 * expr-eval blokkeert toegang tot globals (process/global/constructor) —
 * onbekende namen gooien "undefined variable". We vangen dat af en
 * leveren een nette foutmelding per output i.p.v. de hele evaluatie te
 * laten crashen.
 */

// Eén Parser-instance volstaat; parse() is stateless.
const parser = new Parser({
  operators: {
    // Sta alleen rekenkundige operators toe. Logische/vergelijkings-
    // operators blijven aan voor `if(cond, a, b)`-achtige formules.
    concatenate: false,
    assignment: false,
  },
})

/** Whitelisted financiële + wiskundige helperfuncties. */
const WHITELIST_FNS: Record<string, (...args: number[]) => number> = {
  /** Samengestelde groei: principal × (1+rate)^years. */
  compound: (principal, rate, years) => principal * Math.pow(1 + rate, years),
  /**
   * Eindwaarde van maandelijkse inleg over `years` jaar bij jaar-rente
   * `rate` (annuïteit-spaarvorm, einde-maand-inleg).
   */
  fvAnnuity: (monthly, rate, years) => {
    if (rate === 0) return monthly * 12 * years
    const r = rate / 12
    const n = years * 12
    return (monthly * (Math.pow(1 + r, n) - 1)) / r
  },
  /** Annuïteit-maandlast voor een lening (principal, jaarrente, jaren). */
  annuity: (principal, rate, years) => {
    const r = rate / 12
    const n = years * 12
    if (r === 0) return principal / n
    return (principal * r) / (1 - Math.pow(1 + r, -n))
  },
  /**
   * Box 3-heffing per jaar (vereenvoudigd, forfaitair). grondslag boven
   * heffingsvrij, forfaitair rendement × tarief. Defaults 2026-achtig:
   * forfait 6% (beleggen), tarief 36%. Gebruiker/Will kan met eigen
   * formule afwijken; dit is een gemak-helper.
   */
  box3: (grondslag, forfait, tarief) =>
    Math.max(0, grondslag) * forfait * tarief,
  pow: Math.pow,
  sqrt: Math.sqrt,
  min: Math.min,
  max: Math.max,
  abs: Math.abs,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  /** Ternair als functie: if(cond, a, b). cond != 0 → a, anders b. */
  if: (cond, a, b) => (cond ? a : b),
}

export interface EvaluatedCell {
  outputKey: string
  scenarioKey: string
  value: number | null
  error?: string
}

export interface CalculatorResult {
  /** value[scenarioKey][outputKey] = number | null. */
  values: Record<string, Record<string, number | null>>
  cells: EvaluatedCell[]
  /** Winnende scenario-key volgens compare, of null. */
  winner: string | null
  errors: string[]
}

/**
 * Evalueer een calculator-definitie met de huidige input-waarden +
 * prefill-data. Per (scenario × output) wordt de formule veilig
 * geëvalueerd. Fouten worden per cel afgevangen.
 */
export function evaluateCalculator(
  definition: CalculatorDefinition,
  inputValues: Record<string, number>,
  prefill: PrefillValues,
): CalculatorResult {
  const values: Record<string, Record<string, number | null>> = {}
  const cells: EvaluatedCell[] = []
  const errors: string[] = []

  for (const scenario of definition.scenarios) {
    values[scenario.key] = {}
    for (const output of definition.outputs) {
      const scope: Record<string, unknown> = {
        ...prefill,
        ...inputValues,
        scenario: scenario.key,
        ...WHITELIST_FNS,
      }
      let value: number | null = null
      let error: string | undefined
      try {
        const expr = parser.parse(output.formula)
        const raw = expr.evaluate(scope as Record<string, number>)
        if (typeof raw === 'number' && Number.isFinite(raw)) {
          value = raw
        } else {
          error = 'Formule gaf geen geldig getal'
        }
      } catch (e) {
        error = e instanceof Error ? e.message : 'Onbekende formule-fout'
      }
      values[scenario.key][output.key] = value
      cells.push({ outputKey: output.key, scenarioKey: scenario.key, value, error })
      if (error) {
        errors.push(`${scenario.label} · ${output.label}: ${error}`)
      }
    }
  }

  // Bepaal winnaar op de compare-output.
  let winner: string | null = null
  if (definition.compare) {
    const { outputKey, betterDirection } = definition.compare
    let best: { key: string; v: number } | null = null
    for (const scenario of definition.scenarios) {
      const v = values[scenario.key]?.[outputKey]
      if (v == null || !Number.isFinite(v)) continue
      if (
        best == null ||
        (betterDirection === 'higher' ? v > best.v : v < best.v)
      ) {
        best = { key: scenario.key, v }
      }
    }
    winner = best?.key ?? null
  }

  return { values, cells, winner, errors }
}

/**
 * Resolveer de start-input-waarden: prefill-key indien aanwezig in de
 * data, anders de gedefinieerde default.
 */
export function resolveInitialInputs(
  definition: CalculatorDefinition,
  prefill: PrefillValues,
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const input of definition.inputs) {
    if (input.prefill && prefill[input.prefill] != null) {
      out[input.key] = prefill[input.prefill]
    } else {
      out[input.key] = input.default
    }
  }
  return out
}

/**
 * Statische validatie: controleert dat elke formule alleen verwijst naar
 * bekende namen (inputs, prefill-keys, scenario, whitelisted fns). Geeft
 * een lijst van onbekende namen terug (leeg = ok). Gebruikt door de
 * builder om hallucinerende formules vroeg te vangen.
 */
export function validateFormulas(
  definition: CalculatorDefinition,
  prefillKeySet: Set<string>,
): string[] {
  const knownNames = new Set<string>([
    'scenario',
    ...Object.keys(WHITELIST_FNS),
    ...prefillKeySet,
    ...definition.inputs.map((i) => i.key),
  ])
  const unknown = new Set<string>()
  for (const output of definition.outputs) {
    let vars: string[] = []
    try {
      vars = parser.parse(output.formula).variables({ withMembers: false })
    } catch {
      unknown.add(`${output.key}: parse-fout`)
      continue
    }
    for (const v of vars) {
      if (!knownNames.has(v)) unknown.add(v)
    }
  }
  return Array.from(unknown)
}
