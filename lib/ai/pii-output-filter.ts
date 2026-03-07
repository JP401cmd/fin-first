/**
 * PII Output Filter — Safety net for AI responses
 *
 * Lightweight post-processing filter that scans AI-generated text
 * for accidentally leaked PII (IBANs, BSNs) and masks them before
 * the response reaches the user.
 *
 * This is a DEFENCE-IN-DEPTH measure — the system prompts already
 * instruct the model to avoid PII, and input sanitisation strips
 * PII before it reaches the model. This filter catches any residual
 * leakage in the output.
 *
 * Design goals:
 *  - Minimal latency (simple regex, no allocations if no match)
 *  - No false positives on financial amounts (€1.234,56) or percentages
 *  - Only targets high-risk PII: IBANs and BSNs
 */

// ── IBAN patterns ──────────────────────────────────────────────────

/** Dutch IBAN: NL + 2 digits + 4 uppercase letters + 10 digits (with optional spaces) */
const IBAN_NL_RE = /\bNL\s?\d{2}\s?[A-Z]{4}\s?\d{4}\s?\d{4}\s?\d{2}\b/gi

/** Other European IBANs (DE, BE, FR, etc.) */
const IBAN_INTL_RE = /\b[A-Z]{2}\s?\d{2}\s?[A-Z0-9]{4}(?:\s?[A-Z0-9]{4}){2,7}(?:\s?[A-Z0-9]{1,4})?\b/g

// ── BSN pattern ────────────────────────────────────────────────────

/** BSN: exactly 9 digits — word-boundary guarded */
const BSN_RE = /\b\d{9}\b/g

// ── Mask constants ─────────────────────────────────────────────────

const IBAN_MASK = '****'
const BSN_MASK = '****'

// ── Core filter function ───────────────────────────────────────────

/**
 * Mask IBANs and BSNs in an AI-generated output string.
 *
 * Financial amounts (€1.234,56), percentages (12,5%), and other
 * numeric data are intentionally preserved.
 *
 * Returns the original string reference if no PII is found (zero-copy).
 */
export function maskPIIInOutput(text: string): string {
  if (!text) return text

  let result = text

  // 1. Mask Dutch IBANs
  result = result.replace(IBAN_NL_RE, IBAN_MASK)

  // 2. Mask international IBANs (only if long enough to avoid false positives)
  result = result.replace(IBAN_INTL_RE, (match) => {
    if (match.replace(/\s/g, '').length < 15) return match
    return IBAN_MASK
  })

  // 3. Mask BSN patterns (9-digit numbers not preceded by currency context)
  result = result.replace(BSN_RE, (match, offset: number) => {
    // Don't mask if preceded by currency indicator (€, EUR, comma, dot)
    const before = result.substring(Math.max(0, offset - 5), offset).trim()
    if (before.endsWith('€') || before.endsWith('EUR') || before.endsWith(',') || before.endsWith('.')) {
      return match
    }
    // Don't mask if followed by comma/dot + digits (likely a large number like 123456789,00)
    const after = result.substring(offset + match.length, offset + match.length + 2)
    if (/^[,.]/.test(after)) {
      return match
    }
    return BSN_MASK
  })

  return result
}

// ── Object deep-filter ─────────────────────────────────────────────

/**
 * Recursively mask PII in all string values of a plain object.
 * Useful for structured AI responses (news items, briefing cards).
 */
export function maskPIIInObject<T>(obj: T): T {
  if (typeof obj === 'string') {
    return maskPIIInOutput(obj) as T
  }
  if (Array.isArray(obj)) {
    return obj.map(maskPIIInObject) as T
  }
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = maskPIIInObject(value)
    }
    return result as T
  }
  return obj
}
