/**
 * Golden-fixture-tests voor de OFX-parser (lib/parsers/ofx.ts).
 *
 * "Golden" = de fixture wordt één keer daadwerkelijk door parseOFX() gehaald en
 * de output wordt afgelezen en bevroren als verwachte waarde (niet gegokt) — zie
 * Notion-kaart "Golden-fixture-tests voor MT940- en OFX-bankimport-parsers".
 *
 * transaction_type/bank_code (WF-CASH-23) wordt hier NIET herhaald — dat is al
 * volledig gedekt door transaction-type-mapping.test.ts. Deze suite pint de
 * VOLLEDIGE parse-uitkomst (datum, bedrag, tegenpartij, referentie) + de eigen
 * OFX-randgevallen (geen closing tags, TZ-suffix, komma-decimaal, ontbrekende velden).
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { parseOFX } from './ofx'

const fixture = (name: string): string =>
  readFileSync(path.resolve(__dirname, '__fixtures__', name), 'utf-8')

describe('parseOFX — golden: ofx-ing-sample.ofx (met </STMTTRN>-closing-tags)', () => {
  it('parses alle 3 transacties in bestandsvolgorde', async () => {
    const rows = await parseOFX(fixture('ofx-ing-sample.ofx'))
    expect(rows.length).toBe(3)
  })

  it('pint de exacte output voor een DEBIT-transactie', async () => {
    const rows = await parseOFX(fixture('ofx-ing-sample.ofx'))
    expect(rows[0]).toMatchObject({
      date: '2026-06-03',
      amount: -38.42,
      description: 'BOODSCHAPPEN JUNI',
      counterparty_name: 'Jumbo Supermarkten',
      counterparty_iban: null,
      reference: 'ING-OFX-0001',
      bank_code: 'DEBIT',
      transaction_type: null,
    })
  })

  it('pint de exacte output voor een CREDIT-transactie', async () => {
    const rows = await parseOFX(fixture('ofx-ing-sample.ofx'))
    expect(rows[1]).toMatchObject({
      date: '2026-06-25',
      amount: 2650.75,
      description: 'SALARIS JUNI 2026',
      counterparty_name: 'Werkgever Noord BV',
      reference: 'ING-OFX-0002',
      bank_code: 'CREDIT',
    })
  })

  it('DEBIT wordt negatief, CREDIT positief', async () => {
    const rows = await parseOFX(fixture('ofx-ing-sample.ofx'))
    expect(rows[0].amount).toBeLessThan(0)
    expect(rows[1].amount).toBeGreaterThan(0)
  })

  it('description valt terug op NAME wanneer MEMO ontbreekt', async () => {
    const rows = await parseOFX(fixture('ofx-ing-sample.ofx'))
    // Derde transactie heeft geen <MEMO>, alleen <NAME>Energieleverancier.
    expect(rows[2].description).toBe('Energieleverancier')
    expect(rows[2].counterparty_name).toBe('Energieleverancier')
  })

  it('counterparty_iban is altijd null (OFX levert geen IBAN-veld)', async () => {
    const rows = await parseOFX(fixture('ofx-ing-sample.ofx'))
    for (const row of rows) {
      expect(row.counterparty_iban).toBe(null)
    }
  })

  it('elke rij heeft een stabiele, niet-lege import_hash', async () => {
    const rows = await parseOFX(fixture('ofx-ing-sample.ofx'))
    for (const row of rows) {
      expect(row.import_hash).toMatch(/^[0-9a-f]{64,}$/)
    }
  })
})

describe('parseOFX — randgeval: ofx-no-closing-tags.ofx', () => {
  it('parseert de aaneengesloten transacties ook zonder </STMTTRN>-closing-tags', async () => {
    const rows = await parseOFX(fixture('ofx-no-closing-tags.ofx'))
    // Het bestand bevat 3 <STMTTRN>-blokken. De block-extractor gebruikt een
    // niet-gretige regex die zonder closing-tag stopt bij het volgende <STMTTRN>
    // (lookahead) — dat werkt voor de eerste 2 blokken. Het laatste blok heeft
    // geen opvolgend <STMTTRN> en geen closing-tag, dus wordt het al vóór de
    // datePosted/trnAmt-guard niet als blok herkend (dat blok mist toch
    // DTPOSTED/TRNAMT, dus het eindresultaat — geen transactie — is hetzelfde).
    expect(rows.length).toBe(2)
  })

  it('pint de datum met [+1:CET]-TZ-suffix gestript naar YYYY-MM-DD', async () => {
    const rows = await parseOFX(fixture('ofx-no-closing-tags.ofx'))
    expect(rows[0].date).toBe('2026-06-10')
    expect(rows[1].date).toBe('2026-06-15')
  })

  it('komma-decimaal bedrag wordt naar een punt-decimaal getal geconverteerd', async () => {
    const rows = await parseOFX(fixture('ofx-no-closing-tags.ofx'))
    expect(rows[0].amount).toBe(-25.5)
    expect(rows[1].amount).toBe(1000)
  })

  it('het onvolledige derde blok (geen DTPOSTED/TRNAMT) levert geen transactie op', async () => {
    const rows = await parseOFX(fixture('ofx-no-closing-tags.ofx'))
    const referenties = rows.map((r) => r.reference)
    expect(referenties).not.toContain('ABN-OFX-0003')
  })
})
