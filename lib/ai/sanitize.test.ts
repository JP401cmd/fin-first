import { describe, it, expect } from 'vitest'
import { sanitizeForAI } from './sanitize'

// ── IBAN filtering ──────────────────────────────────────────────

describe('sanitizeForAI — IBANs', () => {
  it('filters Dutch IBAN with spaces', () => {
    expect(sanitizeForAI('Rekening NL99 RABO 0123 4567 89 ontvangen')).toBe(
      'Rekening [IBAN] ontvangen'
    )
  })

  it('filters Dutch IBAN without spaces', () => {
    expect(sanitizeForAI('Rekening NL99RABO0123456789 ontvangen')).toBe(
      'Rekening [IBAN] ontvangen'
    )
  })

  it('filters multiple IBANs in one string', () => {
    const input = 'Van NL99RABO0123456789 naar NL12INGB9876543210'
    const result = sanitizeForAI(input)
    expect(result).toBe('Van [IBAN] naar [IBAN]')
    expect(result).not.toMatch(/NL\d{2}/)
  })

  it('filters IBAN with mixed spacing', () => {
    expect(sanitizeForAI('NL99 RABO0123 456789')).toBe('[IBAN]')
  })
})

// ── BSN filtering ───────────────────────────────────────────────

describe('sanitizeForAI — BSN', () => {
  it('filters 9-digit BSN pattern', () => {
    expect(sanitizeForAI('BSN: 123456789')).toBe('BSN: [BSN]')
  })

  it('does NOT filter 9-digit number preceded by currency symbol', () => {
    expect(sanitizeForAI('€123456789')).toBe('€123456789')
  })

  it('does NOT filter 9-digit number directly after EUR (no space)', () => {
    expect(sanitizeForAI('EUR123456789')).toBe('EUR123456789')
  })

  it('does NOT filter numbers that are part of a larger number', () => {
    // 10-digit number should not match BSN (no word boundary)
    expect(sanitizeForAI('1234567890')).not.toBe('[BSN]0')
  })
})

// ── Email filtering ─────────────────────────────────────────────

describe('sanitizeForAI — Emails', () => {
  it('filters simple email', () => {
    expect(sanitizeForAI('Contact: jan@example.nl')).toBe('Contact: [EMAIL]')
  })

  it('filters email with plus tag', () => {
    expect(sanitizeForAI('Mail: user+tag@domain.com')).toBe('Mail: [EMAIL]')
  })

  it('filters email with dots and hyphens', () => {
    expect(sanitizeForAI('jan.de-vries@mijn-bank.co.nl')).toBe('[EMAIL]')
  })

  it('filters email with underscores', () => {
    expect(sanitizeForAI('jan_vries@test.org')).toBe('[EMAIL]')
  })

  it('filters multiple emails in one string', () => {
    const input = 'Van jan@test.nl naar maria@test.nl'
    const result = sanitizeForAI(input)
    expect(result).toBe('Van [EMAIL] naar [EMAIL]')
  })
})

// ── Financial data preservation ─────────────────────────────────

describe('sanitizeForAI — Financial data NOT filtered', () => {
  it('preserves euro amounts with thousands separator', () => {
    expect(sanitizeForAI('Saldo: €145.000')).toBe('Saldo: €145.000')
  })

  it('preserves euro amounts with decimals', () => {
    expect(sanitizeForAI('€1.234,56 ontvangen')).toBe('€1.234,56 ontvangen')
  })

  it('preserves percentages', () => {
    expect(sanitizeForAI('Rendement: 28%')).toBe('Rendement: 28%')
  })

  it('preserves decimal percentages', () => {
    expect(sanitizeForAI('SWR van 3,5% is veilig')).toBe('SWR van 3,5% is veilig')
  })

  it('preserves category labels', () => {
    expect(sanitizeForAI('Categorie: Boodschappen')).toBe('Categorie: Boodschappen')
  })

  it('preserves budget names', () => {
    expect(sanitizeForAI('Budget Vaste Lasten: €2.100')).toBe('Budget Vaste Lasten: €2.100')
  })

  it('preserves ratios', () => {
    expect(sanitizeForAI('Factor 0.04 gebruiken')).toBe('Factor 0.04 gebruiken')
  })
})

