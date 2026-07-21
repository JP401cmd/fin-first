import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Tests voor DELETE /api/budgets/[id] — de niet-destructieve ARCHIVEER-actie
 * (WF-BUDGET-11 / Notion-kaart "bevestigingstekst belooft bescherming die de
 * API niet biedt").
 *
 * De bevestigingsdialoog in components/app/budgets-client.tsx belooft dat
 * gekoppelde transacties, subbudgetten, rollovers en budget_amounts BEHOUDEN
 * blijven en dat het budget alleen uit de actieve lijst verdwijnt. Deze suite
 * borgt dat de API die belofte waarmaakt: DELETE zet `is_archived = true` i.p.v.
 * budget-rijen (of transactie-koppelingen) te verwijderen. Een regressie naar
 * de oude cascade-hard-delete breekt hier meteen.
 *
 * Mocking-strategie gespiegeld op app/api/holdings/import/route.test.ts.
 */

const mockAuthGetUser = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockAuthGetUser },
    from: mockFrom,
  })),
}))

const VALID_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
const CHILD_UUID = 'b2c3d4e5-f6a7-8901-bcde-f23456789012'
const USER_ID = 'user-uuid-1111'

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

async function callDelete(id: string) {
  const mod = await import('./route')
  const req = {} as unknown as NextRequest
  return mod.DELETE(req, makeParams(id))
}

/**
 * Chainable query-builder mock. `resolveWith` is what the chain returns when
 * awaited (thenable) or via .single(). Update-calls worden opgevangen in
 * `updateSpy` zodat de test de payload kan inspecteren.
 */
function makeChain(resolveWith: unknown, updateSpy?: (...args: unknown[]) => void) {
  const chain: Record<string, unknown> = {}
  const self = () => chain

  chain.select = vi.fn(self)
  chain.eq = vi.fn(self)
  chain.in = vi.fn(self)
  chain.single = vi.fn(() => Promise.resolve(resolveWith))
  chain.update = updateSpy ? vi.fn((...args: unknown[]) => { updateSpy(...args); return chain }) : vi.fn(self)
  chain.delete = vi.fn(() => { throw new Error('DELETE-route mag NOOIT .delete() aanroepen (hard-delete verboden)') })

  ;(chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(resolveWith).then(resolve)

  return chain
}

describe('DELETE /api/budgets/[id] — niet-destructieve archivering', () => {
  beforeEach(() => {
    vi.resetModules()
    mockAuthGetUser.mockReset()
    mockFrom.mockReset()
  })

  it('returns 401 when not authenticated', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: null } })

    const res = await callDelete(VALID_UUID)

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toMatch(/ingelogd/i)
  })

  it('returns 400 for an invalid UUID', async () => {
    const res = await callDelete('not-a-uuid')
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('Ongeldig budget ID formaat')
  })

  it('returns 404 when the budget is not owned / not found', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'not found' } }))

    const res = await callDelete(VALID_UUID)
    expect(res.status).toBe(404)
  })

  it('returns 409 when the budget is already archived', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockFrom.mockReturnValue(
      makeChain({ data: { id: VALID_UUID, name: 'Eten', parent_id: null, is_archived: true }, error: null })
    )

    const res = await callDelete(VALID_UUID)
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/gearchiveerd/i)
  })

  it('SOFT-deletes a leaf budget with linked transactions: sets is_archived=true, never hard-deletes', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })

    const updateSpy = vi.fn()
    // Child budget (heeft parent_id) → geen children-lookup; call 1 = ownership select, call 2 = update.
    const ownershipChain = makeChain(
      { data: { id: VALID_UUID, name: 'Eten', parent_id: 'parent-1', is_archived: false }, error: null }
    )
    const updateChain = makeChain({ error: null }, updateSpy)
    mockFrom.mockReturnValueOnce(ownershipChain).mockReturnValueOnce(updateChain)

    const res = await callDelete(VALID_UUID)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    // Kerninvariant: er is precies één schrijfpad en dat is een is_archived=true UPDATE.
    expect(updateSpy).toHaveBeenCalledTimes(1)
    expect(updateSpy.mock.calls[0][0]).toMatchObject({ is_archived: true })
    expect(body.archived).toMatchObject({ budget_id: VALID_UUID, children_archived: 0 })
  })

  it('archives a parent budget together with its children (cascade via is_archived)', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })

    const updateSpy = vi.fn()
    const inSpy = vi.fn()
    // Parent budget (parent_id=null) → children-lookup gebeurt, dan update.
    const ownershipChain = makeChain(
      { data: { id: VALID_UUID, name: 'Vaste lasten', parent_id: null, is_archived: false }, error: null }
    )
    const childrenChain = makeChain({ data: [{ id: CHILD_UUID }], error: null })
    const updateChain = makeChain({ error: null }, updateSpy)
    // Capture the .in(...) argument on the update chain.
    updateChain.in = vi.fn((...args: unknown[]) => { inSpy(...args); return updateChain })
    mockFrom
      .mockReturnValueOnce(ownershipChain)
      .mockReturnValueOnce(childrenChain)
      .mockReturnValueOnce(updateChain)

    const res = await callDelete(VALID_UUID)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(updateSpy.mock.calls[0][0]).toMatchObject({ is_archived: true })
    // Parent + child worden in één UPDATE ... IN (...) gearchiveerd.
    expect(inSpy).toHaveBeenCalledWith('id', [VALID_UUID, CHILD_UUID])
    expect(body.archived).toMatchObject({ children_archived: 1, is_parent: true })
  })
})
