// ── Bedrag-grounding, sanity-grenzen en de NEGEER-zeef ───────────────────────

import { describe, it, expect } from 'vitest'
import {
  collectVerbatimAmounts,
  isAmountGrounded,
  parseAangifteAmount,
  sanitizeExtractedName,
  containsIdentifier,
  withinSanity,
  SANITY_LIMITS,
} from './grounding'

const VENSTER = `Bank- en spaartegoeden          Waarde 01-01-2024
ING Bank betaalrekening         €     3.450
ASN Bank spaarrekening          €    18.200
WOZ-waarde hoofdverblijf        € 425.000,00`

describe('collectVerbatimAmounts', () => {
  it('herkent de vormen die de Belastingdienst afdrukt', () => {
    const amounts = collectVerbatimAmounts(VENSTER)
    expect(amounts.has(3450)).toBe(true)
    expect(amounts.has(18200)).toBe(true)
    expect(amounts.has(425000)).toBe(true)
  })
})

describe('isAmountGrounded — de belangrijkste guardrail', () => {
  const amounts = collectVerbatimAmounts(VENSTER)

  it('accepteert een bedrag dat letterlijk in het venster staat', () => {
    expect(isAmountGrounded(18200, amounts)).toBe(true)
  })

  it('VERWERPT een bedrag dat niet in het venster staat', () => {
    // Het klassieke overtypfout-patroon: 18.200 → 1.820.
    expect(isAmountGrounded(1820, amounts)).toBe(false)
  })

  it('verwerpt een plausibel maar afwezig bedrag (geen "dichtstbijzijnde" match)', () => {
    expect(isAmountGrounded(18201, amounts)).toBe(false)
    expect(isAmountGrounded(3500, amounts)).toBe(false)
  })

  it('accepteert de hele-euro-variant van een bedrag met centen', () => {
    // De aangifte drukt "425.000,00" af, het model geeft "425000" terug.
    expect(isAmountGrounded(425000, amounts)).toBe(true)
  })
})

describe('parseAangifteAmount', () => {
  it('leest NL-notatie met duizendtalpunt en decimaalkomma', () => {
    expect(parseAangifteAmount('€ 12.345,67')).toBe(12345.67)
  })

  it('leest een kaal getal en een duizendtal-gescheiden getal', () => {
    expect(parseAangifteAmount('65000')).toBe(65000)
    expect(parseAangifteAmount('18.200')).toBe(18200)
  })

  it('maakt van een negatief bedrag een positief saldo (schema-eis)', () => {
    expect(parseAangifteAmount('-4.500')).toBe(4500)
  })

  it('geeft null bij onzin', () => {
    expect(parseAangifteAmount('onbekend')).toBeNull()
    expect(parseAangifteAmount(null)).toBeNull()
  })
})

describe('withinSanity', () => {
  it('markeert een paginanummer als buiten bereik voor een saldo', () => {
    expect(withinSanity(3, SANITY_LIMITS.balance)).toBe(false)
  })

  it('laat een normaal saldo door', () => {
    expect(withinSanity(18200, SANITY_LIMITS.balance)).toBe(true)
  })

  it('houdt een absurde WOZ buiten', () => {
    expect(withinSanity(999_000_000, SANITY_LIMITS.woz)).toBe(false)
  })
})

describe('sanitizeExtractedName — NEGEER-lijst op de uitgaande naamvelden', () => {
  it('haalt een IBAN uit de naam', () => {
    const clean = sanitizeExtractedName('ING Bank betaalrekening NL91ABNA0417164300')
    expect(clean).toBe('ING Bank betaalrekening')
    expect(containsIdentifier(clean!)).toBe(false)
  })

  it('haalt een BSN-vorm en de strip-marker uit de naam', () => {
    expect(sanitizeExtractedName('Rekening 123456789')).toBe('Rekening')
    expect(sanitizeExtractedName('Spaarrekening [BSN]')).toBe('Spaarrekening')
    expect(sanitizeExtractedName('[NAAM] spaarrekening')).toBe('spaarrekening')
  })

  it('geeft null als er niets herkenbaars overblijft', () => {
    expect(sanitizeExtractedName('123456789')).toBeNull()
    expect(sanitizeExtractedName('')).toBeNull()
    expect(sanitizeExtractedName(42)).toBeNull()
  })

  it('kapt af op 60 tekens', () => {
    expect(sanitizeExtractedName('x'.repeat(200))!.length).toBe(60)
  })
})
