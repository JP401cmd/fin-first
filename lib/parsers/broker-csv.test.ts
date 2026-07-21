import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  parseTrading212,
  parseEtoro,
  parseBrokerCSV,
  detectBroker,
  parseENNumber,
  parseISODatePrefix,
  parseEtoroDate,
} from './broker-csv'

const fixture = (name: string): string =>
  readFileSync(path.resolve(__dirname, '__fixtures__', name), 'utf-8')

describe('parseENNumber', () => {
  it('parses a plain decimal', () => {
    expect(parseENNumber('170.50')).toBe(170.5)
  })

  it('strips comma thousands separators', () => {
    expect(parseENNumber('1,234.56')).toBe(1234.56)
  })

  it('returns 0 for empty input', () => {
    expect(parseENNumber('')).toBe(0)
  })
})

describe('parseISODatePrefix', () => {
  it('extracts the date from a Trading 212 timestamp', () => {
    expect(parseISODatePrefix('2024-03-12 09:32:14.123')).toBe('2024-03-12')
  })

  it('returns null for a non-ISO string', () => {
    expect(parseISODatePrefix('12/03/2024')).toBe(null)
  })
})

describe('parseEtoroDate', () => {
  it('parses DD/MM/YYYY HH:mm:ss', () => {
    expect(parseEtoroDate('05/03/2024 13:42:11')).toBe('2024-03-05')
  })

  it('parses bare DD/MM/YYYY', () => {
    expect(parseEtoroDate('05/03/2024')).toBe('2024-03-05')
  })

  it('falls back to ISO prefix', () => {
    expect(parseEtoroDate('2024-03-05 13:42:11')).toBe('2024-03-05')
  })

  it('rejects invalid month/day', () => {
    expect(parseEtoroDate('32/13/2024')).toBe(null)
  })
})

describe('detectBroker — Trading 212 + eToro', () => {
  it('detects Trading 212 from header', () => {
    expect(detectBroker(fixture('trading212-sample.csv'))).toBe('trading212')
  })

  it('detects eToro from header', () => {
    expect(detectBroker(fixture('etoro-sample.csv'))).toBe('etoro')
  })
})

describe('broker-import robuustheid — corrupt bedrag → waarschuwing i.p.v. €0-holding', () => {
  it('Trading 212: onleesbare Total-cel → rij overgeslagen + error, geldige rij blijft correct', () => {
    const csv = [
      'Action,Time,ISIN,Ticker,Name,No. of shares,Price / share,Total,Currency (Total)',
      'Market buy,2024-03-12 09:00:00,US0378331005,AAPL,Apple Inc,10,170.50,1705.00,EUR',
      'Market buy,2024-03-13 09:00:00,US0378331005,AAPL,Apple Inc,10,170.50,corrupt,EUR',
    ].join('\n')
    const result = parseBrokerCSV(csv, 'trading212')
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].total_amount).toBe(1705)
    expect(result.rows.some((r) => r.total_amount === 0)).toBe(false)
    expect(result.skipped).toBe(1)
    expect(result.errors.some((e) => e.toLowerCase().includes('onleesbare waarde'))).toBe(true)
  })

  it('eToro: onleesbare Amount-cel → rij overgeslagen + error', () => {
    const csv = [
      'Date,Type,Details,Amount,Units,ISIN,Realized Equity Change',
      '2024-03-12,Open Position,AAPL/USD,1705.00,10,US0378331005,0',
      '2024-03-13,Open Position,AAPL/USD,corrupt,10,US0378331005,0',
    ].join('\n')
    const result = parseBrokerCSV(csv, 'etoro')
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].total_amount).toBe(1705)
    expect(result.skipped).toBe(1)
    expect(result.errors.some((e) => e.toLowerCase().includes('onleesbare waarde'))).toBe(true)
  })

  it('DEGIRO portfolio: onleesbare "Waarde in EUR"-cel → rij overgeslagen + error', () => {
    const csv = [
      'Product;ISIN;Beurs;Aantal;Slotkoers;Waarde in EUR',
      'Apple;US0378331005;NDQ;10;170,00;1700,50',
      'Microsoft;US5949181045;NDQ;5;300,00;corrupt',
    ].join('\n')
    const result = parseBrokerCSV(csv, 'degiro')
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].total_amount).toBeCloseTo(1700.5)
    expect(result.skipped).toBe(1)
    expect(result.errors.some((e) => e.toLowerCase().includes('onleesbare waarde'))).toBe(true)
  })

  it('een leeg waarde-veld blijft toegestaan (0), alleen niet-lege corrupte cellen worden geweigerd', () => {
    // Lege Total = geen corruptie (0 is een geldige uitkomst) → geen error.
    const csv = [
      'Action,Time,ISIN,Ticker,Name,No. of shares,Price / share,Total,Currency (Total)',
      'Market buy,2024-03-12 09:00:00,US0378331005,AAPL,Apple Inc,10,170.50,,EUR',
    ].join('\n')
    const result = parseBrokerCSV(csv, 'trading212')
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].total_amount).toBe(0)
    expect(result.errors.some((e) => e.toLowerCase().includes('onleesbare waarde'))).toBe(false)
  })
})

