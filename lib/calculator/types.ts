import { z } from 'zod'

/**
 * Rekenhulp — CalculatorDefinition.
 *
 * Will (de AI-coach) produceert een CalculatorDefinition als JSON, nooit
 * uitvoerbare code. De definitie beschrijft invoervelden (optioneel
 * voorgevuld met gebruikersdata), één of meer scenario's, en outputs als
 * wiskundige formules. De formules worden veilig geëvalueerd door
 * `lib/calculator/evaluate.ts` (expr-eval sandbox, geen JS-eval).
 *
 * Deze definitie is de durable artifact: hij wordt opgeslagen in de
 * `custom_calculators`-tabel (JSONB) en blijft herbruikbaar/aanpasbaar.
 */

// ── Input-velden ─────────────────────────────────────────────────

export const INPUT_KINDS = ['euro', 'percent', 'years', 'number'] as const
export type InputKind = (typeof INPUT_KINDS)[number]

export const CalculatorInputSchema = z.object({
  /** Sleutel die in formules wordt gebruikt (snake_case, geen spaties). */
  key: z
    .string()
    .regex(/^[a-z][a-z0-9_]*$/, 'key moet snake_case zijn (a-z, 0-9, _)'),
  /** Leesbaar label voor de slider/input. */
  label: z.string().min(1),
  kind: z.enum(INPUT_KINDS),
  /** Startwaarde wanneer er geen prefill is (of prefill ontbreekt in data). */
  default: z.number(),
  /**
   * Optionele prefill uit gebruikersdata. Moet een bekende key zijn uit
   * `PREFILL_KEYS` (lib/calculator/user-data-keys.ts). Onbekende keys
   * worden genegeerd en vallen terug op `default`.
   */
  prefill: z.string().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
})
export type CalculatorInput = z.infer<typeof CalculatorInputSchema>

// ── Scenario's ───────────────────────────────────────────────────

export const CalculatorScenarioSchema = z.object({
  /** Sleutel beschikbaar als `scenario` in formules (string-vergelijking). */
  key: z.string().regex(/^[a-z][a-z0-9_]*$/),
  label: z.string().min(1),
})
export type CalculatorScenario = z.infer<typeof CalculatorScenarioSchema>

// ── Outputs ──────────────────────────────────────────────────────

export const OUTPUT_FORMATS = ['euro', 'percent', 'years', 'number'] as const
export type OutputFormat = (typeof OUTPUT_FORMATS)[number]

export const CalculatorOutputSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]*$/),
  label: z.string().min(1),
  /**
   * Wiskundige expressie. Mag verwijzen naar: input-keys, prefill-keys,
   * `scenario` (string), en whitelisted functies (compound, annuity,
   * box3drag, pow, min, max, round, abs, sqrt, if).
   */
  formula: z.string().min(1),
  format: z.enum(OUTPUT_FORMATS).default('number'),
  unit: z.string().optional(),
})
export type CalculatorOutput = z.infer<typeof CalculatorOutputSchema>

// ── Definitie ────────────────────────────────────────────────────

export const CalculatorDefinitionSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(400).optional(),
  inputs: z.array(CalculatorInputSchema).max(12),
  scenarios: z.array(CalculatorScenarioSchema).min(1).max(4),
  outputs: z.array(CalculatorOutputSchema).min(1).max(8),
  /** Welke output bepaalt de "keuze" + in welke richting beter is. */
  compare: z
    .object({
      outputKey: z.string(),
      betterDirection: z.enum(['higher', 'lower']),
    })
    .optional(),
  /** Will documenteert hier zijn aannames (tarieven, vereenvoudigingen). */
  assumptions: z.array(z.string()).max(10).default([]),
})
export type CalculatorDefinition = z.infer<typeof CalculatorDefinitionSchema>

// ── Persisted row ────────────────────────────────────────────────

export interface CustomCalculatorRow {
  id: string
  name: string
  description: string | null
  definition: CalculatorDefinition
  created_by_ai: boolean
  sort_order: number
  created_at: string
}
