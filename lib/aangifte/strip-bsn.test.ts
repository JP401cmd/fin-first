// ── BSN-strip unit tests ────────────────────────────────────────────
//
// Verifies that:
//   1. Standalone 9-digit BSN patterns are replaced.
//   2. Boundary cases (8 / 10 digits) are NOT replaced.
//   3. Multiple BSNs are counted correctly.
//   4. IBANs (which contain digit-runs but with letters mixed in) survive
//      the strip — this is non-negotiable, because the user wants to keep
//      account-name context in their data even though we don't extract it.
//   5. Edge cases (empty string) return a well-defined zero result.
//
// Test framework matches the rest of the repo: Vitest with describe/it/expect.

import { describe, it, expect } from 'vitest'
import { stripSensitiveData } from './strip-bsn'

describe('stripSensitiveData — replaces BSN patterns', () => {
  it('replaces a single 9-digit BSN', () => {
    const result = stripSensitiveData('BSN: 123456789 here')
    expect(result.clean).toBe('BSN: [BSN] here')
    expect(result.strippedCount).toBe(1)
  })

  it('replaces a standalone 9-digit BSN with no surrounding label', () => {
    const result = stripSensitiveData('123456789')
    expect(result.clean).toBe('[BSN]')
    expect(result.strippedCount).toBe(1)
  })

  it('replaces multiple BSNs and counts them', () => {
    const result = stripSensitiveData(
      'Aanvrager 111111111 partner 222222222 kind 333333333',
    )
    expect(result.clean).toBe('Aanvrager [BSN] partner [BSN] kind [BSN]')
    expect(result.strippedCount).toBe(3)
  })

  it('replaces BSN at start of string', () => {
    const result = stripSensitiveData('123456789 is een BSN')
    expect(result.clean).toBe('[BSN] is een BSN')
    expect(result.strippedCount).toBe(1)
  })

  it('replaces BSN at end of string', () => {
    const result = stripSensitiveData('Het nummer is 123456789')
    expect(result.clean).toBe('Het nummer is [BSN]')
    expect(result.strippedCount).toBe(1)
  })
})

describe('stripSensitiveData — preserves non-BSN digit runs', () => {
  it('does not replace 8-digit numbers', () => {
    const result = stripSensitiveData('Postcode 12345678 ergens')
    expect(result.clean).toBe('Postcode 12345678 ergens')
    expect(result.strippedCount).toBe(0)
  })

  it('does not replace 10-digit numbers', () => {
    const result = stripSensitiveData('Telefoon 1234567890 staat hier')
    expect(result.clean).toBe('Telefoon 1234567890 staat hier')
    expect(result.strippedCount).toBe(0)
  })

  it('does not replace 9-digit substring of a longer digit run', () => {
    // 12-digit run: the inner 9 should not be matched because there's
    // no word boundary on either side of an arbitrary 9-digit window.
    const result = stripSensitiveData('Reeks 123456789012 in tekst')
    expect(result.clean).toBe('Reeks 123456789012 in tekst')
    expect(result.strippedCount).toBe(0)
  })
})

describe('stripSensitiveData — IBANs survive intact', () => {
  it('leaves a Dutch IBAN unchanged', () => {
    const result = stripSensitiveData('IBAN NL91ABNA0417164300 ontvangen')
    expect(result.clean).toBe('IBAN NL91ABNA0417164300 ontvangen')
    expect(result.strippedCount).toBe(0)
  })

  it('leaves an IBAN with spaces unchanged', () => {
    const result = stripSensitiveData('Rekening NL91 ABNA 0417 1643 00')
    expect(result.clean).toBe('Rekening NL91 ABNA 0417 1643 00')
    expect(result.strippedCount).toBe(0)
  })

  it('leaves multiple IBANs intact while stripping a real BSN nearby', () => {
    const result = stripSensitiveData(
      'BSN 123456789 — rekening NL91ABNA0417164300 en NL12INGB9876543210',
    )
    expect(result.clean).toBe(
      'BSN [BSN] — rekening NL91ABNA0417164300 en NL12INGB9876543210',
    )
    expect(result.strippedCount).toBe(1)
  })
})

describe('stripSensitiveData — edge cases', () => {
  it('returns zero counts for an empty string', () => {
    const result = stripSensitiveData('')
    expect(result.clean).toBe('')
    expect(result.strippedCount).toBe(0)
  })

  it('returns the same string when there is no BSN pattern', () => {
    const input = 'Geen BSN te bekennen, alleen tekst en € 1.234,56.'
    const result = stripSensitiveData(input)
    expect(result.clean).toBe(input)
    expect(result.strippedCount).toBe(0)
  })

  it('handles a string of all whitespace', () => {
    const result = stripSensitiveData('   \n  \t  ')
    expect(result.clean).toBe('   \n  \t  ')
    expect(result.strippedCount).toBe(0)
  })
})
