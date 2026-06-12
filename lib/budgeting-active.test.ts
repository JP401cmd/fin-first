import { describe, it, expect, vi } from 'vitest'
import { syncBudgetingActive } from './budgeting-active'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Regressie: de budgetteren-setup-route zette wél assets.has_budget_tracking
 * maar nooit profiles.budgeting_active — de gate die alle budget-surfaces
 * lezen. syncBudgetingActive is de gedeelde recompute voor álle schrijfpaden.
 */

type MockResult = {
  supabase: SupabaseClient
  profilesUpdate: ReturnType<typeof vi.fn>
  profilesUpdateEq: ReturnType<typeof vi.fn>
  assetsEq: ReturnType<typeof vi.fn>
}

function mockSupabase(trackingRows: { id: string }[]): MockResult {
  const profilesUpdateEq = vi.fn().mockResolvedValue({ error: null })
  const profilesUpdate = vi.fn(() => ({ eq: profilesUpdateEq }))

  // assets-keten: select().eq().eq()… — thenable zodat de laatste .eq() awaitable is
  const assetsEq = vi.fn()
  const assetsBuilder: Record<string, unknown> = {}
  assetsBuilder.select = vi.fn(() => assetsBuilder)
  assetsBuilder.eq = assetsEq.mockImplementation(() => assetsBuilder)
  assetsBuilder.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: trackingRows, error: null }).then(resolve)

  const from = vi.fn((table: string) =>
    table === 'assets' ? assetsBuilder : { update: profilesUpdate },
  )

  return {
    supabase: { from } as unknown as SupabaseClient,
    profilesUpdate,
    profilesUpdateEq,
    assetsEq,
  }
}

describe('syncBudgetingActive', () => {
  it('zet budgeting_active op true wanneer er tracking-rekeningen zijn', async () => {
    const { supabase, profilesUpdate, profilesUpdateEq } = mockSupabase([{ id: 'a1' }])

    const active = await syncBudgetingActive(supabase, 'user-1')

    expect(active).toBe(true)
    expect(profilesUpdate).toHaveBeenCalledWith({ budgeting_active: true })
    expect(profilesUpdateEq).toHaveBeenCalledWith('id', 'user-1')
  })

  it('zet budgeting_active op false wanneer geen enkele rekening tracking heeft', async () => {
    const { supabase, profilesUpdate } = mockSupabase([])

    const active = await syncBudgetingActive(supabase, 'user-1')

    expect(active).toBe(false)
    expect(profilesUpdate).toHaveBeenCalledWith({ budgeting_active: false })
  })

  it('gooit wanneer de gate-write faalt (geen stille desync)', async () => {
    const { supabase, profilesUpdateEq } = mockSupabase([{ id: 'a1' }])
    profilesUpdateEq.mockResolvedValue({ error: { message: 'kapot' } })

    await expect(syncBudgetingActive(supabase, 'user-1')).rejects.toThrow(
      'budgeting_active bijwerken mislukt',
    )
  })

  it('filtert op actieve cash-assets met has_budget_tracking van de gebruiker', async () => {
    const { supabase, assetsEq } = mockSupabase([{ id: 'a1' }])

    await syncBudgetingActive(supabase, 'user-1')

    const filters = assetsEq.mock.calls.map(([col, val]) => `${col}=${val}`)
    expect(filters).toContain('user_id=user-1')
    expect(filters).toContain('asset_type=cash')
    expect(filters).toContain('has_budget_tracking=true')
    expect(filters).toContain('is_active=true')
  })
})
