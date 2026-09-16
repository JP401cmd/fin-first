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

import { EindstrategieBody, GEEN_TEKORT_LENING_UITLEG } from './eindstrategie-body'

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

function renderBody() {
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

describe('EindstrategieBody — Geen tekort-lening in mijn plan', () => {
  it('toont de schakelaar (standaard uit) met uitleg in de vorm keuze · effect · waarom, zonder advies', async () => {
    renderBody()
    const sw = await screen.findByRole('switch', { name: /Geen tekort-lening in mijn plan/ })
    expect(sw.getAttribute('aria-checked')).toBe('false')
    expect(document.body.textContent).toContain(GEEN_TEKORT_LENING_UITLEG)
    expect(GEEN_TEKORT_LENING_UITLEG).toMatch(/Je kiest/)
    expect(GEEN_TEKORT_LENING_UITLEG).toMatch(/Aan:/)
    expect(GEEN_TEKORT_LENING_UITLEG).toMatch(/Relevant omdat/)
    expect(GEEN_TEKORT_LENING_UITLEG).not.toMatch(/aanbevolen|past bij jou|kies voor|je moet/i)
  })

  it('leest de opgeslagen keuze uit GET /api/fire-settings', async () => {
    getBody = { deficit_loan_rate: null, fire_no_deficit_loan: true }
    renderBody()
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: /Geen tekort-lening in mijn plan/ }).getAttribute('aria-checked')).toBe('true'),
    )
    getBody = { deficit_loan_rate: null, fire_no_deficit_loan: null }
  })

  it('omzetten maakt Opslaan mogelijk, voedt de live-sim en gaat in dezelfde PUT als het plan', async () => {
    const { getActions } = renderBody()
    const sw = await screen.findByRole('switch', { name: /Geen tekort-lening in mijn plan/ })
    await waitFor(() => expect(getActions().canSave).toBe(false))

    fireEvent.click(sw)
    await waitFor(() => expect(getActions().canSave).toBe(true))
    const overrides = mockRun.mock.calls.map((c) => (c as unknown[])[1] as { geenTekortLening?: boolean } | undefined)
    expect(overrides.some((o) => o?.geenTekortLening === true)).toBe(true)

    await act(async () => {
      getActions().save()
    })
    await waitFor(() => expect(putBodies()).toHaveLength(1))
    const body = putBodies()[0]
    expect(body.fire_no_deficit_loan).toBe(true)
    expect(body.fire_end_strategy).toBe('deplete')
  })
})
