import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import type { FirePlan } from '@/lib/fire-strategy'
import type { RegelEditActionsState } from './types'

/**
 * TPR-12 — de schakelaar "niet-liquide bezit meetellen in de nalatenschap" (kernel P!B54)
 * in de eindstrategie-pane: alleen zichtbaar bij eind-vorm nalatenschap, gelezen uit
 * `GET /api/fire-settings`, geschreven via dezelfde PUT als het plan, en meegegeven aan
 * de live-sim zodat de grafiek toont wat je opslaat.
 */

vi.mock('@/components/horizon/stop-plan-vragen', () => ({
  StopPlanVragen: () => <div data-testid="stop-plan-vragen" />,
}))
vi.mock('./shared', () => ({
  RegelIntro: () => null,
  LiveSimImpact: () => null,
  FireDeltaFooter: () => null,
  fireDeltaMonths: () => null,
}))
const mockRun = vi.fn(() => ({ rows: [], fireAgeFractional: null }))
vi.mock('@/lib/future/regel-sim', () => ({
  runRegelProjection: (...args: unknown[]) => mockRun(...(args as [])),
}))

import { EindstrategieBody, NALATENSCHAP_NIET_LIQUIDE_UITLEG } from './eindstrategie-body'

const mockFetch = vi.fn()
let getBody: Record<string, unknown> = { deficit_loan_rate: null, fire_legacy_include_illiquid: null }

beforeEach(() => {
  mockFetch.mockReset()
  mockRun.mockClear()
  mockFetch.mockImplementation((_url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      return Promise.resolve({ ok: true, json: async () => ({ success: true }) })
    }
    return Promise.resolve({ ok: true, json: async () => getBody })
  })
  vi.stubGlobal('fetch', mockFetch)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const legacyPlan: FirePlan = { anchor: { kind: 'solved' }, endForm: 'legacy', endAge: 90, legacyAmount: 100_000 }
const depletePlan: FirePlan = { anchor: { kind: 'solved' }, endForm: 'deplete', endAge: 90, legacyAmount: 0 }

// Minimale snapshot: de live-sim is gemockt, dus alleen de vorm telt.
const snapshot = {
  rawContext: { profile: { date_of_birth: '1980-01-01' }, assets: [], debts: [], lifeEvents: [], yearlyExpenses: 30_000 },
  fireStrategy: { strategy: 'legacy', endAge: 90, legacyAmount: 100_000 },
  withdrawalStrategy: { strategy: 'static', guardrailFloor: 0.8, guardrailCeiling: 1.2, guardrailCutStep: 0.1 },
  aowAgeInt: 68,
  aowFractional: 67.25,
} as unknown as NonNullable<Parameters<typeof EindstrategieBody>[0]['simSnapshot']>

function renderBody(plan: FirePlan) {
  let actions: RegelEditActionsState | null = null
  const utils = render(
    <EindstrategieBody
      simSnapshot={snapshot}
      fireStrategy={{ strategy: plan.endForm, endAge: plan.endAge, legacyAmount: plan.legacyAmount }}
      firePlan={plan}
      onActionsChange={(s) => {
        actions = s
      }}
      onClose={() => {}}
      onSaved={() => {}}
    />,
  )
  return { ...utils, getActions: () => actions! }
}

const putBodies = () =>
  mockFetch.mock.calls
    .filter(([, init]) => (init as RequestInit | undefined)?.method === 'PUT')
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>)

describe('EindstrategieBody — niet-liquide meetellen in de nalatenschap', () => {
  it('toont de schakelaar alleen bij eind-vorm nalatenschap, met de uitleg (keuze · effect · waarom)', async () => {
    renderBody(legacyPlan)
    const sw = await screen.findByRole('switch', { name: /Niet-liquide bezit meetellen/ })
    expect(sw.getAttribute('aria-checked')).toBe('false')
    expect(document.body.textContent).toContain(NALATENSCHAP_NIET_LIQUIDE_UITLEG)
    expect(NALATENSCHAP_NIET_LIQUIDE_UITLEG).toMatch(/Je kiest/)
    expect(NALATENSCHAP_NIET_LIQUIDE_UITLEG).toMatch(/wanneer je vrij/)
    expect(NALATENSCHAP_NIET_LIQUIDE_UITLEG).toMatch(/Relevant omdat/)
    expect(NALATENSCHAP_NIET_LIQUIDE_UITLEG).not.toMatch(/aanbevolen|past bij jou|kies voor/i)
  })

  it('geen schakelaar onder "vermogen opeten"', async () => {
    renderBody(depletePlan)
    await waitFor(() => expect(mockFetch).toHaveBeenCalled())
    expect(screen.queryByRole('switch', { name: /Niet-liquide bezit meetellen/ })).toBeNull()
  })

  it('leest de opgeslagen keuze uit GET /api/fire-settings', async () => {
    getBody = { deficit_loan_rate: null, fire_legacy_include_illiquid: true }
    renderBody(legacyPlan)
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: /Niet-liquide bezit meetellen/ }).getAttribute('aria-checked')).toBe('true'),
    )
    getBody = { deficit_loan_rate: null, fire_legacy_include_illiquid: null }
  })

  it('omzetten maakt Opslaan mogelijk, voedt de live-sim en gaat in dezelfde PUT als het plan', async () => {
    const { getActions } = renderBody(legacyPlan)
    const sw = await screen.findByRole('switch', { name: /Niet-liquide bezit meetellen/ })
    await waitFor(() => expect(getActions().canSave).toBe(false))

    fireEvent.click(sw)
    await waitFor(() => expect(getActions().canSave).toBe(true))
    // De draft-run kreeg de schakelaar mee (baseline niet).
    const overrides = mockRun.mock.calls.map((c) => (c as unknown[])[1] as { legacyIncludeIlliquid?: boolean } | undefined)
    expect(overrides.some((o) => o?.legacyIncludeIlliquid === true)).toBe(true)

    await act(async () => {
      getActions().save()
    })
    await waitFor(() => expect(putBodies()).toHaveLength(1))
    const body = putBodies()[0]
    expect(body.fire_legacy_include_illiquid).toBe(true)
    expect(body.fire_end_strategy).toBe('legacy')
    expect(body.fire_end_age).toBe(90)
  })
})
