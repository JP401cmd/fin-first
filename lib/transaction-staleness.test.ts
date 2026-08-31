// lib/transaction-staleness.test.ts
//
// Het versheidsoordeel over transactiedata (UR2-13). De kern van de bug was niet
// een rekenfout maar een BETEKENISFOUT: "nul in dit venster" werd gelezen als
// "deze gebruiker heeft geen transacties". Deze suite pint beide kanten vast —
// dat een leeg venster mét historie als `stale` uitkomt, én dat een normale
// maandkadans NIET gaat piepen (een melding die te vaak afgaat leert de
// gebruiker haar te negeren, precies de val die holdings-staleness benoemt).

import { describe, it, expect } from 'vitest'
import {
  TX_STALE_AFTER_MONTHS,
  transactionFreshness,
  transactionAgeLabel,
  monthKeyLabel,
} from './transaction-staleness'
import { aggLatestMonth, type TxMonthAggregateRow } from './server-data/tx-aggregates'

// 31 augustus 2026 — de datum van de bugmelding.
const NOW = new Date(2026, 7, 31)

describe('transactionFreshness — het oordeel', () => {
  it('zonder maand: geen historie bekend, dus geen melding (de lege staat hoort daar)', () => {
    const f = transactionFreshness(null, NOW)
    expect(f.state).toBe('none')
    expect(f.hasHistory).toBe(false)
    expect(f.monthsBehind).toBeNull()
    expect(f.latestMonthLabel).toBeNull()
  })

  it('de meldingscasus: laatste boeking maart 2026, gemeten op 31 aug 2026 → verouderd', () => {
    const f = transactionFreshness('2026-03', NOW)
    expect(f.state).toBe('stale')
    expect(f.hasHistory).toBe(true)
    expect(f.monthsBehind).toBe(5)
    expect(f.latestMonthLabel).toBe('maart 2026')
  })

  it('boeking in de lopende maand → vers, 0 maanden achter', () => {
    const f = transactionFreshness('2026-08', NOW)
    expect(f.state).toBe('fresh')
    expect(f.monthsBehind).toBe(0)
  })

  it('alleen de vorige maand geboekt → NOG NIET verouderd (normale importkadans)', () => {
    // Wie per maand importeert heeft begin augustus nog niets in augustus staan.
    // Zou de drempel op 1 liggen, dan gaat deze melding elke maand een paar dagen
    // af — en dan werkt ze niet meer op het moment dat het er echt toe doet.
    const f = transactionFreshness('2026-07', NOW)
    expect(f.state).toBe('fresh')
    expect(f.monthsBehind).toBe(1)
  })

  it('de drempel ligt precies op TX_STALE_AFTER_MONTHS hele maanden', () => {
    expect(TX_STALE_AFTER_MONTHS).toBe(2)
    expect(transactionFreshness('2026-06', NOW).state).toBe('stale')
    expect(transactionFreshness('2026-06', NOW).monthsBehind).toBe(2)
  })

  it('telt over de jaargrens heen (december → februari = 2 maanden)', () => {
    const f = transactionFreshness('2025-12', new Date(2026, 1, 4))
    expect(f.monthsBehind).toBe(2)
    expect(f.latestMonthLabel).toBe('december 2025')
  })

  it('een toekomstige (geplande) boeking is nooit "achter" — klemt op 0', () => {
    const f = transactionFreshness('2026-11', NOW)
    expect(f.monthsBehind).toBe(0)
    expect(f.state).toBe('fresh')
  })

  it('onbruikbare invoer valt terug op "geen historie", niet op een verzonnen maand', () => {
    expect(transactionFreshness('', NOW).state).toBe('none')
    expect(transactionFreshness('maart', NOW).state).toBe('none')
    expect(transactionFreshness('2026-3', NOW).state).toBe('none')
  })
})

describe('transactionAgeLabel', () => {
  it('zwijgt binnen de lopende maand (nooit "0 maanden geleden")', () => {
    expect(transactionAgeLabel(0)).toBeNull()
    expect(transactionAgeLabel(null)).toBeNull()
  })

  it('benoemt één maand als "vorige maand" en de rest in maanden', () => {
    expect(transactionAgeLabel(1)).toBe('vorige maand')
    expect(transactionAgeLabel(5)).toBe('5 maanden geleden')
  })
})

describe('monthKeyLabel', () => {
  it("zet 'YYYY-MM' om in Nederlandse maandtaal", () => {
    expect(monthKeyLabel('2026-03')).toBe('maart 2026')
    expect(monthKeyLabel('2026-01')).toBe('januari 2026')
  })
})

describe('aggLatestMonth — de bron van het oordeel', () => {
  const row = (month: string, type: string | null, count: number): TxMonthAggregateRow => ({
    month,
    budget_id: null,
    transaction_type: type,
    sum_positief: 0,
    sum_negatief: -10,
    count,
  })

  it('geeft de jongste maand met boekingen, ook als de rijen ongesorteerd binnenkomen', () => {
    expect(aggLatestMonth([row('2026-01', 'expense', 3), row('2026-03', 'expense', 1), row('2025-12', 'expense', 9)]))
      .toBe('2026-03')
  })

  it('een lege verzameling levert null (en dus "geen historie")', () => {
    expect(aggLatestMonth([])).toBeNull()
  })

  it('telt standaard óók transfer-maanden mee: die bewijzen dat er data IS', () => {
    // Zou dit `realOnly` zijn, dan zou een gebruiker die alleen overboekingen
    // heeft geregistreerd opnieuw "Importeer transacties" te zien krijgen.
    expect(aggLatestMonth([row('2026-02', 'expense', 2), row('2026-05', 'transfer', 4)])).toBe('2026-05')
    expect(aggLatestMonth([row('2026-02', 'expense', 2), row('2026-05', 'transfer', 4)], { realOnly: true }))
      .toBe('2026-02')
  })

  it('negeert een groep zonder tellingen', () => {
    expect(aggLatestMonth([row('2026-02', 'expense', 2), row('2026-06', 'expense', 0)])).toBe('2026-02')
  })
})
