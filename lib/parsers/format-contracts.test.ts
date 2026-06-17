/**
 * Golden-fixture contract test voor format-contracts.ts.
 *
 * Per formaat:
 * 1. Bereken de SHA-256-fingerprint van de fixture-headers.
 * 2. Assert dat de fingerprint gelijk is aan een INGEBAKKEN string (regressie-tripwire).
 *    Een gewijzigde fingerprint duidt op formaat-drift in de fixture of het formaat zelf.
 * 3. Controleer via `diffHeaders` dat alle VERPLICHTE kolommen aanwezig zijn.
 * 4. Assert voor broker-CSV's ook dat `detectBroker` het juiste type herkent en
 *    dat parseBrokerCSV inhoudelijk correcte rijen teruggeeft.
 * 5. Assert voor pension-JSON dat alle verplichte sleutels aanwezig zijn.
 *
 * Hoe de golden hashes zijn bepaald:
 * - Eerste run → "Received"-waarde uit de test-output
 * - Die waarde wordt hier als literal opgeslagen
 * - Elke volgende run vergelijkt de live-berekende fingerprint hiertegen
 * - Fixture-drift OF contract-wijziging maakt de test rood → bewuste update vereist
 *
 * Spiegelt broker-csv.test.ts in structuur.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  fingerprintHeaders,
  diffHeaders,
  FORMAT_CONTRACTS,
} from './format-contracts'
import { detectBroker, parseBrokerCSV } from './broker-csv'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fixture = (name: string): string =>
  readFileSync(path.resolve(__dirname, '__fixtures__', name), 'utf-8')

const fixtureJson = (name: string): unknown =>
  JSON.parse(readFileSync(path.resolve(__dirname, '__fixtures__', name), 'utf-8'))

/**
 * Lees de eerste (header-)regel van een CSV-fixture en retourneer de
 * opgesplitste kolomnamen na BOM-strip en quote-verwijdering.
 */
function csvHeaders(content: string, delimiter: string): string[] {
  const cleaned = content.replace(/^﻿/, '')
  const firstLine = cleaned.split(/\r?\n/).find((l) => l.trim().length > 0) ?? ''
  return firstLine.split(delimiter).map((h) => h.replace(/^"|"$/g, '').trim())
}

// ---------------------------------------------------------------------------
// Bank-CSV: ING
// Golden fingerprint: SHA-256 van gesorteerde, lowercase kolomnamen
// (fixture = ing-sample.csv, kolommen = exact de 9 requiredHeaders)
// ---------------------------------------------------------------------------

describe('Format contract — ING', () => {
  // GOLDEN HASH — gegenereerd vanuit ing-sample.csv (eerste run)
  // Sorteer: af bij | bedrag (eur) | code | datum | mededelingen |
  //          mutatiesoort | naam / omschrijving | rekening | tegenrekening
  const GOLDEN_FINGERPRINT_ING =
    '47dce0f64916482f634f50d5b0cc8fed576ce490bc11f3169551a7bd201424a5'

  const content = fixture('ing-sample.csv')
  const delimiter = FORMAT_CONTRACTS.ing.delimiter!
  const headers = csvHeaders(content, delimiter)

  it('fixture-fingerprint stemt overeen met golden hash (regressie-tripwire)', async () => {
    const fp = await fingerprintHeaders(headers)
    expect(fp).toBe(GOLDEN_FINGERPRINT_ING)
  })

  it('diffHeaders: geen missing, geen unexpected voor ING-fixture', () => {
    const { missing, unexpected } = diffHeaders(headers, 'ing')
    expect(missing).toEqual([])
    expect(unexpected).toEqual([])
  })

  it('fixture heeft 9 kolomnamen', () => {
    expect(headers.length).toBe(9)
  })
})

