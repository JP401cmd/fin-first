import { describe, it, expect } from 'vitest'
import { mapWithConcurrency } from './concurrency'

/** Kleine helper: resolve na `ms` met `value`. */
function delay<T>(value: T, ms: number): Promise<T> {
  return new Promise(resolve => setTimeout(() => resolve(value), ms))
}

describe('mapWithConcurrency', () => {
  it('verwerkt alle items en geeft ze INDEX-geordend terug (ongeacht klaar-volgorde)', async () => {
    const items = [1, 2, 3, 4, 5]
    // Vroege items duren bewust langer dan late → klaar-volgorde ≠ input-volgorde.
    const out = await mapWithConcurrency(items, 2, async (n) => delay(n * 10, (6 - n) * 5))
    expect(out).toEqual([10, 20, 30, 40, 50])
  })

  it('respecteert de concurrency-limiet (piek in-flight <= limit)', async () => {
    let inFlight = 0
    let peak = 0
    const items = Array.from({ length: 20 }, (_, i) => i)
    const LIMIT = 5

    await mapWithConcurrency(items, LIMIT, async (n) => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await delay(null, 5)
      inFlight--
      return n
    })

    expect(peak).toBeLessThanOrEqual(LIMIT)
    expect(peak).toBe(LIMIT) // met 20 items en pool 5 wordt de pool ook echt vol
  })

  it('geeft de worker-index door aan fn', async () => {
    const out = await mapWithConcurrency(['a', 'b', 'c'], 3, async (item, index) => `${index}:${item}`)
    expect(out).toEqual(['0:a', '1:b', '2:c'])
  })

  it('isoleert per-item fouten wanneer fn zelf zijn fouten vangt (batch crasht niet)', async () => {
    // Contract: fn mag niet throwen. Een fn die intern vangt en een result-object
    // teruggeeft laat de overige items gewoon doorlopen — spiegelt processUser.
    const items = [0, 1, 2, 3]
    const out = await mapWithConcurrency(items, 2, async (n) => {
      try {
        if (n === 2) throw new Error('boom')
        return { n, ok: true as const }
      } catch (err) {
        return { n, ok: false as const, error: String(err) }
      }
    })
    expect(out.filter(r => r.ok)).toHaveLength(3)
    expect(out.find(r => !r.ok)).toMatchObject({ n: 2, ok: false })
  })

  it('handelt een lege lijst en limit > lengte netjes af', async () => {
    expect(await mapWithConcurrency([], 5, async (n) => n)).toEqual([])
    expect(await mapWithConcurrency([1, 2], 10, async (n) => n * 2)).toEqual([2, 4])
  })
})
