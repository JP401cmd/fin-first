import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { VrijheidsgetalSnapshot } from '@/lib/goals/vrijheidsgetal-goal'

/**
 * De DOELEN-sectie van Fin consumeert dezelfde LIVE-standen als /toekomst/doelen
 * (`syncGoalsFromCanonicalSources`), niet de ruwe `goals.current_value`. Aanleiding
 * (14 sep 2026): lab-parameterdoelen staan bewust op 0 in de DB, dus Fin las
 * "Plan gedekt: 0%/100%" en "Spaarquote: 0%" terwijl het scherm echte getallen toonde.
 *
 * Gestubd worden alleen de twee zware canonieke bronnen (FIRE-snapshot en de
 * forecast-laag) plus de bezittingen/schulden-fetchers (om de lazy-gating te meten);
 * de sync, de voortgangsberekening en de opmaak draaien echt.
 */

const { snapshotRef, loadSnapshot, getActiveAssets, getActiveDebts } = vi.hoisted(() => {
  const snapshotRef: { current: unknown } = { current: null }
  return {
    snapshotRef,
    loadSnapshot: vi.fn(async () => snapshotRef.current),
    getActiveAssets: vi.fn(async () => ({ data: [{ id: 'a1', current_value: '12500' }], error: null })),
    getActiveDebts: vi.fn(async () => ({ data: [], error: null })),
  }
})

vi.mock('@/lib/goals/vrijheidsgetal-source', () => ({
  loadVrijheidsgetalSnapshot: loadSnapshot,
}))

vi.mock('@/lib/server-data/base', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server-data/base')>()
  return { ...actual, getActiveAssets, getActiveDebts }
})

vi.mock('@/lib/cashflow-kpis', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/cashflow-kpis')>()
  return {
    ...actual,
    loadForecastSectionData: vi.fn(async () => ({
      monthlyIncome: 6000,
      monthlyExpenses: 4200,
      savingsRate6m: 9.5,
      effectiveSavingsRatePct: 30,
      savingsRateIncomeBasis: 'budget' as const,
      savingsRateExpensesBasis: 'budget' as const,
      savingsRateIsEstimate: false,
      savingsHistory: [],
      expenseHistory: [],
    })),
  }
})

import {
  buildGoalContextLines,
  formatGoalContextLines,
  GOAL_NOT_APPLICABLE_MARKER,
  type GoalContextRow,
} from './wil-context'
import { computeGoalProgress } from '@/lib/goal-data'