// ---------------------------------------------------------------------------
// Bank-CSV: Rabobank
// Golden fingerprint: SHA-256 van gesorteerde kolomnamen uit rabobank-sample.csv
// Fixture heeft 26 kolommen (required + optional) — fingerprint dekt alles
// ---------------------------------------------------------------------------

describe('Format contract — Rabobank', () => {
  // GOLDEN HASH — gegenereerd vanuit rabobank-sample.csv (eerste run)
  const GOLDEN_FINGERPRINT_RABOBANK =
    '06247d1d56bd069d40831ad2e0e81c65698d09d3a84d02e571f48e054b7ae70d'

  const content = fixture('rabobank-sample.csv')
  const delimiter = FORMAT_CONTRACTS.rabobank.delimiter!
  const headers = csvHeaders(content, delimiter)

  it('fixture-fingerprint stemt overeen met golden hash (regressie-tripwire)', async () => {
    const fp = await fingerprintHeaders(headers)
    expect(fp).toBe(GOLDEN_FINGERPRINT_RABOBANK)
  })

  it('diffHeaders: geen missing voor verplichte Rabobank-kolommen', () => {
    const { missing } = diffHeaders(headers, 'rabobank')
    expect(missing).toEqual([])
  })

  it('fixture bevat meer dan 12 kolommen (incl. optionele)', () => {
    expect(headers.length).toBeGreaterThanOrEqual(12)
  })
})

// ---------------------------------------------------------------------------
// Bank-CSV: ABN AMRO
// Golden fingerprint: SHA-256 van gesorteerde kolomnamen uit abn-sample.csv
// Fixture heeft exact de 8 requiredHeaders
// ---------------------------------------------------------------------------

describe('Format contract — ABN AMRO', () => {
  // GOLDEN HASH — gegenereerd vanuit abn-sample.csv (eerste run)
  // Sorteer: bedrag | beginsaldo | eindsaldo | muntsoort |
  //          omschrijving | rekeningnummer | rentedatum | transactiedatum
  const GOLDEN_FINGERPRINT_ABN =
    '005a2bd8e3e24e2756e4811f58c936a5b989c8963fa9e91f6f47f032b8fa4b21'

  const content = fixture('abn-sample.csv')
  const delimiter = FORMAT_CONTRACTS.abn.delimiter!
  const headers = csvHeaders(content, delimiter)

  it('fixture-fingerprint stemt overeen met golden hash (regressie-tripwire)', async () => {
    const fp = await fingerprintHeaders(headers)
    expect(fp).toBe(GOLDEN_FINGERPRINT_ABN)
  })

  it('diffHeaders: geen missing, geen unexpected voor ABN-fixture', () => {
    const { missing, unexpected } = diffHeaders(headers, 'abn')
    expect(missing).toEqual([])
    expect(unexpected).toEqual([])
  })

  it('fixture heeft precies 8 kolomnamen', () => {
    expect(headers.length).toBe(8)
  })
})

// ---------------------------------------------------------------------------
// Broker-CSV: DEGIRO portfolio
// Golden fingerprint: SHA-256 van gesorteerde kolomnamen uit degiro-portfolio-sample.csv
// ---------------------------------------------------------------------------

describe('Format contract — DEGIRO portfolio', () => {
  // GOLDEN HASH — gegenereerd vanuit degiro-portfolio-sample.csv (eerste run)
  const GOLDEN_FINGERPRINT_DEGIRO_PORTFOLIO =
    'aefe0cf14de82d4f9b6d1acc276623d1157a449c03981f39fe1899076fe31de7'

  const content = fixture('degiro-portfolio-sample.csv')
  const delimiter = ';'
  const headers = csvHeaders(content, delimiter)

  it('fixture-fingerprint stemt overeen met golden hash (regressie-tripwire)', async () => {
    const fp = await fingerprintHeaders(headers)
    expect(fp).toBe(GOLDEN_FINGERPRINT_DEGIRO_PORTFOLIO)
  })

  it('diffHeaders: geen missing verplichte DEGIRO-portfolio-kolommen', () => {
    const { missing } = diffHeaders(headers, 'degiro-portfolio')
    expect(missing).toEqual([])
  })

  it('detectBroker herkent het als degiro', () => {
    expect(detectBroker(content)).toBe('degiro')
  })

  it('parseBrokerCSV geeft minstens 1 position-rij terug zonder fouten', () => {
    const result = parseBrokerCSV(content, 'degiro')
    expect(result.rows.length).toBeGreaterThanOrEqual(1)
    expect(result.errors).toEqual([])
  })

  it('eerste rij heeft VWRL ISIN en type position', () => {
    const result = parseBrokerCSV(content, 'degiro')
    expect(result.rows[0].type).toBe('position')
    expect(result.rows[0].isin).toBe('IE00BK5BQT80')
  })
})

