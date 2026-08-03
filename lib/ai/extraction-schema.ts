// ── Extractie-schema — gedeelde vorm voor vrije-tekst-extractie ───────────────
//
// Het zod-schema van de vrije-tekst-extractie stond privé in
// `lib/ai/extract-financial-data.ts`. Dat kon zolang er één consument was (de
// cloud-`generateObject`-aanroep). Sinds dezelfde extractie óók on-device kan
// draaien, zijn er twee: het lokale pad heeft geen constrained decoding en moet
// de modeluitvoer daarom achteraf PER ITEM valideren tegen exact dezelfde vorm.
//
// Zou het lokale pad een eigen kopie van dit schema krijgen, dan is drift een
// kwestie van tijd — en drift betekent hier dat een lokaal geëxtraheerde
// bezitting een veld mist dat de server wél verwacht. Eén bron dus.
//
// PUUR ZOD, GEEN SERVERCODE. Bewust een eigen bestand en niet een `export` in
// extract-financial-data.ts: dat bestand importeert `getModel` (en daarmee de
// service-client + provider-SDK's). Het lokale pad draait in de browser en mag
// die keten nooit meetrekken.

import { z } from 'zod'

// ── Gesloten typelijsten ────────────────────────────────────────────────────
//
// Als losse arrays geëxporteerd zodat het lokale pad ze kan gebruiken voor
// enum-hardening (onbekend type → 'other') vóór het safeParse. Zonder die stap
// zou één verzonnen `asset_type` van een klein model het hele item laten
// vervallen, terwijl de gebruiker in de review-stap prima een 'Overig' kan
// bijstellen.

export const EXTRACTION_ASSET_TYPES = [
  'cash',
  'savings',
  'investment',
  'retirement',
  'eigen_huis',
  'real_estate',
  'crypto',
  'vehicle',
  'physical',
  'other',
] as const

export const EXTRACTION_DEBT_TYPES = [
  'mortgage',
  'personal_loan',
  'student_loan',
  'car_loan',
  'credit_card',
  'revolving_credit',
  'payment_plan',
  'belastingschuld',
  'familielening',
  'other',
] as const

export type ExtractionAssetType = (typeof EXTRACTION_ASSET_TYPES)[number]
export type ExtractionDebtType = (typeof EXTRACTION_DEBT_TYPES)[number]

// ── Sub-schema's ────────────────────────────────────────────────────────────
//
// Apart geëxporteerd omdat het lokale pad per item valideert en een ONGELDIG
// item dropt in plaats van de hele extractie te laten mislukken. Een cloud-
// `generateObject` valideert het geheel in één keer; on-device is "één rot item
// gooit alles weg" veel te grof — het model levert daar per micro-call een
// handjevol objecten.

export const extractionAssetSchema = z.object({
  name: z.string().describe('Korte beschrijvende naam, bijv. "Koopwoning", "Spaarrekening", "ETF-portefeuille"'),
  asset_type: z
    .enum(EXTRACTION_ASSET_TYPES)
    .describe('Type bezitting, kies de meest passende categorie'),
  estimated_value: z.number().describe('Geschatte waarde in euro'),
  expected_return: z.number().describe('Verwacht jaarlijks rendement in %, bijv. 7 voor aandelen, 2.5 voor sparen, 3.5 voor eigen huis'),
  monthly_contribution: z.number().describe('Maandelijkse inleg in euro, 0 als niet genoemd'),
  is_liquid: z.boolean().describe('Is de bezitting liquide (snel beschikbaar)?'),
  subtype: z.string().nullable().describe('Subtype als van toepassing, bijv. "checking" voor cash, "savings_account" voor spaarrekening'),
})

export const extractionDebtSchema = z.object({
  name: z.string().describe('Korte beschrijvende naam, bijv. "Hypotheek", "Studieschuld DUO"'),
  debt_type: z
    .enum(EXTRACTION_DEBT_TYPES)
    .describe('Type schuld, kies de meest passende categorie'),
  estimated_balance: z.number().describe('Geschat openstaand saldo in euro'),
  interest_rate: z.number().describe('Jaarlijkse rente in %, gebruik standaard marktrente als niet genoemd'),
  monthly_payment: z.number().describe('Geschatte maandelijkse aflossing in euro, gebruik standaard als niet genoemd'),
  is_tax_deductible: z.boolean().nullable().describe('Is de rente fiscaal aftrekbaar? true voor hypotheek, null als onbekend'),
  subtype: z.string().nullable().describe('Subtype als van toepassing, bijv. "annuiteit" voor hypotheek, "nieuw_stelsel" voor DUO'),
})

export const extractionLifeEventSchema = z.object({
  name: z.string().describe('Naam van de gebeurtenis, bijv. "Kind krijgen", "Stoppen met werken"'),
  event_type: z.string().describe('Type-slug zoals huis_kopen, kind, pensioen, aow, sabbatical, emigratie'),
  target_age: z.number().nullable().describe('Leeftijd waarop dit gepland is, of null als onbekend'),
  description: z.string().describe('Korte beschrijving van het plan'),
  one_time_cost: z.number().describe('Geschatte eenmalige kosten in euro, 0 als niet van toepassing'),
  monthly_cost_change: z.number().describe('Geschatte maandelijkse kostenwijziging in euro (positief = hogere kosten)'),
  monthly_income_change: z.number().describe('Geschatte maandelijkse inkomenswijziging in euro (positief = meer inkomen, negatief = minder)'),
  duration_months: z.number().describe('Duur in maanden, 0 = permanent'),
  icon: z.string().describe('Lucide icon naam, bijv. Baby voor kind, Home voor huis, GraduationCap voor studie, Plane voor emigratie, Heart voor trouwen'),
})

// ── Top-level schema ────────────────────────────────────────────────────────

export const extractionSchema = z.object({
  assets: z.array(extractionAssetSchema),
  debts: z.array(extractionDebtSchema),
  life_events: z.array(extractionLifeEventSchema),
  monthly_income_estimate: z
    .number()
    .nullable()
    .describe('Geschat netto maandinkomen in euro, null als niet genoemd'),
  monthly_expenses_estimate: z
    .number()
    .nullable()
    .describe('Geschatte maandelijkse uitgaven in euro, null als niet genoemd'),
  financial_context_remainder: z
    .string()
    .describe('Overige relevante context die niet in gestructureerde velden past, lege string als er niets overblijft'),
})

export type ExtractionResult = z.infer<typeof extractionSchema>
export type ExtractionAsset = z.infer<typeof extractionAssetSchema>
export type ExtractionDebt = z.infer<typeof extractionDebtSchema>
export type ExtractionLifeEvent = z.infer<typeof extractionLifeEventSchema>

/** Structureel geldig, inhoudelijk leeg — de fail-graceful uitkomst. */
export const EMPTY_EXTRACTION_RESULT: ExtractionResult = {
  assets: [],
  debts: [],
  life_events: [],
  monthly_income_estimate: null,
  monthly_expenses_estimate: null,
  financial_context_remainder: '',
}
