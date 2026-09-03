import { describe, it, expect, vi, beforeEach } from 'vitest'
import { randomUUID } from 'node:crypto'

/**
 * Route-niveau tests voor /api/transaction-flags (ADR 0128).
 *
 * Wat hier bewezen wordt is het deel van de veiligheid dat de ROUTE draagt:
 *  - `household_id` komt uit de huishoud-context en `flagged_by` uit de sessie —
 *    nooit uit de body, ook niet als de client ze meestuurt;
 *  - een policy-weigering (42501) wordt een 403 met leesbare tekst, niet een
 *    rauwe DB-fout, en zonder een tweede schrijfpoging;
 *  - een bestaande vlag wordt heropend binnen het eigen huishouden;
 *  - PATCH stuurt alleen de whitelist (nooit `resolved_*`) en scope't op het
 *    huishouden; DELETE scope't op de melder.
 * De RLS-kant (zichtbaarheid erft van transactions) staat in
 * lib/household/transaction-flags.test.ts als migratie-contract.
 */

const mockGetUser = vi.fn()
const mockFrom = vi.fn()
const mockContext = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser }, from: mockFrom })),
  getAuthClaims: vi.fn(),
}))
vi.mock('@/lib/household/perspective-loader', () => ({
  loadPerspectiveContext: (...args: unknown[]) => mockContext(...args),
}))

import { POST, PATCH, DELETE } from './route'

const USER = { id: 'user-1' }
const HH = 'hh-1'
const TX = randomUUID()
const FLAG = randomUUID()

type Call = { table: string; op: string; payload?: unknown; eq: Array<[string, unknown]> }
let calls: Call[] = []
const results = { insert: vi.fn(), update: vi.fn(), delete: vi.fn() }

function builder(table: string) {
  const call: Call = { table, op: 'select', eq: [] }
  calls.push(call)
  const resolve = () => Promise.resolve(results[call.op as keyof typeof results]?.() ?? { data: null, error: null })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = {
    select: () => b,
    insert: (payload: unknown) => ((call.op = 'insert'), (call.payload = payload), b),
    update: (payload: unknown) => ((call.op = 'update'), (call.payload = payload), b),
    delete: () => ((call.op = 'delete'), b),
    eq: (col: string, val: unknown) => (call.eq.push([col, val]), b),
    single: resolve,
    maybeSingle: resolve,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    then: (onF: any, onR: any) => resolve().then(onF, onR),
  }
  return b
}

