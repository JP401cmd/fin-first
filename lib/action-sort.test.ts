/**
 * Regressie — canonieke actie-volgorde (WF-OVZ-20-bug1, 3 sep 2026).
 *
 * Bug: geen enkel aanmaakpad schrijft `sort_order` (DB-default 0), dus drie open
 * acties met dezelfde `priority_score` waren een 3-weg gelijkspel zonder derde
 * sleutel — de nieuwe actie stond niet gegarandeerd bovenaan en de compacte lijst
 * en de modal toonden een andere volgorde voor dezelfde set. Deze suite pint de
 * derde sleutel (`created_at` desc, nieuwste eerst) vast, plus de server-spiegel.
 */

import { describe, it, expect } from 'vitest'
import { applyActionPriorityOrder, compareActionsByPriority } from './action-sort'

const a = (id: string, priority_score: number | null, sort_order: number, created_at: string) => ({
  id,
  priority_score,
  sort_order,
  created_at,
})

describe('compareActionsByPriority', () => {
  it('3-weg gelijkspel (priority 3, sort_order 0): nieuwste actie bovenaan, deterministisch', () => {
    const seed1 = a('seed1', 3, 0, '2026-08-01T10:00:00Z')
    const seed2 = a('seed2', 3, 0, '2026-08-15T10:00:00Z')
    const nieuw = a('nieuw', 3, 0, '2026-09-02T10:00:00Z')
    // Elke invoervolgorde levert dezelfde uitkomst (niet afhankelijk van DB-/array-volgorde).
    for (const input of [[seed1, seed2, nieuw], [nieuw, seed1, seed2], [seed2, nieuw, seed1]]) {
      expect([...input].sort(compareActionsByPriority).map((x) => x.id)).toEqual(['nieuw', 'seed2', 'seed1'])
    }
  })

  it('priority_score wint van alles; null telt als 0', () => {
    const hoog = a('hoog', 5, 9, '2020-01-01T00:00:00Z')
    const laag = a('laag', 1, 0, '2026-09-02T00:00:00Z')
    const geen = a('geen', null, 0, '2026-09-03T00:00:00Z')
    expect([geen, laag, hoog].sort(compareActionsByPriority).map((x) => x.id)).toEqual(['hoog', 'laag', 'geen'])
  })

  it('sort_order (asc) wint van created_at binnen gelijke prioriteit', () => {
    const eerst = a('eerst', 3, 1, '2020-01-01T00:00:00Z')
    const tweede = a('tweede', 3, 2, '2026-09-02T00:00:00Z')
    expect([tweede, eerst].sort(compareActionsByPriority).map((x) => x.id)).toEqual(['eerst', 'tweede'])
  })

  it('verdraagt string-getallen (MCP/JSON) en ontbrekende created_at', () => {
    const s = { priority_score: '4', sort_order: '0', created_at: undefined }
    const n = { priority_score: 4, sort_order: 0, created_at: '2026-01-01T00:00:00Z' }
    // Gelijk op prio/sort_order; een ontbrekende created_at sorteert als leeg (onderaan).
    expect(compareActionsByPriority(n, s)).toBeLessThan(0)
    expect(compareActionsByPriority(s, n)).toBeGreaterThan(0)
    expect(compareActionsByPriority(n, { ...n })).toBe(0)
  })
})

describe('applyActionPriorityOrder', () => {
  it('spiegelt exact dezelfde drie sleutels op de query (server = client)', () => {
    const calls: [string, { ascending?: boolean } | undefined][] = []
    const q = {
      order(column: string, options?: { ascending?: boolean }) {
        calls.push([column, options])
        return q
      },
    }
    expect(applyActionPriorityOrder(q)).toBe(q)
    expect(calls).toEqual([
      ['priority_score', { ascending: false }],
      ['sort_order', { ascending: true }],
      ['created_at', { ascending: false }],
    ])
  })
})
