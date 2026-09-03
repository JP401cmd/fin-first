/**
 * Quick-add wizard — Zod validation schemas.
 *
 * Used client-side (per-field blur + pre-submit) and server-side
 * (first line in the Server Action). Keeps both layers in sync via a
 * single source of truth.
 *
 * NB: RLS ownership of `linked_asset_id` is NOT checked here — the
 * Server Action does an explicit `SELECT 1 FROM assets WHERE user_id = auth.uid()`
 * before inserting a linked debt.
 */

import { z } from 'zod'

/**
 * Bovengrens voor de optionele looptijd-invoer (`DebtQuickInput.term_years`),
 * in jaren. Ruim boven elke realistische hypotheek-resttermijn en daarmee
 * vooral een typefout-vangnet; geëxporteerd zodat het wizard-veld exact
 * dezelfde grens hanteert als de server-side validatie.
 */
export const MAX_TERM_YEARS = 50

/** Must stay in sync with `AssetType` in `lib/asset-data.ts`. */
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

/** Must stay in sync with `DebtType` in `lib/debt-data.ts`. */
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

/** Field3 is polymorphic — its concrete type depends on the asset/debt type. */
const Field3Schema = z.union([z.string(), z.number(), z.null()]).optional()

export const AssetQuickInputSchema = z.object({
  asset_type: z.enum(ASSET_TYPE_VALUES),
  name: z.string().trim().min(1, 'Naam is verplicht'),
  current_value: z
    .number({ error: 'Voer een geldig bedrag in' })
    .finite()
    .min(0, 'Bedrag mag niet negatief zijn'),
  field3: Field3Schema,
  // Savings-only: verwacht jaarrendement/rente (%). Nullable-optional zodat
  // andere asset-types en oudere call-sites ongemoeid blijven. Geen min(0):
  // een (historisch reële) negatieve spaarrente mag worden vastgelegd —
  // `buildAssetDraft` valt op null terug op de TYPICAL_RETURNS-default.
  expected_return: z.number().finite().nullable().optional(),
  // Onboarding-only opaak koppel-token (zie AssetQuickInput.client_ref). Geen
  // UUID-eis: het is een client-gegenereerde string, geen DB-id.
  client_ref: z.string().max(64).optional(),
})

/**
 * Debt payload. `linked_asset_id` is optional and accepted from the
 * client because the wizard uses a 2-phase save for asset→debt flows:
 * asset is saved first (returning the id), then a second `kind:'debt'`
 * call references that id via `linked_asset_id`. The Server Action
 * defensively calls `assertAssetOwned(linked_asset_id, userId)` before
 * any insert, so a user cannot link to another user's asset (RLS
 * already blocks writes, but the explicit check gives a cleaner error).
 */
export const DebtQuickInputSchema = z.object({
  debt_type: z.enum(DEBT_TYPE_VALUES),
  name: z.string().trim().min(1, 'Naam is verplicht'),
  current_balance: z
    .number({ error: 'Voer een geldig bedrag in' })
    .finite()
    .min(0, 'Bedrag mag niet negatief zijn'),
  field3: Field3Schema,
  // Hypotheek-only: aflossingsvorm + ingangsdatum. Optioneel zodat andere
  // schuldtypes (en oudere call-sites) ongemoeid blijven; `buildDebtDraft`
  // valt terug op de type-defaults wanneer ze ontbreken.
  repayment_type: z.enum(['aflossingsvrij', 'annuiteit', 'lineair']).nullable().optional(),
  start_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ongeldige datum')
    .nullable()
    .optional(),
  linked_asset_id: z.string().uuid().nullable().optional(),
  // Onboarding-only koppel-token (zie DebtQuickInput.linked_client_ref). Geen
  // UUID — matcht met AssetQuickInput.client_ref, niet met een DB-id.
  linked_client_ref: z.string().max(64).nullable().optional(),
  // Looptijd-leningen-only: werkelijke aflossing per maand (€). Optioneel
  // zodat andere schuldtypes (en oudere call-sites) ongemoeid blijven;
  // `buildDebtDraft` valt terug op de berekende default wanneer dit ontbreekt.
  monthly_payment: z
    .number()
    .finite()
    .min(0, 'Bedrag mag niet negatief zijn')
    .nullable()
    .optional(),
  // Hypotheek-only: resterende looptijd in jaren vanaf vandaag. Optioneel
  // zodat andere schuldtypes (en oudere call-sites) ongemoeid blijven;
  // `buildDebtDraft` valt terug op `DEFAULT_TERM_YEARS_PER_TYPE` wanneer dit
  // ontbreekt. Bovengrens 50 sluit typefouten uit (bv. maanden i.p.v. jaren).
  term_years: z
    .number()
    .finite()
    .min(1, 'Looptijd moet minstens 1 jaar zijn')
    .max(MAX_TERM_YEARS, `Looptijd mag hoogstens ${MAX_TERM_YEARS} jaar zijn`)
    .nullable()
    .optional(),
})

