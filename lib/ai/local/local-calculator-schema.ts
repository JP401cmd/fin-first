// ── Gereduceerd rekenhulp-schema voor het on-device model ───────────────────
//
// `LocalCalculatorDefinitionSchema` is een STRIKTE DEELVERZAMELING van
// `CalculatorDefinitionSchema` (lib/calculator/types.ts). Dat is de kern van het
// ontwerp: omdat elke lokale definitie per constructie óók een geldige canonieke
// definitie is, blijven het opslagcontract (`custom_calculators` JSONB,
// `StoredCalculatorDefinitionSchema`) en de renderer (`CalculatorRunner`,
// `evaluateCalculator`) ongewijzigd geldig. Er is dus geen tweede opslagvorm,
// geen tweede renderpad en geen migratie — alleen een armere generatie.
//
// Wat eruit is, en waarom:
//  - `derived`   — tussenwaarden zijn een extra laag kruisverwijzingen (derived
//                  mag naar inputs/prefill, outputs mogen naar derived, derived
//                  mag NIET naar outputs). Precies het soort regel dat een
//                  2B-model niet vasthoudt, en zonder winst voor een mini-calc.
//  - `narrative` — de `{output:key}`/`{derived:key}`-placeholders moeten naar een
//                  bestaande output wijzen; de cloud-route heeft daar een eigen
//                  validator (`validateNarrative`) én een retry voor nodig.
//  - `compare` + meerdere scenario's — een vergelijking verdubbelt de uitvoer en
//                  vraagt de `scenario`-constante in de formules. Eén scenario.
//  - `appliesWhen`/`notApplicableReason` — hoort bij vergelijken.
//  - `kind: 'enum'`/`'boolean'` + `options` — categorische inputs vragen een
//                  geneste optielijst plus if()-vergelijkingen in de formules.
//
// De caps (≤4 inputs, ≤3 outputs, formule ≤120 tekens) brengen de uitvoer van
// 4.000-7.000 tokens naar ~500-900 — de reden dat dit überhaupt in het
// 8.192-tokenvenster past dat het model IN TOTAAL heeft (in + out samen).
//
// LET OP de rolverdeling van de twee poorten:
//   * dit schema is de poort op de GENERATIE (wat het model mag opleveren);
//   * `CalculatorDefinitionSchema` is de poort op de OPSLAG, en die staat ruimer.
// De deterministische reparatie (local-calculator-repair.ts) mag daardoor een
// ontbrekende variabele als extra input toevoegen en dus bóven de lokale cap
// uitkomen — dat blijft een geldige rekenhulp, en een werkende calc is meer waard
// dan een cap die alleen over de generatie ging.

import { z } from 'zod'
import {
  CalculatorDefinitionSchema,
  type CalculatorDefinition,
} from '@/lib/calculator/types'
import { PREFILL_KEY_SET } from '@/lib/calculator/user-data-keys'

/** Maximaal aantal inputs dat het model zelf mag declareren. */
export const LOCAL_MAX_INPUTS = 4
/** Maximaal aantal outputs. */
export const LOCAL_MAX_OUTPUTS = 3
/** Formules langer dan dit zijn vrijwel altijd een hallucinerende breakdown. */
export const LOCAL_MAX_FORMULA_CHARS = 120
/**
 * Harde bovengrens ná deterministische reparatie. Ruimer dan LOCAL_MAX_INPUTS
 * (reparatie mág inputs toevoegen) maar ruim binnen de canonieke cap van 10 —
 * boven dit aantal is de definitie zo ver van de vraag afgedreven dat een
 * ontbrekende output laten vallen eerlijker is dan doorrepareren.
 */
export const LOCAL_REPAIR_MAX_INPUTS = 6

/**
 * Alleen de continue soorten. `boolean` en `enum` vallen af (zie kop): die
 * vragen een optielijst en if()-vergelijkingen, en dat is niet waar het budget
 * of het model aan toe is.
 */
export const LOCAL_INPUT_KINDS = ['euro', 'percent', 'years', 'number'] as const
export const LOCAL_OUTPUT_FORMATS = ['euro', 'percent', 'years', 'number'] as const

/**
 * Zelfde normalisatie als `normalizeKey` in lib/calculator/types.ts, hier
 * herhaald omdat die niet geëxporteerd is.
 *
 * WAAROM WE HIER AL NORMALISEREN en niet pas bij de canonieke parse: de
 * canonieke `KeyString` normaliseert óók, maar dat gebeurt ná de assemblage. Zou
 * een key daar alsnog van vorm veranderen (`Bedrag` → `bedrag`), dan wijzen de
 * formules — die de oude spelling gebruiken — ineens naar een naam die niet meer
 * bestaat. Door hier te normaliseren krijgt stap 3 de definitieve namen te zien.
 */
export function normalizeLocalKey(raw: string): string {
  const normalized = raw
    .replace(/[\s-]+/g, '_')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .replace(/^[^a-z]+/, '')
  return normalized.length > 0 ? normalized : 'k'
}

const LocalKeyString = z
  .string()
  .min(1)
  .transform(normalizeLocalKey)
  .refine((s) => /^[a-z][a-z0-9_]*$/.test(s), {
    message: 'key moet (na normalisatie) snake_case zijn',
  })