describe('parseTrading212', () => {
  const result = parseTrading212(fixture('trading212-sample.csv'))

  it('skips cash-only actions (Deposit)', () => {
    // 5 lines: 2 buys, 1 sell, 1 dividend, 1 deposit → 4 holdings rows
    expect(result.rows.length).toBe(4)
  })

  it('detects buy, sell and dividend types', () => {
    const types = result.rows.map((r) => r.type).sort()
    expect(types).toEqual(['buy', 'buy', 'dividend', 'sell'])
  })

  it('parses Apple buy with correct ISIN, ticker, units and EUR total', () => {
    const apple = result.rows.find(
      (r) => r.ticker === 'AAPL' && r.type === 'buy' && r.units === 5,
    )
    expect(apple).toBeDefined()
    expect(apple!.isin).toBe('US0378331005')
    expect(apple!.name).toBe('Apple Inc')
    expect(apple!.total_amount).toBe(782.34)
    expect(apple!.date).toBe('2024-03-12')
  })

  it('parses the IWDA sell with the correct ISIN', () => {
    const iwda = result.rows.find((r) => r.type === 'sell')
    expect(iwda).toBeDefined()
    expect(iwda!.isin).toBe('IE00B4L5Y983')
    expect(iwda!.units).toBe(2)
    expect(iwda!.total_amount).toBe(178.2)
  })

  it('captures the Apple dividend', () => {
    const div = result.rows.find((r) => r.type === 'dividend')
    expect(div).toBeDefined()
    expect(div!.ticker).toBe('AAPL')
    expect(div!.total_amount).toBeCloseTo(1.77, 2)
  })

  it('records no parser-level errors on the sample', () => {
    expect(result.errors).toEqual([])
  })
})

