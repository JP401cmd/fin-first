import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

/**
 * ADR 0179 fase 3 — de rij "Uitgave na pensioen" opent dezelfde body als de wizard
 * (`UitgavenBody`) in een ShellOverlay-pane. Gepind: de kop toont het opgeslagen jaarbedrag
 * uit de uitgaven-context (dezelfde bron als de oude pane), een methode-klik is een concept,
 * Opslaan in de footer schrijft via PUT /api/fire-settings en ververst de pagina, en de
 * verschilregel komt uit `runRegelProjection` met de uitgaven-override.
 */

const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh, back: vi.fn() }),
  usePathname: () => '/toekomst/instellingen',
  useSearchParams: () => new URLSearchParams(),
}))

const runRegelProjection = vi.fn((_s: unknown, o?: unknown) => ({ rows: [], fireAgeFractional: o ? 54 : 55 }))
vi.mock('@/lib/future/regel-sim', () => ({ runRegelProjection: (s: unknown, o?: unknown) => runRegelProjection(s, o) }))

import { UitgavenRijPane } from './uitgaven-rij-pane'

const CTX = {
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
  refresh.mockClear()
  runRegelProjection.mockClear()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined })
      if (url === '/api/uitgaven-na-pensioen/context') return new Response(JSON.stringify(CTX))
      if (url === '/api/fire-settings' && method === 'GET') {
        return new Response(JSON.stringify({ fire_end_strategy: 'deplete', fire_end_age: 90, fire_legacy_amount: null }))
      }
      return new Response(JSON.stringify({ ok: true }))
    }),
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('UitgavenRijPane', () => {
  it('kop met het opgeslagen jaarbedrag uit de context; Opslaan uit zonder wijziging', async () => {
    const onClose = vi.fn()
    render(<UitgavenRijPane open onClose={onClose} snapshot={{ rawContext: {} } as never} />)
    const kop = await screen.findByTestId('uitgaven-kop')
    expect(kop.textContent).toMatch(/24\.000/)
    expect(kop.textContent).toContain('Huidig')
    await waitFor(() =>
      expect((screen.getAllByRole('button', { name: /^Opslaan/ })[0] as HTMLButtonElement).disabled).toBe(true),
    )
  })

  it('methode-klik = concept met verschilregel; Opslaan schrijft, sluit en ververst', async () => {
    const onClose = vi.fn()
    render(<UitgavenRijPane open onClose={onClose} snapshot={{ rawContext: {} } as never} />)
    fireEvent.click(await screen.findByRole('button', { name: /Behoud van inkomen/ }))
    expect(calls.some((c) => c.method === 'PUT')).toBe(false)
    await waitFor(() =>
      expect(runRegelProjection).toHaveBeenCalledWith(expect.anything(), {
        retirementExpense: { method: 'current_income', customAmount: 28000 },
      }),
    )
    await waitFor(() => expect(document.body.textContent).toContain('12 mnd eerder'))
    const opslaan = screen.getAllByRole('button', { name: /^Opslaan/ })[0] as HTMLButtonElement
    await waitFor(() => expect(opslaan.disabled).toBe(false))
    fireEvent.click(opslaan)
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(calls.find((c) => c.url === '/api/fire-settings' && c.method === 'PUT')?.body).toMatchObject({
      retirement_expense_method: 'current_income',
    })
  })
})
