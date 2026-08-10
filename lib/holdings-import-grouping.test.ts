import { describe, it, expect } from 'vitest'
import { instrumentKey, countDistinctInstruments } from './holdings-import-grouping'

describe('instrumentKey', () => {
  it('geeft ISIN voorrang boven ticker en naam', () => {
    expect(instrumentKey({ isin: 'us5738741041', ticker: 'MRVL', name: 'Marvell' }))
      .toBe('US5738741041')
  })

  it('valt terug op ticker, en daarna op naam', () => {
    expect(instrumentKey({ isin: null, ticker: 'mrvl', name: 'Marvell' })).toBe('MRVL')
    expect(instrumentKey({ isin: null, ticker: null, name: 'AEX 485.9SPSOPENG' }))
      .toBe('AEX 485.9SPSOPENG')
  })
})

describe('countDistinctInstruments', () => {
  it('telt instrumenten, niet regels — 24 aankopen van één fonds is één holding', () => {
    const rows = Array.from({ length: 24 }, () => ({
      isin: 'US5738741041',
      ticker: 'MRVL',
      name: 'MARVELL TECHNOLOGY, INC.',
    }))
    expect(countDistinctInstruments(rows)).toBe(1)
  })

  it('telt koop en verkoop van hetzelfde instrument als één', () => {
    const rows = [
      { isin: 'US8334451098', ticker: null, name: 'SNOWFLAKE INC.' },
      { isin: 'US8334451098', ticker: null, name: 'SNOWFLAKE INC.' },
      { isin: 'NL0012969182', ticker: null, name: 'ADYEN N.V.' },
    ]
    expect(countDistinctInstruments(rows)).toBe(2)
  })

  it('is 0 voor een lege set', () => {
    expect(countDistinctInstruments([])).toBe(0)
  })
})
