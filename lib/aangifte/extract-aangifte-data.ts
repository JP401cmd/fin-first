// ── Aangifte AI Extraction — structured extraction from aangifte text ──
//
// Reads the (already-BSN-stripped) text-content of a Dutch
// belastingaangifte and returns a strict, whitelist-validated object
// describing the assets, debts and Box 1 income components found.
//
// Mirrors the proven shape of `lib/ai/extract-financial-data.ts`:
//   - Same `getModel(supabase)` resolver for provider+API-key lookup.
//   - Same `app_settings` override pattern (key: AANGIFTE_PROMPT_OVERRIDE_KEY)
//     so admins can iterate on the prompt without redeploying.
//   - Same fail-graceful contract: on any failure the function returns
//     a structurally valid empty result so the UI can recover into the
//     manual wizard fallback. We never throw at the caller.
//
// Privacy & AVG-overwegingen
// --------------------------
// 1. INPUT-MINIMISATIE: callers MUST run `stripSensitiveData()` from
//    `./strip-bsn.ts` BEFORE calling this function. The function itself
//    does NOT re-strip — the API route does it as a server-side
//    defense-in-depth, and the browser does it as the primary control.
//    Calling without stripping leaks BSNs to the AI provider.
//
// 2. NO LOGGING OF AMOUNTS OR NAMES: the body of an aangifte is sensitive
//    by definition (financial + identifiable). We log only:
//      - The presence of an override row (boolean).
//      - The schema-validation error TYPE (no message bodies, which
//        could echo amounts back).
//      - The number of items extracted (counts only — no values).
//    We deliberately do NOT log `text.length` either; that combined with
//    a known PDF template hash could be used to fingerprint a user.
//
// 3. NO PERSISTENCE: the aangifte text is not stored anywhere. It crosses
//    the wire to the AI provider once, the result is returned, and the
//    text is dropped on the floor by the caller (the API route never
//    persists it; the client review-step keeps only the structured
//    result in component-state).
//
// 4. STRICT SCHEMA: `extractionSchema` is a `.strict()` Zod object —
//    unknown keys cause a parse error, not a silent passthrough. The AI
//    SDK's `generateObject` enforces this at the provider boundary too,
//    so a misbehaving model cannot inject extra fields.

import { generateObject } from 'ai'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getModel } from '@/lib/ai/config'
import {
  extractionSchema,
  type AangifteExtractionResult,
} from './extraction-schema'
import {
  AANGIFTE_PROMPT_OVERRIDE_KEY,
  DEFAULT_AANGIFTE_EXTRACTION_PROMPT,
} from './system-prompt'

// ── Constants ───────────────────────────────────────────────────────

/**
 * Minimum input length to attempt extraction. Below this we short-circuit
 * to an empty result — too-short inputs are almost always a parser
 * failure on the client (corrupt PDF, blank page) and the AI call would
 * waste tokens for a guaranteed empty answer.
 */
const MIN_TEXT_LENGTH = 50

/**
 * Build an empty `AangifteExtractionResult` with the fallback peildatum.
 * Centralised so both the early-exit path and the catch-block return the
 * exact same shape — the consumer can always rely on `result.assets`
 * and `result.debts` being arrays.
 */
function buildEmptyResult(fallbackTaxYear: number): AangifteExtractionResult {
  return {
    assets: [],
    debts: [],
    box1_components: [],
    peildatum: `${fallbackTaxYear}-01-01`,
    tax_year: fallbackTaxYear,
  }
}

// ── Main Extraction Function ────────────────────────────────────────

/**
 * Extracts structured aangifte-data from already-cleaned text.
 *
 * Flow:
 *   1. Resolve the AI model via `getModel(supabase)`.
 *   2. Read the optional system-prompt override from `app_settings`.
 *   3. Hand the text to `generateObject` with the strict schema.
 *   4. On any failure, return a structurally valid empty result.
 *
 * @param supabase
 *   Authenticated Supabase client. Used for model resolution and to
 *   read the optional `app_settings` row that overrides the default
 *   system prompt. The function does NOT use the client for inserts
 *   or row-level data — extraction is read-only.
 * @param text
 *   The aangifte text, ALREADY stripped of BSN by
 *   `stripSensitiveData()`. Free-form Dutch text — typically the
 *   output of a `pdfjs-dist` text-extract or a paste from the user.
 * @param fallbackTaxYear
 *   Year to use when the model cannot detect the tax year from the
 *   text (e.g. uploaded a sub-section without a header). Defaults to
 *   the current calendar year.
 * @returns
 *   A `AangifteExtractionResult` matching `extractionSchema`. On
 *   failure the result is structurally valid but content-empty.
 */
export async function extractAangifteData(
  supabase: SupabaseClient,
  text: string,
  fallbackTaxYear: number = new Date().getFullYear(),
): Promise<AangifteExtractionResult> {
  // Short-circuit on too-short input. We don't log the length — see
  // the privacy section above for why.
  if (!text || text.trim().length < MIN_TEXT_LENGTH) {
    return buildEmptyResult(fallbackTaxYear)
  }

  try {
    // 1) Resolve the configured AI model. This may throw `AIConfigError`
    // if no provider is set up — we let it bubble into our catch so the
    // UI gets the same empty-result fallback regardless of cause.
    const model = await getModel(supabase, 'aangifte_extractie')

    // 2) Optional admin override of the system prompt. Stored in the
    // shared `app_settings` table under the stable key from
    // `system-prompt.ts`. If the row doesn't exist or is empty, fall
    // back to the in-code default.
    const { data: overrideRow } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', AANGIFTE_PROMPT_OVERRIDE_KEY)
      .maybeSingle()
    const systemPrompt =
      typeof overrideRow?.value === 'string' && overrideRow.value.trim().length > 0
        ? overrideRow.value
        : DEFAULT_AANGIFTE_EXTRACTION_PROMPT

    // 3) The user-prompt is intentionally minimal: a tiny preamble that
    // tells the model how to interpret the fallback-year, then the raw
    // text. The system-prompt carries all the rules and examples; the
    // user-prompt is essentially the data payload.
    const userPrompt = `Aangiftetekst hieronder. Als je geen jaartal kunt afleiden uit de tekst, gebruik dan ${fallbackTaxYear} als fallback (peildatum wordt dan ${fallbackTaxYear}-01-01).\n\n--- BEGIN AANGIFTETEKST ---\n${text.trim()}\n--- EINDE AANGIFTETEKST ---`

    const { object } = await generateObject({
      model,
      schema: extractionSchema,
      system: systemPrompt,
      prompt: userPrompt,
    })

    // 4) Counts-only logging — confirms the call succeeded and gives
    // operators a coarse sense of "is the prompt working?" without
    // leaking values. Never log names, amounts, or peildatum here.
    console.log(
      '[extract-aangifte-data] Extraction complete:',
      `${object.assets.length} assets,`,
      `${object.debts.length} debts,`,
      `${object.box1_components.length} box1 components`,
    )

    return object
  } catch (err) {
    // Log only the error TYPE — never the message body, which the SDK
    // sometimes echoes parts of the input back into. `err.name` for
    // structured errors (ZodError, AIConfigError, ...) and 'Unknown'
    // otherwise; this is enough to triage in operational logs without
    // leaking PII.
    const errorType = err instanceof Error ? err.name : 'Unknown'
    console.error('[extract-aangifte-data] Extraction failed:', errorType)
    return buildEmptyResult(fallbackTaxYear)
  }
}
