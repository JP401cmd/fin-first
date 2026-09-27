/**
 * GET /api/report — de vermogensreeksen van het rapport zijn PERSOONLIJK.
 *
 * Security-review 27 sep 2026, live geverifieerd: de SELECT-policy op
 * `net_worth_snapshots` is huishoud-gedeeld
 * (`auth.uid() = user_id OR (ownership = 'shared' AND household_id = user_household_id())`),
 * en `ownership`/`household_id` zijn door de gebruiker zelf schrijfbaar. Twee
 * snapshotqueries in deze route filterden niet op `user_id`:
 *
 *  1. de periodereeks (netto vermogen begin/eind/groei, `netWorthByPeriod`);
 *  2. de "laatste stand" per vorige periode (`historicalPeriods[].netWorthEnd`).
 *
 * Een gedeelde partnerrij verscheen dus in een rapport dat de gebruiker als PDF
 * deelt. De simulatie past de filters werkelijk toe en laat RLS weg, zodat de
 * partnerrij zichtbaar is zolang de query zelf niet scoopt.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { hasEq, makePostgrestSim } from '@/lib/test-utils/postgrest-sim'

const { mockCreateClient, mockCheckTierGate, mockIsCloudAllowed, mockDailyRate } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockCheckTierGate: vi.fn(),
  mockIsCloudAllowed: vi.fn(),
  mockDailyRate: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mockCreateClient,
  getAuthClaims: vi.fn(),
}))
vi.mock('@/lib/require-tier', () => ({ checkTierGate: mockCheckTierGate }))
vi.mock('@/lib/ai/privacy-gate', () => ({
  isCloudAllowed: mockIsCloudAllowed,
  PRIVACY_GATE_CODE: 'privacy_mode_active',
}))
vi.mock('@/lib/expense-rate', () => ({ getRecentDailyExpenseRate: mockDailyRate }))

import { GET } from './route'

const PROFILE_ROW = {
  id: 'ik',
  full_name: 'Testgebruiker',
  date_of_birth: '1990-04-15',
  expected_return: 0.07,
  inflation_rate: 0.02,
  box3_method: null,
  net_monthly_income: 4000,
  estimated_monthly_expenses: 3100,
  income_source: 'manual',
  expenses_source: 'manual',
  housing_strategy_config: null,
}

function snap(user_id: string, snapshot_date: string, net_worth: number, ownership = 'personal') {
  return { user_id, snapshot_date, net_worth, total_assets: net_worth, total_debts: 0, freedom_percentage: 10, ownership }
}

// Rapportperiode mei 2026; vorige perioden maart en april 2026.
const SNAPSHOTS = [
  snap('ik', '2026-03-15', 90_000),
  snap('partner', '2026-03-30', 700_000, 'shared'),
  snap('ik', '2026-04-15', 95_000),
  snap('partner', '2026-04-29', 710_000, 'shared'),
  snap('ik', '2026-05-02', 100_000),
  snap('ik', '2026-05-20', 104_000),
  snap('partner', '2026-05-31', 720_000, 'shared'),
]

type ScopedReport = {
  kern: { netWorthStart: number | null; netWorthEnd: number | null; netWorthByPeriod: unknown[] }
  historicalPeriods: { dateFrom: string; netWorthEnd: number | null }[]
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/report — vermogensreeksen uit de EIGEN snapshots', () => {
  it('Given gedeelde partnersnapshots in de periode en de vorige perioden, When het rapport laadt, Then lopen alle reeksen alleen over eigen rijen en draagt elke snapshotquery .eq(user_id)', async () => {
    const sim = makePostgrestSim({ net_worth_snapshots: SNAPSHOTS, profiles: [PROFILE_ROW] })
    mockCreateClient.mockResolvedValue(sim.client)
    mockCheckTierGate.mockResolvedValue(null)
    mockIsCloudAllowed.mockResolvedValue(true)
    mockDailyRate.mockResolvedValue({ dailyRate: 100 })

    const res = await GET(
      new Request('http://localhost/api/report?period_type=month&date_from=2026-05-01&date_to=2026-06-01&use_ai=false'),
    )
    const data = (await res.json()) as ScopedReport

    expect(res.status).toBe(200)
    // (1) de periodereeks
    expect(data.kern.netWorthStart).toBe(100_000)
    expect(data.kern.netWorthEnd).toBe(104_000)
    expect(data.kern.netWorthByPeriod).toHaveLength(2)
    // (2) de laatste stand per vorige periode
    expect(data.historicalPeriods.map(p => [p.dateFrom, p.netWorthEnd])).toEqual([
      ['2026-03-01', 90_000],
      ['2026-04-01', 95_000],
    ])

    const snapshotCalls = sim.callsTo('net_worth_snapshots')
    expect(snapshotCalls).toHaveLength(3)
    for (const call of snapshotCalls) expect(hasEq(call, 'user_id', 'ik')).toBe(true)
  })
})
