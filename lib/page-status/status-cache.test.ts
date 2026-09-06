import { describe, it, expect, beforeEach } from 'vitest'
import {
  statusCacheKey,
  readStatusCache,
  writeStatusCache,
  __resetStatusCache,
  STATUS_CACHE_TTL_MS,
} from './status-cache'
import type { PageStatusInfo } from '@/lib/page-status/types'

const info = { some: 'status' } as unknown as PageStatusInfo

describe('page-status status-cache', () => {
  beforeEach(() => __resetStatusCache())

  it('miss on empty cache', () => {
    const key = statusCacheKey('u1', 'personal', '/overzicht/budget')
    expect(readStatusCache(key, 1000)).toEqual({ hit: false, info: null })
  })

  it('hit within TTL, miss after TTL expires', () => {
    const key = statusCacheKey('u1', 'personal', '/overzicht/budget')
    writeStatusCache(key, info, 1000)

    // Vlak vóór verlopen → hit.
    const within = readStatusCache(key, 1000 + STATUS_CACHE_TTL_MS - 1)
    expect(within.hit).toBe(true)
    expect(within.info).toBe(info)

    // Op/na de TTL → miss (en entry opgeruimd).
    expect(readStatusCache(key, 1000 + STATUS_CACHE_TTL_MS).hit).toBe(false)
    expect(readStatusCache(key, 1000 + STATUS_CACHE_TTL_MS + 1).hit).toBe(false)
  })

  it('caches a null info (geen banner) net zo goed als een echte status', () => {
    const key = statusCacheKey('u1', 'personal', '/overzicht/budget/forecast')
    writeStatusCache(key, null, 0)
    const read = readStatusCache(key, 10)
    expect(read.hit).toBe(true)
    expect(read.info).toBeNull()
  })

  it('isoleert per user, per perspectief en per route (geen cross-account-lek)', () => {
    const now = 0
    writeStatusCache(
      statusCacheKey('u1', 'personal', '/overzicht/budget'),
      info,
      now,
    )

    // Andere gebruiker → miss.
    expect(
      readStatusCache(
        statusCacheKey('u2', 'personal', '/overzicht/budget'),
        now,
      ).hit,
    ).toBe(false)
    // Ander perspectief → miss.
    expect(
      readStatusCache(
        statusCacheKey('u1', 'household', '/overzicht/budget'),
        now,
      ).hit,
    ).toBe(false)
    // Andere route → miss.
    expect(
      readStatusCache(
        statusCacheKey('u1', 'personal', '/overzicht/budget/transacties'),
        now,
      ).hit,
    ).toBe(false)
    // Zelfde sleutel → hit.
    expect(
      readStatusCache(
        statusCacheKey('u1', 'personal', '/overzicht/budget'),
        now,
      ).hit,
    ).toBe(true)
  })
})
