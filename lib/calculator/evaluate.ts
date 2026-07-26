import { Parser } from './safe-eval'
import type { CalculatorDefinition } from './types'
import type { PrefillValues } from './user-data-keys'

/**
 * Rekenhulp — veilige formule-evaluator.
 *
 * Gebruikt de in-house `safe-eval` parser (pure math-parser, GEEN JS-eval /
 * code-exec, GEEN member-access). Een formule heeft alleen toegang tot:
 *   - input-waarden (de actuele slider-stand)
 *   - voorgevulde gebruikersdata (PrefillValues)
 *   - de actieve scenario-key als string-constante `scenario`
 *   - een whitelisted set financiële functies (zie WHITELIST_FNS)
 *
 * De evaluator blokkeert toegang tot globals (process/global/constructor) by
 * construction: er is geen `.`-operator en opzoekingen gaan uitsluitend via
 * hasOwnProperty. Onbekende namen gooien "undefined variable". We vangen dat
 * af en leveren een nette foutmelding per output i.p.v. de hele evaluatie te
 * laten crashen.
 */

// Eén Parser-instance volstaat; parse() is stateless.
const parser = new Parser()

/**
 * Whitelisted financiële + wiskundige helperfuncties.
 *
 * LET OP — dit is NIET de volledige set beschikbare functies. De safe-eval
 * parser kent een tweede, altijd-actieve laag `BUILTINS` (zie
 * `lib/calculator/safe-eval.ts`): een vaste tabel generieke numerieke
 * functies (log/ln/log2/exp/sin/…/pow/min/max/…), 1-op-1 geport uit
 * expr-eval 2.0.2. `resolveFn()` zoekt eerst hier (scope, WHITELIST_FNS) en
 * valt dan terug op die BUILTINS-tabel; `validateFormulas` filtert diezelfde
 * namen uit `variables()` (via safe-eval's EXCLUDED_NAMES), zodat bv.
 * `log(...)` in een prefab NIET als "onbekende variabele" wordt gezien.
 * Een formule die alleen BUILTINS gebruikt (zoals de prefab
 * `eerder-met-pensioen`, die `log` aanroept) is dus geldig en veilig zonder
 * hier iets toe te voegen. WHITELIST_FNS bevat enkel de TriFinity-specifieke
 * financiële helpers die expr-eval niet kent.
 */
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
   * forfait 6% (beleggen), tarief 36%. Gebruiker/Fin kan met eigen
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

export type ApplicabilityStatus = 'yes' | 'maybe' | 'no'

export interface ScenarioApplicability {
  status: ApplicabilityStatus
  /** Ruwe formule-uitkomst voor debug; 1=yes, 0.5=maybe, 0=no. */
  raw: number | null
  reason?: string
}

export interface EvaluatedDerived {
  key: string
  label: string
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
  /** Afgeleide context-rijen, berekend op het eerste scenario. */
  derived: EvaluatedDerived[]
  /** Per scenario: van-toepassing-status. Leeg als geen appliesWhen
   *  is gedefinieerd op een scenario. */
  applicability: Record<string, ScenarioApplicability>
  /** Geïnterpoleerde narrative (placeholders ingevuld) of null. */
  narrative: string | null
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

  // Derived = benoemde tussenwaarden (vergelijkbaar met `let`-bindings):
  // berekend uit inputs/prefill/scenario + eerdere derived, en daarna
  // beschikbaar in de output-scope. Ze worden dus PER SCENARIO en VÓÓR
  // de outputs geëvalueerd. De context-strook in de UI toont de waarden
  // van het eerste scenario (zie `derived` hieronder).
  const derivedDefs = definition.derived ?? []
  // Per-scenario derived-waarden, zodat scenario-afhankelijke derived
  // (bv. via if(scenario==..)) correct doorwerken in de outputs.
  const derivedByScenario: Record<string, Record<string, number | null>> = {}

