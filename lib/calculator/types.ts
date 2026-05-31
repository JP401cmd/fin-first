import { z } from 'zod'

/**
 * OPMAAK-LOCK: dit schema bevat UITSLUITEND logica-velden. Geen icon,
 * color, layout, sectionOrder, theme of vergelijkbare velden — die zijn
 * een framework-verantwoordelijkheid (de TriFinity-UI bepaalt opmaak
 * deterministisch op basis van module en type). AI-generatie moet
 * opmaak-verzoeken negeren; eventuele extra velden vanuit een LLM
 * worden door Zod stilzwijgend afgekapt.
 */

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
 * `lib/calculator/evaluate.ts` (in-house safe-eval, geen JS-eval / member-access).
 *
 * Deze definitie is de durable artifact: hij wordt opgeslagen in de
 * `custom_calculators`-tabel (JSONB) en blijft herbruikbaar/aanpasbaar.
 */

// ── Input-velden ─────────────────────────────────────────────────

export const INPUT_KINDS = [
  'euro',
  'percent',
  'years',
  'number',
  'boolean',
  'enum',
] as const
export type InputKind = (typeof INPUT_KINDS)[number]

/** Optie binnen een enum-input. Waarde is numeriek zodat formules
 *  natuurlijk vergelijken: `if(rental_type == 1, ..., ...)`. */
const CalculatorInputOptionSchema = z.object({
  value: z.number().describe('Numerieke waarde (gebruik in formules, bv. 0/1 of 1/2/3)'),
  label: z.string().min(1).describe('Nederlands label voor de keuze-knop'),
  hint: z.string().optional().describe('Korte verduidelijking onder het label'),
})
export type CalculatorInputOption = z.infer<typeof CalculatorInputOptionSchema>

export const CalculatorInputSchema = z.object({
  key: KeyString.describe('Sleutel in snake_case die in formules wordt gebruikt, bv. "mortgage_rate"'),
  label: z.string().min(1).describe('Leesbaar Nederlands label voor de slider/input'),
  kind: z.enum(INPUT_KINDS).describe(
    'Type waarde: euro, percent (fractie 0-1), years, number, boolean (0/1) of enum (numerieke keuze)',
  ),
  default: z.number().describe('Startwaarde als terugval wanneer prefill niet beschikbaar is'),
  prefill: z.string().optional().describe('Optionele key uit de gebruikersdata-whitelist; onbekende keys worden genegeerd'),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  hint: z.string().optional().describe('Korte uitleg/disclaimer onder de slider (max 1 zin)'),
  options: z
    .array(CalculatorInputOptionSchema)
    .optional()
    .describe('Verplicht bij kind="enum": lijst van keuze-opties (2-5)'),
  relevantFor: z
    .array(z.string())
    .optional()
    .describe(
      'Optionele lijst van scenario-keys waarvoor dit veld relevant is. Bij scenarios buiten deze lijst markeert de UI het veld als minder relevant.',
    ),
})
export type CalculatorInput = z.infer<typeof CalculatorInputSchema>

// ── Scenario's ───────────────────────────────────────────────────

export const CalculatorScenarioSchema = z.object({
  key: KeyString.describe('Sleutel in snake_case, vergelijkbaar in formules via if(scenario == "x", ...)'),
  label: z.string().min(1).describe('Nederlands label voor de scenario-tab'),
  description: z
    .string()
    .max(280)
    .optional()
    .describe('1-2 zinnen die het scenario uitleggen (verschijnt onder de tab-keuze)'),
  appliesWhen: z
    .string()
    .max(300)
    .optional()
    .describe(
      'Optionele formule die de toepasbaarheid van dit scenario uitdrukt: 1 = van toepassing, 0.5 = wellicht, 0 = niet van toepassing. Mag dezelfde namen gebruiken als output-formules.',
    ),
  notApplicableReason: z
    .string()
    .max(240)
    .optional()
    .describe('Toon deze reden wanneer appliesWhen ≤ 0 evalueert.'),
})
export type CalculatorScenario = z.infer<typeof CalculatorScenarioSchema>

// ── Outputs ──────────────────────────────────────────────────────

export const OUTPUT_FORMATS = ['euro', 'percent', 'years', 'number'] as const
export type OutputFormat = (typeof OUTPUT_FORMATS)[number]

export const OUTPUT_STYLES = ['normal', 'subtotal', 'total', 'warn', 'good'] as const
export type OutputStyle = (typeof OUTPUT_STYLES)[number]

export const CalculatorOutputSchema = z.object({
  key: KeyString,
  label: z.string().min(1).describe('Nederlands label voor de output-waarde'),
  formula: z
    .string()
    .min(1)
    .max(300)
    .describe(
      'Wiskundige expressie zonder code. Mag verwijzen naar input-keys, prefill-keys, "scenario" en whitelisted functies (compound, annuity, fvAnnuity, box3, pow, sqrt, min, max, abs, round, floor, ceil, if).',
    ),
  format: z.enum(OUTPUT_FORMATS).describe('Hoe de uitkomst gepresenteerd wordt'),
  unit: z.string().optional(),
  section: z
    .string()
    .max(60)
    .optional()
    .describe('Optionele groepskop voor de breakdown (bv. "Kosten", "Belasting", "Voordelen")'),
  style: z
    .enum(OUTPUT_STYLES)
    .optional()
    .describe(
      'Visuele weging: normal | subtotal | total | warn (rood, negatief) | good (groen, positief)',
    ),
  hint: z
    .string()
    .max(160)
    .optional()
    .describe('Korte inline uitleg onder de waarde'),
})
export type CalculatorOutput = z.infer<typeof CalculatorOutputSchema>

