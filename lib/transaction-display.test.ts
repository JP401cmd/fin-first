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

import { avgDailyExpense, dayFreedomLabel, freedomDays, groupByDay } from './transaction-display'

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

describe('dayFreedomLabel — dagkop deelt één grondslag met het euro-bedrag (M20)', () => {
  // Het exacte scenario uit de bevinding: één dag met €507,64 freelance-inkomsten
  // en €28,61 uitgaven, bij een dagtarief van ~€95/dag.
  const gemeldeDag = [
    { date: '2026-08-20', amount: 507.64, transaction_type: null },
    { date: '2026-08-20', amount: -28.61, transaction_type: null },
  ]
  const daily = 95

  it('rekent op het netto dagbedrag, niet op de bruto uitgaven', () => {
    const [g] = groupByDay(gemeldeDag)
    const net = g.incomeTotal - g.expenseTotal
    expect(net).toBeCloseTo(479.03, 2)
    // Vóór de fix: freedomDays(g.expenseTotal, daily) ≈ 0,3 naast "+ €479,03".
    expect(freedomDays(g.expenseTotal, daily)).toBeCloseTo(0.3, 1)
    // Na de fix volgen dagen en euro's dezelfde teller: 479,03 / 95 ≈ 5,0.
    expect(dayFreedomLabel(net, daily)).toBe('≈ 5,0 vrijheidsdagen erbij')
  })

  it('labelt een netto-uitgavendag als "kwijt" en laat die ongewijzigd', () => {
    const [g] = groupByDay([{ date: '2026-06-05', amount: -82.4, transaction_type: null }])
    const net = g.incomeTotal - g.expenseTotal
    expect(net).toBeCloseTo(-82.4, 2)
    // Zuivere uitgavendag: netto == -expenseTotal, dus hetzelfde cijfer als vóór M20.
    expect(dayFreedomLabel(net, 90)).toBe('≈ 0,9 vrijheidsdag kwijt')
  })

  it('meervoud volgt het afgeronde getal, niet de ruwe waarde', () => {
    expect(dayFreedomLabel(-176.4, 90)).toBe('≈ 2,0 vrijheidsdagen kwijt') // 1,96 → 2,0
    expect(dayFreedomLabel(-90, 90)).toBe('≈ 1,0 vrijheidsdag kwijt')
  })

  it('verbergt het dagental zodra bedragen gemaskeerd zijn', () => {
    // dagen × dagtarief == het verborgen bedrag, dus het cijfer moet ook weg.
    expect(dayFreedomLabel(479.03, daily, true)).toBe('≈ •••••• vrijheidsdagen erbij')
    expect(dayFreedomLabel(-82.4, 90, true)).toBe('≈ •••••• vrijheidsdagen kwijt')
    // Ook een bijna-nul-dag toont de regel: anders lekt '' dat het saldo minimaal is.
    expect(dayFreedomLabel(-4, 90, true)).toBe('≈ •••••• vrijheidsdagen kwijt')
    // Zonder dagtarief valt er niets te tonen — dat hangt niet van het bedrag af.
    expect(dayFreedomLabel(-500, 0, true)).toBe('')
  })

  it('zwijgt bij een verwaarloosbaar of onbekend dagsaldo', () => {
    expect(dayFreedomLabel(0, 90)).toBe('')
    expect(dayFreedomLabel(-4, 90)).toBe('') // 0,04 dag → rondt af op 0,0
    expect(dayFreedomLabel(-500, 0)).toBe('') // geen dagtarief bekend
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

// groupByDay wordt hierboven al geimporteerd (dayFreedomLabel-sectie) - een tweede
// import van dezelfde naam is een TS2300-duplicaat.
import { parseSmartQuery, monogram } from './transaction-display'

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
