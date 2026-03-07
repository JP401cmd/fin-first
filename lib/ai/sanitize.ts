/**
 * sanitizeForAI — Data minimisation utility
 *
 * Strips or replaces personally identifiable information (PII) before
 * any text is sent to an external AI provider.
 *
 * What is REMOVED / REPLACED:
 *  - IBANs          → [IBAN]
 *  - BSN patterns   → [BSN]
 *  - Email addresses → [EMAIL]
 *  - Phone numbers  → [TELEFOON]
 *  - Birth dates    → age in years
 *  - Full names     → 'gebruiker' / 'partner'
 *  - Street addresses → [ADRES]
 *
 * What is KEPT (required for financial analysis):
 *  - Currency amounts, percentages, ratios
 *  - Category labels, budget names
 *  - Dates (month/year only — day is stripped where part of PII)
 */

// ── Regex patterns ──────────────────────────────────────────────────

/** Dutch IBAN: NL + 2 digits + 4 uppercase letters + 10 digits (with optional spaces) */
const IBAN_RE = /\bNL\s?\d{2}\s?[A-Z]{4}\s?\d{4}\s?\d{4}\s?\d{2}\b/gi

/** Other European IBANs (DE, BE, FR, etc.) — 2-letter country + 2 check + up to 30 alphanumeric */
const IBAN_INTL_RE = /\b[A-Z]{2}\s?\d{2}\s?[A-Z0-9]{4}(?:\s?[A-Z0-9]{4}){2,7}(?:\s?[A-Z0-9]{1,4})?\b/g

/** BSN: exactly 9 digits (Dutch citizen service number) — word-boundary guarded */
const BSN_RE = /\b\d{9}\b/g

/** Email addresses */
const EMAIL_RE = /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g

/** Dutch phone numbers: +31, 06, 0xx-xxxxxxx variants */
const PHONE_RE = /(?:\+31|0)\s?[1-9](?:[\s\-]?\d){7,9}\b/g

/** Dutch postal code + city pattern (1234 AB Amsterdam) */
const POSTCODE_RE = /\b\d{4}\s?[A-Z]{2}\b\s+[A-Z][a-z]+(?:\s[A-Z][a-z]+)*/g

/** Street address pattern (Kerkstraat 12, Hoofdweg 123a) */
const STREET_RE = /\b[A-Z][a-z]+(?:straat|weg|laan|plein|gracht|kade|singel|dijk|dreef|hof|pad|steeg|markt|ring|baan|boulevard|allee)\s+\d+[a-zA-Z]?\b/gi

/** ISO date (yyyy-mm-dd) — used to detect birth dates */
const ISO_DATE_RE = /\b(\d{4})-(\d{2})-(\d{2})\b/g

// ── Types ───────────────────────────────────────────────────────────

export interface SanitizeOptions {
  /** Full name(s) to replace — e.g. ['Jan de Vries', 'Maria de Vries'] */
  names?: string[]
  /** If provided, birth-date strings matching this value are converted to age */
  dateOfBirth?: string | null
  /** Label to use for the primary user (default: 'gebruiker') */
  userLabel?: string
  /** Label to use for a partner (default: 'partner') */
  partnerLabel?: string
}

export interface TransactionInput {
  amount: number
  is_income: boolean
  category?: string | null
  description?: string | null
  counterparty_name?: string | null
  date?: string | null
}

export interface SanitizedTransaction {
  amount: number
  is_income: boolean
  category: string
  month?: string  // yyyy-MM only
}

// ── Core sanitise function ──────────────────────────────────────────

/**
 * Sanitise a free-text string by replacing PII patterns.
 *
 * Financial amounts (€1.234,56), percentages (12,5%), and ratios (0.04)
 * are intentionally preserved.
 */
