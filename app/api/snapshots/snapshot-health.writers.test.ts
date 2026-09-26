import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readSourceLF } from '@/lib/test-utils/read-source'

/**
 * De drie snapshot-writers (POST /api/snapshots, GET /api/snapshots/auto en de
 * cron) schrijven `resilience_score` met DEZELFDE budgetteer-vlag als de live
 * score (ADR 0008: opgeslagen ≈ live).
 *
 * Defect (26 sep 2026): de live score (lib/horizon-data-loader.ts) geeft
 * `profiles.budgeting_active` mee aan `computeHealthScoreFromInputs`; de writers
 * riepen hem zonder dat argument aan (default `true`). Bij budgetteren uit sloegen
 * ze dus een score mét budgetdiscipline op, terwijl de hub die pijler uitsluit —
 * het verloop sprong daardoor tegen "sinds vorige maand" in.
 *
 * POST en auto worden hier echt doorlopen (gemockte Supabase, response-pijlers);
 * de cron (service-role, CRON_SECRET, gebruikerspool) wordt op de bron gepind,
 * net als de twee andere, zodat geen van de drie terug kan naar een eigen regel.
 */

const { mockAuthGetUser, mockFrom, mockRpc } = vi.hoisted(() => ({
  mockAuthGetUser: vi.fn(),
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockAuthGetUser }, from: mockFrom, rpc: mockRpc })),
  getAuthClaims: vi.fn(),
}))
vi.mock('@/lib/balance-snapshot', () => ({ captureBalanceSnapshots: vi.fn(async () => ({ error: null })) }))
vi.mock('@/lib/log-error', () => ({ logError: vi.fn() }))

import { POST } from './route'
import { GET as AUTO_GET } from './auto/route'

const USER = { id: 'user-1' }
const DOB = `${new Date().getFullYear() - 42}-01-01`

function makeChain(resolve: Record<string, unknown>, onUpsert?: (row: unknown) => void) {
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'lt', 'gt', 'gte', 'lte', 'is', 'in', 'not', 'or', 'order', 'limit', 'update', 'delete', 'insert']) {
    chain[m] = () => chain
  }
  chain.upsert = (row: unknown) => {
    onUpsert?.(row)
    return chain
  }
  chain.single = () => Promise.resolve(resolve)
  chain.maybeSingle = () => Promise.resolve(resolve)
  chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => Promise.resolve(resolve).then(onF, onR)
  return chain
}

// Eén uitgavenbudget met een limiet → de budgetdiscipline-pijler heeft data en is
// actief zolang budgetteren aan staat.
const BUDGETS = [
  { id: 'b1', parent_id: null, budget_type: 'expense', default_limit: 500, interval: 'monthly', is_essential: true },
]

const upserts: Record<string, unknown>[] = []

function arm(profile: Record<string, unknown>) {
  upserts.length = 0
  mockFrom.mockImplementation((table: string) => {
    if (table === 'profiles') return makeChain({ data: profile, error: null })
    if (table === 'budgets') return makeChain({ data: BUDGETS, error: null })
    if (table === 'net_worth_snapshots') {
      return makeChain({ data: { id: 'snap-1', user_id: USER.id, net_worth: 0 }, error: null, count: 0 }, (row) =>
        upserts.push(row as Record<string, unknown>),
      )
    }
    return makeChain({ data: [], error: null })
  })
}

const PROFILE = {
  date_of_birth: DOB,
  expected_return: 0.06,
  inflation_rate: 0.02,
  household_type: 'single',
  income_source: 'manual',
  net_monthly_income: 4000,
  expenses_source: 'manual',
  estimated_monthly_expenses: 2500,
  fire_end_strategy: 'deplete',
  fire_end_age: 90,
}

type Pillar = { id: string }

beforeEach(() => {
  mockAuthGetUser.mockReset()
  mockFrom.mockReset()
  mockRpc.mockReset()
  mockAuthGetUser.mockResolvedValue({ data: { user: USER } })
  mockRpc.mockResolvedValue({ data: [], error: null })
})

