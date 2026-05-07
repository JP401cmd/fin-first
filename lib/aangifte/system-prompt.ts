// ── Aangifte Extraction System Prompt — placeholder ──
//
// Single source of truth for the AI system prompt used during
// belastingaangifte-extraction. Imported by:
//   - lib/aangifte/extract-aangifte-data.ts (Phase B Agent 1) — feeds
//     this string to `generateObject` as the `system` parameter.
//   - Admin prompt-override management (future) — same pattern as
//     `extraction_system_prompt` for the news-only flow.
//
// Phase A leaves this as a placeholder so Phase-B-Agent-1 (AI extraction)
// is not blocked on a missing module while the prompt is being authored.
// The placeholder is intentionally short and detectable; running the
// extraction with this stub will produce structurally correct but
// content-empty results, surfacing the missing prompt clearly during
// Phase-B development.
//
// Phase-B-Agent-1 SHOULD overwrite this constant with the real Dutch
// system prompt that:
//   - Lists every Box 1/2/3 field name as it appears in the aangifte.
//   - Spells out the data-minimisation whitelist (BSN/IBAN/NAW excluded).
//   - Provides 2-3 short PDF-fragment examples to anchor the model.
//   - Warns against "behulpzame" extra context in description fields.

/**
 * Default system prompt for AI extraction of a Dutch belastingaangifte.
 *
 * **Phase A status: placeholder.** Phase-B-Agent-1 fills the real prompt.
 * Until then, callers should read the override row from `app_settings`
 * (key: `aangifte_extraction_prompt`) when present — that path bypasses
 * this stub entirely.
 */
export const DEFAULT_AANGIFTE_EXTRACTION_PROMPT = `[STUB — wordt ingevuld in Fase B Agent 1]`

/**
 * Stable `app_settings` key for the runtime override of the prompt.
 * Centralising the key here means the API route, the admin UI and the
 * extraction call all use the same string — typo-proof.
 */
export const AANGIFTE_PROMPT_OVERRIDE_KEY = 'aangifte_extraction_prompt' as const