describe('parseEtoro', () => {
  const result = parseEtoro(fixture('etoro-sample.csv'))

  it('skips deposit and withdrawal rows', () => {
    // 5 data rows: deposit + 2 opens + 1 close + withdrawal → 3 holdings rows
    expect(result.rows.length).toBe(3)
  })

  it('maps Open Position → buy and Position closed → sell', () => {
    const types = result.rows.map((r) => r.type).sort()
    expect(types).toEqual(['buy', 'buy', 'sell'])
  })

  it('extracts the ticker from the Details column', () => {
    const tickers = result.rows.map((r) => r.ticker).sort()
    expect(tickers).toEqual(['MSFT', 'TSLA', 'TSLA'])
  })

  it('preserves the ISIN when present', () => {
    const tsla = result.rows.find((r) => r.ticker === 'TSLA' && r.type === 'buy')
    expect(tsla).toBeDefined()
    expect(tsla!.isin).toBe('US88160R1014')
    expect(tsla!.units).toBe(1.5)
    expect(tsla!.total_amount).toBe(250)
    expect(tsla!.date).toBe('2024-03-05')
  })

  it('marks rows as USD currency', () => {
    expect(result.rows.every((r) => r.currency === 'USD')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// DEGIRO
// ---------------------------------------------------------------------------

const GENERIC_ERROR =
  'Geen geldige rijen gevonden. Controleer of het juiste brokerformaat is geselecteerd.'

describe('DEGIRO — Rekeningoverzicht (Account.csv) — bug regression', () => {
  // (a) This is the RED test: today parseBrokerCSV returns 0 rows but with the
  // generic error message.  After the fix it must return a SPECIFIC error that
  // names "Rekeningoverzicht" and points to Portfolio/Transactie.
  const result = parseBrokerCSV(fixture('degiro-account-sample.csv'), 'degiro')

  it('produces zero parsed rows for an Account.csv', () => {
    expect(result.rows.length).toBe(0)
  })

  it('returns a SPECIFIC error — not the generic brokerformat message (RED until fix)', () => {
    // After the fix: errors[0] must mention the unsupported format by name and
    // redirect to the correct export type.
    expect(result.errors[0]).not.toBe(GENERIC_ERROR)
    expect(result.errors[0]).toMatch(/Rekeningoverzicht/i)
    expect(result.errors[0]).toMatch(/Portfolio|Transactie/i)
  })
})

describe('DEGIRO — Portfolio export', () => {
  const result = parseBrokerCSV(fixture('degiro-portfolio-sample.csv'), 'degiro')

  it('parses at least one position row', () => {
    expect(result.rows.length).toBeGreaterThanOrEqual(1)
  })

  it('first row has correct name, ISIN, units and price', () => {
    const row = result.rows[0]
    expect(row.name).toBe('VANGUARD FTSE ALL-WORLD UCITS ETF')
    expect(row.isin).toBe('IE00BK5BQT80')
    expect(row.units).toBe(50)
    expect(row.price_per_unit).toBeCloseTo(130.05, 2)
    expect(row.type).toBe('position')
  })

  it('price_per_unit and units are positive numbers', () => {
    for (const row of result.rows) {
      expect(row.units).toBeGreaterThan(0)
      expect(row.price_per_unit).toBeGreaterThan(0)
    }
  })

  it('detects DEGIRO broker from portfolio fixture header', () => {
    expect(detectBroker(fixture('degiro-portfolio-sample.csv'))).toBe('degiro')
  })
})

// ---------------------------------------------------------------------------
// DEGIRO — Transaction export (echt komma-gescheiden formaat, SpaceX-rij)
// ---------------------------------------------------------------------------
// Het oude describe-blok ('DEGIRO — Transaction export') is verwijderd omdat
// de onderliggende fixture (degiro-transaction-sample.csv) verzonnen was:
// puntkomma-gescheiden, met een 'Waarde'-kolom die niet overeenkomt met de
// echte DEGIRO-export. De nieuwe fixture (degiro-transaction-real.csv) bevat
// een echte DEGIRO-exportrij en sterke asserts op exacte waarden.
// ---------------------------------------------------------------------------

describe('DEGIRO — Transaction export (echt formaat)', () => {
  const result = parseBrokerCSV(fixture('degiro-transaction-real.csv'), 'degiro')

  it('parses at least 1 row (preview toont de rij)', () => {
    expect(result.rows.length).toBeGreaterThanOrEqual(1)
  })

  it('detectBroker herkent het komma-gescheiden transactiebestand als degiro', () => {
    expect(detectBroker(fixture('degiro-transaction-real.csv'))).toBe('degiro')
  })

  it('name is correct', () => {
    expect(result.rows[0].name).toBe('SPACE EXPLORATION TECHNOLOGIES CORP CLASS A')
  })

  it('isin is correct', () => {
    expect(result.rows[0].isin).toBe('US84615Q1031')
  })

  it('exchange is correct', () => {
    expect(result.rows[0].exchange).toBe('NDQ')
  })

  it('type is sell (Aantal negatief)', () => {
    expect(result.rows[0].type).toBe('sell')
  })

  it('units is absolute value (5)', () => {
    expect(result.rows[0].units).toBe(5)
  })

  it('total_amount comes from Waarde EUR (500.00), not Lokale waarde', () => {
    expect(result.rows[0].total_amount).toBe(500.00)
  })

  it('price_per_unit is Waarde EUR / |Aantal| in EUR, not USD Koers', () => {
    // 500.00 / 5 = 100.000
    expect(result.rows[0].price_per_unit).toBeCloseTo(100.000, 3)
  })

  it('fees is absolute value of Transactiekosten EUR (2.00)', () => {
    expect(result.rows[0].fees).toBe(2.00)
  })

  it('currency is EUR', () => {
    expect(result.rows[0].currency).toBe('EUR')
  })

  it('date is parsed correctly', () => {
    expect(result.rows[0].date).toBe('2025-01-01')
  })

  it('order-id (UUID) is stored in raw["Order ID"]', () => {
    // DEGIRO-quirk: de UUID staat in het veld NA de "Order ID"-header
    // (kolomverschuiving door lege laatste header). We lezen hem robuust uit
    // als het laatste niet-lege, UUID-achtige veld van de rij en slaan op in
    // raw["Order ID"] zodat de import-stap hem kan persisteren.
    expect(result.rows[0].raw['Order ID']).toBe('00000000-0000-0000-0000-000000000001')
  })
})
