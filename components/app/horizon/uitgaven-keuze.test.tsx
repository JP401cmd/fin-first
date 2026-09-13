import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

/**
 * Characterization-test voor het uitgaven-na-stoppen-scherm (TPR-15, vóór de wizard het
 * hergebruikt). Pint het BESTAANDE gedrag:
 *  - een methode-klik (niet "zelf samenstellen") schrijft direct via PUT /api/fire-settings,
 *    met de huidige eind-vorm erbij en een leeg eigen bedrag, en meldt `onSaveComplete`;
 *  - in een pane publiceert de flow zijn save-state; "zelf samenstellen" schrijft pas bij
 *    save, samen met de antwoorden, en meldt dan `onSaved`.
 */

const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh, back: vi.fn() }),
  usePathname: () => '/toekomst',
  useSearchParams: () => new URLSearchParams(),
}))

import UitgavenNaPensioenClient from '@/app/(app)/horizon/uitgaven-na-pensioen/uitgaven-client'
import type { UitgavenPaneActionsState } from './uitgaven-keuze'

afterEach(cleanup)

let calls: Array<{ url: string; method: string; body: unknown }>

beforeEach(() => {
  calls = []
  refresh.mockReset()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined })
      if (url === '/api/fire-settings' && method === 'GET') {
        return new Response(JSON.stringify({ fire_end_strategy: 'legacy', fire_end_age: 95, fire_legacy_amount: 50000 }))
      }
      return new Response(JSON.stringify({ ok: true }))
    }),
  )
})

const BASIS = {
  initialMethod: 'essential_budgets' as const,
  customAmount: 28000,
  yearlyMustExpenses: 24000,
  yearlyIncome: 60000,
  estimatedYearlyExpenses: 30000,
  currentRetirementExpense: 24000,
  budgetingActive: true,
  savedAspirations: null,
}

describe('uitgaven na stoppen — bestaand gedrag', () => {
  it('een methode-klik schrijft direct, met de huidige eind-vorm en een leeg eigen bedrag', async () => {
    const onSaveComplete = vi.fn()
    render(<UitgavenNaPensioenClient {...BASIS} onSaveComplete={onSaveComplete} />)
    fireEvent.click(screen.getByRole('button', { name: /Behoud van inkomen/ }))
    await waitFor(() => expect(onSaveComplete).toHaveBeenCalledTimes(1))
    const put = calls.find((c) => c.url === '/api/fire-settings' && c.method === 'PUT')
    expect(put?.body).toEqual({
      fire_end_strategy: 'legacy',
      fire_end_age: 95,
      fire_legacy_amount: 50000,
      retirement_expense_method: 'current_income',
      retirement_expense_custom_amount: null,
    })
    expect(refresh).toHaveBeenCalled()
  })

  it('in een pane: zelf samenstellen schrijft pas bij save, met de antwoorden, en meldt onSaved', async () => {
    const onSaved = vi.fn()
    let actions: UitgavenPaneActionsState | null = null
    render(
      <UitgavenNaPensioenClient
        {...BASIS}
        inPane
        onActionsChange={(s) => {
          actions = s
        }}
        onSaved={onSaved}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Zelf samenstellen/ }))
    expect(calls.some((c) => c.method === 'PUT')).toBe(false)
    await waitFor(() => expect(actions?.isCustom).toBe(true))
    // Het inline save-blok is onderdrukt: de pane-footer is de enige CTA.
    expect(screen.queryByRole('button', { name: /Opslaan als doelbedrag/ })).not.toBeInTheDocument()
    actions!.save()
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(calls.filter((c) => c.method === 'PUT').map((c) => c.url)).toEqual([
      '/api/fire-settings',
      '/api/retirement-aspirations',
    ])
  })
})
