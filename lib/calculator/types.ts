import { z } from 'zod'

/**
 * Normaliseer LLM-output naar strikte snake_case. Modellen genereren soms
 * `kebab-case`, `camelCase` of beginnen met een hoofdletter / cijfer; we
 * converteren stil i.p.v. te falen, zodat een prima definitie niet door
 * een schoonheidsfout van het model afketst.
 */
function normalizeKey(raw: string): string {
  const normalized = raw
    .replace(/[\s-]+/g, '_')                       // spaties + kebab → _
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')        // camelCase → snake_case
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')                    // overige tekens weg
    .replace(/^[^a-z]+/, '')                       // start letter afdwingen
  return normalized.length > 0 ? normalized : 'k'
}

const KeyString = z
  .string()
  .min(1)
  .transform(normalizeKey)
  .refine((s) => /^[a-z][a-z0-9_]*$/.test(s), {
    message: 'key moet (na normalisatie) snake_case zijn',
  })

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
  key: KeyString.describe('Sleutel in snake_case die in formules wordt gebruikt, bv. "mortgage_rate"'),
  label: z.string().min(1).describe('Leesbaar Nederlands label voor de slider/input'),
  kind: z.enum(INPUT_KINDS).describe('Type waarde: euro, percent (fractie 0-1), years of number'),
  default: z.number().describe('Startwaarde als terugval wanneer prefill niet beschikbaar is'),
  prefill: z.string().optional().describe('Optionele key uit de gebruikersdata-whitelist; onbekende keys worden genegeerd'),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
})
export type CalculatorInput = z.infer<typeof CalculatorInputSchema>

// ── Scenario's ───────────────────────────────────────────────────

export const CalculatorScenarioSchema = z.object({
  key: KeyString.describe('Sleutel in snake_case, vergelijkbaar in formules via if(scenario == "x", ...)'),
  label: z.string().min(1).describe('Nederlands label voor de scenario-tab'),
})
export type CalculatorScenario = z.infer<typeof CalculatorScenarioSchema>

// ── Outputs ──────────────────────────────────────────────────────

export const OUTPUT_FORMATS = ['euro', 'percent', 'years', 'number'] as const
export type OutputFormat = (typeof OUTPUT_FORMATS)[number]

export const CalculatorOutputSchema = z.object({
  key: KeyString,
  label: z.string().min(1).describe('Nederlands label voor de output-waarde'),
  formula: z
    .string()
    .min(1)
    .max(500)
    .describe(
      'Wiskundige expressie zonder code. Mag verwijzen naar input-keys, prefill-keys, "scenario" en whitelisted functies (compound, annuity, fvAnnuity, box3, pow, sqrt, min, max, abs, round, floor, ceil, if).',
    ),
  format: z.enum(OUTPUT_FORMATS).describe('Hoe de uitkomst gepresenteerd wordt'),
  unit: z.string().optional(),
})
export type CalculatorOutput = z.infer<typeof CalculatorOutputSchema>

// ── Definitie ────────────────────────────────────────────────────

export const CalculatorDefinitionSchema = z.object({
  name: z.string().min(1).max(120).describe('Korte Nederlandse titel van de rekenhulp'),
  description: z.string().max(400).optional().describe('Eén à twee zinnen die uitleggen wat de hulp berekent'),
  inputs: z.array(CalculatorInputSchema).min(1).max(12).describe('Tussen 1 en 12 invoervelden'),
  scenarios: z.array(CalculatorScenarioSchema).min(1).max(4).describe('1 tot 4 scenario-tabs, bv. "Aflossen" en "Beleggen"'),
  outputs: z.array(CalculatorOutputSchema).min(1).max(8).describe('1 tot 8 berekende uitkomsten'),
  compare: z
    .object({
      outputKey: z.string().describe('De output-key die wordt vergeleken tussen scenarios'),
      betterDirection: z.enum(['higher', 'lower']).describe('Welke richting wint: hoger of lager'),
    })
    .optional()
    .describe('Optioneel: welke output bepaalt de "keuze" tussen scenarios'),
  assumptions: z
    .array(z.string())
    .max(10)
    .optional()
    .describe('Documenteer gebruikte aannames (tarieven, vereenvoudigingen)'),
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
