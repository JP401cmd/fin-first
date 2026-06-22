/**
 * Unit-tests voor `linkOnboardingMortgages` — de twee-fasen koppeling van een
 * eigen woning aan haar hypotheek tijdens onboarding.
 *
 * Kernbewijs (de échte deliverable van de hypotheek-vervolgvraag-kaart):
 *   - een gekoppeld paar (asset.client_ref ↔ debt.linked_client_ref) leidt na
 *     insert tot `debts.linked_asset_id` = het verse huis-id;
 *   - de UPDATE filtert altijd op de EIGEN `user_id` (cross-user koppeling
 *     onmogelijk — de client levert nooit een echt asset-id);
 *   - geen koppeling zonder ref / verkeerd type.
 */
import { describe, it, expect } from 'vitest'
import { linkOnboardingMortgages } from './route'
import type { AssetQuickInput, DebtQuickInput } from '@/lib/quick-add/types'

type AssetRow = { id: string; sort_order: number; asset_type: string }
type DebtRow = { id: string; sort_order: number; debt_type: string }
type UpdateCall = { id: string; user_id: string; linked_asset_id: string }

/**
 * Minimal chainable Supabase-stub. `select(...).eq('user_id', id)` is awaitable
 * en levert de canned rijen; `update(...).eq('id', x).eq('user_id', y)` is
 * awaitable, registreert de call en levert `{ error: null }`.
 */
function makeSupabase(assetRows: AssetRow[], debtRows: DebtRow[], updates: UpdateCall[]) {
  return {
    from(table: string) {
      return {
        select() {
          return {
            eq() {
              return Promise.resolve({
                data: table === 'assets' ? assetRows : debtRows,
                error: null,
              })
            },
          }
        },
        update(patch: { linked_asset_id: string }) {
          const call: Partial<UpdateCall> = { linked_asset_id: patch.linked_asset_id }
          return {
            eq(col1: string, val1: string) {
              call[col1 as keyof UpdateCall] = val1 as never
              return {
                eq(col2: string, val2: string) {
                  call[col2 as keyof UpdateCall] = val2 as never
                  updates.push(call as UpdateCall)
                  return Promise.resolve({ error: null })
                },
              }
            },
          }
        },
      }
    },
  }
}

function house(ref: string, overrides: Partial<AssetQuickInput> = {}): AssetQuickInput {
  return { asset_type: 'eigen_huis', name: 'Woning', current_value: 500_000, client_ref: ref, ...overrides }
}
function mortgage(ref: string | null, overrides: Partial<DebtQuickInput> = {}): DebtQuickInput {
  return {
    debt_type: 'mortgage',
    name: 'Hypotheek — Woning',
    current_balance: 300_000,
    linked_asset_id: null,
    linked_client_ref: ref,
    ...overrides,
  }
}

describe('linkOnboardingMortgages', () => {
  it('koppelt een huis aan zijn hypotheek via linked_asset_id (= vers huis-id)', async () => {
    const updates: UpdateCall[] = []
    const supabase = makeSupabase(
      [{ id: 'house-1', sort_order: 0, asset_type: 'eigen_huis' }],
      [{ id: 'mort-1', sort_order: 0, debt_type: 'mortgage' }],
      updates,
    )
    await linkOnboardingMortgages(supabase as never, 'user-1', [house('r1')], [mortgage('r1')])

    expect(updates).toHaveLength(1)
    expect(updates[0]).toEqual({
      linked_asset_id: 'house-1',
      id: 'mort-1',
      user_id: 'user-1',
    })
  })

  it('filtert de UPDATE altijd op de eigen user_id (cross-user koppeling onmogelijk)', async () => {
    const updates: UpdateCall[] = []
    const supabase = makeSupabase(
      [{ id: 'house-9', sort_order: 0, asset_type: 'eigen_huis' }],
      [{ id: 'mort-9', sort_order: 0, debt_type: 'mortgage' }],
      updates,
    )
    await linkOnboardingMortgages(supabase as never, 'owner-42', [house('x')], [mortgage('x')])
    expect(updates[0].user_id).toBe('owner-42')
  })

  it('koppelt niets zonder linked_client_ref', async () => {
    const updates: UpdateCall[] = []
    const supabase = makeSupabase(
      [{ id: 'house-1', sort_order: 0, asset_type: 'eigen_huis' }],
      [{ id: 'mort-1', sort_order: 0, debt_type: 'mortgage' }],
      updates,
    )
    await linkOnboardingMortgages(supabase as never, 'user-1', [house('r1')], [mortgage(null)])
    expect(updates).toHaveLength(0)
  })

  it('koppelt geen niet-hypotheek-schuld, ook niet met een ref', async () => {
    const updates: UpdateCall[] = []
    const supabase = makeSupabase(
      [{ id: 'house-1', sort_order: 0, asset_type: 'eigen_huis' }],
      [{ id: 'loan-1', sort_order: 0, debt_type: 'personal_loan' }],
      updates,
    )
    await linkOnboardingMortgages(
      supabase as never,
      'user-1',
      [house('r1')],
      [mortgage('r1', { debt_type: 'personal_loan' })],
    )
    expect(updates).toHaveLength(0)
  })

  it('resolveert het juiste paar bij meerdere items via sort_order/array-index', async () => {
    const updates: UpdateCall[] = []
    // quickAssets: [spaar(0), huis(1)], quickDebts: [studie(0), hypotheek→huis(1)]
    const assets: AssetQuickInput[] = [
      { asset_type: 'savings', name: 'Spaar', current_value: 10_000 },
      house('r1'),
    ]
    const debts: DebtQuickInput[] = [
      { debt_type: 'student_loan', name: 'DUO', current_balance: 15_000 },
      mortgage('r1'),
    ]
    const supabase = makeSupabase(
      [
        { id: 'spaar-1', sort_order: 0, asset_type: 'savings' },
        { id: 'house-1', sort_order: 1, asset_type: 'eigen_huis' },
      ],
      [
        { id: 'duo-1', sort_order: 0, debt_type: 'student_loan' },
        { id: 'mort-1', sort_order: 1, debt_type: 'mortgage' },
      ],
      updates,
    )
    await linkOnboardingMortgages(supabase as never, 'user-1', assets, debts)
    expect(updates).toHaveLength(1)
    expect(updates[0]).toEqual({ linked_asset_id: 'house-1', id: 'mort-1', user_id: 'user-1' })
  })

  it('is idempotent — twee runs zetten exact dezelfde koppeling', async () => {
    const run = async () => {
      const updates: UpdateCall[] = []
      const supabase = makeSupabase(
        [{ id: 'house-1', sort_order: 0, asset_type: 'eigen_huis' }],
        [{ id: 'mort-1', sort_order: 0, debt_type: 'mortgage' }],
        updates,
      )
      await linkOnboardingMortgages(supabase as never, 'user-1', [house('r1')], [mortgage('r1')])
      return updates
    }
    expect(await run()).toEqual(await run())
  })
})
