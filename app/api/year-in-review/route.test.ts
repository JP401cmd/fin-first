/**
 * GET /api/year-in-review — de vermogensreeks van het jaaroverzicht is PERSOONLIJK.
 *
 * Security-review 27 sep 2026, live geverifieerd: de SELECT-policy op
 * `net_worth_snapshots` is huishoud-gedeeld
 * (`auth.uid() = user_id OR (ownership = 'shared' AND household_id = user_household_id())`),
 * en `ownership`/`household_id` zijn door de gebruiker zelf schrijfbaar. De
 * jaarquery filterde niet op `user_id`, dus een gedeelde partnerrij schoof de
 * reeks in: netto vermogen begin/eind, groei en FIRE-voortgang liepen over het
 * vermogen van de partner.
 *
 * De simulatie past de filters werkelijk toe en laat RLS weg, zodat de partnerrij
 * zichtbaar is zolang de query zelf niet scoopt.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { hasEq, makePostgrestSim, type PostgrestSim } from '@/lib/test-utils/postgrest-sim'

const { mockCreateClient, mockGetAuthClaims } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockGetAuthClaims: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mockCreateClient,
  getAuthClaims: mockGetAuthClaims,
}))

import { GET } from './route'

const SNAPSHOTS = [
  { user_id: 'ik', snapshot_date: '2025-01-31', net_worth: 100_000, total_assets: 120_000, total_debts: 20_000, freedom_percentage: 10, ownership: 'personal' },
  { user_id: 'ik', snapshot_date: '2025-11-30', net_worth: 130_000, total_assets: 145_000, total_debts: 15_000, freedom_percentage: 13, ownership: 'personal' },
  // Later in het jaar én gedeeld: zonder eigen scoping wordt dit het "eindvermogen".
  { user_id: 'partner', snapshot_date: '2025-12-31', net_worth: 900_000, total_assets: 900_000, total_debts: 0, freedom_percentage: 90, ownership: 'shared' },
]

async function reviewFor(sim: PostgrestSim, sub: string | null) {
  mockCreateClient.mockResolvedValue(sim.client)
  mockGetAuthClaims.mockResolvedValue(sub ? { sub } : null)
  return GET(new Request('http://localhost/api/year-in-review?year=2025'))
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/year-in-review — vermogensreeks uit de EIGEN snapshots', () => {
  it('Given een gedeelde partnersnapshot in het jaar, When het jaaroverzicht laadt, Then loopt de reeks alleen over eigen rijen en draagt de query .eq(user_id)', async () => {
    const sim = makePostgrestSim({ net_worth_snapshots: SNAPSHOTS })

    const res = await reviewFor(sim, 'ik')
    const body = (await res.json()) as { netWorthStart: number; netWorthEnd: number; netWorthByMonth: unknown[] }

    expect(res.status).toBe(200)
    expect(body.netWorthStart).toBe(100_000)
    expect(body.netWorthEnd).toBe(130_000)
    expect(body.netWorthByMonth).toHaveLength(2)
    const [call] = sim.callsTo('net_worth_snapshots')
    expect(hasEq(call, 'user_id', 'ik')).toBe(true)
  })
})