export function sanitizeForAI(text: string, options: SanitizeOptions = {}): string {
  const {
    names = [],
    dateOfBirth,
    userLabel = 'gebruiker',
    partnerLabel = 'partner',
  } = options

  let result = text

  // 1. Replace IBANs (Dutch first, then international)
  result = result.replace(IBAN_RE, '[IBAN]')
  result = result.replace(IBAN_INTL_RE, (match) => {
    // Avoid false positives on short uppercase words
    if (match.replace(/\s/g, '').length < 15) return match
    return '[IBAN]'
  })

  // 2. Replace email addresses (before BSN to avoid partial matches)
  result = result.replace(EMAIL_RE, '[EMAIL]')

  // 3. Replace phone numbers
  result = result.replace(PHONE_RE, '[TELEFOON]')

  // 4. Replace BSN patterns (9-digit numbers not preceded by € or currency context)
  result = result.replace(BSN_RE, (match, offset: number) => {
    // Don't replace if preceded by € or currency indicator
    const before = result.substring(Math.max(0, offset - 3), offset).trim()
    if (before.endsWith('€') || before.endsWith('EUR') || before.endsWith(',') || before.endsWith('.')) {
      return match
    }
    return '[BSN]'
  })

  // 5. Replace birth date with age if provided
  if (dateOfBirth) {
    const dobPattern = new RegExp(escapeRegex(dateOfBirth), 'g')
    const age = calculateAge(dateOfBirth)
    result = result.replace(dobPattern, `${age} jaar`)

    // Also replace common Dutch date formats of the same date
    const d = new Date(dateOfBirth)
    if (!isNaN(d.getTime())) {
      const ddmmyyyy = `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`
      const dmyyyy = `${d.getDate()}-${d.getMonth() + 1}-${d.getFullYear()}`
      for (const fmt of [ddmmyyyy, dmyyyy]) {
        result = result.replace(new RegExp(escapeRegex(fmt), 'g'), `${age} jaar`)
      }
    }
  }

  // 6. Replace known names (longest first to avoid partial matches)
  const sortedNames = [...names].filter(Boolean).sort((a, b) => b.length - a.length)
  for (let i = 0; i < sortedNames.length; i++) {
    const name = sortedNames[i]
    const label = i === 0 ? userLabel : partnerLabel
    // Replace full name and individual parts (first/last)
    result = result.replace(new RegExp(escapeRegex(name), 'gi'), label)
    // Also replace individual name parts (>= 3 chars to avoid false positives)
    const parts = name.split(/\s+/).filter((p) => p.length >= 3 && !DUTCH_PREPOSITIONS.has(p.toLowerCase()))
    for (const part of parts) {
      result = result.replace(new RegExp(`\\b${escapeRegex(part)}\\b`, 'gi'), label)
    }
  }

  // 7. Replace street addresses
  result = result.replace(STREET_RE, '[ADRES]')

  // 8. Replace postal codes with city
  result = result.replace(POSTCODE_RE, '[ADRES]')

  return result
}

// ── Transaction sanitiser ───────────────────────────────────────────

/**
 * Reduce a transaction to category + amount only.
 * Raw descriptions and counterparty names are stripped.
 */
export function sanitizeTransaction(tx: TransactionInput): SanitizedTransaction {
  const result: SanitizedTransaction = {
    amount: tx.amount,
    is_income: tx.is_income,
    category: tx.category || 'onbekend',
  }

  // Keep only year-month from date
  if (tx.date) {
    result.month = tx.date.substring(0, 7) // yyyy-MM
  }

  return result
}

/**
 * Sanitise an array of transactions — strips descriptions,
 * keeps only category + amount + month.
 */
export function sanitizeTransactions(txs: TransactionInput[]): SanitizedTransaction[] {
  return txs.map(sanitizeTransaction)
}

// ── Birth date → age conversion ─────────────────────────────────────

/**
 * Convert a date-of-birth string to age in years.
 * Returns the age as a number, or null if the input is invalid.
 */
export function birthDateToAge(dateOfBirth: string | null | undefined): number | null {
  if (!dateOfBirth) return null
  const age = calculateAge(dateOfBirth)
  return age > 0 && age < 150 ? age : null
}

// ── Helpers ─────────────────────────────────────────────────────────

/** Dutch prepositions that should not be treated as name parts */
const DUTCH_PREPOSITIONS = new Set([
  'de', 'het', 'van', 'der', 'den', 'ter', 'ten', 'te', 'op', 'in', 'aan',
])

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function calculateAge(dateOfBirth: string): number {
  const dob = new Date(dateOfBirth)
  const now = new Date()
  let age = now.getFullYear() - dob.getFullYear()
  const monthDiff = now.getMonth() - dob.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
    age--
  }
  return age
}

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}
