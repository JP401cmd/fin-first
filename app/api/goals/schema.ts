import { z } from 'zod'
import { GOAL_TYPE_META, type GoalType } from '@/lib/goal-data'

/**
 * Schrijfpoort-schema's voor `/api/goals` (ADR 0044 — zod op mutatie-routes).
 *
 * WAAROM APART BESTAND: de route zelf blijft dan leesbaar als *flow* (auth →
 * valideren → scoping → schrijven), en het contract dat de frontend consumeert
 * staat op één plek. Spiegelt `app/api/assets/route.ts` in stijl (whitelist per
 * veld, geen `passthrough`, server-bepaalde velden ontbreken bewust).
 *
 * DE KERN VAN DEZE POORT — wat de client NIET mag zetten:
 *   - `user_id` / `household_id` — komen uit de geverifieerde sessie resp. uit
 *     `household_members`. Zou de client `household_id` mogen meesturen, dan kon
 *     iemand een doel in het huishouden van een ander hangen; de SELECT-policy
 *     "View own or shared goals" is huishoud-verbreed, dus die rij verschijnt
 *     dan op andermans scherm.
 *   - `metadata` — nooit vrij. De enige metadata die deze route zet is
 *     `{ sync: 'auto' }`, server-side afgeleid uit het smalle veld `sync`.
 *     `metadata.bron = 'parameter'` blijft exclusief aan `/api/toekomst-doel`.
 *   - `ownership` bij PATCH — een doel van persoonlijk naar gedeeld (of terug)
 *     omzetten verandert wie het ziet; dat is een eigen handeling, geen veldje
 *     in een generieke update.
 *   - `linked_asset_id` / `linked_debt_id` — legacy. De kolommen blijven staan
 *     (gebackfilld door 20260901140000) maar worden door deze route niet meer
 *     geschreven; koppelen gaat via `links` → `goal_links`.
 *
 * Onbekende sleutels worden STIL gestript (zod-object-default). Bewuste keuze:
 * bestaande clients die een extra veld meesturen breken niet, maar het veld
 * bereikt de database ook niet. Precies de zwakte die deze poort dicht — de
 * oude PATCH deed `const { id, ...updates } = body` en schreef alles door.
 */

// ── Doeltypen ────────────────────────────────────────────────────────────────

/**
 * De toegestane `goal_type`-waarden, AFGELEID uit de canonieke bron in
 * `lib/goal-data.ts` — bewust niet overgetikt. Groeit `GOAL_TYPE_META`, dan
 * groeit deze poort automatisch mee. De database heeft géén CHECK op deze kolom
 * (zie de aantekening in migratie 20260901140000), dus dit schema ís de enige
 * gate — vandaar dat de niet-canonieke waarden die die migratie normaliseert
 * ('wealth', 'debt') hier hard afketsen.
 */
export const GOAL_TYPES = Object.keys(GOAL_TYPE_META) as [GoalType, ...GoalType[]]

/**
 * Mag dit doeltype meelopen met een kengetal (`sync: 'auto'`)?
 *
 * Leest de canonieke `metricBasis`-vlag op `GOAL_TYPE_META` — bewust GEEN eigen
 * lijst in deze route. Die vlag markeert precies de typen waarvan de huidige
 * waarde uit een canonieke motor komt (`metricSource` noemt welke); een
 * auto-sync-marker op bv. een `custom`- of `savings`-doel zou niets meesyncen en
 * is dus een fout, geen stille no-op. Komt er een basis bij, dan groeit deze
 * poort automatisch mee (ADR 0125).
 */
export function isAutoSyncGoalType(goalType: GoalType): boolean {
  return GOAL_TYPE_META[goalType]?.metricBasis === true
}

// ── Grenzen ──────────────────────────────────────────────────────────────────

/**
 * Body-cap vóór het parsen. De grootste legitieme body is een doel met 20
 * koppelingen (20 × ~40 bytes) plus de tekstvelden — ruim binnen 16 KB.
 * Zelfde vangnet als `/api/toekomst-doel`.
 */
export const MAX_GOAL_BODY_BYTES = 16 * 1024

/** Maximum aantal koppelingen per doel (bezittingen + schulden samen). */
export const MAX_GOAL_LINKS = 20

/**
 * Waardegrens voor `target_value`/`current_value`. Bewust ruim en tweezijdig:
 * `net_worth` mag negatief zijn (meer schuld dan bezit) en een UHNW-gebruiker
 * mag niet hard geblokkeerd worden. De server vangt alleen wat onmogelijk is.
 */
const GOAL_VALUE_LIMIT = 1_000_000_000_000

// ── Bouwstenen ───────────────────────────────────────────────────────────────

/**
 * Getalveld dat óók een numerieke string accepteert. Formuliervelden leveren
 * strings; de oude route deed `Number(x) || 0` en slikte daarmee ook `"abc"`
 * (→ 0, een stil verkeerd doelbedrag). Hier: string → getal, en wat geen eindig
 * getal is valt om in een 400. De komma-variant (`"1234,50"`) is nl-NL-invoer.
 */
const goalNumber = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() !== '' ? Number(v.trim().replace(',', '.')) : v),
  z.number().finite().min(-GOAL_VALUE_LIMIT).max(GOAL_VALUE_LIMIT),
)

