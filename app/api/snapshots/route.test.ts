import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests voor POST /api/snapshots — specifiek de foutlogging op het
 * per-entiteit balance-snapshot-schrijfpad (fire-and-forget, niet-blokkerend).
 *
 * Contract:
 *  - captureBalanceSnapshots geeft `{ error }` terug (DB-fout die de helper NIET
 *    throwt) → logError() met context 'balance-snapshot:POST' + die message.
 *  - captureBalanceSnapshots REJECTET (throw) → logError() met de exception-message.
 *  - Geen fout → géén logError, en het hoofdpad-antwoord (snapshot-JSON) is
 *    ongewijzigd en niet-blokkerend.
 *
 * Gotcha: de logging is fire-and-forget (.then/.catch, niet ge-await) → we
 * flushen microtasks vóór de assert.
 */

const { mockAuthGetUser, mockFrom, mockCapture, mockLogError } = vi.hoisted(() => ({
  mockAuthGetUser: vi.fn(),
  mockFrom: vi.fn(),
  mockCapture: vi.fn(),
  mockLogError: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockAuthGetUser },
    from: mockFrom,
  })),
  getAuthClaims: vi.fn(),
}))

vi.mock('@/lib/balance-snapshot', () => ({
  captureBalanceSnapshots: (...args: unknown[]) => mockCapture(...args),
}))

vi.mock('@/lib/log-error', () => ({
  logError: (...args: unknown[]) => mockLogError(...args),
}))

import { POST } from './route'

const USER = { id: 'user-1' }

const PROFILE = {
  date_of_birth: '1990-01-01',
  expected_return: 0.06,
  inflation_rate: 0.02,
  household_type: 'single',
}

/**
 * Thenable query-chain. `resolve` is de await-waarde ({ data, error }) en de
 * waarde die single()/maybeSingle() opleveren.
 */
function makeChain(resolve: Record<string, unknown>) {
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'lt', 'gt', 'gte', 'is', 'in', 'order', 'update', 'delete', 'upsert']) {
    chain[m] = () => chain
  }
  chain.single = () => Promise.resolve(resolve)
  chain.maybeSingle = () => Promise.resolve(resolve)
  chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
    Promise.resolve(resolve).then(onF, onR)
  return chain
}

/** Happy-path DB-mock: alle brondata leeg/minimaal, snapshot-upsert slaagt. */
function mockHappyPath() {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'profiles') return makeChain({ data: PROFILE, error: null })
    if (table === 'net_worth_snapshots') {
      return makeChain({ data: { id: 'snap-1', user_id: USER.id, net_worth: 0 }, error: null })
    }
    // assets, debts, transactions, budgets, bank_accounts → lege datasets.
    return makeChain({ data: [], error: null })
  })
}

/** Flush fire-and-forget microtasks zodat .then/.catch-logging is afgerond. */
async function flush() {
  await new Promise(r => setTimeout(r, 0))
  await new Promise(r => setTimeout(r, 0))
}

beforeEach(() => {
  mockAuthGetUser.mockReset()
  mockFrom.mockReset()
  mockCapture.mockReset()
  mockLogError.mockReset()
  mockAuthGetUser.mockResolvedValue({ data: { user: USER } })
  mockHappyPath()
})

describe('POST /api/snapshots — balance-snapshot foutlogging', () => {
  it('401 zonder sessie', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST()
    expect(res.status).toBe(401)
  })

  it('teruggegeven DB-fout ({ error }) → logError met context balance-snapshot:POST', async () => {
    mockCapture.mockResolvedValue({ count: 0, error: 'boom' })

    const res = await POST()
    await flush()

    expect(res.status).toBe(200)
    expect(mockLogError).toHaveBeenCalledTimes(1)
    const [, params] = mockLogError.mock.calls[0]
    expect(params).toMatchObject({
      userId: USER.id,
      context: 'balance-snapshot:POST',
      message: 'boom',
    })
  })

  it('geworpen exception (reject) → logError met de exception-message', async () => {
    mockCapture.mockRejectedValue(new Error('kaboom'))

    const res = await POST()
    await flush()

    expect(res.status).toBe(200)
    expect(mockLogError).toHaveBeenCalledTimes(1)
    const [, params] = mockLogError.mock.calls[0]
    expect(params).toMatchObject({
      context: 'balance-snapshot:POST',
      message: 'kaboom',
    })
  })

  it('geen fout → géén logError, hoofdpad-antwoord ongewijzigd (niet-blokkerend)', async () => {
    mockCapture.mockResolvedValue({ count: 2 })

    const res = await POST()
    await flush()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.snapshot).toBeDefined()
    expect(mockLogError).not.toHaveBeenCalled()
  })
})
