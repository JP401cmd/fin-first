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
})