  for (const scenario of definition.scenarios) {
    values[scenario.key] = {}
    // Scope leeft per scenario; eerst derived, dan outputs worden hierin
    // toegevoegd zodat latere formules ernaar kunnen verwijzen.
    const scope: Record<string, unknown> = {
      ...prefill,
      ...inputValues,
      scenario: scenario.key,
      ...WHITELIST_FNS,
    }

    // PASS 0: derived in definition-volgorde. Elke derived mag verwijzen
    // naar inputs, prefill, scenario en EERDERE derived — niet naar
    // outputs (die bestaan nog niet). Resultaat gaat in scope.
    const scenarioDerived: Record<string, number | null> = {}
    for (const row of derivedDefs) {
      let value: number | null = null
      let error: string | undefined
      try {
        const raw = parser.parse(row.formula).evaluate(scope as Record<string, number>)
        if (typeof raw === 'number' && Number.isFinite(raw)) {
          value = raw
          scope[row.key] = raw
        } else {
          error = 'Formule gaf geen geldig getal'
        }
      } catch (e) {
        error = e instanceof Error ? e.message : 'Onbekende formule-fout'
      }
      scenarioDerived[row.key] = value
      // Fouten op derived rapporteren we alleen voor het eerste scenario
      // (zie display-derived hieronder), om duplicate-meldingen te
      // voorkomen wanneer een derived-formule structureel faalt.
    }
    derivedByScenario[scenario.key] = scenarioDerived

    // PASS 1: outputs in dependency-volgorde, vul scope. Outputs zien nu
    // óók de derived-waarden van dit scenario.
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

  // Derived-display — context-strook toont de waarden van het EERSTE
  // scenario (de strook is niet per-scenario in de UI). De berekening
  // zelf is al per scenario gedaan in de loop hierboven.
  const derived: EvaluatedDerived[] = []
  if (derivedDefs.length > 0) {
    const firstScenario = definition.scenarios[0]
    const firstDerived = firstScenario ? derivedByScenario[firstScenario.key] : undefined
    for (const row of derivedDefs) {
      const value = firstDerived?.[row.key] ?? null
      derived.push({ key: row.key, label: row.label, value })
      if (value === null) {
        errors.push(`Afgeleid · ${row.label}: kon niet berekend worden`)
      }
    }
  }

  // Applicability — per scenario evalueer optionele appliesWhen-formule.
  // Resultaat ≥1 = yes, >0 = maybe, ≤0 = no. Scope is identiek aan de
  // output-scope van dat scenario, plus alle outputs en derived.
  const applicability: Record<string, ScenarioApplicability> = {}
  for (const scenario of definition.scenarios) {
    if (!scenario.appliesWhen) continue
    const scope: Record<string, unknown> = {
      ...prefill,
      ...inputValues,
      scenario: scenario.key,
      ...WHITELIST_FNS,
      ...(derivedByScenario[scenario.key] ?? {}),
      ...values[scenario.key],
    }
    let raw: number | null = null
    let status: ApplicabilityStatus = 'yes'
    try {
      const r = parser.parse(scenario.appliesWhen).evaluate(scope as Record<string, number>)
      if (typeof r === 'number' && Number.isFinite(r)) {
        raw = r
        if (r >= 1) status = 'yes'
        else if (r > 0) status = 'maybe'
        else status = 'no'
      }
    } catch {
      // Formule-fout — laat status op 'yes' staan (failsafe: niet
      // onterecht een scenario verbergen door een fouttje in de
      // appliesWhen-expressie).
    }
    applicability[scenario.key] = {
      status,
      raw,
      reason: status === 'no' ? scenario.notApplicableReason : undefined,
    }
  }

  // Narrative — placeholders invullen op winnaar-context.
  let narrative: string | null = null
  if (definition.narrative) {
    narrative = interpolateNarrative(definition, values, derived, winner)
  }

  return { values, cells, winner, errors, derived, applicability, narrative }
}

/**
 * Vervang placeholders in de narrative-string door geëvalueerde
 * waarden. Ondersteunt:
 *   {winner_label}        — label van het winnende scenario
 *   {compare_output}      — geformatteerde compare-waarde van winnaar
 *   {output:key}          — geformatteerde output van winnaar (of eerste
 *                            scenario als er geen winnaar is)
 *   {derived:key}         — geformatteerde derived-rij
 * Onbekende placeholders blijven staan zodat de gebruiker ze opmerkt.
 */
function interpolateNarrative(
  definition: CalculatorDefinition,
  values: Record<string, Record<string, number | null>>,
  derived: EvaluatedDerived[],
  winner: string | null,
): string {
  const fallbackScenarioKey = winner ?? definition.scenarios[0]?.key ?? ''
  const winnerLabel =
    definition.scenarios.find((s) => s.key === fallbackScenarioKey)?.label ?? ''
  const outputByKey = new Map(definition.outputs.map((o) => [o.key, o]))
  const derivedByKey = new Map(derived.map((d) => [d.key, d]))

  const fmt = (
    value: number | null,
    format: 'euro' | 'percent' | 'years' | 'number',
  ): string => {
    if (value == null) return '—'
    if (format === 'euro') {
      const sign = value < 0 ? '−' : ''
      return `${sign}€${Math.round(Math.abs(value)).toLocaleString('nl-NL')}`
    }
    if (format === 'percent') return `${(value * 100).toFixed(1)}%`
    if (format === 'years') {
      const y = Math.floor(value)
      const m = Math.round((value - y) * 12)
      return m === 0 ? `${y} jr` : `${y} jr ${m} mnd`
    }
    return Math.round(value).toLocaleString('nl-NL')
  }

  return definition.narrative!.replace(
    /\{(winner_label|compare_output|output:[a-z][a-z0-9_]*|derived:[a-z][a-z0-9_]*)\}/g,
    (_match, token: string) => {
      if (token === 'winner_label') return winnerLabel
      if (token === 'compare_output') {
        if (!definition.compare) return ''
        const out = outputByKey.get(definition.compare.outputKey)
        if (!out) return ''
        const v = values[fallbackScenarioKey]?.[out.key] ?? null
        return fmt(v, out.format)
      }
      if (token.startsWith('output:')) {
        const key = token.slice('output:'.length)
        const out = outputByKey.get(key)
        if (!out) return `{${token}}`
        const v = values[fallbackScenarioKey]?.[key] ?? null
        return fmt(v, out.format)
      }
      if (token.startsWith('derived:')) {
        const key = token.slice('derived:'.length)
        const d = derivedByKey.get(key)
        if (!d) return `{${token}}`
        const row = definition.derived?.find((r) => r.key === key)
        return fmt(d.value, row?.format ?? 'number')
      }
      return `{${token}}`
    },
  )
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
  const derivedKeys = new Set((definition.derived ?? []).map((d) => d.key))
  const knownNames = new Set<string>([
    'scenario',
    ...Object.keys(WHITELIST_FNS),
    ...prefillKeySet,
    ...definition.inputs.map((i) => i.key),
    // Outputs mogen naar elkaar verwijzen (intermediate results). Cyclisch
    // is alsnog verboden — zie cycle-check hieronder.
    ...outputKeys,
    // Derived rows zijn ook beschikbaar in andere derived/output/appliesWhen-
    // formules. Geen cycle-check op derived: de evaluator gebruikt
    // definition-volgorde voor derived.
    ...derivedKeys,
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

  // Derived-formules worden VÓÓR de outputs geëvalueerd (ze zijn
  // benoemde tussenwaarden die outputs mogen gebruiken). Daarom mogen
  // derived-formules NIET naar output-keys verwijzen — die bestaan op
  // dat moment nog niet in scope. Toegestaan: inputs, prefill, scenario,
  // en andere derived-keys (definition-volgorde; geen cycle-check).
  const derivedKnownNames = new Set<string>([
    'scenario',
    ...Object.keys(WHITELIST_FNS),
    ...prefillKeySet,
    ...definition.inputs.map((i) => i.key),
    ...derivedKeys,
  ])
  for (const row of definition.derived ?? []) {
    let vars: string[] = []
    try {
      vars = parser.parse(row.formula).variables({ withMembers: false })
    } catch {
      unknown.add(`${row.key}: parse-fout`)
      continue
    }
    for (const v of vars) {
      if (derivedKnownNames.has(v)) continue
      // Een output-key in een derived-formule is een specifieke,
      // begrijpelijke fout — geef een gerichte melding i.p.v. de
      // variabele als "onbekend" te bestempelen.
      if (outputKeys.has(v)) {
        unknown.add(
          `${row.key}: derived mag niet naar output '${v}' verwijzen (outputs worden ná derived berekend)`,
        )
      } else {
        unknown.add(v)
      }
    }
  }

  // appliesWhen per scenario: check op onbekende namen. Mag verwijzen
  // naar alles: inputs, outputs, derived, prefill, scenario-constante.
  for (const scenario of definition.scenarios) {
    if (!scenario.appliesWhen) continue
    let vars: string[] = []
    try {
      vars = parser.parse(scenario.appliesWhen).variables({ withMembers: false })
    } catch {
      unknown.add(`${scenario.key}.appliesWhen: parse-fout`)
      continue
    }
    for (const v of vars) {
      if (!knownNames.has(v)) unknown.add(v)
    }
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

/**
 * Statische validatie van de narrative-string: controleert dat elke
 * `{output:key}`/`{derived:key}`-placeholder verwijst naar een bestaande
 * output- resp. derived-key. Geeft een lijst van onbekende placeholders
 * terug (leeg = ok). Gebruikt door de builder om hallucinerende
 * narrative-referenties vroeg te vangen — analoog aan validateFormulas.
 *
 * Achtergrond: interpolateNarrative laat een onbekende placeholder op
 * runtime BEWUST letterlijk staan (fail-visible-by-design, zie regel 316).
 * Deze functie vangt zo'n hallucinatie al aan de generatie-poort af, zodat
 * de gebruiker nooit een rauwe `{output:...}` te zien krijgt.
 *
 * BELANGRIJK: gebruikt EXACT dezelfde placeholder-regex als
 * interpolateNarrative (regel 349). Wijk je hiervan af, dan lopen
 * validatie en runtime uiteen (valse negatieven/positieven).
 */
export function validateNarrative(definition: CalculatorDefinition): string[] {
  if (!definition.narrative) return []
  const outputKeys = new Set(definition.outputs.map((o) => o.key))
  const derivedKeys = new Set((definition.derived ?? []).map((d) => d.key))
  const unknown = new Set<string>()
  const re =
    /\{(winner_label|compare_output|output:[a-z][a-z0-9_]*|derived:[a-z][a-z0-9_]*)\}/g
  let match: RegExpExecArray | null
  while ((match = re.exec(definition.narrative)) !== null) {
    const token = match[1]
    if (token.startsWith('output:')) {
      const key = token.slice('output:'.length)
      if (!outputKeys.has(key)) unknown.add(`{output:${key}}`)
    } else if (token.startsWith('derived:')) {
      const key = token.slice('derived:'.length)
      if (!derivedKeys.has(key)) unknown.add(`{derived:${key}}`)
    }
  }
  return Array.from(unknown)
}
