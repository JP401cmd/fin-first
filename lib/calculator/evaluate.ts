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

  // Topologische sortering van outputs: een output kan verwijzen naar
  // andere outputs (intermediate results). We bouwen één keer een
  // afhankelijkheidsgrafiek + sorteer-volgorde — voor alle scenarios
  // identiek (formules zijn statisch). Bij een cyclus vallen we
  // gracieus terug op de definition-volgorde; validateFormulas zou de
  // cyclus aan publish-/build-tijd al gevangen moeten hebben.
  const outputKeys = new Set(definition.outputs.map((o) => o.key))
  const outputByKey = new Map(definition.outputs.map((o) => [o.key, o]))
  const sortedKeys = topoSortOutputs(definition, outputKeys)

  for (const scenario of definition.scenarios) {
    values[scenario.key] = {}
    // Scope leeft per scenario; eerder berekende outputs worden hierin
    // toegevoegd zodat latere outputs ernaar kunnen verwijzen.
    const scope: Record<string, unknown> = {
      ...prefill,
      ...inputValues,
      scenario: scenario.key,
      ...WHITELIST_FNS,
    }

    // PASS 1: evalueer in dependency-volgorde, vul scope.
    const scenarioValues = new Map<string, number | null>()
    const scenarioErrors = new Map<string, string | undefined>()
    for (const outputKey of sortedKeys) {
      const output = outputByKey.get(outputKey)
      if (!output) continue
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
      scenarioValues.set(outputKey, value)
      scenarioErrors.set(outputKey, error)
      if (value !== null) {
        scope[outputKey] = value
      }
    }

    // PASS 2: emit cells in definition.outputs-volgorde voor stabiele UI.
    for (const output of definition.outputs) {
      const value = scenarioValues.get(output.key) ?? null
      const error = scenarioErrors.get(output.key)
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
 * Topologische sortering van outputs op basis van hun onderlinge
 * formule-afhankelijkheden. Bij een cyclus (zou validateFormulas moeten
 * vangen) of parse-fout valt elke onbereikbare output terug op zijn
 * definition-positie — evaluatie produceert dan gewoon een formule-fout
 * i.p.v. te crashen.
 */
function topoSortOutputs(
  definition: CalculatorDefinition,
  outputKeys: Set<string>,
): string[] {
  const deps = new Map<string, Set<string>>()
  for (const output of definition.outputs) {
    const set = new Set<string>()
    try {
      const vars = parser.parse(output.formula).variables({ withMembers: false })
      for (const v of vars) {
        if (outputKeys.has(v) && v !== output.key) set.add(v)
      }
    } catch {
      // Geen deps op parse-fout — output zal later falen tijdens evaluate.
    }
    deps.set(output.key, set)
  }

  const sorted: string[] = []
  const visited = new Set<string>()
  const visiting = new Set<string>()
  const visit = (key: string) => {
    if (visited.has(key)) return
    if (visiting.has(key)) return // cyclus → skip; dependents falen later
    visiting.add(key)
    for (const dep of deps.get(key) ?? []) visit(dep)
    visiting.delete(key)
    visited.add(key)
    sorted.push(key)
  }
  for (const output of definition.outputs) visit(output.key)
  return sorted
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
  const outputKeys = new Set(definition.outputs.map((o) => o.key))
  const knownNames = new Set<string>([
    'scenario',
    ...Object.keys(WHITELIST_FNS),
    ...prefillKeySet,
    ...definition.inputs.map((i) => i.key),
    // Outputs mogen naar elkaar verwijzen (intermediate results). Cyclisch
    // is alsnog verboden — zie cycle-check hieronder.
    ...outputKeys,
  ])

  const unknown = new Set<string>()
  const deps = new Map<string, Set<string>>()

  for (const output of definition.outputs) {
    let vars: string[] = []
    try {
      vars = parser.parse(output.formula).variables({ withMembers: false })
    } catch {
      unknown.add(`${output.key}: parse-fout`)
      continue
    }
    const outDeps = new Set<string>()
    for (const v of vars) {
      if (!knownNames.has(v)) {
        unknown.add(v)
        continue
      }
      if (outputKeys.has(v) && v !== output.key) outDeps.add(v)
    }
    // Zelf-referentie is ook een cyclus (lengte 1).
    if (vars.includes(output.key)) {
      unknown.add(`cyclus: ${output.key} → ${output.key}`)
    }
    deps.set(output.key, outDeps)
  }

  // Cycle-detectie via DFS met 3-state coloring.
  const WHITE = 0
  const GRAY = 1
  const BLACK = 2
  const color = new Map<string, number>()
  for (const k of outputKeys) color.set(k, WHITE)

  const dfs = (node: string, path: string[]): string[] | null => {
    color.set(node, GRAY)
    for (const dep of deps.get(node) ?? []) {
      const c = color.get(dep) ?? WHITE
      if (c === GRAY) {
        const startIdx = path.indexOf(dep)
        const cyclePath =
          startIdx >= 0 ? [...path.slice(startIdx), node, dep] : [dep, node, dep]
        return cyclePath
      }
      if (c === WHITE) {
        const cycle = dfs(dep, [...path, node])
        if (cycle) return cycle
      }
    }
    color.set(node, BLACK)
    return null
  }

  for (const key of outputKeys) {
    if (color.get(key) !== WHITE) continue
    const cycle = dfs(key, [])
    if (cycle) {
      unknown.add(`cyclus: ${cycle.join(' → ')}`)
      break
    }
  }

  return Array.from(unknown)
}
