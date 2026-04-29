/**
 * Quick-add wizard — shared type definitions.
 *
 * Exported discriminated unions used by the 4-step wizard (`QuickAddWizard`),
 * the Zod validators in `./validation` and the Server Action in
 * `app/actions/quick-add.ts`. Client + server both import from this file.
 */

import type { AssetType } from '@/lib/asset-data'
import type { DebtType } from '@/lib/debt-data'

export type QuickAddIntent = 'asset' | 'debt'

/**
 * Minimal asset input collected by the wizard (step 3).
 * `field3` holds the type-specific third value — interpretation depends on
 * `asset_type` (e.g. institution string, WOZ number, rental income, ownership %).
 * See `buildAssetDraft()` for the mapping.
 */
export interface AssetQuickInput {
  asset_type: AssetType
  name: string
  current_value: number
  field3?: string | number | null
}

/**
 * Minimal debt input collected by the wizard (step 3 / step 4).
 * `field3` interpretation depends on `debt_type` — see `buildDebtDraft()`.
 * `linked_asset_id` is only set when the debt was created via step 4
 * (coupled to a just-saved asset).
 */
export interface DebtQuickInput {
  debt_type: DebtType
  name: string
  current_balance: number
  field3?: number | string | null
  linked_asset_id?: string | null
}

export type QuickAddInput =
  | { kind: 'asset'; asset: AssetQuickInput }
  | { kind: 'debt'; debt: DebtQuickInput }
  | {
      kind: 'asset_with_debt'
      asset: AssetQuickInput
      debt: Omit<DebtQuickInput, 'linked_asset_id'>
    }

export type QuickAddResult =
  | { ok: true; assetId?: string; debtId?: string }
  | {
      ok: false
      code: 'AUTH' | 'VALIDATION' | 'ASSET_FAILED' | 'DEBT_FAILED' | 'SERVER'
      message: string
      partial?: { assetId?: string }
    }
