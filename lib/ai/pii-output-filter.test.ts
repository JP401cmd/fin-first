import { describe, it, expect } from 'vitest'
import { maskPIIInOutput, maskPIIInObject } from './pii-output-filter'

describe('maskPIIInOutput', () => {
  // ── IBAN masking ──────────────────────────────────────────────────

  it('masks a Dutch IBAN without spaces', () => {
    const input = 'Je rekening NL91ABNA0417164300 is actief.'
    expect(maskPIIInOutput(input)).toBe('Je rekening **** is actief.')
  })

  it('masks a Dutch IBAN with spaces', () => {
    const input = 'Overboeken naar NL91 ABNA 0417 1643 00 voor sparen.'
    expect(maskPIIInOutput(input)).toBe('Overboeken naar **** voor sparen.')
  })

  it('masks multiple IBANs in one string', () => {
    const input = 'Van NL91ABNA0417164300 naar NL20INGB0001234567.'
    const result = maskPIIInOutput(input)
    expect(result).not.toContain('NL91')
    expect(result).not.toContain('NL20')
    expect(result.match(/\*\*\*\*/g)?.length).toBe(2)
  })

  it('masks a German IBAN', () => {
    const input = 'Betaling naar DE89370400440532013000 ontvangen.'
    expect(maskPIIInOutput(input)).toBe('Betaling naar **** ontvangen.')
  })

  it('masks a Belgian IBAN', () => {
    const input = 'IBAN: BE68539007547034'
    expect(maskPIIInOutput(input)).toBe('IBAN: ****')
  })

  // ── BSN masking ──────────────────────────────────────────────────

  it('masks a BSN (9-digit number)', () => {
    const input = 'BSN: 123456789 is geregistreerd.'
    expect(maskPIIInOutput(input)).toBe('BSN: **** is geregistreerd.')
  })

  it('masks a standalone BSN without label', () => {
    const input = 'Jouw nummer is 987654321 bij de gemeente.'
    expect(maskPIIInOutput(input)).toBe('Jouw nummer is **** bij de gemeente.')
  })

  // ── Financial amounts preserved ──────────────────────────────────

  it('preserves euro amounts with EUR prefix', () => {
    const input = 'Je spaart EUR 123456789 per jaar.'
    expect(maskPIIInOutput(input)).toBe('Je spaart EUR 123456789 per jaar.')
  })

  it('preserves euro amounts with euro sign', () => {
    const input = 'Je netto vermogen is €123456789.'
    expect(maskPIIInOutput(input)).toBe('Je netto vermogen is €123456789.')
  })

  it('preserves amounts with decimal comma', () => {
    const input = 'Totaal: 123456789,50 euro.'
    // The comma after 123456789 prevents BSN masking
    expect(maskPIIInOutput(input)).toContain('123456789,50')
  })

  it('preserves amounts with decimal dot', () => {
    const input = 'Rate: 123456789.50 procent.'
    // The dot after 123456789 prevents BSN masking
    expect(maskPIIInOutput(input)).toContain('123456789.50')
  })

  it('preserves percentages', () => {
    const input = 'Je spaarpercentage is 45,2% van je inkomen.'
    expect(maskPIIInOutput(input)).toBe('Je spaarpercentage is 45,2% van je inkomen.')
  })

  it('preserves normal currency amounts like €1.234,56', () => {
    const input = 'Je maandbudget is €1.234,56 en je spaart €500,00.'
    expect(maskPIIInOutput(input)).toBe('Je maandbudget is €1.234,56 en je spaart €500,00.')
  })

  it('preserves smaller numbers that are not 9 digits', () => {
    const input = 'Je hebt 42 transacties en 1234 euro gespaard.'
    expect(maskPIIInOutput(input)).toBe('Je hebt 42 transacties en 1234 euro gespaard.')
  })

  // ── No-op on clean text ──────────────────────────────────────────

  it('returns clean text unchanged', () => {
    const input = 'Je vrijheidstijd is 14 jaar en 3 maanden. Je spaart 52% van je inkomen.'
    expect(maskPIIInOutput(input)).toBe(input)
  })

  it('handles empty string', () => {
    expect(maskPIIInOutput('')).toBe('')
  })

  it('handles null-ish values gracefully', () => {
    expect(maskPIIInOutput(undefined as unknown as string)).toBe(undefined)
    expect(maskPIIInOutput(null as unknown as string)).toBe(null)
  })

  // ── Mixed content ────────────────────────────────────────────────

  it('masks IBAN but preserves amounts in mixed text', () => {
    const input = 'Overboek €500 naar NL91ABNA0417164300 voor je vrijheid.'
    const result = maskPIIInOutput(input)
    expect(result).toContain('€500')
    expect(result).not.toContain('NL91')
    expect(result).toContain('****')
  })
})

describe('maskPIIInObject', () => {
  it('filters string values in a flat object', () => {
    const obj = {
      headline: 'Rente stijgt NL91ABNA0417164300',
      amount: 1234,
    }
    const result = maskPIIInObject(obj)
    expect(result.headline).toBe('Rente stijgt ****')
    expect(result.amount).toBe(1234)
  })

  it('filters nested objects recursively', () => {
    const obj = {
      card: {
        label: 'BSN 123456789 gevonden',
        value: 42,
      },
    }
    const result = maskPIIInObject(obj)
    expect(result.card.label).toBe('BSN **** gevonden')
    expect(result.card.value).toBe(42)
  })

  it('filters arrays of objects', () => {
    const items = [
      { text: 'IBAN: NL91ABNA0417164300' },
      { text: 'Normaal bericht' },
    ]
    const result = maskPIIInObject(items)
    expect(result[0].text).toBe('IBAN: ****')
    expect(result[1].text).toBe('Normaal bericht')
  })

  it('preserves non-string non-object values', () => {
    expect(maskPIIInObject(42)).toBe(42)
    expect(maskPIIInObject(true)).toBe(true)
    expect(maskPIIInObject(null)).toBe(null)
  })
})
