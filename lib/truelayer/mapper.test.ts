import { describe, it, expect } from 'vitest'
import { mapTransaction } from './mapper'
import type { TLTransaction } from './types'

// Vastgepind gedrag: transaction_type blijft altijd null (die kolom heeft een
// CHECK-constraint op een vaste enum, zie lib/parsers/csv.ts en
// lib/parsers/shared.ts) — rauwe TrueLayer-categorieën ('PURCHASE',
// 'DIRECT_DEBIT', ...) landen in bank_code, net als bij de CSV-parser.

describe('mapTransaction', () => {
  it('zet transaction_category in bank_code, transaction_type blijft null', async () => {
    const tl: TLTransaction = {
      transaction_id: 'tl-1',
      timestamp: '2026-03-15T08:00:00Z',
      amount: -12.5,
      currency: 'EUR',
      description: 'Albert Heijn',
      transaction_type: 'DEBIT',
      transaction_category: 'PURCHASE',
    }

    const result = await mapTransaction(tl)

    expect(result.transaction_type).toBeNull()
    expect(result.bank_code).toBe('PURCHASE')
  })

  it('valt terug op transaction_type in bank_code als transaction_category ontbreekt', async () => {
    const tl: TLTransaction = {
      transaction_id: 'tl-2',
      timestamp: '2026-03-16T09:00:00Z',
      amount: 100,
      currency: 'EUR',
      description: 'Salaris',
      transaction_type: 'CREDIT',
      transaction_category: undefined as unknown as string,
    }

    const result = await mapTransaction(tl)

    expect(result.bank_code).toBe('CREDIT')
    expect(result.transaction_type).toBeNull()
  })

  it('sanity: bestaande mapping (date/amount/description/reference/import_hash/running_balance) blijft intact', async () => {
    const tl: TLTransaction = {
      transaction_id: 'tl-3',
      timestamp: '2026-03-17T10:30:00Z',
      amount: -42.5,
      currency: 'EUR',
      description: 'Coffeeshop Betaling',
      transaction_type: 'DEBIT',
      transaction_category: 'PURCHASE',
      merchant_name: 'Coffeeshop BV',
      running_balance: { amount: 1234.56, currency: 'EUR' },
    }

    const result = await mapTransaction(tl)

    expect(result.date).toBe('2026-03-17')
    expect(result.amount).toBe(-42.5)
    expect(result.description).toBe('Coffeeshop Betaling')
    expect(result.counterparty_name).toBe('Coffeeshop BV')
    expect(result.reference).toBe('tl-3')
    expect(result.running_balance).toBe(1234.56)
    expect(typeof result.import_hash).toBe('string')
    expect(result.import_hash.length).toBeGreaterThan(0)
  })

  // Bug: Rabobank (provider xs2a-rabobank, live) vult merchant_name NIET (0/354
  // transacties in de echte sync); naam + IBAN zitten in `meta.counter_party_*`.
  // TLTransaction kent `meta` nog niet -> cast via unknown, zie types.ts (fix in
  // een latere stap). Dit legt vast dat mapTransaction daar (nog) niet naar kijkt.
  it('BUG: leest counterparty uit meta.counter_party_* als merchant_name ontbreekt (Rabobank)', async () => {
    const tl = {
      transaction_id: '7ab7dea768d6bb7389ec2e97086a8e36',
      timestamp: '2026-07-29T06:05:01.241Z',
      amount: -11.99,
      currency: 'EUR',
      description: 'BRN?00000679,3: S-7760892, 2026-07-25 - 2026-08-24',
      transaction_type: 'DEBIT',
      transaction_category: 'DEBIT',
      meta: {
        transaction_type: 'Debit',
        counter_party_preferred_name: 'VIDEOLAND DOOR BUCKAROO',
        counter_party_iban: 'NL16DEUT0265237289',
      },
    } as unknown as TLTransaction

    const result = await mapTransaction(tl)

    expect(result.counterparty_name).toBe('VIDEOLAND DOOR BUCKAROO')
    expect(result.counterparty_iban).toBe('NL16DEUT0265237289')
  })

  it('BUG: een gevulde merchant_name houdt voorrang boven meta.counter_party_preferred_name', async () => {
    const tl = {
      transaction_id: 'tl-4',
      timestamp: '2026-07-29T06:05:01.241Z',
      amount: -11.99,
      currency: 'EUR',
      description: 'Videoland abonnement',
      transaction_type: 'DEBIT',
      transaction_category: 'DEBIT',
      merchant_name: 'Videoland B.V.',
      meta: {
        transaction_type: 'Debit',
        counter_party_preferred_name: 'VIDEOLAND DOOR BUCKAROO',
        counter_party_iban: 'NL16DEUT0265237289',
      },
    } as unknown as TLTransaction

    const result = await mapTransaction(tl)

    expect(result.counterparty_name).toBe('Videoland B.V.')
  })
})
