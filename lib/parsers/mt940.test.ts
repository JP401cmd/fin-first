/**
 * Golden-fixture-tests voor de MT940-parser (lib/parsers/mt940.ts).
 *
 * "Golden" = de fixture wordt één keer daadwerkelijk door parseMT940() gehaald en
 * de output wordt afgelezen en bevroren als verwachte waarde (niet gegokt) — zie
 * Notion-kaart "Golden-fixture-tests voor MT940- en OFX-bankimport-parsers".
 *
 * transaction_type/bank_code (WF-CASH-23) wordt hier NIET herhaald — dat is al
 * volledig gedekt door transaction-type-mapping.test.ts. Deze suite pint de
 * VOLLEDIGE parse-uitkomst (datum, bedrag, tegenpartij, IBAN, referentie).
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { parseMT940 } from './mt940'

const fixture = (name: string): string =>
  readFileSync(path.resolve(__dirname, '__fixtures__', name), 'utf-8')

describe('parseMT940 — golden: mt940-rabobank-sample.sta', () => {
  it('parses all 5 transactions in file order', async () => {
    const rows = await parseMT940(fixture('mt940-rabobank-sample.sta'))
    expect(rows.length).toBe(5)
  })

  it('pins the exact output for a debit with /NAME//IBAN//EREF/', async () => {
    const rows = await parseMT940(fixture('mt940-rabobank-sample.sta'))
    const ah = rows[0]
    expect(ah.date).toBe('2026-06-10')
    expect(ah.amount).toBe(-45)
    expect(ah.counterparty_name).toBe('Albert Heijn')
    expect(ah.counterparty_iban).toBe('NL91ABNA0417164300')
    expect(ah.reference).toBe('AH-BOODSCHAPPEN-JUNI')
    expect(ah.bank_code).toBe('NTRF')
  })

  it('pins the exact output for a credit with /NAME//IBAN//RREF/', async () => {
    const rows = await parseMT940(fixture('mt940-rabobank-sample.sta'))
    const salaris = rows[1]
    expect(salaris.date).toBe('2026-06-20')
    expect(salaris.amount).toBe(2500)
    expect(salaris.counterparty_name).toBe('Werkgever BV')
    expect(salaris.counterparty_iban).toBe('NL02RABO0123456789')
    // /RREF/ wint als /RREF/ aanwezig is (vóór de /EREF/-fallback).
    expect(salaris.reference).toBe('SALARIS-JUNI-2026')
  })

  it('debit boekingen worden negatief, credit boekingen positief', async () => {
    const rows = await parseMT940(fixture('mt940-rabobank-sample.sta'))
    expect(rows[0].amount).toBeLessThan(0) // debit
    expect(rows[1].amount).toBeGreaterThan(0) // credit
    expect(rows[2].amount).toBeLessThan(0) // debit (huur)
  })

  it('/CNTP/ levert de tegenrekening-IBAN wanneer /IBAN/ ontbreekt, /NAME/ ontbreekt dan ook (incasso)', async () => {
    const rows = await parseMT940(fixture('mt940-rabobank-sample.sta'))
    const incasso = rows[3]
    expect(incasso.date).toBe('2026-06-15')
    expect(incasso.amount).toBe(-22.5)
    expect(incasso.counterparty_name).toBe(null)
    expect(incasso.counterparty_iban).toBe('NL39RABO0300065264')
    expect(incasso.reference).toBe('INCASSO-JULI-2026')
  })

  it('een :86: zonder gestructureerde /NAME//IBAN//RREF//EREF/-velden levert overal null op, raw text als description', async () => {
    const rows = await parseMT940(fixture('mt940-rabobank-sample.sta'))
    const raw = rows[4]
    expect(raw.date).toBe('2026-06-05')
    expect(raw.amount).toBe(15)
    expect(raw.counterparty_name).toBe(null)
    expect(raw.counterparty_iban).toBe(null)
    expect(raw.reference).toBe(null)
    expect(raw.description).toBe('Diversen bijschrijving zonder gestructureerde velden')
  })

  it('transaction_type is altijd null (SWIFT-code hoort in bank_code, WF-CASH-23)', async () => {
    const rows = await parseMT940(fixture('mt940-rabobank-sample.sta'))
    for (const row of rows) {
      expect(row.transaction_type).toBe(null)
    }
  })

  it('elke rij heeft een stabiele, niet-lege import_hash', async () => {
    const rows = await parseMT940(fixture('mt940-rabobank-sample.sta'))
    for (const row of rows) {
      expect(row.import_hash).toMatch(/^[0-9a-f]{64,}$/)
    }
    // Zelfde content -> zelfde hash (belangrijk voor re-import-detectie).
    const rowsAgain = await parseMT940(fixture('mt940-rabobank-sample.sta'))
    expect(rowsAgain.map((r) => r.import_hash)).toEqual(rows.map((r) => r.import_hash))
  })

  it('datum wordt via lokale getters opgebouwd, niet via toISOString (TZ-guard)', async () => {
    // formatDate() in mt940.ts gebruikt getFullYear/getMonth/getDate (lokale tijd),
    // nooit toISOString(). Deze test pint de kalenderdag exact zoals in het bestand
    // staat (:61:2606100610D...) — als iemand ooit toISOString() introduceert kan
    // dit op een runner met TZ < UTC een dag terugrollen (reference_month_boundary_tz).
    const rows = await parseMT940(fixture('mt940-rabobank-sample.sta'))
    expect(rows[0].date).toBe('2026-06-10')
    expect(rows[2].date).toBe('2026-07-01')
  })
})

describe('parseMT940 — randgeval: mt940-multi-statement.sta (meerdere :20:/:25:-statements)', () => {
  it('flattened alle transacties uit beide statements naar één platte array', async () => {
    const rows = await parseMT940(fixture('mt940-multi-statement.sta'))
    expect(rows.length).toBe(2)
  })

  it('pint de transacties van beide rekeningen in volgorde', async () => {
    const rows = await parseMT940(fixture('mt940-multi-statement.sta'))
    expect(rows[0]).toMatchObject({
      date: '2026-06-01',
      amount: -12,
      counterparty_name: 'Coffeecompany',
      counterparty_iban: 'NL10ABNA0987654321',
      reference: 'KOFFIE-JUNI',
    })
    expect(rows[1]).toMatchObject({
      date: '2026-06-02',
      amount: 300,
      counterparty_name: 'Belastingdienst',
      counterparty_iban: 'NL86INGB0002445588',
      reference: 'TEROUGGAAF-2025',
    })
  })
})
