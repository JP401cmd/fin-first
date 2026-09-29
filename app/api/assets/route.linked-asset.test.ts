/**
 * POST /api/assets — de koppeling van een DGA-vordering aan een deelneming.
 *
 * Given een nieuwe DGA-vordering met een gekozen deelneming
 * When de bezitting wordt aangemaakt
 * Then staat `linked_asset_id` in de insert — mits het doel een EIGEN
 *      deelneming is. De SELECT-policy op `assets` is huishoud-gedeeld, dus de
 *      toets filtert expliciet op `user_id`.
 *
 * Deze test controleert de insert-payload zelf. Een bron-scan op het formulier
 * bewijst alleen dat de sleutel in de client-payload staat; het zod-schema en
 * de veld-voor-veld insert van deze route lieten hem daarna stil vallen.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const DEELNEMING_ID = '22222222-2222-4222-8222-222222222222'

let insertedRow: Record<string, unknown> | null = null
let targetFilters: Array<[string, unknown]> = []
let targetResult: { data: { id: string } | null; error: null } = { data: { id: DEELNEMING_ID }, error: null }

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: USER_ID } }, error: null }) },
    from: () => ({
      select: () => {
        const chain = {
          eq: (column: string, value: unknown) => {
            targetFilters.push([column, value])
            return chain
          },
          maybeSingle: async () => targetResult,
        }
        return chain
      },
      insert: (row: Record<string, unknown>) => {
        insertedRow = row
        return { select: () => ({ single: async () => ({ data: { id: 'new-asset' }, error: null }) }) }
      },
    }),
  }),
}))

import { POST } from './route'

function request(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/assets', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const vordering = {
  name: 'Lening aan eigen BV',
  asset_type: 'vordering',
  subtype: 'dga_lening',
  current_value: 50_000,
  purchase_value: 50_000,
  monthly_contribution: 0,
  expected_return: 4,
  purchase_date: null,
  lock_end_date: null,
}

beforeEach(() => {
  insertedRow = null
  targetFilters = []
  targetResult = { data: { id: DEELNEMING_ID }, error: null }
})

describe('POST /api/assets — linked_asset_id', () => {
  it('slaat de gekozen deelneming op bij een DGA-vordering', async () => {
    const res = await POST(request({ ...vordering, linked_asset_id: DEELNEMING_ID }))

    expect(res.status).toBe(201)
    expect(insertedRow?.linked_asset_id).toBe(DEELNEMING_ID)
  })

  it('toetst dat het doel een eigen deelneming is', async () => {
    await POST(request({ ...vordering, linked_asset_id: DEELNEMING_ID }))

    expect(targetFilters).toContainEqual(['id', DEELNEMING_ID])
    expect(targetFilters).toContainEqual(['user_id', USER_ID])
    expect(targetFilters).toContainEqual(['asset_type', 'deelneming'])
  })

  it('weigert een doel dat niet gevonden wordt, en maakt dan niets aan', async () => {
    targetResult = { data: null, error: null }

    const res = await POST(request({ ...vordering, linked_asset_id: DEELNEMING_ID }))

    expect(res.status).toBe(400)
    expect(insertedRow).toBeNull()
  })

  it('zonder keuze blijft de koppeling leeg', async () => {
    const res = await POST(request(vordering))

    expect(res.status).toBe(201)
    expect(insertedRow?.linked_asset_id).toBeNull()
    expect(targetFilters).toEqual([])
  })

  it('negeert de koppeling bij een ander subtype', async () => {
    const res = await POST(request({ ...vordering, subtype: 'familielening', linked_asset_id: DEELNEMING_ID }))

    expect(res.status).toBe(201)
    expect(insertedRow?.linked_asset_id).toBeNull()
  })

  it('negeert de koppeling bij een ander type', async () => {
    const res = await POST(
      request({ ...vordering, asset_type: 'savings', subtype: 'vrij_opneembaar', expected_return: 2, linked_asset_id: DEELNEMING_ID }),
    )

    expect(res.status).toBe(201)
    expect(insertedRow?.linked_asset_id).toBeNull()
  })

  it('weigert een waarde die geen uuid is', async () => {
    const res = await POST(request({ ...vordering, linked_asset_id: 'geen-uuid' }))

    expect(res.status).toBe(400)
    expect(insertedRow).toBeNull()
  })
})
