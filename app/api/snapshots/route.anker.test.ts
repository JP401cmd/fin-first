import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * ADR 0129 F3a (E) — POST /api/snapshots onder een vast stop-anker: `fire_age` wordt
 * NIET geschreven (anders leest de trend "bereikt"), en het anker + de dekking reizen
 * mee in `params`. Onder `solved` blijft de route kernel-vrij en schrijft ze `fire_age`
 * zoals voorheen.
 */
const { mockAuthGetUser, mockFrom, mockUpsert, mockFireSim } = vi.hoisted(() => ({
  mockAuthGetUser: vi.fn(),
  mockFrom: vi.fn(),
  mockUpsert: vi.fn(),
  mockFireSim: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockAuthGetUser }, from: mockFrom })),
  getAuthClaims: vi.fn(),
}))
vi.mock('@/lib/balance-snapshot', () => ({ captureBalanceSnapshots: vi.fn(async () => ({ error: null })) }))
vi.mock('@/lib/log-error', () => ({ logError: vi.fn() }))
vi.mock('@/lib/fire-target-shared', () => ({ computeHorizonFireSim: (...args: unknown[]) => mockFireSim(...args) }))

import { POST } from './route'

const USER = { id: 'user-1' }
// Geboortedatum zodat de leeftijd vandaag 42 is (de kernel-tijdas).
const DOB = `${new Date().getFullYear() - 42}-01-01`

function makeChain(resolve: Record<string, unknown>, onUpsert?: (row: unknown) => void) {
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'lt', 'gt', 'gte', 'is', 'in', 'order', 'update', 'delete']) chain[m] = () => chain
  chain.upsert = (row: unknown) => {
    onUpsert?.(row)
    return chain
  }
  chain.single = () => Promise.resolve(resolve)
  chain.maybeSingle = () => Promise.resolve(resolve)
  chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => Promise.resolve(resolve).then(onF, onR)
  return chain
}

function arm(profile: Record<string, unknown>) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'profiles') return makeChain({ data: profile, error: null })
    if (table === 'net_worth_snapshots') {
      return makeChain({ data: { id: 'snap-1', user_id: USER.id, net_worth: 0 }, error: null }, (row) => mockUpsert(row))
    }
    return makeChain({ data: [], error: null })
  })
}

const BASE_PROFILE = { date_of_birth: DOB, expected_return: 0.06, inflation_rate: 0.02, household_type: 'single' }

beforeEach(() => {
  mockAuthGetUser.mockReset()
  mockFrom.mockReset()
  mockUpsert.mockReset()
  mockFireSim.mockReset()
  mockAuthGetUser.mockResolvedValue({ data: { user: USER } })
})

describe('POST /api/snapshots — het stop-anker', () => {
  it('aow: fire_age null, params.stopAnchor aow en de dekking uit de kernel-run', async () => {
    arm({ ...BASE_PROFILE, fire_stop_anchor: 'aow', fire_end_strategy: 'deplete', fire_end_age: 90 })
    // Start 42, eind 90 ⇒ eindMaand 576; AOW-anker maand 300; uitputting maand 480 ⇒ 65,2 %.
    mockFireSim.mockResolvedValue({ sim: { requiredFireIsAnchorPortfolio: true, kernelDepletionMonth: 480, ankerMaand: 300, displayEndAge: 90 } })
    const res = await POST()
    expect(res.status).toBe(200)
    const row = mockUpsert.mock.calls[0]?.[0] as Record<string, unknown>
    expect(row).toBeDefined()
    expect(row.fire_age).toBeNull()
    const params = row.params as Record<string, unknown>
    expect(params.stopAnchor).toBe('aow')
    expect(params.coveragePct).toBeCloseTo(((480 - 300) / (576 - 300)) * 100, 1)
    const body = await res.json()
    expect(body.snapshot.fire_age).toBeNull()
    expect(body.snapshot.stop_anchor).toBe('aow')
    expect(mockFireSim).toHaveBeenCalledTimes(1)
  })

  it('now (legacy-label nu-stoppen): fire_age null, anker now, dekking op ankerMaand 0', async () => {
    arm({ ...BASE_PROFILE, fire_end_strategy: 'nu-stoppen', fire_end_age: 90 })
    mockFireSim.mockResolvedValue({ sim: { requiredFireIsAnchorPortfolio: true, kernelDepletionMonth: 288, ankerMaand: 0, displayEndAge: 90 } })
    await POST()
    const row = mockUpsert.mock.calls[0]?.[0] as Record<string, unknown>
    expect(row.fire_age).toBeNull()
    expect((row.params as Record<string, unknown>).stopAnchor).toBe('now')
    expect((row.params as Record<string, unknown>).coveragePct).toBe(50)
  })

  it('solved: kernel-vrij, params.stopAnchor solved, coveragePct null — fire_age zoals voorheen', async () => {
    arm({ ...BASE_PROFILE, fire_end_strategy: 'deplete', fire_end_age: 90 })
    await POST()
    expect(mockFireSim).not.toHaveBeenCalled()
    const row = mockUpsert.mock.calls[0]?.[0] as Record<string, unknown>
    const params = row.params as Record<string, unknown>
    expect(params.stopAnchor).toBe('solved')
    expect(params.coveragePct).toBeNull()
    // Zonder assets/inkomen levert de scalar-lus geen leeftijd — de KOLOM blijft gewoon
    // wat de lus zegt (hier null), niet omdat het anker 'm blokkeert.
    expect('fire_age' in row).toBe(true)
  })

  it('vast anker maar de kernel-run faalt: fire_age blijft null, dekking onbekend (null), anker wél geschreven', async () => {
    arm({ ...BASE_PROFILE, fire_stop_anchor: 'age', fire_stop_age: 58, fire_end_strategy: 'deplete', fire_end_age: 90 })
    mockFireSim.mockRejectedValue(new Error('kern-fout'))
    const res = await POST()
    expect(res.status).toBe(200)
    const row = mockUpsert.mock.calls[0]?.[0] as Record<string, unknown>
    expect(row.fire_age).toBeNull()
    expect((row.params as Record<string, unknown>).stopAnchor).toBe('age')
    expect((row.params as Record<string, unknown>).coveragePct).toBeNull()
  })
})