/**
 * `z.coerce.number()` i.p.v. `z.number()`: een klein model schrijft een default
 * met enige regelmaat als string ("1000"). Dat is een schoonheidsfout, geen
 * inhoudelijke fout — en een verse generatie kost lokaal minuten.
 */
const LocalNumber = z.coerce.number().refine(Number.isFinite, {
  message: 'moet een eindig getal zijn',
})

/**
 * Input zonder `options`/`relevantFor`/`min`/`max`/`step`. BEWUST niet `.strict()`:
 * een model dat er ongevraagd een `min` bij zet moet niet de hele run kosten —
 * zod laat onbekende velden vallen en de rest blijft bruikbaar. De strikte poort
 * staat op definitie-niveau, waar `derived`/`narrative`/`compare` wél moeten
 * afketsen (dat zijn geen schoonheidsfouten maar hele features).
 */
export const LocalCalculatorInputSchema = z.object({
  key: LocalKeyString,
  label: z.string().min(1).max(80),
  kind: z.enum(LOCAL_INPUT_KINDS),
  default: LocalNumber,
  prefill: z
    .string()
    .refine((k) => PREFILL_KEY_SET.has(k), { message: 'onbekende prefill-key' })
    .optional(),
})
export type LocalCalculatorInput = z.infer<typeof LocalCalculatorInputSchema>

export const LocalCalculatorOutputSchema = z.object({
  key: LocalKeyString,
  label: z.string().min(1).max(80),
  formula: z.string().min(1).max(LOCAL_MAX_FORMULA_CHARS),
  format: z.enum(LOCAL_OUTPUT_FORMATS),
})
export type LocalCalculatorOutput = z.infer<typeof LocalCalculatorOutputSchema>

/**
 * Het ene scenario. Strikt, want dit object wordt door TypeScript samengesteld
 * en niet door het model — alles wat hier extra in zit, is een programmeerfout.
 */
export const LocalCalculatorScenarioSchema = z
  .object({
    key: LocalKeyString,
    label: z.string().min(1).max(80),
  })
  .strict()

/**
 * De poort op de generatie. `.strict()` is hier essentieel: zonder die vlag
 * zou zod een meegestuurde `derived` of `narrative` stilzwijgend WEGLATEN in
 * plaats van weigeren, en dan zou "het lokale pad levert nooit derived op" een
 * toevallige eigenschap zijn in plaats van een gecontroleerde.
 */
export const LocalCalculatorDefinitionSchema = z
  .object({
    name: z.string().min(1).max(120),
    description: z.string().max(400).optional(),
    inputs: z.array(LocalCalculatorInputSchema).min(1).max(LOCAL_MAX_INPUTS),
    scenarios: z.array(LocalCalculatorScenarioSchema).length(1),
    outputs: z.array(LocalCalculatorOutputSchema).min(1).max(LOCAL_MAX_OUTPUTS),
    assumptions: z.array(z.string().min(1).max(240)).max(4).optional(),
  })
  .strict()
export type LocalCalculatorDefinition = z.infer<typeof LocalCalculatorDefinitionSchema>

/**
 * COMPILE-TIME BEWIJS dat het gereduceerde schema een deelverzameling is.
 * Breekt iemand de subset-relatie (bv. door een eigen `kind` toe te voegen die
 * de canonieke `INPUT_KINDS` niet kent), dan is dat hier een type-fout en niet
 * pas een runtime-verrassing bij het opslaan.
 */
const _subsetGuard: (d: LocalCalculatorDefinition) => CalculatorDefinition = (d) => d
void _subsetGuard

// ── Per-deelstap: wat het model in die ene beurt mag opleveren ───────────────

/** Stap 1 — de grootheden. `prefill` komt pas in stap 2. */
export const LocalStep1InputsSchema = z
  .array(LocalCalculatorInputSchema.omit({ prefill: true }))
  .min(1)
  .max(LOCAL_MAX_INPUTS)

/**
 * Stap 2 — de gesloten keuze. Het schema eist alleen de VORM; of de gekozen key
 * bestaat, wordt hier al afgedwongen via PREFILL_KEY_SET, en of de input bestaat
 * controleert de resolver. Een onbruikbaar paar wordt weggelaten, niet gerepareerd:
 * geen prefill is een prima uitkomst (de default blijft staan).
 */
export const LocalStep2PrefillSchema = z.array(
  z.object({
    input: z.string().min(1),
    prefill: z.string().refine((k) => PREFILL_KEY_SET.has(k)),
  }),
)

/** Stap 3 — de formules. */
export const LocalStep3OutputsSchema = z
  .array(LocalCalculatorOutputSchema)
  .min(1)
  .max(LOCAL_MAX_OUTPUTS)

/** Stap 4 — naam/omschrijving/aannames, als array met één object. */
export const LocalStep4MetaSchema = z
  .array(
    z.object({
      name: z.string().min(1).max(120),
      description: z.string().max(400).optional(),
      assumptions: z.array(z.string().min(1).max(240)).max(4).optional(),
    }),
  )
  .min(1)

/** Her-export zodat consumenten niet óók lib/calculator/types hoeven te importeren. */
export { CalculatorDefinitionSchema }