// ---------------------------------------------------------------------------
// Broker-CSV: DEGIRO transacties
// Golden fingerprint: SHA-256 van gesorteerde kolomnamen uit degiro-transaction-real.csv
// ⚠️ PII-opmerking: zie rapport — fixture bevat een reëel DEGIRO order-UUID
// ---------------------------------------------------------------------------

describe('Format contract — DEGIRO transacties', () => {
  // GOLDEN HASH — gegenereerd vanuit degiro-transaction-real.csv (eerste run)
  const GOLDEN_FINGERPRINT_DEGIRO_TRANSACTION =
    '2abaa259ebe90987d5eb984d66e4f94d3c8bc9f41b27a5589403dec424dc1b79'

  const content = fixture('degiro-transaction-real.csv')
  const delimiter = ','
  const headers = csvHeaders(content, delimiter)

  it('fixture-fingerprint stemt overeen met golden hash (regressie-tripwire)', async () => {
    const fp = await fingerprintHeaders(headers)
    expect(fp).toBe(GOLDEN_FINGERPRINT_DEGIRO_TRANSACTION)
  })

  it('diffHeaders: geen missing verplichte DEGIRO-transactie-kolommen', () => {
    const { missing } = diffHeaders(headers, 'degiro-transaction')
    expect(missing).toEqual([])
  })

  it('detectBroker herkent het als degiro', () => {
    expect(detectBroker(content)).toBe('degiro')
  })

  it('parseBrokerCSV geeft 1 sell-rij terug', () => {
    const result = parseBrokerCSV(content, 'degiro')
    expect(result.rows.length).toBe(1)
    expect(result.rows[0].type).toBe('sell')
    expect(result.rows[0].isin).toBe('US84615Q1031')
  })
})

// ---------------------------------------------------------------------------
// Broker-CSV: Saxo Bank
// Golden fingerprint: SHA-256 van gesorteerde kolomnamen uit saxo-sample.csv
// ---------------------------------------------------------------------------

describe('Format contract — Saxo Bank', () => {
  // GOLDEN HASH — gegenereerd vanuit saxo-sample.csv (eerste run)
  const GOLDEN_FINGERPRINT_SAXO =
    'c5c9b984520b20bc77c86eff4c4d13c1ddfbea48acda3415205f2fb942a51ad9'

  const content = fixture('saxo-sample.csv')
  const delimiter = FORMAT_CONTRACTS.saxo.delimiter!
  const headers = csvHeaders(content, delimiter)

  it('fixture-fingerprint stemt overeen met golden hash (regressie-tripwire)', async () => {
    const fp = await fingerprintHeaders(headers)
    expect(fp).toBe(GOLDEN_FINGERPRINT_SAXO)
  })

  it('diffHeaders: geen missing verplichte Saxo-kolommen', () => {
    const { missing } = diffHeaders(headers, 'saxo')
    expect(missing).toEqual([])
  })

  it('detectBroker herkent het als saxo', () => {
    expect(detectBroker(content)).toBe('saxo')
  })

  it('parseBrokerCSV geeft 3 position-rijen terug', () => {
    const result = parseBrokerCSV(content, 'saxo')
    expect(result.rows.length).toBe(3)
    expect(result.rows.every((r) => r.type === 'position')).toBe(true)
  })

  it('eerste rij is IWDA met juist ISIN', () => {
    const result = parseBrokerCSV(content, 'saxo')
    expect(result.rows[0].isin).toBe('IE00B4L5Y983')
  })
})

