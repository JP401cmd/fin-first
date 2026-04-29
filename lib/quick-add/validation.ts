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
  linked_asset_id: z.string().uuid().nullable().optional(),
})

/** Debt payload inside `asset_with_debt` — no `linked_asset_id` (server-set). */
const DebtQuickInputWithoutLink = DebtQuickInputSchema.omit({ linked_asset_id: true })

export const QuickAddInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('asset'), asset: AssetQuickInputSchema }),
  z.object({ kind: z.literal('debt'), debt: DebtQuickInputSchema }),
  z.object({
    kind: z.literal('asset_with_debt'),
    asset: AssetQuickInputSchema,
    debt: DebtQuickInputWithoutLink,
  }),
])

// Re-export inferred TS types so callers can stay DRY.
export type AssetQuickInputValidated = z.infer<typeof AssetQuickInputSchema>
export type DebtQuickInputValidated = z.infer<typeof DebtQuickInputSchema>
export type QuickAddInputValidated = z.infer<typeof QuickAddInputSchema>