/** Debt payload inside `asset_with_debt` — no `linked_asset_id` (server-set). */
const DebtQuickInputWithoutLink = DebtQuickInputSchema.omit({ linked_asset_id: true })

/**
 * Foutmelding wanneer een DGA-schuld zonder deelneming wordt opgeslagen.
 *
 * Eén bron voor de wizard (client, `step-details.tsx`) én de Server Action
 * (`app/actions/quick-add.ts`), en bewust letterlijk dezelfde tekst als het
 * volledige bewerkformulier (`components/app/core/debts/debt-form.tsx`) — twee
 * aanmaakpaden voor hetzelfde schuldtype horen dezelfde melding te geven.
 */
export const DGA_LINKED_ASSET_REQUIRED_ERROR =
  'Selecteer de deelneming waaraan deze DGA-schuld gekoppeld is.'

/**
 * Draagt deze schuld-invoer de app-invariant "een `dga_schuld` hangt altijd aan
 * een deelneming"? (WF-SCHULD-20 sub c.)
 *
 * De koppeling kan op twee manieren rond zijn: met een echt `linked_asset_id`
 * (bestaande deelneming) of — tijdens onboarding, waar de deelneming zelf nog
 * geen DB-id heeft — met het opaak koppel-token `linked_client_ref`, dat de
 * server ná de batch-insert naar het echte id vertaalt
 * (`linkOnboardingAssetDebtPairs`). Beide tellen dus als "gekoppeld".
 */
export function hasRequiredDeelnemingLink(debt: {
  debt_type: string
  linked_asset_id?: string | null
  linked_client_ref?: string | null
}): boolean {
  if (debt.debt_type !== 'dga_schuld') return true
  return Boolean(debt.linked_asset_id) || Boolean(debt.linked_client_ref)
}

const QuickAddInputUnion = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('asset'), asset: AssetQuickInputSchema }),
  z.object({ kind: z.literal('debt'), debt: DebtQuickInputSchema }),
  z.object({
    kind: z.literal('asset_with_debt'),
    asset: AssetQuickInputSchema,
    debt: DebtQuickInputWithoutLink,
  }),
])

/**
 * De invariant hangt aan de UNIE, niet aan `DebtQuickInputSchema` zelf, en dat
 * is bewust:
 *   - `kind:'asset_with_debt'` draagt géén `linked_asset_id` (de server zet 'm
 *     na de asset-insert), dus daar is "leeg" juist correct;
 *   - `DebtQuickInputSchema` wordt óók door de onboarding-batch
 *     (`/api/onboarding/save-own-data`) gebruikt, waar de koppeling pas ná de
 *     insert wordt gelegd — een refine op dát schema zou de hele
 *     onboarding-submit afkeuren.
 * Blijft over: het zelfstandige `kind:'debt'`-pad van de quick-add-wizard, en
 * dat is precies het pad waar een niet-gekoppelde DGA-schuld ontstond.
 */
export const QuickAddInputSchema = QuickAddInputUnion.superRefine((value, ctx) => {
  if (value.kind !== 'debt') return
  if (hasRequiredDeelnemingLink(value.debt)) return
  ctx.addIssue({
    code: 'custom',
    message: DGA_LINKED_ASSET_REQUIRED_ERROR,
    path: ['debt', 'linked_asset_id'],
  })
})

// Re-export inferred TS types so callers can stay DRY.
export type AssetQuickInputValidated = z.infer<typeof AssetQuickInputSchema>
export type DebtQuickInputValidated = z.infer<typeof DebtQuickInputSchema>
export type QuickAddInputValidated = z.infer<typeof QuickAddInputSchema>
