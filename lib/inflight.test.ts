import { describe, it, expect, afterEach } from 'vitest'
import { inflight, __resetInflight } from './inflight'

/**
 * inflight — dedupe't gelijktijdige fetches per key naar één roundtrip; na settle
 * fetcht een nieuwe aanroep vers (géén tijd-cache → geen cross-account-lek).
 */

afterEach(() => {
  __resetInflight()
})

describe('inflight', () => {
  it('twee gelijktijdige calls delen één fetch', async () => {
    let calls = 0
    const factory = () => {
      calls += 1
      return new Promise<string>((r) => setTimeout(() => r('waarde'), 10))
    }

    const [a, b] = await Promise.all([
      inflight('k', factory),
      inflight('k', factory),
    ])

    expect(calls).toBe(1)
    expect(a).toBe('waarde')
    expect(b).toBe('waarde')
  })

  it('verschillende keys dedupen NIET', async () => {
    let calls = 0
    const factory = () => {
      calls += 1
      return Promise.resolve('v')
    }

    await Promise.all([inflight('a', factory), inflight('b', factory)])
    expect(calls).toBe(2)
  })

  it('een aanroep ná settle fetcht opnieuw (geen tijd-cache)', async () => {
    let calls = 0
    const factory = () => {
      calls += 1
      return Promise.resolve('v')
    }

    await inflight('k', factory)
    await inflight('k', factory)
    expect(calls).toBe(2)
  })

  it('een afwijzing wist de entry zodat een retry opnieuw fetcht', async () => {
    let calls = 0
    const factory = () => {
      calls += 1
      return Promise.reject(new Error('boom'))
    }

    await expect(inflight('k', factory)).rejects.toThrow('boom')
    // Entry gewist na de rejection → tweede aanroep fetcht opnieuw.
    await expect(inflight('k', factory)).rejects.toThrow('boom')
    expect(calls).toBe(2)
  })
})
