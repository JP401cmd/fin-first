import { describe, it, expect } from 'vitest'
import { normalizeCounterparty, stripPspPrefix, PSP_PREFIX_RE } from './counterparty-normalize'

describe('normalizeCounterparty', () => {
  it('lowercased + whitespace-collapse', () => {
    expect(normalizeCounterparty('  Albert   Heijn ')).toBe('albert heijn')
  })

  it('strip PSP-prefix met sterretje', () => {
    expect(normalizeCounterparty('CCV*Bakker')).toBe('bakker')
    expect(normalizeCounterparty('BCK*Shell T Kempke')).toBe('shell t kempke')
    expect(normalizeCounterparty('PAY.nl*Sportbedrijf')).toBe('sportbedrijf')
  })

  it('strip PSP-prefix met underscore (zettle_)', () => {
    expect(normalizeCounterparty('ZETTLE_*Koffie')).toBe('koffie')
    expect(normalizeCounterparty('Zettle_Koffie')).toBe('koffie')
  })

  it('strip spatie-gescheiden prefixen (iZettle, SumUp, PayPal, CCV)', () => {
    expect(normalizeCounterparty('iZettle Bakker')).toBe('bakker')
    expect(normalizeCounterparty('iZ Bakker')).toBe('bakker')
    expect(normalizeCounterparty('SumUp Kapper')).toBe('kapper')
    expect(normalizeCounterparty('PayPal Spotify')).toBe('spotify')
    expect(normalizeCounterparty('CCV Horeca')).toBe('horeca')
  })

  it('strip trailing kassanummer/filiaal', () => {
    expect(normalizeCounterparty('Albert Heijn 1032')).toBe('albert heijn')
    expect(normalizeCounterparty('Lidl 238 Arnhem')).toBe('lidl')
  })

  it('strip trailing rechtsvorm-suffix', () => {
    expect(normalizeCounterparty('Gras Horeca B.V.')).toBe('gras horeca')
    expect(normalizeCounterparty('Iets N.V.')).toBe('iets')
  })

  it('varianten van dezelfde tegenpartij landen op dezelfde sleutel', () => {
    const a = normalizeCounterparty('CCV*BAKKER 12')
    const b = normalizeCounterparty('Bakker')
    expect(a).toBe(b)
    expect(a).toBe('bakker')
  })

  it('lege of null invoer → lege string', () => {
    expect(normalizeCounterparty(null)).toBe('')
    expect(normalizeCounterparty(undefined)).toBe('')
    expect(normalizeCounterparty('   ')).toBe('')
  })

  it('tegenpartij die enkel uit ruis bestaat → de oorspronkelijke string (geen lege key)', () => {
    // "CCV*" stript naar leeg → val terug op het origineel zodat de match-key
    // nooit leeg wordt (zou anders alle "ruis-only" rijen op één key gooien).
    expect(normalizeCounterparty('CCV*')).toBe('ccv*')
  })
})

describe('stripPspPrefix / PSP_PREFIX_RE (gedeeld met display-stripper)', () => {
  it('herkent en stript ster- en underscore-prefixen', () => {
    expect(PSP_PREFIX_RE.test('BCK*Shell')).toBe(true)
    expect(PSP_PREFIX_RE.test('ZETTLE_Koffie')).toBe(true)
    expect(PSP_PREFIX_RE.test('Albert Heijn')).toBe(false)
    expect(stripPspPrefix('BCK*Shell')).toBe('Shell')
    expect(stripPspPrefix('Albert Heijn')).toBe('Albert Heijn')
  })
})
