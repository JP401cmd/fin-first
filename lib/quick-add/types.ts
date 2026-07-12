/**
 * Quick-add wizard — shared type definitions.
 *
 * Exported discriminated unions used by the 4-step wizard (`QuickAddWizard`),
 * the Zod validators in `./validation` and the Server Action in
 * `app/actions/quick-add.ts`. Client + server both import from this file.
 */

import type { AssetType } from '@/lib/asset-data'
import type { DebtType, RepaymentType } from '@/lib/debt-data'

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
  /**
   * Verwacht jaarrendement / rente (%) — alleen door de wizard uitgevraagd voor
   * spaarrekeningen (`asset_type='savings'`), naast het bank/instelling-veld
   * (`field3`). Vult `assets.expected_return`; overschrijft de TYPICAL_RETURNS-
   * default (savings = 2,5%). `undefined`/`null` ⇒ `buildAssetDraft` valt terug
   * op die default. Andere asset-types laten dit leeg (hun rendement volgt uit
   * TYPICAL_RETURNS of, bij vordering, uit `field3`).
   */
  expected_return?: number | null
  /**
   * Onboarding-only koppel-token. Tijdens onboarding heeft een asset nog geen
   * DB-id, dus een gekoppelde schuld (bv. hypotheek bij een huis) verwijst via
   * dit opake client-token naar de asset. De server resolved het token na
   * insert naar het echte `assets.id` en zet `debts.linked_asset_id`. Leeg in
   * commit-mode (/core) waar het echte id direct beschikbaar is.
   */
  client_ref?: string
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
  /**
   * Aflossingsvorm — alleen door de wizard uitgevraagd voor hypotheken
   * (`debt_type='mortgage'`). Vult de bestaande `debts.repayment_type`-kolom;
   * bepaalt de aflossingsprognose én (samen met het type) de box 1-
   * aftrekbaarheid. `undefined`/`null` ⇒ `buildDebtDraft` valt terug op
   * `DEBT_DEFAULT_REPAYMENT_TYPE`. Andere schuldtypes laten dit leeg.
   */
  repayment_type?: RepaymentType | null
  /**
   * Ingangsdatum (yyyy-mm-dd) — alleen uitgevraagd voor hypotheken, zodat een
   * al lopende hypotheek niet als "gestart vandaag" wordt vastgelegd. Vult de
   * bestaande `debts.start_date`-kolom en bepaalt daarmee `end_date`.
   * `undefined`/`null` ⇒ `buildDebtDraft` valt terug op vandaag.
   */
  start_date?: string | null
  /**
   * Onboarding-only koppel-token dat matcht met `AssetQuickInput.client_ref`
   * van de bijbehorende asset. Wordt door de onboarding-server na asset-insert
   * naar het echte `linked_asset_id` vertaald. Los van `linked_asset_id` zodat
   * de twee koppel-mechanismen (DB-id vs. client-token) elkaar niet bijten.
   */
  linked_client_ref?: string | null
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
