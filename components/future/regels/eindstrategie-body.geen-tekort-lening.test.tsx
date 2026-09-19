import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import type { FirePlan } from '@/lib/fire-strategy'
import type { RegelEditActionsState } from './types'

/**
 * ADR 0149 — de hoofdinstelling "Geen tekort-lening in mijn plan" in de eindstrategie-pane
 * (dus ook in wizard-stap "Je plan"): altijd zichtbaar, gelezen uit GET /api/fire-settings,
 * meegegeven aan de live-sim en geschreven via dezelfde PUT als het plan.
 */

vi.mock('@/components/horizon/stop-plan-vragen', () => ({
  StopPlanVragen: () => <div data-testid="stop-plan-vragen" />,
}))
vi.mock('./shared', () => ({
  RegelIntro: () => null,
  LiveSimImpact: () => null,
  FireDeltaFooter: () => null,
  fireFooterSleutel: () => null,
}))
const mockRun = vi.fn(() => ({ rows: [], fireAgeFractional: null }))
vi.mock('@/lib/future/regel-sim', () => ({
  runRegelProjection: (...args: unknown[]) => mockRun(...(args as [])),
}))

import {
  EindstrategieBody,
  GEEN_TEKORT_LENING_UITLEG,
  GEEN_TEKORT_LENING_VAST_ANKER_UITLEG,
} from './eindstrategie-body'

const mockFetch = vi.fn()
let getBody: Record<string, unknown> = { deficit_loan_rate: null, fire_no_deficit_loan: null }

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

const plan: FirePlan = { anchor: { kind: 'solved' }, endForm: 'deplete', endAge: 90, legacyAmount: 0 }

const snapshot = {
  rawContext: { profile: { date_of_birth: '1980-01-01' }, assets: [], debts: [], lifeEvents: [], yearlyExpenses: 30_000 },
  fireStrategy: { strategy: 'deplete', endAge: 90, legacyAmount: 0 },
  withdrawalStrategy: { strategy: 'static', guardrailFloor: 0.8, guardrailCeiling: 1.2, guardrailCutStep: 0.1 },
  aowAgeInt: 68,
  aowFractional: 67.25,
} as unknown as NonNullable<Parameters<typeof EindstrategieBody>[0]['simSnapshot']>

function renderBody(firePlan: FirePlan = plan) {
  let actions: RegelEditActionsState | null = null
  const utils = render(
    <EindstrategieBody
      simSnapshot={snapshot}
      fireStrategy={{ strategy: firePlan.endForm, endAge: firePlan.endAge, legacyAmount: firePlan.legacyAmount }}
      firePlan={firePlan}
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

describe('EindstrategieBody — Geen tekort-lening in mijn plan', () => {
  it('toont de schakelaar (standaard aan) met uitleg in de vorm keuze · effect · waarom, zonder advies', async () => {
    renderBody()
    const sw = await screen.findByRole('switch', { name: /Geen tekort-lening in mijn plan/ })
    await waitFor(() => expect(sw.getAttribute('aria-checked')).toBe('true'))
    expect(GEEN_TEKORT_LENING_UITLEG).toMatch(/Aan \(standaard\)/)
    expect(document.body.textContent).toContain(GEEN_TEKORT_LENING_UITLEG)
    expect(GEEN_TEKORT_LENING_UITLEG).toMatch(/Je kiest/)
    expect(GEEN_TEKORT_LENING_UITLEG).toMatch(/Uit:/)
    expect(GEEN_TEKORT_LENING_UITLEG).toMatch(/Relevant omdat/)
    expect(GEEN_TEKORT_LENING_UITLEG).not.toMatch(/aanbevolen|past bij jou|kies voor|je moet/i)
  })

  // B-050 (19 sep 2026, variant B): de ankervoorwaarde staat alleen bij een vast stopmoment.
  it('"zo vroeg als het kan" (solved): geen ankervoorwaarde bij de instelling', async () => {
    renderBody()
    await screen.findByRole('switch', { name: /Geen tekort-lening in mijn plan/ })
    expect(screen.queryByTestId('geen-tekort-lening-vast-anker')).toBeNull()
    expect(document.body.textContent).not.toContain(GEEN_TEKORT_LENING_VAST_ANKER_UITLEG)
  })

  it.each([
    ['age', { kind: 'age', age: 58 } as FirePlan['anchor']],
    ['aow', { kind: 'aow' } as FirePlan['anchor']],
    ['now', { kind: 'now' } as FirePlan['anchor']],
  ])('vast anker (%s): de instelling legt uit dat de leeftijd niet verschuift en de lening kan blijven', async (_kind, anchor) => {
    renderBody({ ...plan, anchor })
    await screen.findByRole('switch', { name: /Geen tekort-lening in mijn plan/ })
    const caveat = screen.getByTestId('geen-tekort-lening-vast-anker')
    expect(caveat.textContent).toBe(GEEN_TEKORT_LENING_VAST_ANKER_UITLEG)
    expect(GEEN_TEKORT_LENING_VAST_ANKER_UITLEG).toMatch(/verschuift die leeftijd niet/)
    expect(GEEN_TEKORT_LENING_VAST_ANKER_UITLEG).toMatch(/zo vroeg als het kan/)
    // Beschrijvend (Wft): geen advies.
    expect(GEEN_TEKORT_LENING_VAST_ANKER_UITLEG).not.toMatch(/aanbevolen|past bij jou|kies voor|je moet/i)
  })

  it('leest de bewust uitgezette keuze (false) uit GET /api/fire-settings', async () => {
    getBody = { deficit_loan_rate: null, fire_no_deficit_loan: false }
    renderBody()
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: /Geen tekort-lening in mijn plan/ }).getAttribute('aria-checked')).toBe('false'),
    )
    getBody = { deficit_loan_rate: null, fire_no_deficit_loan: null }
  })

  it('omzetten maakt Opslaan mogelijk, voedt de live-sim en gaat in dezelfde PUT als het plan', async () => {
    const { getActions } = renderBody()
    const sw = await screen.findByRole('switch', { name: /Geen tekort-lening in mijn plan/ })
    await waitFor(() => expect(getActions().canSave).toBe(false))

    await waitFor(() => expect(sw.getAttribute('aria-checked')).toBe('true'))
    fireEvent.click(sw)
    await waitFor(() => expect(getActions().canSave).toBe(true))
    const overrides = mockRun.mock.calls.map((c) => (c as unknown[])[1] as { geenTekortLening?: boolean } | undefined)
    expect(overrides.some((o) => o?.geenTekortLening === false)).toBe(true)

    await act(async () => {
      getActions().save()
    })
    await waitFor(() => expect(putBodies()).toHaveLength(1))
    const body = putBodies()[0]
    expect(body.fire_no_deficit_loan).toBe(false)
    expect(body.fire_end_strategy).toBe('deplete')
  })
})
