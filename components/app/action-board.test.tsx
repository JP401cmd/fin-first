import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ActionBoard } from './action-board'
import { ToastProvider } from '@/components/app/toast-provider'
import type { Action } from '@/lib/recommendation-data'

/**
 * E-01 (WILL-LUS): elke mislukte schrijfactie in het actiebord faalde stil
 * (handleAssign/handleStatusChange/handleUpdateAction/handleCreateAction
 * returnden zonder gebruikersfeedback). Deze suite dwingt af dat élk faalpad
 * een NL-foutmelding (toast) toont en de optimistische state NIET muteert.
 *
 * De kind-componenten (ActionCard/ActionForm/ActionListModal) worden gemockt
 * tot minimale knoppen die de mutatie-callbacks aanroepen — zo testen we het
 * gedrag van het bord zelf zonder de volledige kaart-UI (en haar
 * DisplayMode-afhankelijkheden) op te tuigen.
 */

vi.mock('@/components/app/action-card', () => ({
  ActionCard: ({ action, onStatusChange, onAssign, onUpdate }: {
    action: Action
    onStatusChange: (id: string, status: string, data?: Record<string, unknown>) => void
    onAssign: (id: string, partnerId: string | null) => void
    onUpdate: (id: string, data: Record<string, unknown>) => void
  }) => (
    <div>
      <span>{action.title}</span>
      <button onClick={() => onStatusChange(action.id, 'completed')}>status</button>
      <button onClick={() => onAssign(action.id, 'partner-1')}>assign</button>
      <button onClick={() => onUpdate(action.id, { title: 'gewijzigd' })}>update</button>
    </div>
  ),
}))

vi.mock('@/components/app/action-form', () => ({
  ActionForm: ({ onSubmit }: { onSubmit: (data: Record<string, unknown>) => void }) => (
    <button onClick={() => onSubmit({ title: 'Nieuwe actie', freedom_days_impact: 1 })}>create</button>
  ),
}))

vi.mock('@/components/app/action-list-modal', () => ({
  ActionListModal: () => null,
}))

vi.mock('@/components/app/freedom-days-animation', () => ({
  useFreedomDaysAnimation: () => ({ triggerAnimation: vi.fn() }),
}))

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

beforeEach(() => {
  fetchMock.mockReset()
})

const baseAction = (overrides: Partial<Action>): Action =>
  ({
    id: 'a1',
    user_id: 'u1',
    recommendation_id: null,
    source: 'manual',
    title: 'Bestaande actie',
    description: null,
    freedom_days_impact: 3,
    euro_impact_monthly: null,
    status: 'open',
    scheduled_week: null,
    due_date: null,
    postpone_weeks: null,
    postponed_until: null,
    rejection_reason: null,
    sort_order: 0,
    priority_score: 5,
    completed_at: null,
    status_changed_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    assigned_to: null,
    assigned_by: null,
    ...overrides,
  }) as Action

function renderBoard(actions: Action[]) {
  return render(
    <ToastProvider>
      <ActionBoard initialActions={actions} currentUserId="u1" />
    </ToastProvider>,
  )
}

describe('ActionBoard — faalpaden tonen een foutmelding (E-01)', () => {
  it('toont een foutmelding als het bijwerken van de status faalt (!res.ok)', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: () => Promise.resolve('boom') })
    renderBoard([baseAction({ id: 'a1', title: 'Bestaande actie', status: 'open' })])

    fireEvent.click(screen.getByText('status'))

    expect(await screen.findByText(/niet gelukt/i)).toBeInTheDocument()
  })

  it('toont een foutmelding als de fetch bij statuswijziging gooit (netwerk)', async () => {
    fetchMock.mockRejectedValue(new Error('network down'))
    renderBoard([baseAction({ id: 'a1', title: 'Bestaande actie', status: 'open' })])

    fireEvent.click(screen.getByText('status'))

    expect(await screen.findByText(/niet gelukt/i)).toBeInTheDocument()
  })

  it('toont een foutmelding als toewijzen aan een partner faalt', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 })
    renderBoard([baseAction({ id: 'a1', title: 'Bestaande actie', status: 'open' })])

    fireEvent.click(screen.getByText('assign'))

    expect(await screen.findByText(/niet gelukt/i)).toBeInTheDocument()
  })

  it('toont een foutmelding als het opslaan van een wijziging faalt', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 })
    renderBoard([baseAction({ id: 'a1', title: 'Bestaande actie', status: 'open' })])

    fireEvent.click(screen.getByText('update'))

    expect(await screen.findByText(/niet gelukt/i)).toBeInTheDocument()
  })

  it('toont een foutmelding én houdt het formulier open als aanmaken faalt', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 })
    renderBoard([])

    fireEvent.click(screen.getByRole('button', { name: /Eerste actie toevoegen/i }))
    fireEvent.click(screen.getByText('create'))

    expect(await screen.findByText(/niet gelukt/i)).toBeInTheDocument()
    // Optimistische state niet toegepast: het formulier blijft open (geen setShowForm(false)).
    expect(screen.getByText('create')).toBeInTheDocument()
  })
})
