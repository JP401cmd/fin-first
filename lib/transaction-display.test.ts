import { describe, it, expect } from 'vitest'
import { cleanMerchantName } from './transaction-display'

describe('cleanMerchantName', () => {
  it('strip PSP-prefixes', () => {
    expect(cleanMerchantName('BCK*SHELL T KEMPKE')).toBe('Shell T Kempke')
    expect(cleanMerchantName('CCV*Gras Horeca B.V.')).toBe('Gras Horeca')
    expect(cleanMerchantName('PAY.nl*Sportbedrijf Ar')).toBe('Sportbedrijf Ar')
  })
  it('strip trailing winkelnummer', () => {
    expect(cleanMerchantName('Albert Heijn 1032')).toBe('Albert Heijn')
    expect(cleanMerchantName('Lidl 238 Arnhem')).toBe('Lidl')
  })
  it('bekende merchants', () => {
    expect(cleanMerchantName('Esso Arnhem IJsseloo')).toBe('Esso')
    expect(cleanMerchantName('PayPal Europe S.a.r.l. et Cie S.C.A')).toBe('PayPal')
  })
  it('lege invoer', () => {
    expect(cleanMerchantName(null)).toBe('Onbekend')
    expect(cleanMerchantName('   ')).toBe('Onbekend')
  })
})

import { deriveType } from './transaction-display'

describe('deriveType', () => {
  it('mapt Rabobank-codes', () => {
    expect(deriveType('bc', 'Shell', -10).kind).toBe('pin')
    expect(deriveType('ba', 'Hornbach', 23).kind).toBe('pin')
    expect(deriveType('ei', 'PayPal', -5).kind).toBe('incasso')
    expect(deriveType('id', 'bol.com', -19).kind).toBe('ideal')
    expect(deriveType('bg', 'KvK', -47).kind).toBe('overboeking')
    expect(deriveType('cb', 'Belastingdienst', 74).kind).toBe('bijschrijving')
    expect(deriveType('bv', 'Rabo Betaalverzoek', 120).kind).toBe('betaalverzoek')
    expect(deriveType('db', 'Rabobank', -3.45).kind).toBe('bankkosten')
  })
  it('fallback zonder code op teken', () => {
    expect(deriveType(null, 'Iets', 50).kind).toBe('bijschrijving')
    expect(deriveType(null, 'Iets', -50).kind).toBe('pin')
  })
  it('levert glyph + label', () => {
    const t = deriveType('ei', 'PayPal', -5)
    expect(t.glyph).toBeTruthy()
    expect(t.label).toMatch(/incasso/i)
  })
})

import { parseLocationTime } from './transaction-display'

describe('parseLocationTime', () => {
  it('haalt plaats + tijd uit pin-omschrijving', () => {
    expect(parseLocationTime('ELST GLD, 6661KK, NLD, 09:39')).toEqual({ place: 'Elst Gld', time: '09:39' })
    expect(parseLocationTime('Zaandam, 1506BH, NLD, 13:11')).toEqual({ place: 'Zaandam', time: '13:11' })
  })
  it('null als geen match', () => {
    expect(parseLocationTime('1047645677604/PAYPAL')).toEqual({ place: null, time: null })
    expect(parseLocationTime(null)).toEqual({ place: null, time: null })
  })
})

import { avgDailyExpense, freedomDays } from './transaction-display'

describe('avgDailyExpense + freedomDays', () => {
  const txns = [
    { amount: -90, transaction_type: null },
    { amount: -90, transaction_type: null },
    { amount: 1000, transaction_type: null },
    { amount: -50, transaction_type: 'transfer' },
  ]
  it('gemiddelde dag-uitgave over venster', () => {
    expect(avgDailyExpense(txns, 2)).toBeCloseTo(90)
  })
  it('vrijheidsdagen = bedrag / dag-uitgave', () => {
    expect(freedomDays(180, 90)).toBeCloseTo(2)
    expect(freedomDays(100, 0)).toBe(0)
  })
})

import { detectRecurring } from './transaction-display'

describe('detectRecurring', () => {
  it('vlagt op creditor_id (≥2 voorkomens)', () => {
    const r = detectRecurring([
      { id: 'a', counterparty_name: 'PayPal', counterparty_iban: null, creditor_id: 'LU96ZZZ', amount: -4.99, date: '2026-01-05' },
      { id: 'b', counterparty_name: 'PayPal', counterparty_iban: null, creditor_id: 'LU96ZZZ', amount: -4.99, date: '2026-01-19' },
      { id: 'c', counterparty_name: 'Eenmalig', counterparty_iban: null, creditor_id: null, amount: -20, date: '2026-01-10' },
    ])
    expect(r.has('a')).toBe(true)
    expect(r.has('b')).toBe(true)
    expect(r.has('c')).toBe(false)
  })
  it('fallback op counterparty bij ≥3 met stabiel bedrag', () => {
    const r = detectRecurring([
      { id: '1', counterparty_name: 'Sportschool', counterparty_iban: null, creditor_id: null, amount: -30, date: '2026-01-01' },
      { id: '2', counterparty_name: 'Sportschool', counterparty_iban: null, creditor_id: null, amount: -30, date: '2026-02-01' },
      { id: '3', counterparty_name: 'Sportschool', counterparty_iban: null, creditor_id: null, amount: -31, date: '2026-03-01' },
    ])
    expect(r.has('2')).toBe(true)
  })
})

import { groupByDay, parseSmartQuery, monogram } from './transaction-display'

describe('groupByDay', () => {
  it('groepeert + subtotalen, nieuw→oud', () => {
    const g = groupByDay([
      { date: '2026-01-02', amount: -10, transaction_type: null },
      { date: '2026-01-02', amount: 100, transaction_type: null },
      { date: '2026-01-01', amount: -5, transaction_type: 'transfer' },
    ])
    expect(g[0].date).toBe('2026-01-02')
    expect(g[0].expenseTotal).toBe(10)
    expect(g[0].incomeTotal).toBe(100)
    expect(g[1].expenseTotal).toBe(0)
  })
})

describe('parseSmartQuery', () => {
  const now = new Date(2026, 5, 8)
  it('parst bedrag + tekst', () => {
    const q = parseSmartQuery('hornbach boven 50', now)
    expect(q.text).toBe('hornbach')
    expect(q.amountMin).toBe(50)
  })
  it('parst "vorige maand"', () => {
    const q = parseSmartQuery('vorige maand', now)
    expect(q.dateFrom).toBe('2026-05-01')
    expect(q.dateTo).toBe('2026-05-31')
  })
  it('lege query → alles null, text leeg', () => {
    expect(parseSmartQuery('', now)).toEqual({ text: '', amountMin: null, amountMax: null, dateFrom: null, dateTo: null, direction: null })
  })
})

describe('monogram', () => {
  it('1-2 initialen', () => {
    expect(monogram('Albert Heijn')).toBe('AH')
    expect(monogram('Shell')).toBe('SH')
  })
})
