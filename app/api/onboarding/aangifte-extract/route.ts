// ── /api/onboarding/aangifte-extract — POST ──
//
// Authenticated endpoint that turns aangifte text (already pre-stripped
// in the browser) into a strict, schema-validated extraction result.
// Returns `AangifteExtractionResult` directly so the client review-step
// can render it without re-shaping.
//
// Pipeline:
//   1. Auth check (401 if no session).
//   2. Body validation via Zod (`text` + optional `fallback_tax_year`).
//   3. Server-side defense-in-depth: re-run `stripSensitiveData()` on the
//      already-cleaned text. The browser is the primary control, but if
//      a client bug or a network proxy strips the BSN-strip, we still
//      catch it here. Logs ONLY the count, never the matched values.
//   4. Run `extractAangifteData()` — fail-graceful, never throws.
//   5. Re-validate the result with `extractionSchema.safeParse()` before
//      returning. This is belt-and-braces: the AI SDK already enforced
//      the schema once, but a future SDK version might loosen that
//      contract. We add this server boundary check so any schema-drift
//      surfaces as a 500 here rather than silently flowing to the
//      client.
//
// Privacy
// -------
// - The endpoint logs ONLY:
//   - The number of BSNs the server-side strip caught (zero in normal
//     operation; >0 means the client missed some — that's a bug).
//   - The number of items extracted (counts only).
//   - Schema-validation error TYPE on failure (no message bodies).
// - The endpoint does NOT log: amounts, names, raw text, response
//   bodies, or anything that could re-identify a user.
// - The aangifte text is NOT persisted; it lives in memory for the
//   duration of this request and is dropped on response.
//
// Idempotency: not needed. Extraction is read-only — no DB writes
// happen in this route. The eventual import endpoint
// (`/api/onboarding/aangifte-import`) handles idempotency via the
// `idempotency_key` field; this extract route can be retried freely.

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { extractAangifteData } from '@/lib/aangifte/extract-aangifte-data'
import { extractionSchema } from '@/lib/aangifte/extraction-schema'
import { stripSensitiveData } from '@/lib/aangifte/strip-bsn'

// ── Body validation ─────────────────────────────────────────────────

/**
 * Request body. `text` is the aangifte content the client extracted
 * with pdfjs-dist (or pasted manually); `fallback_tax_year` lets the
 * client tell the AI which year to assume if the text itself doesn't
 * contain a year header.
 *
 * Length cap (200_000) is generous for a multi-page aangifte
 * (typically 30-50 KB of text) but bounded so a malformed PDF cannot
 * exhaust an LLM context window and rack up token costs. Matches the
 * order of magnitude of comparable extraction endpoints in the AI SDK
 * docs.
 */
const bodySchema = z.object({
  text: z.string().min(1).max(200_000),
  fallback_tax_year: z
    .number()
    .int()
    .min(2000)
    .max(2100)
    .optional(),
})

// ── POST ────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON-body' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return Response.json({ error: 'Ongeldige invoer' }, { status: 400 })
  }

  // Defense-in-depth: re-strip BSNs on the server. The browser already
  // does this (see `stripSensitiveData` callsite in the upload pane),
  // but if a client bug or a malicious caller sends raw text we cannot
  // silently let BSNs cross into the AI provider. We log the count
  // only — the cleaned text is never logged.
  const { clean, strippedCount } = stripSensitiveData(parsed.data.text)
  if (strippedCount > 0) {
    // Counts-only audit log — see privacy section in the file header.
    console.warn(
      '[onboarding/aangifte-extract] Server-side BSN strip caught',
      strippedCount,
      'instances; client should have stripped these',
    )
  }

  // Default the fallback year to the current calendar year. The
  // extraction function applies the same default, but threading it
  // through the request makes the contract explicit.
  const fallbackYear = parsed.data.fallback_tax_year ?? new Date().getFullYear()

  try {
    const result = await extractAangifteData(supabase, clean, fallbackYear)

    // Belt-and-braces: re-validate the result against the public Zod
    // schema. `generateObject` already validates once, but the
    // additional parse here pins the contract at the API boundary so
    // any future SDK regression surfaces as a clear 500 rather than
    // silently leaking malformed data to the client.
    const reparsed = extractionSchema.safeParse(result)
    if (!reparsed.success) {
      console.error(
        '[onboarding/aangifte-extract] Schema-drift in extraction result:',
        reparsed.error.name,
      )
      return Response.json(
        { error: 'Extractie heeft een onverwacht formaat opgeleverd' },
        { status: 500 },
      )
    }

    return Response.json(reparsed.data)
  } catch (err) {
    // The extraction function is fail-graceful, so we should rarely hit
    // this branch — but guard anyway. Log only the error type to keep
    // the operational logs free of PII/amounts.
    const errorType = err instanceof Error ? err.name : 'Unknown'
    console.error('[onboarding/aangifte-extract] Extraction error:', errorType)
    return Response.json({ error: 'Extractie mislukt' }, { status: 500 })
  }
}