// ── Afgeleide context-rijen ──────────────────────────────────────
//
// Een "derived" is geen output maar een tussenresultaat dat de UI
// toont als context-strook tussen inputs en outputs — bv. "Totale
// huur per jaar = €18.000" of "+€11.367 boven vrijstellingsgrens".
// Niet vergelijkbaar tussen scenarios; berekend op het eerste
// scenario (of het scenario dat de actieve tab toont).

export const CalculatorDerivedSchema = z.object({
  key: KeyString.describe('Sleutel — mag in latere derived/output-formules gebruikt worden'),
  label: z.string().min(1).describe('Nederlands label, bv. "Totale huur per jaar"'),
  formula: z.string().min(1).max(300),
  format: z.enum(OUTPUT_FORMATS).describe('euro / percent / years / number'),
  hint: z
    .string()
    .max(160)
    .optional()
    .describe('Inline duiding, bv. "boven vrijstellingsgrens"'),
})
export type CalculatorDerived = z.infer<typeof CalculatorDerivedSchema>

// ── Definitie ────────────────────────────────────────────────────
//
// Belangrijk: Anthropic's Claude-API ondersteunt geen `maxItems` op
// JSON-schema arrays (rejected met HTTP 400). Zod's `.max(n)` op een
// array serialiseert wel naar `maxItems`, dus we vermijden die en
// gebruiken `.refine()` voor de runtime-cap — die wordt niet in het
// JSON-schema gezet maar wel na de parse afgedwongen.

function arrayMax<T extends z.ZodArray<z.ZodTypeAny>>(
  schema: T,
  limit: number,
  label: string,
) {
  return schema.refine((arr) => arr.length <= limit, {
    message: `Maximaal ${limit} ${label}`,
  })
}

export const CalculatorDefinitionSchema = z.object({
  name: z.string().min(1).max(120).describe('Korte Nederlandse titel van de rekenhulp'),
  description: z.string().max(400).optional().describe('Eén à twee zinnen die uitleggen wat de hulp berekent'),
  inputs: arrayMax(z.array(CalculatorInputSchema).min(1), 10, 'inputs').describe(
    'Tussen 1 en 10 invoervelden',
  ),
  derived: arrayMax(z.array(CalculatorDerivedSchema), 6, 'derived')
    .optional()
    .describe(
      'Optionele context-strook tussen inputs en outputs: tussenresultaten zoals "Totale huur per jaar" of "Boven vrijstellingsgrens". Niet vergelijkbaar tussen scenarios.',
    ),
  scenarios: arrayMax(
    z.array(CalculatorScenarioSchema).min(1),
    8,
    'scenarios',
  ).describe('1 tot 8 scenario-tabs, bv. "Aflossen" en "Beleggen"'),
  outputs: arrayMax(z.array(CalculatorOutputSchema).min(1), 8, 'outputs').describe(
    '1 tot 8 berekende uitkomsten',
  ),
  compare: z
    .object({
      outputKey: z.string().describe('De output-key die wordt vergeleken tussen scenarios'),
      betterDirection: z.enum(['higher', 'lower']).describe('Welke richting wint: hoger of lager'),
    })
    .optional()
    .describe('Optioneel: welke output bepaalt de "keuze" tussen scenarios'),
  narrative: z
    .string()
    .max(280)
    .optional()
    .describe(
      'Eén zin als samenvatting/pull-quote bovenaan het resultaat. Mag placeholders gebruiken: {winner_label}, {compare_output} en {output:key} voor outputs van het winnende scenario.',
    ),
  assumptions: arrayMax(z.array(z.string()), 10, 'aannames')
    .optional()
    .describe('Documenteer gebruikte aannames (tarieven, vereenvoudigingen)'),
})
export type CalculatorDefinition = z.infer<typeof CalculatorDefinitionSchema>

// ── Stored / legacy variant ──────────────────────────────────────
//
// Calculators uit de DB kunnen ruimer zijn dan de huidige strikte caps:
// pre-MVP-rijen werden gegenereerd onder `inputs.max(12)`, `outputs.max(8)`,
// `formula.max(500)`. We willen die oude rijen niet hardhandig blokkeren
// bij read-only paden (publish-source, duplicate-source, refineFrom-input).
//
// `StoredCalculatorDefinitionSchema` gebruikt daarom ruimere caps die de
// historische limieten plus marge omvatten. Nieuwe AI-output blijft door
// de strikte `CalculatorDefinitionSchema` gevalideerd worden.

const StoredCalculatorOutputSchema = CalculatorOutputSchema.extend({
  formula: z.string().min(1).max(1000),
})

export const StoredCalculatorDefinitionSchema = CalculatorDefinitionSchema.extend({
  inputs: z.array(CalculatorInputSchema).min(1).max(20),
  outputs: z.array(StoredCalculatorOutputSchema).min(1).max(12),
  scenarios: z.array(CalculatorScenarioSchema).min(1).max(10),
  derived: z.array(CalculatorDerivedSchema).max(10).optional(),
})
export type StoredCalculatorDefinition = z.infer<
  typeof StoredCalculatorDefinitionSchema
>

// ── Persisted row ────────────────────────────────────────────────

export interface CustomCalculatorRow {
  id: string
  name: string
  description: string | null
  definition: CalculatorDefinition
  created_by_ai: boolean
  sort_order: number
  created_at: string
  // ── Bibliotheek-velden (migratie 20260529100000) ───────────────
  // Velden zijn `nullable`/optional zodat bestaande selects zonder
  // de nieuwe kolommen blijven werken (oudere code in rekenhulp-view
  // selecteert maar een subset). Counter-velden zijn synchroon
  // gehouden door DB-triggers (zie sync_calculator_like_count).
  is_public?: boolean
  published_at?: string | null
  forked_from?: string | null
  like_count?: number
  duplicate_count?: number
}
