// ── Aangifte → Review-drafts builder ──
//
// Pure function: takes the AI-extraction result (or a manually filled
// equivalent) and produces the per-row review-payload that the review-
// step UI renders. One review row per extracted asset/debt; the user
// can edit, accept or remove each row before the import fires.
//
// Mirrors `lib/quick-add/build-drafts.ts` in spirit: a tiny adapter
// between an "extracted shape" and the "QuickInput shape" that the rest
// of the app speaks. The QuickInput shape uses a polymorphic `field3`
// to carry one type-specific extra value per asset/debt — this file
// re-encodes the strongly-typed extraction fields (institution-name,
// woz_value, repayment_type, interest_rate) into that polymorphic slot
// per the same type→field3 contract used by the manual quick-add wizard
// (see `buildAssetDraft` / `buildDebtDraft` for the canonical mapping).
//
// What lives here vs in the API import endpoint
// ----------------------------------------------
// Here (pure, browser-safe):
//   - Re-shape extraction-rows into review-shape rows.
//   - Compute `linked_mortgage_pairs` based on the (eigen_huis, mortgage)
//     pattern so the review-UI can render them as a single "Eigen woning"
//     card with both lines.
//
// In the API endpoint (server, with Supabase client):
//   - Stamp `source='aangifte_import'` and `imported_peildatum=<peildatum>`
//     onto each inserted row. We deliberately do NOT add these fields
//     here because the contract `AangifteAssetReviewItem extends
//     AssetQuickInput` does not include them — they are persistence
//     metadata, set at insert-time, not review-time.
//   - Resolve `linked_asset_id` (the just-created asset's UUID) for any
//     mortgage that was paired in `linked_mortgage_pairs`.
//   - Apply the optional `current_value_actual` / `current_balance_actual`
//     delta to create a peildatum-snapshot row.
//
// All consumers of this function should rely ONLY on the typed return
// value — no hidden side effects, no async work.

import type {
  AangifteAssetReviewItem,
  AangifteDebtReviewItem,
  AangifteLinkedMortgagePair,
} from './types'
import type { AangifteExtractionResult } from './extraction-schema'

// ── Field3 mapping ───────────────────────────────────────────────────
//
// `AssetQuickInput.field3` carries the type-specific third value used
// by `buildAssetDraft` to populate institution/woz/contribution/...
// We re-create that contract here so the manual wizard and the
// aangifte-import flow converge on a single QuickInput shape.

/**
 * Pick the right `field3` value per asset_type, mirroring the contract
 * in `lib/quick-add/build-drafts.ts:107-149`.
 *
 * - cash / savings / retirement → institution string. Aangifte gives us
 *   the bank-name in `name` (e.g. "ING betaalrekening"); we forward the
 *   first token as the institution so the user sees it in the
 *   institution-field too. We deliberately keep this conservative —
 *   guessing a multi-word institution is fragile, the user can fix it
 *   in the review-step or full form.
 * - eigen_huis → WOZ-value. The schema's `woz_value` field is the
 *   primary source; if it's missing fall back to `current_value` so the
 *   review-step never shows a confusing "0 WOZ" placeholder.
 * - investment / crypto / vordering / vehicle / real_estate / deelneming /
 *   levensverzekering / physical / other → null (we have no monthly
 *   inleg / rente / etc. in an aangifte; the review-step exposes those
 *   as optional follow-up fields).
 */
function pickAssetField3(
  asset_type: AangifteExtractionResult['assets'][number]['asset_type'],
  name: string,
  woz_value: number | null,
  current_value: number,
): string | number | null {
  switch (asset_type) {
    case 'cash':
    case 'savings':
    case 'retirement':
      // Heuristic: take the first whitespace-token of the name as the
      // institution. "ING betaalrekening" → "ING", "ASN spaarrekening"
      // → "ASN". Falls back to the full name if it's a single token.
      // The user sees this in the review-step and can edit; a wrong
      // guess is recoverable, an empty institution is just a default
      // we'll later fill in via the full form.
      return firstTokenOrNull(name)
    case 'eigen_huis':
      return woz_value ?? current_value
    default:
      return null
  }
}

/**
 * Pick the right `field3` value per debt_type. Mirrors
 * `buildDebtDraft` (`lib/quick-add/build-drafts.ts:210-249`):
 *   - mortgage / personal_loan / student_loan / car_loan / credit_card /
 *     revolving_credit / familielening / dga_schuld / other → interest
 *     rate (%). The schema's `interest_rate` is null when not in the
 *     aangifte, in which case the manual default in `buildDebtDraft`
 *     applies.
 *   - belastingschuld → tax_year (number). The aangifte never tells us
 *     this; null forces the user to fill it manually.
 *   - payment_plan → user-provided monthly amount (we never have it).
 *
 * For aangifte we forward the rate when present and null otherwise; the
 * manual quick-add defaults kick in downstream.
 */
function pickDebtField3(
  debt_type: AangifteExtractionResult['debts'][number]['debt_type'],
  interest_rate: number | null,
): number | string | null {
  switch (debt_type) {
    case 'belastingschuld':
    case 'payment_plan':
      // No reliable source for tax_year or monthly amount in an aangifte
      // — leave the user to fill it in.
      return null
    default:
      return interest_rate
  }
}

/**
 * Take the first whitespace-separated token, trimmed. Returns null for
 * empty strings so the institution field stays unset rather than
 * showing an empty string in the review-UI.
 */
function firstTokenOrNull(s: string): string | null {
  const trimmed = s.trim()
  if (!trimmed) return null
  const first = trimmed.split(/\s+/)[0]
  return first || null
}

