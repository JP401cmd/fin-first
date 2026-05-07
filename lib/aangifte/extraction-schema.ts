// ── Aangifte Extraction Schema — strict whitelist for AI extraction ──
//
// Single source of truth for the structure that the AI extraction step
// returns when parsing a Dutch belastingaangifte (PDF text or pasted text).
// The Zod schema enforces *strict data minimisation*: only fields that
// have a direct destination in the app's database (`assets`, `debts`,
// `profiles`) are extracted. Anything outside this whitelist (BSN, NAW,
// IBAN, alimentatie, scholingsuitgaven, …) is structurally rejected by
// `generateObject` — it cannot survive the round-trip even if the model
// hallucinates extra keys.
//
// The schema is shared by:
//   - lib/aangifte/extract-aangifte-data.ts (Phase B Agent 1) — passes
//     this schema to `generateObject`.
//   - app/api/onboarding/aangifte-extract/route.ts (Phase B) — re-validates
//     the response server-side as a defence-in-depth layer.
//   - components/aangifte/review-step.tsx (Phase B) — uses the inferred
//     `AangifteExtractionResult` type for review-state.
//   - components/aangifte/manual-wizard.tsx (Phase B) — consumes the same
//     types so the manual + AI paths converge on one review pipeline.
//
// Conventions match `lib/ai/extract-financial-data.ts`:
//   - Dutch `.describe()` strings (the model speaks Dutch).
//   - Asset/Debt enums hand-mirror `AssetType` / `DebtType` from
//     `lib/asset-data.ts` / `lib/debt-data.ts` (we deliberately do not
//     re-export the union — Zod needs literal strings at compile-time).
//   - `.strict()` on the top-level object so unknown fields become a
//     parse error, not a silent passthrough.

import { z } from 'zod'

// ── Asset & Debt enums (mirror lib/asset-data.ts + lib/debt-data.ts) ─

/**
 * Asset types extractable from an aangifte. Mirrors `AssetType` from
 * `lib/asset-data.ts`. Kept as a literal-string array so Zod can emit
 * a structurally compatible enum at the SDK boundary.
 */
const ASSET_TYPE_VALUES = [
  'cash',
  'savings',
  'investment',
  'retirement',
  'eigen_huis',
  'real_estate',
  'crypto',
  'vehicle',
  'physical',
  'deelneming',
  'levensverzekering',
  'vordering',
  'other',
] as const

/**
 * Debt types extractable from an aangifte. Mirrors `DebtType` from
 * `lib/debt-data.ts`.
 */
const DEBT_TYPE_VALUES = [
  'mortgage',
  'personal_loan',
  'student_loan',
  'car_loan',
  'credit_card',
  'revolving_credit',
  'payment_plan',
  'belastingschuld',
  'familielening',
  'dga_schuld',
  'other',
] as const

/**
 * Box 1 inkomenscomponenten die de aangifte apart toont. De gebruiker
 * kiest in de review-stap waar elk component landt:
 *   - loon → `profiles.gross_annual_income`
 *   - aow → `profiles.aow_active=true` (geen apart bedrag opslaan; AOW is
 *           een vaste grootheid via NL_AOW_MONTHLY)
 *   - pensioen → bundelen in gross_annual_income óf apart als
 *                `retirement` asset
 *   - uitkering → tijdelijk inkomen, beste expressie via `life_event`
 *   - winst → ondernemingswinst / ROW, zelfde slot als loon maar markeer
 *             `income_type='self_employed'`
 *
 * De review-laag is de plek waar de mapping definitief wordt. Het schema
 * extraheert alle aanwezige componenten zodat geen geld zoekraakt.
 */
const BOX1_KIND_VALUES = ['loon', 'pensioen', 'aow', 'uitkering', 'winst'] as const

// ── Sub-schemas ──────────────────────────────────────────────────────

const assetExtractionSchema = z.object({
  name: z
    .string()
    .describe(
      'Beschrijvende naam van de bezitting, bijv. "ING betaalrekening", "ASN spaarrekening", "Eigen woning" of "DEGIRO portefeuille". Hou het kort.',
    ),
  asset_type: z
    .enum(ASSET_TYPE_VALUES)
    .describe(
      'Type bezitting; mapping vanuit aangifte: bank/spaargeld → cash of savings, beleggingen/effecten → investment, eigen woning Box 1 → eigen_huis, tweede woning Box 3 → real_estate, crypto → crypto, vorderingen op derden/DGA → vordering, aanmerkelijk belang Box 2 → deelneming.',
    ),
  current_value: z
    .number()
    .describe(
      'Waarde op peildatum 1 januari in euro. Positief getal. Voor eigen_huis is dit de WOZ-waarde of marktwaarde — beide mogen, maar woz_value moet ook gevuld worden als die in de aangifte staat.',
    ),
  subtype: z
    .string()
    .nullable()
    .describe(
      'Subtype indien expliciet vermeld, bijv. "savings_account" voor spaargeld, "etf" voor beleggingen. Null als de aangifte het subtype niet noemt.',
    ),
  woz_value: z
    .number()
    .nullable()
    .describe(
      'WOZ-waarde van het eigen huis in euro. Alleen invullen wanneer asset_type=eigen_huis EN de aangifte een WOZ-waarde noemt. Null in alle andere gevallen.',
    ),
})