// ---------------------------------------------------------------------------
// Broker-CSV: ING Beleggen
// Golden fingerprint: SHA-256 van gesorteerde kolomnamen uit ing-beleggen-sample.csv
// ---------------------------------------------------------------------------

describe('Format contract — ING Beleggen', () => {
  // GOLDEN HASH — gegenereerd vanuit ing-beleggen-sample.csv (eerste run)
  const GOLDEN_FINGERPRINT_ING_BELEGGEN =
    '06423d13f220cfc355a4392dd499fb7c2dc464910083f8bb96498a44c3f4df11'

  const content = fixture('ing-beleggen-sample.csv')
  const delimiter = FORMAT_CONTRACTS['ing-beleggen'].delimiter!
  const headers = csvHeaders(content, delimiter)

  it('fixture-fingerprint stemt overeen met golden hash (regressie-tripwire)', async () => {
    const fp = await fingerprintHeaders(headers)
    expect(fp).toBe(GOLDEN_FINGERPRINT_ING_BELEGGEN)
  })

  it('diffHeaders: geen missing verplichte ING-Beleggen-kolommen', () => {
    const { missing } = diffHeaders(headers, 'ing-beleggen')
    expect(missing).toEqual([])
  })

  it('detectBroker herkent het als ing_beleggen', () => {
    expect(detectBroker(content)).toBe('ing_beleggen')
  })

  it('parseBrokerCSV geeft 3 position-rijen terug', () => {
    const result = parseBrokerCSV(content, 'ing_beleggen')
    expect(result.rows.length).toBe(3)
    expect(result.rows.every((r) => r.type === 'position')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Broker-CSV: Trading 212
// Golden fingerprint: SHA-256 van gesorteerde kolomnamen uit trading212-sample.csv
// ---------------------------------------------------------------------------

describe('Format contract — Trading 212', () => {
  // GOLDEN HASH — gegenereerd vanuit trading212-sample.csv (eerste run)
  const GOLDEN_FINGERPRINT_TRADING212 =
    'c6bad9450635ac94cee46c041fbe564ebfb715e556a01f7ec06a242b48654001'

  const content = fixture('trading212-sample.csv')
  const delimiter = FORMAT_CONTRACTS.trading212.delimiter!
  const headers = csvHeaders(content, delimiter)

  it('fixture-fingerprint stemt overeen met golden hash (regressie-tripwire)', async () => {
    const fp = await fingerprintHeaders(headers)
    expect(fp).toBe(GOLDEN_FINGERPRINT_TRADING212)
  })

  it('diffHeaders: geen missing verplichte Trading 212-kolommen', () => {
    const { missing } = diffHeaders(headers, 'trading212')
    expect(missing).toEqual([])
  })

  it('detectBroker herkent het als trading212', () => {
    expect(detectBroker(content)).toBe('trading212')
  })

  it('parseBrokerCSV geeft 4 holdings-rijen terug (deposit overgeslagen)', () => {
    const result = parseBrokerCSV(content, 'trading212')
    expect(result.rows.length).toBe(4)
    expect(result.errors).toEqual([])
  })

  it('typen zijn buy, buy, sell, dividend', () => {
    const result = parseBrokerCSV(content, 'trading212')
    const types = result.rows.map((r) => r.type).sort()
    expect(types).toEqual(['buy', 'buy', 'dividend', 'sell'])
  })
})

// ---------------------------------------------------------------------------
// Broker-CSV: eToro
// Golden fingerprint: SHA-256 van gesorteerde kolomnamen uit etoro-sample.csv
// ---------------------------------------------------------------------------

describe('Format contract — eToro', () => {
  // GOLDEN HASH — gegenereerd vanuit etoro-sample.csv (eerste run)
  const GOLDEN_FINGERPRINT_ETORO =
    '13067be87cd1b658b893680a5538aed4741b57960c9b8b4bde1cca136fa274d0'

  const content = fixture('etoro-sample.csv')
  const delimiter = FORMAT_CONTRACTS.etoro.delimiter!
  const headers = csvHeaders(content, delimiter)

  it('fixture-fingerprint stemt overeen met golden hash (regressie-tripwire)', async () => {
    const fp = await fingerprintHeaders(headers)
    expect(fp).toBe(GOLDEN_FINGERPRINT_ETORO)
  })

  it('diffHeaders: geen missing verplichte eToro-kolommen', () => {
    const { missing } = diffHeaders(headers, 'etoro')
    expect(missing).toEqual([])
  })

  it('detectBroker herkent het als etoro', () => {
    expect(detectBroker(content)).toBe('etoro')
  })

  it('parseBrokerCSV geeft 3 holdings-rijen terug', () => {
    const result = parseBrokerCSV(content, 'etoro')
    expect(result.rows.length).toBe(3)
    expect(result.errors).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Pensioen-JSON
// (geen fingerprint — JSON kent geen kolomvolgorde; structurele asserts)
// ---------------------------------------------------------------------------

describe('Format contract — Pensioen-JSON', () => {
  const data = fixtureJson('pension-sample.json') as Record<string, unknown>
  const contract = FORMAT_CONTRACTS['pension-json']

  it('alle verplichte sleutels zijn aanwezig in de fixture', () => {
    for (const key of contract.requiredHeaders) {
      expect(data).toHaveProperty(key)
    }
  })

  it('regelingen is een niet-lege array', () => {
    expect(Array.isArray(data.regelingen)).toBe(true)
    expect((data.regelingen as unknown[]).length).toBeGreaterThan(0)
  })

  it('aowBedrag is een positief getal', () => {
    expect(typeof data.aowBedrag).toBe('number')
    expect(data.aowBedrag as number).toBeGreaterThan(0)
  })

  it('samenvatting is een niet-lege string', () => {
    expect(typeof data.samenvatting).toBe('string')
    expect((data.samenvatting as string).length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// diffHeaders — gedragscontroles
// ---------------------------------------------------------------------------

describe('diffHeaders — correctheid', () => {
  it('signaleert een ontbrekende verplichte kolom', () => {
    const incompleteHeaders = FORMAT_CONTRACTS['degiro-portfolio'].requiredHeaders.filter(
      (h) => h !== 'ISIN',
    )
    const { missing } = diffHeaders(incompleteHeaders, 'degiro-portfolio')
    expect(missing).toContain('isin')
  })

  it('signaleert een onbekende kolom als unexpected', () => {
    const headersWithExtra = [...FORMAT_CONTRACTS.ing.requiredHeaders, 'OnbekendeKolom']
    const { unexpected } = diffHeaders(headersWithExtra, 'ing')
    expect(unexpected).toContain('onbekendekolom')
  })

  it('bekende optionele kolommen leiden NIET tot unexpected', () => {
    const headers = [
      ...FORMAT_CONTRACTS.rabobank.requiredHeaders,
      ...FORMAT_CONTRACTS.rabobank.knownOptionalHeaders,
    ]
    const { unexpected } = diffHeaders(headers, 'rabobank')
    expect(unexpected).toEqual([])
  })

  it('vergelijking is case-insensitief', () => {
    const headersUpperCase = FORMAT_CONTRACTS.ing.requiredHeaders.map((h) => h.toUpperCase())
    const { missing } = diffHeaders(headersUpperCase, 'ing')
    expect(missing).toEqual([])
  })
})
