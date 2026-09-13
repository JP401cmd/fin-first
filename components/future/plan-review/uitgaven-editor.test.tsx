import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import type { RegelEditActionsState } from '@/components/future/regels/types'

/**
 * TPR-15 stap 2 inline. Gepind:
 *  - een methode-klik in de wizard is een CONCEPT: er wordt niets geschreven;
 *  - het live effect draait via `runRegelProjection` met de uitgaven-override (geen eigen som);
 *  - zonder wijziging `changed: false`; na een klik `changed` + `canSave`;
 *  - opslaan schrijft via PUT /api/fire-settings met de gekozen methode en laat het
 *    opgeslagen eigen bedrag staan, en meldt daarna `onSaved`.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => '/toekomst',
  useSearchParams: () => new URLSearchParams(),
}))

const runRegelProjection = vi.fn((..._args: unknown[]) => ({ rows: [], fireAgeFractional: 55 }))
vi.mock('@/lib/future/regel-sim', () => ({ runRegelProjection: (...a: unknown[]) => runRegelProjection(...a) }))

import { UitgavenEditor } from './uitgaven-editor'

afterEach(cleanup)

let CTX_OVERRIDE: Record<string, unknown> = {}
const CTX_BASIS = {
  initialMethod: 'essential_budgets',
  customAmount: 28000,
  yearlyMustExpenses: 24000,
  yearlyIncome: 60000,
  estimatedYearlyExpenses: 30000,
  currentRetirementExpense: 24000,
  budgetingActive: true,
  savedAspirations: null,
}

let calls: Array<{ url: string; method: string; body: unknown }>

beforeEach(() => {
  calls = []
  CTX_OVERRIDE = {}
  runRegelProjection.mockClear()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined })
      if (url === '/api/uitgaven-na-pensioen/context') {
        return new Response(JSON.stringify({ ...CTX_BASIS, ...CTX_OVERRIDE }))
      }
      if (url === '/api/fire-settings' && method === 'GET') {
        return new Response(JSON.stringify({ fire_end_strategy: 'deplete', fire_end_age: 90, fire_legacy_amount: null }))
      }
      return new Response(JSON.stringify({ ok: true }))
    }),
  )
})

function renderEditor() {
  let actions: RegelEditActionsState | null = null
  const onSaved = vi.fn()
  render(
    <UitgavenEditor
      context={{ snapshot: { rawContext: {} } as never, firePlan: null, potRules: null, potBalances: null, woning: null, inkomsten: null, laag2: null }}
      onActionsChange={(s) => {
        actions = s
      }}
      onSaved={onSaved}
    />,
  )
  return { onSaved, actions: () => actions }
}

describe('UitgavenEditor (plan-review stap 2)', () => {
  it('toont de bestaande methodekeuze; zonder wijziging is er niets op te slaan', async () => {
    const { actions } = renderEditor()
    expect(await screen.findByRole('button', { name: /Behoud van inkomen/ })).toBeInTheDocument()
    await waitFor(() => expect(actions()?.changed).toBe(false))
    expect(actions()?.canSave).toBe(false)
  })

  it('onboarding-default (eigen bedrag zónder antwoorden): bij openen niets gewijzigd, dus niets op te slaan (review H1)', async () => {
    CTX_OVERRIDE = { initialMethod: 'custom_amount', customAmount: 24000, savedAspirations: null }
    const { actions } = renderEditor()
    expect(await screen.findByText('Jouw pensioenleven, opgeteld')).toBeInTheDocument()
    await waitFor(() => expect(actions()?.changed).toBe(false))
    expect(actions()?.canSave).toBe(false)
    // In de wizard hangt de vragenlijst onder de stap-h4 (ADR 0110).
    expect(screen.getByRole('heading', { name: 'Jouw pensioenleven, opgeteld' }).tagName).toBe('H5')
  })

  it('een methode-klik schrijft niets, rekent het concept live door en maakt opslaan mogelijk', async () => {
    const { actions } = renderEditor()
    fireEvent.click(await screen.findByRole('button', { name: /Behoud van inkomen/ }))
    await waitFor(() => expect(actions()?.canSave).toBe(true))
    expect(calls.some((c) => c.method === 'PUT')).toBe(false)
    await waitFor(() =>
      expect(runRegelProjection).toHaveBeenCalledWith(expect.anything(), {
        retirementExpense: { method: 'current_income', customAmount: 28000 },
      }),
    )
  })

  it('opslaan schrijft de gekozen methode via de bestaande route, laat het eigen bedrag staan en meldt onSaved', async () => {
    const { actions, onSaved } = renderEditor()
    fireEvent.click(await screen.findByRole('button', { name: /Behoud van inkomen/ }))
    await waitFor(() => expect(actions()?.canSave).toBe(true))
    actions()!.save()
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    const put = calls.find((c) => c.url === '/api/fire-settings' && c.method === 'PUT')
    expect(put?.body).toMatchObject({
      retirement_expense_method: 'current_income',
      retirement_expense_custom_amount: 28000,
    })
  })
})