const debtExtractionSchema = z.object({
  name: z
    .string()
    .describe(
      'Beschrijvende naam van de schuld, bijv. "Hypotheek ABN AMRO", "Studielening DUO" of "Persoonlijke lening Santander".',
    ),
  debt_type: z
    .enum(DEBT_TYPE_VALUES)
    .describe(
      'Type schuld; mapping: eigenwoningschuld Box 1 → mortgage, studieschuld DUO → student_loan, doorlopend krediet/roodstand → revolving_credit, persoonlijke lening → personal_loan, autolening → car_loan, creditcard → credit_card, belastingschuld → belastingschuld, familielening → familielening, DGA-schuld → dga_schuld.',
    ),
  current_balance: z
    .number()
    .describe('Openstaand saldo op peildatum 1 januari in euro. Positief getal.'),
  interest_rate: z
    .number()
    .nullable()
    .describe(
      'Jaarlijkse rente in %, indien expliciet in de aangifte vermeld. Null als de aangifte de rente niet noemt — schat NIET zelf.',
    ),
  repayment_type: z
    .enum(['aflossingsvrij', 'annuiteit', 'lineair'])
    .nullable()
    .describe(
      'Aflossingsvorm voor hypotheken: annuïteit, lineair of aflossingsvrij. Null voor andere schuldtypen of wanneer niet vermeld.',
    ),
  subtype: z
    .string()
    .nullable()
    .describe(
      'Subtype indien expliciet vermeld, bijv. "annuiteit" voor hypotheek, "nieuw_stelsel" voor DUO. Null als onbekend.',
    ),
  is_tax_deductible: z
    .boolean()
    .nullable()
    .describe(
      'true voor mortgage met eigenwoningschuld-status (rente fiscaal aftrekbaar). false of null voor andere schulden.',
    ),
})

const box1ComponentSchema = z.object({
  kind: z
    .enum(BOX1_KIND_VALUES)
    .describe(
      'Soort Box 1-inkomen: loon (jaaropgaaf werkgever), pensioen (lopende uitkering), aow (AOW-uitkering), uitkering (WW/WIA/bijstand) of winst (winst uit onderneming / ROW).',
    ),
  annual_amount: z
    .number()
    .describe('Bruto bedrag per jaar in euro. Voor maandbedragen vermenigvuldig met 12.'),
  label: z
    .string()
    .describe(
      'Korte herkenbare label voor de review-UI, bijv. "Bruto loon werkgever", "AOW-uitkering" of "Pensioen ABP". De gebruiker ziet dit terug.',
    ),
})

// ── Top-level schema ────────────────────────────────────────────────

/**
 * Strict whitelist voor AI-extractie uit een Nederlandse aangifte
 * inkomstenbelasting. `.strict()` op het object weigert onbekende
 * top-level sleutels — defense-in-depth boven de prompt.
 *
 * Velden die expliciet **niet** geëxtraheerd worden (BSN, NAW, IBAN,
 * alimentatie, scholingsuitgaven, kindgebonden budget, ...) staan
 * gemotiveerd in `docs` en in de system-prompt. Er is geen `extra`-vrij
 * tekstveld; het schema bewaakt de minimisatie.
 */
export const extractionSchema = z
  .object({
    assets: z
      .array(assetExtractionSchema)
      .describe(
        'Alle bezittingen die we kunnen herleiden uit Box 1 (eigen woning), Box 2 (deelneming, alleen als duidelijk vermeld) en Box 3 (bank/spaartegoeden, beleggingen, OG, crypto, vorderingen). Lege array als er niets te extraheren valt.',
      ),
    debts: z
      .array(debtExtractionSchema)
      .describe(
        'Alle schulden uit Box 1 (eigenwoningschuld) en Box 3 (consumptief krediet, doorlopend, persoonlijk). Lege array als er geen schulden in de aangifte staan.',
      ),
    box1_components: z
      .array(box1ComponentSchema)
      .describe(
        'Alle Box 1 inkomenscomponenten die in de aangifte voorkomen. Zelfs als er maar één bron is (alleen loon), zet die in de array. De review-stap laat de gebruiker per component kiezen waar het landt.',
      ),
    peildatum: z
      .string()
      .describe(
        'Peildatum als ISO-datestring (yyyy-mm-dd). Voor een aangifte over jaar X is dit altijd X-01-01.',
      ),
    tax_year: z
      .number()
      .int()
      .describe('Jaartal van de aangifte, bijv. 2024 voor een aangifte over 2024.'),
  })
  .strict()

// ── Inferred type ───────────────────────────────────────────────────

/**
 * Inferred TypeScript type for the AI-extraction result. Phase B
 * (extract-aangifte-data.ts) returns this type from `generateObject`,
 * and the review-step UI consumes it directly.
 */
export type AangifteExtractionResult = z.infer<typeof extractionSchema>

/**
 * Re-exports of the literal string unions for use in narrow type-guards
 * and switch-statements without re-importing from this file.
 */
export type AangifteAssetType = (typeof ASSET_TYPE_VALUES)[number]
export type AangifteDebtType = (typeof DEBT_TYPE_VALUES)[number]
export type AangifteBox1Kind = (typeof BOX1_KIND_VALUES)[number]