describe('POST /api/snapshots — budgetteer-vlag zoals de live score', () => {
  it('Given budgetteren UIT in het profiel, When de snapshot wordt geschreven, Then sluit de opgeslagen score budgetdiscipline uit', async () => {
    arm({ ...PROFILE, budgeting_active: false })
    const body = await (await POST()).json()
    const ids = (body.calculation.health_pillars as Pillar[]).map((p) => p.id)
    expect(ids).not.toContain('budget_discipline')
    expect(upserts[0]?.resilience_score).toBe(body.calculation.resilience_score)
  })

  it('Given budgetteren AAN (controle), When de snapshot wordt geschreven, Then telt budgetdiscipline mee', async () => {
    arm({ ...PROFILE, budgeting_active: true })
    const body = await (await POST()).json()
    expect((body.calculation.health_pillars as Pillar[]).map((p) => p.id)).toContain('budget_discipline')
  })
})

describe('GET /api/snapshots/auto — budgetteer-vlag zoals de live score', () => {
  const req = () => new Request('http://localhost/api/snapshots/auto?source=manual')

  it('Given budgetteren UIT in het profiel, When de auto-snapshot wordt geschreven, Then sluit de opgeslagen score budgetdiscipline uit', async () => {
    arm({ ...PROFILE, budgeting_active: false })
    const body = await (await AUTO_GET(req())).json()
    const ids = (body.metrics.health_pillars as Pillar[]).map((p) => p.id)
    expect(ids).not.toContain('budget_discipline')
  })

  it('Given budgetteren AAN (controle), When de auto-snapshot wordt geschreven, Then telt budgetdiscipline mee', async () => {
    arm({ ...PROFILE, budgeting_active: true })
    const body = await (await AUTO_GET(req())).json()
    expect((body.metrics.health_pillars as Pillar[]).map((p) => p.id)).toContain('budget_discipline')
  })
})

// ── Onbekend is geen nul (ADR 0131) ─────────────────────────────────────────
// Zonder inkomen en uitgaven onthoudt de score haar oordeel: `total` is dan een
// som over de resterende pijlers. Die partiële score hoort niet in de historie —
// de rij draagt verder niets waaraan je zo'n maand later herkent.
const ONBEKEND_PROFIEL = {
  date_of_birth: DOB,
  expected_return: 0.06,
  inflation_rate: 0.02,
  household_type: 'single',
  fire_end_strategy: 'deplete',
  fire_end_age: 90,
  budgeting_active: true,
}

describe('snapshot-writers — geen partiële score bij een onbekend oordeel', () => {
  it('Given onbekend inkomen en uitgaven, When POST /api/snapshots schrijft, Then is resilience_score null (rij én antwoord)', async () => {
    arm(ONBEKEND_PROFIEL)
    const body = await (await POST()).json()
    expect(upserts[0]).toHaveProperty('resilience_score', null)
    expect(body.calculation.resilience_score).toBeNull()
    expect(body.snapshot.resilience_score).toBeNull()
  })

  it('Given onbekend inkomen en uitgaven, When de auto-snapshot schrijft, Then is resilience_score null', async () => {
    arm(ONBEKEND_PROFIEL)
    const body = await (await AUTO_GET(new Request('http://localhost/api/snapshots/auto?source=manual'))).json()
    expect(upserts[0]).toHaveProperty('resilience_score', null)
    expect(body.snapshot.resilience_score).toBeNull()
  })

  it('Given een bekend inkomen (controle), When POST schrijft, Then een getal', async () => {
    arm({ ...PROFILE, budgeting_active: true })
    await POST()
    expect(typeof upserts[0]?.resilience_score).toBe('number')
  })
})

describe('snapshot-writers — één regel voor de opgeslagen score (bron-grendel)', () => {
  const WRITERS = ['app/api/snapshots/route.ts', 'app/api/snapshots/auto/route.ts', 'app/api/snapshots/cron/route.ts']

  it.each(WRITERS)('Given %s, When hij de score berekent, Then via computeSnapshotHealthScore mét het profiel, en de profielselect leest budgeting_active', (path) => {
    const src = readSourceLF(path)
    expect(src).toMatch(/computeSnapshotHealthScore\(/)
    // Geen losse aanroep van de score-motor meer in de writer: de vlag en de
    // onbekend-regel wonen in de gedeelde helper.
    expect(src).not.toMatch(/computeHealthScoreFromInputs\(/)
    expect(src).toMatch(/select\(`[^`]*\bbudgeting_active\b[^`]*`\)/)
  })
})
