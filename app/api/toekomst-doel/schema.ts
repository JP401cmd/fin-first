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
 * `salaris`/`salarisMnd` worden sinds 15 sep 2026 genegeerd (spec lab-haalbaarheid §2, de
 * knop Maandinkomen verviel) — een oudere client die ze meestuurt breekt niet, ze stripten
 * stil weg.
 */

/** Eén aangevinkte parameter: alleen `true` bestaat (afwezig = niet gekozen). */
const gekozen = z.literal(true, { error: 'Ongeldige doelparameter' }).optional()

/**
 * De parameters als object met één optioneel veld per `DoelParameter`. De `satisfies`
 * maakt een nieuwe parameter in `DOEL_PARAMETERS` een compile-fout tot hij hier staat.
 */
const ParametersSchema = z.object({
  spaarquote: gekozen,
  rendement: gekozen,
  fire: gekozen,
  dekking: gekozen,
  // ADR 0145 D12 — het eindvermogen-doel bij een gedekt plan onder een vast stopmoment.
  eindvermogen: gekozen,
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

/** Bovengrens voor het eindvermogen-doelbedrag (€ 10 mld, nominaal) — eindreview M9. */
export const EINDVERMOGEN_DOELWAARDE_MAX = 1e10

const DoelwaardenSchema = z.object({
  spaarquotePct: doelwaarde,
  rendementPct: doelwaarde,
  fireLeeftijd: doelwaarde,
  margeJaren: doelwaarde,
  // ADR 0145 D12 — het NOMINALE eindvermogen van de verkenning (een client-waarde: alleen de
  // live-sim kent 'm). Negatief wordt in de builder overgeslagen, niet hier geweigerd.
  // Eindreview M9 — wél een bovengrens: een eigen rij, dus geen lek, maar onzin (1e300) hoort
  // niet in `goals.target_value`.
  eindvermogen: z
    .number({ error: 'Ongeldige doelwaarde' })
    .finite()
    .max(EINDVERMOGEN_DOELWAARDE_MAX, { error: 'Ongeldige doelwaarde' })
    .nullish()
    .transform((v) => v ?? undefined),
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
