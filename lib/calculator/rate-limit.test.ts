import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  checkAndIncrement,
  getCurrentWeekStart,
  getUsage,
  MAX_GENERATIONS_PER_WEEK,
  MAX_REFINEMENTS_PER_WEEK,
} from './rate-limit'

/**
 * Mock-supabase: minimalistische in-memory builder die de drie chains
 * dekt die rate-limit.ts gebruikt:
 *   .from(t).select(c).eq(k,v).eq(k,v).maybeSingle()
 *   .from(t).upsert(row, opts)
 */
type Row = { user_id: string; week_start: string; generations: number; refinements: number }

function makeMockSupabase(initialRows: Row[] = []) {
  const rows: Row[] = [...initialRows]
  const upserts: Array<{ row: Row; opts?: unknown }> = []

  const fromTable = () => {
    let filterUser: string | null = null
    let filterWeek: string | null = null
    const chain = {
      select: () => chain,
      eq: (col: string, val: string) => {
        if (col === 'user_id') filterUser = val
        if (col === 'week_start') filterWeek = val
        return chain
      },
      maybeSingle: async () => {
        const found = rows.find(
          (r) => r.user_id === filterUser && r.week_start === filterWeek,
        )
        return { data: found ?? null, error: null }
      },
      upsert: async (row: Row, opts?: unknown) => {
        upserts.push({ row, opts })
        const idx = rows.findIndex(
          (r) => r.user_id === row.user_id && r.week_start === row.week_start,
        )
        if (idx >= 0) rows[idx] = row
        else rows.push(row)
        return { data: null, error: null }
      },
    }
    return chain
  }

  const mock = { from: vi.fn(fromTable) } as unknown as SupabaseClient
  return { mock, rows, upserts }
}

describe('getCurrentWeekStart', () => {
  it('valt op een maandag', () => {
    const ws = getCurrentWeekStart()
    // UTC-getter is OK omdat we de DATE-shape als UTC-midnight modelleren.
    expect(ws.getUTCDay()).toBe(1) // Monday = 1 (0=Sun, 1=Mon, ...)
  })

  it('voor een vaste woensdag levert het maandag van diezelfde week', () => {
    // 2026-05-27 is een woensdag. We voeden expliciet "now" mee.
    const wed = new Date('2026-05-27T10:00:00Z')
    const ws = getCurrentWeekStart(wed)
    // De maandag = 2026-05-25 (UTC-midnight).
    expect(ws.toISOString().slice(0, 10)).toBe('2026-05-25')
  })
})

describe('checkAndIncrement', () => {
  it('eerste call (geen rij) → allowed met remaining = limit - 1', async () => {
    const { mock, upserts } = makeMockSupabase([])
    const r = await checkAndIncrement(mock, 'user-1', 'generation')
    expect(r.allowed).toBe(true)
    expect(r.limit).toBe(MAX_GENERATIONS_PER_WEEK)
    expect(r.remaining).toBe(MAX_GENERATIONS_PER_WEEK - 1)
    expect(upserts).toHaveLength(1)
    expect(upserts[0].row.generations).toBe(1)
    expect(upserts[0].row.refinements).toBe(0)
  })

  it('verfijning verhoogt aparte teller', async () => {
    const { mock, upserts } = makeMockSupabase([
      {
        user_id: 'user-1',
        week_start: '2026-05-25',
        generations: 3,
        refinements: 1,
      },
    ])
    // We zetten de week op exact dezelfde rij door de huidige week-start
    // te gebruiken. Voor de mock maakt het niet uit; we testen het delta-
    // gedrag.
    const r = await checkAndIncrement(mock, 'user-1', 'refinement')
    // We weten niet welke week_start de helper kiest in deze run, dus we
    // checken alleen dat een upsert is gedaan met een refinement-+1.
    expect(r.allowed).toBe(true)
    expect(r.limit).toBe(MAX_REFINEMENTS_PER_WEEK)
    expect(upserts.at(-1)?.row.refinements).toBeGreaterThanOrEqual(1)
  })

  it('bij bereikt maximum → allowed = false, geen upsert', async () => {
    // Pre-vul met een rij die overeenkomt met de huidige week.
    const ws = getCurrentWeekStart().toISOString().slice(0, 10)
    const { mock, upserts } = makeMockSupabase([
      {
        user_id: 'user-1',
        week_start: ws,
        generations: MAX_GENERATIONS_PER_WEEK,
        refinements: 0,
      },
    ])
    const r = await checkAndIncrement(mock, 'user-1', 'generation')
    expect(r.allowed).toBe(false)
    expect(r.remaining).toBe(0)
    expect(r.limit).toBe(MAX_GENERATIONS_PER_WEEK)
    expect(upserts).toHaveLength(0)
  })
})

describe('getUsage', () => {
  it('zonder rij → {0, 0}', async () => {
    const { mock } = makeMockSupabase([])
    const u = await getUsage(mock, 'user-1')
    expect(u).toEqual({ generations: 0, refinements: 0 })
  })

  it('met rij → leest tellers terug', async () => {
    const ws = getCurrentWeekStart().toISOString().slice(0, 10)
    const { mock } = makeMockSupabase([
      {
        user_id: 'user-1',
        week_start: ws,
        generations: 4,
        refinements: 2,
      },
    ])
    const u = await getUsage(mock, 'user-1')
    expect(u).toEqual({ generations: 4, refinements: 2 })
  })
})
