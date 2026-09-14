import { z } from 'zod'
import type { DoelParameter } from '@/lib/horizon/toekomst-scenario'

/**
 * Schrijfpoort-schema voor `PUT /api/toekomst-doel` (ADR 0044 — zod op mutatie-routes).
 *
 * WAT DIT SCHEMA WEL EN NIET DOET. Het legt de VORM van de body vast; de betekenis blijft
 * in de route en in de canonieke poorten:
 *   - welk uitkomstdoel bij het anker hoort (`fire` strippen, `dekking` weigeren) beslist
 *     de route op het plan uit het eigen profiel (ADR 0145 D3) — niet dit schema;
 *   - de doelwaarden clampt `buildParameterGoalRows`;
 *   - de doelstand saneert `parseToekomstScenarioPrefs` (de enige schrijfpoort op de pref).
 *     `stand` gaat hier dus alleen als "een object" door, bewust zonder eigen veldlijst —
 *     een tweede lezing van de stand naast de parser zou precies de drift zijn die die
 *     ene poort voorkomt.
 *
 * Onbekende sleutels worden STIL gestript (zod-object-default), zoals de handmatige
 * whitelist vóór dit schema deed. Belangrijk voor `doelwaarden`: de plan-velden van het
 * dekkingsdoel (`planEindleeftijd`, `planStopAnker`, `planStopLeeftijd`) staan hier bewust
 * NIET in — die komen uit het profiel, en een client die ze meestuurt raakt ze hier kwijt.
 */

/** Eén aangevinkte parameter: alleen `true` bestaat (afwezig = niet gekozen). */
const gekozen = z.literal(true, { error: 'Ongeldige doelparameter' }).optional()

/**
 * De parameters als object met één optioneel veld per `DoelParameter`. De `satisfies`
 * maakt een nieuwe parameter in `DOEL_PARAMETERS` een compile-fout tot hij hier staat.
 */
const ParametersSchema = z.object({
  spaarquote: gekozen,
  salaris: gekozen,
  rendement: gekozen,
  fire: gekozen,
  dekking: gekozen,
} satisfies Record<DoelParameter, typeof gekozen>)

/**
 * Een doelwaarde: eindig getal of afwezig. `null` leest als afwezig (de client zet
 * `?? undefined`, maar een oudere client kan `null` sturen); de builder clampt verder.
 */
const doelwaarde = z
  .number({ error: 'Ongeldige doelwaarde' })
  .finite()
  .nullish()
  .transform((v) => v ?? undefined)

const DoelwaardenSchema = z.object({
  spaarquotePct: doelwaarde,
  salarisMnd: doelwaarde,
  rendementPct: doelwaarde,
  fireLeeftijd: doelwaarde,
  margeJaren: doelwaarde,
})

const VastleggenSchema = z.object({
  action: z.literal('vastleggen'),
  // Afwezig = leeg object (`prefault` parset `{}` door het schema, dus het type blijft
  // de schema-uitvoer). Een lege keuze eindigt in de route op "Geen doelparameters".
  parameters: ParametersSchema.prefault({}),
  doelwaarden: DoelwaardenSchema.prefault({}),
  // Alleen de vorm (een object); de inhoud valideert de pref-parser in de route.
  stand: z.record(z.string(), z.unknown(), { error: 'Ongeldige doelstand' }).prefault({}),
})

const LoslatenSchema = z.object({
  action: z.literal('loslaten'),
})

export const ToekomstDoelBodySchema = z.discriminatedUnion('action', [VastleggenSchema, LoslatenSchema], {
  error: 'Ongeldige actie',
})

export type ToekomstDoelBody = z.infer<typeof ToekomstDoelBodySchema>
export type VastleggenBody = z.infer<typeof VastleggenSchema>