// ── Combined PII in one string ──────────────────────────────────

describe('sanitizeForAI — Combined PII', () => {
  it('filters IBAN and email in the same string', () => {
    const input = 'Betaling NL99RABO0123456789 bevestigd naar jan@test.nl'
    const result = sanitizeForAI(input)
    expect(result).toBe('Betaling [IBAN] bevestigd naar [EMAIL]')
  })

  it('filters PII but preserves financial data in mixed string', () => {
    const input = 'Overboeking €5.000 van NL99RABO0123456789 (BSN 123456789)'
    const result = sanitizeForAI(input)
    expect(result).toContain('€5.000')
    expect(result).toContain('[IBAN]')
    expect(result).toContain('[BSN]')
    expect(result).not.toContain('NL99RABO')
  })

  it('filters names and IBAN together', () => {
    const input = 'Jan de Vries heeft NL99RABO0123456789'
    const result = sanitizeForAI(input, { names: ['Jan de Vries'] })
    expect(result).toContain('gebruiker')
    expect(result).toContain('[IBAN]')
    expect(result).not.toContain('Jan')
    expect(result).not.toContain('Vries')
  })
})

// ── Edge cases ──────────────────────────────────────────────────

describe('sanitizeForAI — Edge cases', () => {
  it('handles empty string without crash', () => {
    expect(sanitizeForAI('')).toBe('')
  })

  it('handles string with no PII', () => {
    const input = 'Totale uitgaven deze maand: €1.250,00 in categorie Boodschappen'
    expect(sanitizeForAI(input)).toBe(input)
  })

  it('handles string with only whitespace', () => {
    expect(sanitizeForAI('   ')).toBe('   ')
  })

  it('handles default options (no options provided)', () => {
    expect(sanitizeForAI('Hallo wereld')).toBe('Hallo wereld')
  })
})

// ── Name replacement ────────────────────────────────────────────

describe('sanitizeForAI — Names', () => {
  it('replaces full name with gebruiker label', () => {
    const result = sanitizeForAI('Hallo Jan de Vries', { names: ['Jan de Vries'] })
    expect(result).toBe('Hallo gebruiker')
  })

  it('replaces individual name parts (>= 3 chars)', () => {
    const result = sanitizeForAI('Betaling aan Vries', { names: ['Jan de Vries'] })
    expect(result).toBe('Betaling aan gebruiker')
  })

  it('does not replace Dutch prepositions as name parts', () => {
    const result = sanitizeForAI('van de winkel', { names: ['Jan van de Berg'] })
    expect(result).toContain('van')
    expect(result).toContain('de')
  })

  it('replaces second name with partner label', () => {
    const result = sanitizeForAI('Jan en Maria', {
      names: ['Jan de Vries', 'Maria de Vries'],
    })
    expect(result).not.toContain('Jan')
    expect(result).not.toContain('Maria')
  })

  it('handles custom labels', () => {
    const result = sanitizeForAI('Jan betaalt', {
      names: ['Jan de Vries'],
      userLabel: 'persoon',
    })
    expect(result).toBe('persoon betaalt')
  })
})

// ── Phone numbers ───────────────────────────────────────────────

describe('sanitizeForAI — Phone numbers', () => {
  it('filters Dutch mobile number', () => {
    expect(sanitizeForAI('Bel 06 12345678')).toBe('Bel [TELEFOON]')
  })

  it('filters +31 format', () => {
    expect(sanitizeForAI('Tel: +31612345678')).toBe('Tel: [TELEFOON]')
  })
})

// ── Address filtering ───────────────────────────────────────────

describe('sanitizeForAI — Addresses', () => {
  it('filters street addresses', () => {
    expect(sanitizeForAI('Kerkstraat 12')).toBe('[ADRES]')
  })

  it('filters postal code with city', () => {
    expect(sanitizeForAI('1234 AB Amsterdam')).toBe('[ADRES]')
  })
})
