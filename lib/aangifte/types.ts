// ── Aangifte-import — shared interface contracts ──
//
// Single point of truth for the request/response shapes that flow
// between the Phase-B components built by the parallel agents. Keeping
// these in one file means:
//
//   - The frontend (`components/aangifte/review-step.tsx`) and the API
//     route (`app/api/onboarding/aangifte-import/route.ts`) cannot
//     drift apart — TypeScript catches mismatched fields.
//
//   - The Phase-B agents can build in parallel without coordinating on
//     ad-hoc shapes; both import from this module.
//
// Conventions:
//   - Re-export `AangifteExtractionResult` from extraction-schema.ts so
//     consumers do not need to know about the Zod plumbing — they
//     import the shape from `lib/aangifte/types.ts` and never see Zod.
//   - Payload types extend `AssetQuickInput` / `DebtQuickInput` from
//     `lib/quick-add/types.ts` so the manual wizard, the AI extraction
//     and the QuickAdd flow share one input shape — same type-safe
//     defaults via `buildAssetDraft` / `buildDebtDraft` later.
//   - The `_actual` fields carry the optional "current value" override
//     entered in the review-step. When present, the import endpoint
//     creates **two** records: a `balance_snapshots` row at peildatum
//     plus an `assets`/`debts` row at the actual current value.

import type { AssetQuickInput, DebtQuickInput } from '@/lib/quick-add/types'

// ── Re-export the extraction result type for convenience ─────────────

export type { AangifteExtractionResult } from './extraction-schema'

// ── Profile fields the import flow may update ────────────────────────

/**
 * Subset of `profiles` columns that the aangifte-import flow can update.
 * Keeps the surface minimal — we never let the import touch unrelated
 * columns. Mirror of the columns added in
 * `<...>_add_aangifte_profile_fields.sql`.
 *
 * `income_type` uses the same enum as the migration's CHECK constraint;
 * we keep it as `string` here (with the union in a JSDoc) so that any
 * value mismatch surfaces as a Postgres CHECK violation rather than a
 * TS incompatibility — the server boundary re-validates.
 */
export interface AangifteProfileUpdates {
  /** Bruto jaarloon in EUR. Omit to leave existing value unchanged. */
  gross_annual_income?: number
  /** Whether the user receives AOW. Omit if the user did not confirm. */
  aow_active?: boolean
  /**
   * Income categorisation. One of:
   * `employee` | `self_employed` | `mixed` | `pension` | `unemployed`.
   * Validated against the `profiles_income_type_check` CHECK constraint.
   */
  income_type?: 'employee' | 'self_employed' | 'mixed' | 'pension' | 'unemployed'
}

// ── Asset / Debt review payloads ─────────────────────────────────────

/**
 * One asset row as it exits the review-step and enters the import API.
 * Extends `AssetQuickInput` with an optional `current_value_actual`:
 * when filled, the import creates a peildatum-snapshot at
 * `current_value` and stores `current_value_actual` as the live row's
 * `current_value`.
 */
export interface AangifteAssetReviewItem extends AssetQuickInput {
  /**
   * Current actual value as of today, optionally overridden by the user
   * during review. When present, the import endpoint creates a
   * `balance_snapshots` row at peildatum AND inserts the asset with
   * `current_value = current_value_actual` so the live row reflects
   * present reality.
   */
  current_value_actual?: number
}

/**
 * One debt row as it exits the review-step. Same delta-pattern as
 * `AangifteAssetReviewItem`.
 */
export interface AangifteDebtReviewItem extends DebtQuickInput {
  /**
   * Current actual balance as of today. See
   * `AangifteAssetReviewItem.current_value_actual` for semantics.
   */
  current_balance_actual?: number
}

// ── Mortgage-coupling pair ───────────────────────────────────────────

/**
 * Eén (eigen_huis, mortgage) koppeling — door indexen in de assets- en
 * debts-arrays geïdentificeerd. De client-side builder
 * (`lib/aangifte/build-drafts.ts`) berekent deze pairs op basis van wat
 * de gebruiker uiteindelijk reviewt; de server gebruikt ze om
 * `debts.linked_asset_id` te vullen op de zojuist ingevoegde rijen.
 *
 * Indexen verwijzen naar de **post-review, pre-skip** posities — de
 * client moet zijn pairs herberekenen na elke remove/skip-operatie zodat
 * de indexen consistent blijven met de uiteindelijk verstuurde
 * `assets[]` en `debts[]` arrays.
 */
export interface AangifteLinkedMortgagePair {
  asset_idx: number
  debt_idx: number
}

// ── Import payload (frontend → API) ──────────────────────────────────

/**
 * What the review-step posts to `/api/onboarding/aangifte-import`.
 * Carries everything needed to create the assets, debts, profile-update
 * and balance_snapshots rows in one transaction.
 *
 * `idempotency_key` follows the same convention as
 * `/api/onboarding/save-own-data`: a client-generated UUID that the
 * server uses to dedupe duplicate submits (page-refresh, double-click).
 */
export interface AangifteImportPayload {
  assets: AangifteAssetReviewItem[]
  debts: AangifteDebtReviewItem[]
  profile_updates: AangifteProfileUpdates
  /**
   * Peildatum als ISO datestring (yyyy-mm-dd). Always 1 January of the
   * tax year for an aangifte-import.
   */
  peildatum: string
  /** Tax year, e.g. 2024 for a 2024 aangifte. */
  tax_year: number
  /** Client-generated UUID for idempotent retries. */
  idempotency_key: string
  /**
   * Optional: client-computed pairs of (eigen_huis asset, mortgage debt).
   * When present, the server uses these explicitly to set
   * `debts.linked_asset_id`. When absent (older clients), the server falls
   * back to greedy heuristic matching of the first eigen_huis to all
   * unlinked mortgages — backward-compat met de B3-implementatie.
   */
  linked_mortgage_pairs?: AangifteLinkedMortgagePair[]
}

// ── Import response (API → frontend) ─────────────────────────────────

/**
 * What the import endpoint returns. The success branch surfaces the
 * created IDs so the frontend can deeplink straight into the new
 * records (e.g. for the post-import "Verifieer"-pill flow). The
 * failure branch returns a single human-readable error string — the
 * server logs structured details for debugging, but the client never
 * sees BSN/amounts/etc.
 */
export type AangifteImportResponse =
  | {
      ok: true
      asset_ids: string[]
      debt_ids: string[]
    }
  | {
      ok: false
      error: string
    }
