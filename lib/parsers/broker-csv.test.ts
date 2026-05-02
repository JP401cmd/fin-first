import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  parseTrading212,
  parseEtoro,
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