// ── Mortgage-coupling logic ──────────────────────────────────────────

/**
 * Re-export of `AangifteLinkedMortgagePair` from `./types` zodat
 * bestaande consumers (`build-drafts.test.ts`, `review-step.tsx`) hun
 * import-paden niet hoeven aan te passen. Pair-indexen verwijzen naar
 * posities in de assets- en debts-arrays — de review-UI rendert ze als
 * één gecombineerde kaart, en de import-API gebruikt ze om
 * `debts.linked_asset_id` te vullen op de zojuist gepersisteerde rijen.
 *
 * Why indexes instead of object refs: de review-step laat de gebruiker
 * rijen verwijderen; object-refs zouden bij delete kunnen dangle.
 * Indexen zijn stabiel zolang de review-step de originele arrays intact
 * houdt, en de UI berekent de pairs opnieuw na elke mutatie.
 */
export type { AangifteLinkedMortgagePair }

/**
 * Build the (eigen_huis, mortgage) pairs in stable order.
 *
 * Pairing rules (V1 — simple greedy):
 *   - For every `eigen_huis` asset, find the first unused `mortgage`
 *     debt and pair them.
 *   - If counts mismatch (rare: one mortgage and two eigen_huis, or
 *     one eigen_huis and two mortgages), pair what we can; leftover
 *     rows render as standalone cards in the review-step.
 *
 * We do NOT attempt to match by name or amount — the review-UI lets the
 * user re-pair if the heuristic gets it wrong.
 */
function computeLinkedMortgagePairs(
  assets: AangifteAssetReviewItem[],
  debts: AangifteDebtReviewItem[],
): AangifteLinkedMortgagePair[] {
  const pairs: AangifteLinkedMortgagePair[] = []
  const usedDebtIdx = new Set<number>()

  for (let aIdx = 0; aIdx < assets.length; aIdx += 1) {
    if (assets[aIdx].asset_type !== 'eigen_huis') continue
    for (let dIdx = 0; dIdx < debts.length; dIdx += 1) {
      if (usedDebtIdx.has(dIdx)) continue
      if (debts[dIdx].debt_type !== 'mortgage') continue
      pairs.push({ asset_idx: aIdx, debt_idx: dIdx })
      usedDebtIdx.add(dIdx)
      break
    }
  }

  return pairs
}

// ── Box 1 component shape ────────────────────────────────────────────

/**
 * Box 1-component as it crosses into the review-UI. The schema-shape
 * already matches what the UI needs, so we just re-export the shape
 * here without re-mapping. Keeping the type local (instead of importing
 * from extraction-schema) decouples the public return-type from the
 * internal Zod plumbing — a pattern we already use elsewhere.
 */
export interface AangifteBox1ComponentDraft {
  kind: 'loon' | 'pensioen' | 'aow' | 'uitkering' | 'winst'
  annual_amount: number
  label: string
}

// ── Public return shape ──────────────────────────────────────────────

/**
 * What the review-step renders. `assets` and `debts` are
 * QuickInput-compatible (so the manual + AI paths converge); the
 * `linked_mortgage_pairs` give the UI the hint it needs to render
 * "Eigen woning" cards with both lines fused; `box1_components` flow
 * straight into the IncomeMappingSection; `peildatum` and `tax_year`
 * are echoed back so the review header can show them.
 */
export interface AangifteReviewDrafts {
  assets: AangifteAssetReviewItem[]
  debts: AangifteDebtReviewItem[]
  box1_components: AangifteBox1ComponentDraft[]
  peildatum: string
  tax_year: number
  linked_mortgage_pairs: AangifteLinkedMortgagePair[]
}

// ── Builder ──────────────────────────────────────────────────────────

/**
 * Pure transformer: AI-extraction result → review-step drafts.
 *
 * - Empty input arrays produce empty output arrays — no fakery.
 * - `peildatum` and `tax_year` are passed through verbatim. The review
 *   header expects them so it can show "Aangifte 2024 — peildatum 1
 *   januari 2024 (16 maanden geleden)".
 * - `linked_mortgage_pairs` is computed greedily; see
 *   `computeLinkedMortgagePairs` for the rules.
 *
 * No I/O, no async, no logging — safe to import anywhere.
 */
export function aangifteResultToReviewDrafts(
  result: AangifteExtractionResult,
): AangifteReviewDrafts {
  const assets: AangifteAssetReviewItem[] = result.assets.map((row) => ({
    asset_type: row.asset_type,
    name: row.name,
    current_value: row.current_value,
    field3: pickAssetField3(
      row.asset_type,
      row.name,
      row.woz_value,
      row.current_value,
    ),
  }))

  const debts: AangifteDebtReviewItem[] = result.debts.map((row) => ({
    debt_type: row.debt_type,
    name: row.name,
    current_balance: row.current_balance,
    field3: pickDebtField3(row.debt_type, row.interest_rate),
    // `linked_asset_id` is filled in by the API after the asset is
    // inserted and we have its UUID. We leave it null here even when
    // the row is paired — the index-based `linked_mortgage_pairs`
    // carries that information through the review-step.
    linked_asset_id: null,
  }))

  const box1_components: AangifteBox1ComponentDraft[] = result.box1_components.map(
    (row) => ({
      kind: row.kind,
      annual_amount: row.annual_amount,
      label: row.label,
    }),
  )

  const linked_mortgage_pairs = computeLinkedMortgagePairs(assets, debts)

  return {
    assets,
    debts,
    box1_components,
    peildatum: result.peildatum,
    tax_year: result.tax_year,
    linked_mortgage_pairs,
  }
}
