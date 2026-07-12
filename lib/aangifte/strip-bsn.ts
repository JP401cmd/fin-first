// ── BSN-strip — pure helper for client-side data minimisation ──
//
// Strips Burgerservicenummers (BSN) from text BEFORE it crosses the
// browser-server boundary on its way to the AI extraction step.
// Runs in the browser, on the raw text extracted from a PDF by
// `pdfjs-dist`. The server never sees a BSN — the AI provider
// definitely does not.
//
// **Scope** of this helper is intentionally narrow: only the 9-digit
// BSN-pattern. The richer PII filter `lib/ai/sanitize.ts` already
// strips IBAN, email, phone, addresses for the financial-news flow,
// but that helper is too aggressive for an aangifte (it would replace
// city names that happen to follow a postal code, even when they are
// actually a "Plaats van uitgifte" header). The aangifte path uses a
// surgical strip: BSN out, everything else stays.
//
// IBANs explicitly remain in the text — they contain letters between
// the digits (NL91ABNA0417164300), so the 9-digit-boundary regex below
// does not match them. This is verified in strip-bsn.test.ts.

/**
 * Result of `stripSensitiveData`. The caller logs `strippedCount` for
 * audit purposes (we want to be able to assert "0 BSNs left the browser
 * for user X"), but never logs `clean` itself — that still contains
 * financial data.
 */
export interface StripResult {
  clean: string
  strippedCount: number
}

/**
 * BSN regex — exactly nine consecutive digits with word boundaries on
 * both sides. The `\b` ensures we don't match digit-runs that are part
 * of a longer number (e.g. an account-number that happens to contain
 * 9 digits in the middle). Global flag so we replace every match.
 *
 * Verified non-matches:
 *   - 8 digits ("12345678")
 *   - 10 digits ("1234567890")
 *   - 9 digits embedded in a longer digit-run ("123456789012")
 *   - 9 digits with letters around them ("NL91ABNA0417164300")
 *
 * Verified matches:
 *   - "123456789" (standalone)
 *   - "BSN: 123456789 here"
 *   - "Partner-BSN 987654321"
 */
const BSN_RE = /\b\d{9}\b/g

/**
 * Replace every 9-digit BSN-pattern in `text` with the literal `[BSN]`
 * marker. Returns the cleaned text plus a count of replacements made.
 *
 * Pure function — no side effects, no async. Safe to call on every
 * keystroke or on every PDF parse without performance concerns
 * (regex.replace is O(n) over the input).
 *
 * @param text Free-form text, typically the output of a PDF parser.
 * @returns Cleaned text + number of BSNs replaced.
 */
export function stripSensitiveData(text: string): StripResult {
  // Short-circuit on empty / non-string input. Defensive — the caller
  // is supposed to pass a string, but PDF parsers occasionally yield
  // an empty string for blank pages and we don't want to allocate a
  // regex pass for that.
  if (!text) {
    return { clean: '', strippedCount: 0 }
  }

  let strippedCount = 0
  const clean = text.replace(BSN_RE, () => {
    strippedCount += 1
    return '[BSN]'
  })

  return { clean, strippedCount }
}

// ── Household-name strip — surgical name removal for the aangifte path ──
//
// The aangifte path deliberately does NOT run the full `sanitizeForAI`
// filter (its POSTCODE/STREET heuristics would clobber legitimate
// aangifte headers — see the file header). But the fiscal-partner name,
// the applicant name and their income/asset lines DO identify a person,
// so before the (already-BSN-stripped) text crosses to the AI provider
// we replace the known household names with a neutral `[NAAM]` marker.
//
// Only the names we KNOW (from `profiles.full_name` of the user + their
// household partner) are stripped — we never guess at arbitrary
// capitalised words, so aangifte terminology stays intact. Full name is
// replaced first, then individual parts (≥3 chars, minus Dutch
// tussenvoegsels) so "J. de Vries" and "Vries" both disappear.

/** Dutch tussenvoegsels that are too generic to strip as a name part. */
const DUTCH_NAME_PARTICLES = new Set([
  'de', 'het', 'van', 'der', 'den', 'ter', 'ten', 'te', 'op', 'in', 'aan',
])

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Replace every occurrence of the supplied household names (and their
 * significant parts) with `[NAAM]`. Returns the cleaned text plus a
 * count of replacements. Pure function — safe to call on the aangifte
 * text after `stripSensitiveData`.
 *
 * @param text  Free-form text (typically already BSN-stripped).
 * @param names Known household full names, e.g. ['Jan de Vries', 'Maria de Vries'].
 */
export function stripHouseholdNames(text: string, names: string[]): StripResult {
  if (!text) return { clean: '', strippedCount: 0 }

  const cleanNames = [...new Set(names.filter((n): n is string => typeof n === 'string' && n.trim().length >= 3))]
    .sort((a, b) => b.length - a.length)
  if (cleanNames.length === 0) return { clean: text, strippedCount: 0 }

  let strippedCount = 0
  let result = text
  for (const name of cleanNames) {
    result = result.replace(new RegExp(escapeRegex(name.trim()), 'gi'), () => {
      strippedCount += 1
      return '[NAAM]'
    })
    const parts = name
      .split(/\s+/)
      .filter((p) => p.length >= 3 && !DUTCH_NAME_PARTICLES.has(p.toLowerCase()))
    for (const part of parts) {
      result = result.replace(new RegExp(`\\b${escapeRegex(part)}\\b`, 'gi'), () => {
        strippedCount += 1
        return '[NAAM]'
      })
    }
  }

  return { clean: result, strippedCount }
}
