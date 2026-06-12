/**
 * Componenttest voor de Sleepmodus-overlay — het tap-to-assign-pad (jsdom kan
 * geen echte pointer-drags simuleren; de drop-logica deelt hetzelfde
 * `resolveTarget`-pad). Verifieert:
 *  1. Veld rendert na het laden van de context (header, teller, ring).
 *  2. Eigen rekening-zone alleen zichtbaar mét eigen-rekening-budget.
 *  3. Parent met ≥2 children opent de deelbudgetten (geen directe toewijzing).
 *  4. Toewijzen mét vergelijkbare transacties toont de vraagkaart; annuleren
 *     laat de wachtrij intact.
 *  5. Overslaan schuift door zonder toewijzing (teller loopt).
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SleepmodusOverlay, type SleepmodusApplyRequest } from './sleepmodus-overlay'
import type { Budget } from '@/lib/budget-data'

vi.mock('@/lib/auto-categorize-context', () => ({
  loadAutoCatContext: vi.fn(async () => ({
    budgets: [],
    corrections: [],
    freqMap: new Map(),
    ownIbans: new Set(),
    ownNamePatterns: [],
    eigenRekeningBudgetId: null,
  })),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u-1' } } }) },
  }),
}))

function budget(id: string, name: string, parent_id: string | null, overrides: Partial<Budget> = {}): Budget {
  return {
    id,
    user_id: 'u-1',
    parent_id,
    name,
    slug: id,
    icon: 'Circle',
    description: null,
    default_limit: 100,
    budget_type: 'expense',
    interval: 'monthly',
    rollover_type: 'reset',
    limit_type: 'soft',
    alert_threshold: 0.8,
    max_single_transaction_amount: 0,
    is_essential: false,
    priority_score: 1,
    is_inflation_indexed: false,
    sort_order: 0,
    created_at: '',
    updated_at: '',
    ownership: 'personal',
    household_id: null,
    goal_type: null,
    goal_amount: null,
    goal_date: null,
    goal_frequency: null,
    is_favorite: false,
  }
}

const dagelijks = budget('dagelijks', 'Dagelijks', null, { sort_order: 0 })
const boodschappen = budget('boodschappen', 'Boodschappen', 'dagelijks')
const uitEten = budget('uit-eten', 'Uit eten', 'dagelijks')
const inkomen = budget('inkomen', 'Inkomen', null, { budget_type: 'income', sort_order: 1 })

const baseBudgets = [dagelijks, boodschappen, uitEten, inkomen]
const baseGroups = [
  { parent: dagelijks, children: [boodschappen, uitEten] },
  { parent: inkomen, children: [] },
]

function tx(id: string, counterparty: string | null) {
  return {
    id,
    date: '2026-03-04',
    description: `Betaling ${id}`,
    counterparty_name: counterparty,
    counterparty_iban: null,
    amount: -12.5,
    import_hash: null,
    budget_id: null,
  }
}

const transactions = [tx('a1', 'Albert Heijn'), tx('a2', 'Albert Heijn'), tx('b1', 'Jumbo')]

function renderOverlay(overrides: Partial<Parameters<typeof SleepmodusOverlay>[0]> = {}) {
  return render(
    <SleepmodusOverlay
      transactions={transactions}
      budgets={baseBudgets}
      budgetGroups={baseGroups}
      hasHousehold={false}
      monthLabel="maart 2026"
      onExit={() => {}}
      onDone={() => {}}
      {...overrides}
    />,
  )
}

const counterIs = (text: string) =>
  screen.getByText((_, el) => el?.tagName === 'P' && el.textContent?.replace(/\s+/g, ' ').trim() === text)

describe('SleepmodusOverlay', () => {
  it('rendert het speelveld na het laden van de context', async () => {
    renderOverlay()
    expect(screen.getByText('Sleepmodus voorbereiden…')).toBeInTheDocument()
    await waitFor(() => expect(counterIs('Nog 3 van 3')).toBeInTheDocument())
    expect(screen.getByLabelText('Open deelbudgetten van Dagelijks')).toBeInTheDocument()
    expect(screen.getByLabelText('Wijs toe aan Inkomen')).toBeInTheDocument()
    expect(screen.getByLabelText('Sla deze transactie over')).toBeInTheDocument()
  })

  it('toont de Eigen rekening-zone alleen wanneer er een eigen-rekening-budget is', async () => {
    const { unmount } = renderOverlay()
    await waitFor(() => expect(counterIs('Nog 3 van 3')).toBeInTheDocument())
    expect(screen.queryByLabelText('Markeer als overboeking tussen eigen rekeningen')).not.toBeInTheDocument()
    unmount()

    const eigen = budget('eigen-rekening', 'Eigen rekening', null, { budget_type: 'archive', sort_order: 99 })
    renderOverlay({ budgets: [...baseBudgets, eigen], budgetGroups: [...baseGroups, { parent: eigen, children: [] }] })
    await waitFor(() => expect(counterIs('Nog 3 van 3')).toBeInTheDocument())
    expect(screen.getByLabelText('Markeer als overboeking tussen eigen rekeningen')).toBeInTheDocument()
  })

  it('opent de deelbudgetten bij een parent met meerdere children', async () => {
    renderOverlay()
    await waitFor(() => expect(counterIs('Nog 3 van 3')).toBeInTheDocument())
    fireEvent.click(screen.getByLabelText('Open deelbudgetten van Dagelijks'))
    expect(screen.getByLabelText('Wijs toe aan Boodschappen')).toBeInTheDocument()
    expect(screen.getByLabelText('Wijs toe aan Uit eten')).toBeInTheDocument()
    // Geen vraagkaart — er is nog niets toegewezen
    expect(screen.queryByRole('dialog', { name: /vergelijkbare/ })).not.toBeInTheDocument()
  })

  it('toont de vraagkaart bij vergelijkbare transacties en laat annuleren de wachtrij intact', async () => {
    renderOverlay()
    await waitFor(() => expect(counterIs('Nog 3 van 3')).toBeInTheDocument())
    // Huidige transactie = Albert Heijn (1 sibling) → leaf-parent tikken
    fireEvent.click(screen.getByLabelText('Wijs toe aan Inkomen'))
    const card = await screen.findByRole('dialog', { name: 'Nog 1 vergelijkbare transacties' })
    expect(card).toHaveTextContent('Albert Heijn')
    expect(card).toHaveTextContent('Inkomen')

    fireEvent.click(screen.getByText('Toch een ander budget'))
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /vergelijkbare/ })).not.toBeInTheDocument(),
    )
    expect(counterIs('Nog 3 van 3')).toBeInTheDocument()
  })

  it('gebruikt een geïnjecteerde applyAssignment (import-modus) en schuift door na succes', async () => {
    const applyAssignment = vi.fn(async (_req: SleepmodusApplyRequest) => ({ ruleCreated: false, bulkUpdated: 0 }))
    renderOverlay({ applyAssignment, doneLabel: 'Terug naar import' })
    await waitFor(() => expect(counterIs('Nog 3 van 3')).toBeInTheDocument())

    fireEvent.click(screen.getByLabelText('Wijs toe aan Inkomen'))
    await screen.findByRole('dialog', { name: 'Nog 1 vergelijkbare transacties' })
    fireEvent.click(screen.getByText('Alleen deze ene'))

    await waitFor(() => expect(counterIs('Nog 2 van 3')).toBeInTheDocument(), { timeout: 3000 })
    expect(applyAssignment).toHaveBeenCalledTimes(1)
    expect(applyAssignment.mock.calls[0][0]).toMatchObject({
      budgetId: 'inkomen',
      scope: 'one',
      isTransfer: false,
      siblingIds: ['a2'],
    })
  })

  it('overslaan schuift door zonder toewijzing', async () => {
    renderOverlay()
    await waitFor(() => expect(counterIs('Nog 3 van 3')).toBeInTheDocument())
    fireEvent.click(screen.getByLabelText('Sla deze transactie over'))
    await waitFor(() => expect(counterIs('Nog 2 van 3')).toBeInTheDocument())
  })

  it('toont geen "Opslaan en stoppen"-knop zolang er niets is toegewezen', async () => {
    renderOverlay()
    await waitFor(() => expect(counterIs('Nog 3 van 3')).toBeInTheDocument())
    expect(screen.queryByText('Opslaan en stoppen')).not.toBeInTheDocument()
  })

  it('toont de knop na een toewijzing en gaat bij klik naar het samenvattingsscherm', async () => {
    const applyAssignment = vi.fn(async (_req: SleepmodusApplyRequest) => ({ ruleCreated: false, bulkUpdated: 0 }))
    renderOverlay({ applyAssignment })
    await waitFor(() => expect(counterIs('Nog 3 van 3')).toBeInTheDocument())

    // Albert Heijn (scope 'one' via "Alleen deze ene") → 1 toegewezen, 2 over.
    fireEvent.click(screen.getByLabelText('Wijs toe aan Inkomen'))
    await screen.findByRole('dialog', { name: 'Nog 1 vergelijkbare transacties' })
    fireEvent.click(screen.getByText('Alleen deze ene'))
    await waitFor(() => expect(counterIs('Nog 2 van 3')).toBeInTheDocument(), { timeout: 3000 })

    const stopKnop = await screen.findByText('Opslaan en stoppen')
    fireEvent.click(stopKnop)

    // Samenvatting verschijnt met de geruststellende resterende-regel.
    expect(await screen.findByText('Terug naar budgetten')).toBeInTheDocument()
    expect(screen.getByText(/niet toegewezen/)).toBeInTheDocument()
  })
})
