import { describe, it, expect } from 'vitest'
import { reassignOrders, moveWidget } from './widget-order'
import type { WidgetPref } from './widget-catalog'

function makePrefs(ids: string[]): WidgetPref[] {
  return ids.map((id, i) => ({ id, enabled: true, size: 'half' as const, order: i * 10 }))
}

describe('reassignOrders', () => {
  it('assigns sequential 0-based orders', () => {
    const prefs = makePrefs(['a', 'b', 'c'])
    const result = reassignOrders(prefs)
    expect(result.map(p => p.order)).toEqual([0, 1, 2])
  })

  it('preserves all other fields', () => {
    const prefs = makePrefs(['a', 'b'])
    const result = reassignOrders(prefs)
    expect(result[0].id).toBe('a')
    expect(result[0].enabled).toBe(true)
    expect(result[0].size).toBe('half')
  })

  it('returns empty array for empty input', () => {
    expect(reassignOrders([])).toEqual([])
  })
})

describe('moveWidget', () => {
  it('moves widget forward in the list', () => {
    const prefs = makePrefs(['a', 'b', 'c', 'd'])
    const result = moveWidget(prefs, 'a', 'c')
    expect(result.map(p => p.id)).toEqual(['b', 'c', 'a', 'd'])
  })

  it('moves widget backward in the list', () => {
    const prefs = makePrefs(['a', 'b', 'c', 'd'])
    const result = moveWidget(prefs, 'd', 'b')
    expect(result.map(p => p.id)).toEqual(['a', 'd', 'b', 'c'])
  })

  it('reassigns sequential orders after move', () => {
    const prefs = makePrefs(['a', 'b', 'c'])
    const result = moveWidget(prefs, 'a', 'c')
    expect(result.map(p => p.order)).toEqual([0, 1, 2])
  })

  it('returns unchanged when fromId equals toId', () => {
    const prefs = makePrefs(['a', 'b', 'c'])
    const result = moveWidget(prefs, 'b', 'b')
    expect(result.map(p => p.id)).toEqual(['a', 'b', 'c'])
  })

  it('returns unchanged when fromId is unknown', () => {
    const prefs = makePrefs(['a', 'b', 'c'])
    const result = moveWidget(prefs, 'z', 'b')
    expect(result.map(p => p.id)).toEqual(['a', 'b', 'c'])
  })

  it('returns unchanged when toId is unknown', () => {
    const prefs = makePrefs(['a', 'b', 'c'])
    const result = moveWidget(prefs, 'a', 'z')
    expect(result.map(p => p.id)).toEqual(['a', 'b', 'c'])
  })

  it('preserves widget size after move', () => {
    const prefs: WidgetPref[] = [
      { id: 'a', enabled: true, size: 'full', order: 0 },
      { id: 'b', enabled: true, size: 'half', order: 1 },
    ]
    const result = moveWidget(prefs, 'a', 'b')
    expect(result.find(p => p.id === 'a')?.size).toBe('full')
  })
})