function makeSupabase(goalLinks: { goal_id: string; asset_id: string | null; debt_id: string | null }[] = []) {
  const chain = (table: string): Record<string, unknown> => {
    const rows = table === 'goal_links' ? goalLinks : []
    const q: Record<string, unknown> = {
      select: () => q, eq: () => q, in: () => q, not: () => q, gte: () => q, lt: () => q, order: () => q, limit: () => q,
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      then: (resolve: (v: { data: unknown[]; error: null }) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve({ data: rows, error: null as null }).then(resolve, reject),
    }
    return q
  }
  return { from: (table: string) => chain(table) } as never
}

let seq = 0
function goal(overrides: Partial<GoalContextRow> & Pick<GoalContextRow, 'goal_type' | 'name'>): GoalContextRow {
  seq += 1
  return {
    id: `g${seq}`,
    user_id: 'u1',
    target_value: 100,
    current_value: 0,
    target_date: null,
    is_completed: false,
    metadata: null,
    linked_asset_id: null,
    linked_debt_id: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

const vastAnker = {
  currentValue: 500_000,
  targetValue: null,
  eta: null,
  fireAgeFractional: null,
  stopAnchor: 'age',
  stopAge: 58,
  endAge: 90,
  planCoveragePct: 78.4,
} as unknown as VrijheidsgetalSnapshot

const solved = {
  currentValue: 500_000,
  targetValue: 900_000,
  eta: 'mrt 2039',
  fireAgeFractional: 52.1,
  stopAnchor: 'solved',
} as unknown as VrijheidsgetalSnapshot

beforeEach(() => {
  snapshotRef.current = null
  loadSnapshot.mockClear()
  getActiveAssets.mockClear()
  getActiveDebts.mockClear()
})

describe('buildGoalContextLines — Fin ziet de live standen van het doelen-scherm', () => {
  it('parameterdoel met opgeslagen 0 krijgt de gesynchroniseerde live waarde', async () => {
    const lines = await buildGoalContextLines(
      makeSupabase(),
      [goal({ name: 'Spaarquote', goal_type: 'savings_rate', target_value: '40', current_value: '0', metadata: { bron: 'parameter' } })],
      'u1',
    )
    expect(lines).toEqual(['Spaarquote: 30,0%/40,0% (75%)'])
    // Geen koppeling en geen FIRE-doel ⇒ geen bezittingen-fetch en geen kernel-snapshot.
    expect(getActiveAssets).not.toHaveBeenCalled()
    expect(loadSnapshot).not.toHaveBeenCalled()
  })

  it('plan_coverage onder een vast anker toont de dekking uit de bundel', async () => {
    snapshotRef.current = vastAnker
    const lines = await buildGoalContextLines(
      makeSupabase(),
      [goal({ name: 'Plan gedekt tot 90 jaar', goal_type: 'plan_coverage', target_value: 100, current_value: 0, metadata: { bron: 'parameter' } })],
      'u1',
    )
    expect(lines).toEqual(['Plan gedekt tot 90 jaar: 78,4%/100,0% (78%)'])
    expect(loadSnapshot).toHaveBeenCalledTimes(1)
  })

  it('een doel met notApplicableReason krijgt de n.v.t.-markering i.p.v. getallen', async () => {
    snapshotRef.current = vastAnker
    const lines = await buildGoalContextLines(
      makeSupabase(),
      [goal({ name: 'Vrijheidsleeftijd', goal_type: 'fire_age', target_value: 53, current_value: 0, metadata: { bron: 'parameter' } })],
      'u1',
    )
    expect(lines).toEqual([`Vrijheidsleeftijd: ${GOAL_NOT_APPLICABLE_MARKER}`])
    // Nooit de lange doelkaart-zin in de prompt.
    expect(lines[0]).not.toMatch(/Je stopmoment ligt vast/)
  })

  it('plan_coverage onder solved: n.v.t., geen kapitaalratio als dekking', async () => {
    snapshotRef.current = solved
    const lines = await buildGoalContextLines(
      makeSupabase(),
      [goal({ name: 'Plan gedekt', goal_type: 'plan_coverage', target_value: 100, current_value: 64, metadata: { bron: 'parameter' } })],
      'u1',
    )
    expect(lines).toEqual([`Plan gedekt: ${GOAL_NOT_APPLICABLE_MARKER}`])
  })

  it('een gedeeld vrijheidsgetal-doel van de partner krijgt NIET de anker-notitie van de kijker', async () => {
    snapshotRef.current = vastAnker
    const lines = await buildGoalContextLines(
      makeSupabase(),
      [
        goal({ name: 'Mijn vrijheidsgetal', goal_type: 'net_worth', target_value: 700_000, current_value: 123, metadata: { standaardDoel: 'vrijheidsgetal' } }),
        goal({ name: 'Vrijheidsgetal partner', user_id: 'partner', goal_type: 'net_worth', target_value: 800_000, current_value: 200_000, metadata: { standaardDoel: 'vrijheidsgetal' } }),
      ],
      'u1',
    )
    expect(lines).toEqual([
      `Mijn vrijheidsgetal: ${GOAL_NOT_APPLICABLE_MARKER}`,
      'Vrijheidsgetal partner: €200.000/€800.000 (25%)',
    ])
  })

  it('gekoppeld doel: bezittingen worden alleen dán opgehaald, en de stand volgt de koppeling', async () => {
    const g = goal({ name: 'Buffer', goal_type: 'savings', target_value: 25_000, current_value: 0 })
    const lines = await buildGoalContextLines(makeSupabase([{ goal_id: g.id, asset_id: 'a1', debt_id: null }]), [g], 'u1')
    expect(getActiveAssets).toHaveBeenCalledTimes(1)
    expect(lines).toEqual(['Buffer: €12.500/€25.000 (50%)'])
  })

  it('zonder doelen: geen regels en geen enkele sync-aanroep', async () => {
    expect(await buildGoalContextLines(makeSupabase(), [], 'u1')).toEqual([])
    expect(loadSnapshot).not.toHaveBeenCalled()
  })
})

describe('formatGoalContextLines — pure opmaak', () => {
  it('neemt het percentage over uit computeGoalProgress (richting-bewust), met deadline', () => {
    const g = { ...goal({ name: 'FIRE op 55', goal_type: 'fire_age', target_date: '2040-01-01' }), current_value: 60, target_value: 55 }
    const p = computeGoalProgress(g)
    expect(formatGoalContextLines([g], [p])).toEqual([`FIRE op 55: 60 jaar/55 jaar (${p.pct}%) — deadline 2040-01-01`])
    expect(p.pct).toBe(92)
  })
})
