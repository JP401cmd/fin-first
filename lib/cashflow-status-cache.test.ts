import { describe, it, expect, beforeEach } from 'vitest'
import {
  cashflowStatusCacheKey,
  readCashflowStatusCache,
  writeCashflowStatusCache,
  __resetCashflowStatusCache,
  CASHFLOW_STATUS_CACHE_TTL_MS,
} from './cashflow-status-cache'
import type { CashflowCardStatuses } from '@/lib/cashflow-cards'

const statuses: CashflowCardStatuses = {
  budget: 'good',
  transacties: 'bad',
  vasteLasten: 'warn',
  forecast: 'good',
}

describe('cashflow-status-cache', () => {
  beforeEach(() => __resetCashflowStatusCache())

  it('miss op een lege cache', () => {
    const key = cashflowStatusCacheKey('u1', 'personal')
    expect(readCashflowStatusCache(key, 1000)).toEqual({ hit: false, statuses: null })
  })

  it('hit binnen de TTL, miss zodra de TTL verlopen is', () => {
    const key = cashflowStatusCacheKey('u1', 'personal')
    writeCashflowStatusCache(key, statuses, 1000)

    // Vlak vóór verlopen → hit.
    const within = readCashflowStatusCache(key, 1000 + CASHFLOW_STATUS_CACHE_TTL_MS - 1)
    expect(within.hit).toBe(true)
    expect(within.statuses).toBe(statuses)

    // Op/na de TTL → miss (en entry opgeruimd).
    expect(readCashflowStatusCache(key, 1000 + CASHFLOW_STATUS_CACHE_TTL_MS).hit).toBe(false)
    expect(readCashflowStatusCache(key, 1000 + CASHFLOW_STATUS_CACHE_TTL_MS + 1).hit).toBe(false)
  })

  it('isoleert per user en per perspectief (geen cross-account-lek)', () => {
    const now = 0
    writeCashflowStatusCache(cashflowStatusCacheKey('u1', 'personal'), statuses, now)

    // Andere gebruiker → miss.
    expect(
      readCashflowStatusCache(cashflowStatusCacheKey('u2', 'personal'), now).hit,
    ).toBe(false)
    // Ander perspectief → miss (perspectiefwissel levert per definitie verse data).
    expect(
      readCashflowStatusCache(cashflowStatusCacheKey('u1', 'household'), now).hit,
    ).toBe(false)
    expect(
      readCashflowStatusCache(cashflowStatusCacheKey('u1', 'partner'), now).hit,
    ).toBe(false)
    // Zelfde sleutel → hit.
    expect(
      readCashflowStatusCache(cashflowStatusCacheKey('u1', 'personal'), now).hit,
    ).toBe(true)
  })

  it('overschrijft een bestaande entry en verlengt de TTL', () => {
    const key = cashflowStatusCacheKey('u1', 'personal')
    writeCashflowStatusCache(key, statuses, 0)
    const next: CashflowCardStatuses = { ...statuses, budget: 'bad' }
    writeCashflowStatusCache(key, next, CASHFLOW_STATUS_CACHE_TTL_MS)

    const read = readCashflowStatusCache(key, CASHFLOW_STATUS_CACHE_TTL_MS + 1)
    expect(read.hit).toBe(true)
    expect(read.statuses).toBe(next)
  })
})