function jsonRequest(method: string, body?: unknown, query = '') {
  return new Request(`http://localhost/api/transaction-flags${query}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

beforeEach(() => {
  calls = []
  mockGetUser.mockReset().mockResolvedValue({ data: { user: USER }, error: null })
  mockFrom.mockReset().mockImplementation((table: string) => builder(table))
  mockContext.mockReset().mockResolvedValue({ hasHousehold: true, householdId: HH })
  results.insert.mockReset().mockReturnValue({ data: { id: FLAG, transaction_id: TX }, error: null })
  results.update.mockReset().mockReturnValue({ data: { id: FLAG, status: 'open' }, error: null })
  results.delete.mockReset().mockReturnValue({ data: { id: FLAG }, error: null })
})

describe('POST /api/transaction-flags', () => {
  it('neemt household_id uit de context en flagged_by uit de sessie — nooit uit de body', async () => {
    const res = await POST(
      jsonRequest('POST', {
        transactionId: TX,
        note: ' even overleggen ',
        household_id: 'ander-huishouden',
        flagged_by: 'iemand-anders',
      }),
    )
    expect(res.status).toBe(201)
    const insert = calls.find((c) => c.op === 'insert')
    expect(insert?.table).toBe('transaction_flags')
    expect(insert?.payload).toEqual({
      transaction_id: TX,
      household_id: HH,
      flagged_by: USER.id,
      note: 'even overleggen',
    })
  })

  it('weigert zonder huishouden met een 400 en schrijft niets', async () => {
    mockContext.mockResolvedValue({ hasHousehold: false, householdId: null })
    const res = await POST(jsonRequest('POST', { transactionId: TX }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('no_household')
    expect(calls.some((c) => c.op === 'insert')).toBe(false)
  })

  it('vertaalt een policy-weigering (42501) naar een 403 met leesbare tekst, zonder heropen-poging', async () => {
    results.insert.mockReturnValue({ data: null, error: { code: '42501', message: 'new row violates row-level security policy' } })
    const res = await POST(jsonRequest('POST', { transactionId: TX }))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toContain('kun je niet met je partner bespreken')
    expect(body.error).not.toContain('row-level')
    expect(calls.some((c) => c.op === 'update')).toBe(false)
  })

  it('heropent een bestaande vlag (23505) binnen het eigen huishouden', async () => {
    results.insert.mockReturnValue({ data: null, error: { code: '23505', message: 'duplicate key' } })
    const res = await POST(jsonRequest('POST', { transactionId: TX, note: 'opnieuw' }))
    expect(res.status).toBe(200)
    const update = calls.find((c) => c.op === 'update')
    expect(update?.payload).toEqual({ status: 'open', note: 'opnieuw' })
    expect(update?.eq).toEqual([
      ['transaction_id', TX],
      ['household_id', HH],
    ])
  })

  it('heropenen zonder nieuwe notitie laat de oude notitie staan (geen note: null in de patch)', async () => {
    results.insert.mockReturnValue({ data: null, error: { code: '23505', message: 'duplicate key' } })
    const res = await POST(jsonRequest('POST', { transactionId: TX, note: null }))
    expect(res.status).toBe(200)
    const update = calls.find((c) => c.op === 'update')
    expect(update?.payload).toEqual({ status: 'open' })
  })

  it('geeft 401 zonder sessie', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    const res = await POST(jsonRequest('POST', { transactionId: TX }))
    expect(res.status).toBe(401)
  })
})

describe('PATCH /api/transaction-flags', () => {
  it('stuurt alleen de whitelist (status/note) en scope\'t op id + huishouden', async () => {
    const res = await PATCH(
      jsonRequest('PATCH', { id: FLAG, status: 'resolved', resolved_by: 'x', resolved_at: 'y', household_id: 'z' }),
    )
    expect(res.status).toBe(200)
    const update = calls.find((c) => c.op === 'update')
    expect(update?.payload).toEqual({ status: 'resolved' })
    expect(update?.eq).toEqual([
      ['id', FLAG],
      ['household_id', HH],
    ])
  })

  it('antwoordt 404 wanneer de policy geen rij teruggeeft (geen orakel op andermans vlag)', async () => {
    results.update.mockReturnValue({ data: null, error: null })
    const res = await PATCH(jsonRequest('PATCH', { id: FLAG, status: 'resolved' }))
    expect(res.status).toBe(404)
  })

  it('weigert een lege wijziging met 400', async () => {
    const res = await PATCH(jsonRequest('PATCH', { id: FLAG }))
    expect(res.status).toBe(400)
    expect(calls.some((c) => c.op === 'update')).toBe(false)
  })
})

describe('DELETE /api/transaction-flags', () => {
  it('scope\'t op de melder zelf', async () => {
    const res = await DELETE(jsonRequest('DELETE', undefined, `?id=${FLAG}`))
    expect(res.status).toBe(200)
    const del = calls.find((c) => c.op === 'delete')
    expect(del?.eq).toEqual([
      ['id', FLAG],
      ['flagged_by', USER.id],
    ])
  })

  it('404 als er niets van jou verwijderd is', async () => {
    results.delete.mockReturnValue({ data: null, error: null })
    const res = await DELETE(jsonRequest('DELETE', undefined, `?id=${FLAG}`))
    expect(res.status).toBe(404)
  })
})
