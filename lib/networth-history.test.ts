import { describe, it, expect, vi } from 'vitest'
import { captureNetWorthHistory } from './networth-history'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Bouwt een minimale Supabase-stub die alleen `.from(table).insert(row)`
 * ondersteunt en de doorgegeven tabel + rij vastlegt.
 */
function makeSupabaseStub(insertError: { message: string } | null = null) {
  const insert = vi.fn().mockResolvedValue({ error: insertError })
  const from = vi.fn().mockReturnValue({ insert })
  return { client: { from } as unknown as SupabaseClient, from, insert }
}

describe('captureNetWorthHistory', () => {
  it('voegt een append-only rij toe met de canonieke totalen en de opgegeven source', async () => {
    const { client, from, insert } = makeSupabaseStub()

    const res = await captureNetWorthHistory(client, 'user-1', {
      netWorth: 12345.67,
      totalAssets: 20000,
      totalDebts: 7654.33,
      source: 'daily-open',
    })

    expect(res.error).toBeNull()
    expect(from).toHaveBeenCalledWith('net_worth_history')
    expect(insert).toHaveBeenCalledTimes(1)
    expect(insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      total_assets: 20000,
      total_debts: 7654.33,
      net_worth: 12345.67,
      source: 'daily-open',
    })
    // Bewust GEEN captured_at meegestuurd — de DB-default (now()) is de bron.
    expect(insert.mock.calls[0][0]).not.toHaveProperty('captured_at')
  })

  it("valt terug op source 'sync' als er geen source is opgegeven", async () => {
    const { client, insert } = makeSupabaseStub()

    await captureNetWorthHistory(client, 'user-2', {
      netWorth: 0,
      totalAssets: 0,
      totalDebts: 0,
    })

    expect(insert.mock.calls[0][0]).toMatchObject({ source: 'sync' })
  })

  it('geeft de foutmelding terug in plaats van te gooien (niet-kritiek pad)', async () => {
    const { client } = makeSupabaseStub({ message: 'relation "net_worth_history" does not exist' })

    const res = await captureNetWorthHistory(client, 'user-3', {
      netWorth: 100,
      totalAssets: 100,
      totalDebts: 0,
      source: 'manual',
    })

    expect(res.error).toBe('relation "net_worth_history" does not exist')
  })
})
