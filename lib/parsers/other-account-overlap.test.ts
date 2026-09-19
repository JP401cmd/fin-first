import { describe, it, expect } from 'vitest'
import { countOtherAccountOverlaps, groupRowsByAccount } from './other-account-overlap'

/**
 * Waarschuwing "X regels staan al op rekening Y" (Notion 3d8f9e8d-568a-815e-9d91-e882e4d24000).
 *
 * De matchsleutel is die van laag 2 (datum ±1 dag, bedrag exact, tegenpartij
 * genormaliseerd) — hier niet opnieuw bewezen (zie cross-source-dedup.test.ts),
 * wél dat hij PER ANDERE REKENING wordt toegepast en netjes geteld.
 */

const paypalExport = [
  { date: '2026-09-01', amount: -9.99, counterparty_name: 'Spotify', counterparty_iban: null },
  { date: '2026-09-03', amount: -13.99, counterparty_name: 'Netflix', counterparty_iban: null },
  { date: '2026-09-05', amount: -55, counterparty_name: 'Ziggo', counterparty_iban: 'NL12INGB0001234567' },
]

describe('countOtherAccountOverlaps', () => {
  it('telt per andere rekening hoeveel kandidaten daar al staan, aflopend gesorteerd', () => {
    const others = [
      {
        account_id: 'creditcard',
        rows: [
          // Zelfde export, een dag verschoven geboekt: matcht op naam.
          { date: '2026-09-02', amount: -9.99, counterparty_name: 'SPOTIFY', counterparty_iban: null },
          { date: '2026-09-03', amount: -13.99, counterparty_name: 'Netflix', counterparty_iban: null },
        ],
      },
      {
        account_id: 'spaar',
        rows: [{ date: '2026-09-05', amount: -55, counterparty_name: 'Ziggo B.V.', counterparty_iban: 'NL12 INGB 0001 2345 67' }],
      },
      { account_id: 'leeg', rows: [] },
    ]
    expect(countOtherAccountOverlaps(paypalExport, others)).toEqual([
      { account_id: 'creditcard', count: 2 },
      { account_id: 'spaar', count: 1 },
    ])
  })

  it('laat een rekening zonder treffer weg en geeft [] zonder kandidaten', () => {
    const others = [
      { account_id: 'x', rows: [{ date: '2026-09-01', amount: -9.99, counterparty_name: 'Deezer', counterparty_iban: null }] },
    ]
    expect(countOtherAccountOverlaps(paypalExport, others)).toEqual([])
    expect(countOtherAccountOverlaps([], others)).toEqual([])
  })

  it('één bestaande rij absorbeert hooguit één kandidaat (twee echte boekingen tellen niet allebei)', () => {
    const tweeKoffies = [
      { date: '2026-09-01', amount: -3, counterparty_name: 'Bakker', counterparty_iban: null },
      { date: '2026-09-01', amount: -3, counterparty_name: 'Bakker', counterparty_iban: null },
    ]
    const others = [
      { account_id: 'a', rows: [{ date: '2026-09-01', amount: -3, counterparty_name: 'Bakker', counterparty_iban: null }] },
    ]
    expect(countOtherAccountOverlaps(tweeKoffies, others)).toEqual([{ account_id: 'a', count: 1 }])
  })
})

describe('groupRowsByAccount', () => {
  it('groepeert een platte loader-uitkomst per rekening, in volgorde van eerste voorkomen', () => {
    const grouped = groupRowsByAccount([
      { account_id: 'b', date: '2026-09-01', amount: -1 },
      { account_id: 'a', date: '2026-09-01', amount: -2 },
      { account_id: 'b', date: '2026-09-02', amount: -3 },
    ])
    expect(grouped.map((g) => [g.account_id, g.rows.length])).toEqual([['b', 2], ['a', 1]])
  })
})