/** `goals.target_date` is een DATE-kolom: alleen JJJJ-MM-DD, `''` leest als leeg. */
const goalDate = z.union([
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum moet de vorm JJJJ-MM-DD hebben'),
  z.literal(''),
  z.null(),
])

/**
 * Tijdstempel voor `completed_at`. Bewust `Date.parse` i.p.v. een strak
 * ISO-formaatschema: de waarde komt van `new Date().toISOString()` uit de
 * client, en een strengere vorm zou alleen valse 400's opleveren.
 */
const goalTimestamp = z
  .string()
  .trim()
  .max(40)
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Ongeldige datum/tijd')

/** Eén uuid-lijst uit `links`, gededupliceerd. Afwezig = lege lijst. */
const linkIdList = z
  .array(z.uuid('Ongeldig id'))
  .max(MAX_GOAL_LINKS, `Maximaal ${MAX_GOAL_LINKS} koppelingen`)
  .optional()
  .transform((v) => (v ? Array.from(new Set(v)) : []))

/**
 * De koppelingen van een doel. `assetIds`/`debtIds` zijn twee aparte lijsten
 * (niet één polymorfe lijst), omdat `goal_links` twee echte foreign keys draagt
 * met een XOR-CHECK — de vorm hier spiegelt de datalaag.
 */
export const GoalLinksSchema = z
  .object({
    assetIds: linkIdList,
    debtIds: linkIdList,
  })
  .refine((v) => v.assetIds.length + v.debtIds.length <= MAX_GOAL_LINKS, {
    message: `Maximaal ${MAX_GOAL_LINKS} koppelingen per doel`,
    path: ['assetIds'],
  })

export type GoalLinksInput = z.infer<typeof GoalLinksSchema>

// ── POST ─────────────────────────────────────────────────────────────────────

export const CreateGoalSchema = z.object({
  name: z.string().trim().min(1, 'Naam is verplicht').max(200),
  description: z.string().trim().max(2000).nullish().transform((v) => (v ? v : null)),

  goal_type: z.enum(GOAL_TYPES).default('savings'),

  target_value: goalNumber.default(0),
  current_value: goalNumber.default(0),
  target_date: goalDate.optional().transform((v) => (v ? v : null)),

  budget_id: z.uuid('Ongeldig budget-id').nullish().transform((v) => v ?? null),

  icon: z.string().trim().min(1).max(80).optional(),
  color: z.string().trim().min(1).max(40).optional(),
  custom_unit: z.string().trim().max(40).nullish().transform((v) => (v ? v : null)),

  // `household_id` staat hier BEWUST NIET: die bepaalt de server.
  ownership: z.enum(['personal', 'shared']).default('personal'),

  sort_order: z.number().int().min(0).max(100_000).optional(),

  /**
   * De enige toegestane metadata-schrijfactie van deze route. `'auto'` wordt
   * server-side vertaald naar `metadata = { sync: 'auto' }`; vrije metadata
   * bestaat in dit contract niet.
   */
  sync: z.literal('auto').optional(),

  links: GoalLinksSchema.optional(),
})

export type CreateGoalInput = z.infer<typeof CreateGoalSchema>

// ── PATCH ────────────────────────────────────────────────────────────────────

/**
 * Bij PATCH is "afwezig" iets anders dan "leeg": een ontbrekend veld blijft
 * ongemoeid, een expliciete `null` wist het. Daarom hier — anders dan bij POST —
 * GEEN `undefined → null`-transforms; de route kopieert alleen de sleutels die
 * daadwerkelijk een waarde (incl. `null`) hebben.
 */
export const UpdateGoalSchema = z.object({
  id: z.uuid('Ongeldig doel-id'),

  name: z.string().trim().min(1, 'Naam mag niet leeg zijn').max(200).optional(),
  description: z
    .string()
    .trim()
    .max(2000)
    .nullable()
    .optional()
    .transform((v) => (v === '' ? null : v)),

  goal_type: z.enum(GOAL_TYPES).optional(),

  target_value: goalNumber.optional(),
  current_value: goalNumber.optional(),
  target_date: goalDate.optional().transform((v) => (v === undefined ? undefined : v || null)),

  budget_id: z.uuid('Ongeldig budget-id').nullable().optional(),

  icon: z.string().trim().min(1).max(80).optional(),
  color: z.string().trim().min(1).max(40).optional(),
  custom_unit: z
    .string()
    .trim()
    .max(40)
    .nullable()
    .optional()
    .transform((v) => (v === '' ? null : v)),

  is_completed: z.boolean().optional(),
  completed_at: goalTimestamp.nullable().optional(),

  sort_order: z.number().int().min(0).max(100_000).optional(),

  links: GoalLinksSchema.optional(),
})

export type UpdateGoalInput = z.infer<typeof UpdateGoalSchema>

/** De kolommen die PATCH mag schrijven — `links` en `id` horen hier niet bij. */
export const PATCHABLE_GOAL_COLUMNS = [
  'name',
  'description',
  'goal_type',
  'target_value',
  'current_value',
  'target_date',
  'budget_id',
  'icon',
  'color',
  'custom_unit',
  'is_completed',
  'completed_at',
  'sort_order',
] as const satisfies readonly (keyof UpdateGoalInput)[]
