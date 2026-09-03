import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ActionListModal } from './action-list-modal'
import { compareActionsByPriority } from '@/lib/action-sort'
import type { Action } from '@/lib/recommendation-data'

/**
 * WF-OVZ-20-bug1 (eigenaarsbesluit optie A, 3 sep 2026): de "Alle acties"-modal
 * opent in DEZELFDE volgorde als de compacte lijst (priority_score desc, sort_order
 * asc, created_at desc — `lib/action-sort.ts`). 'Impact' was de default en gaf voor
 * dezelfde actie-set een andere volgorde dan het bord; het blijft een expliciete keuze.
 *
 * BottomSheet en ActionCard worden tot het minimum gemockt: de sheet rendert haar
 * kinderen zodra ze open is, de kaart alleen de titel.
 */

vi.mock('@/components/app/bottom-sheet', () => ({
  BottomSheet: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="sheet">{children}</div> : null,
}))

vi.mock('@/components/app/action-card', () => ({
  ActionCard: ({ action }: { action: Action }) => <div data-testid="kaart">{action.title}</div>,
}))

vi.mock('@/components/app/action-form', () => ({
  ActionForm: () => null,
}))

const baseAction = (overrides: Partial<Action>): Action =>
  ({
    id: 'a1',
    user_id: 'u1',
    recommendation_id: null,
    source: 'manual',
    title: 'Actie',
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
    priority_score: 3,
    completed_at: null,
    status_changed_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    assigned_to: null,
    assigned_by: null,
    recommendation: null,
    ...overrides,
  }) as Action

// Het scenario uit de UAT: impacts 45/20/10, alle drie priority 3 en sort_order 0.
const seed1 = baseAction({ id: 's1', title: 'Seed 1 (impact 45)', freedom_days_impact: 45, created_at: '2026-08-01T10:00:00Z' })
const seed2 = baseAction({ id: 's2', title: 'Seed 2 (impact 10)', freedom_days_impact: 10, created_at: '2026-08-15T10:00:00Z' })
const nieuw = baseAction({ id: 'n1', title: 'Nieuw (impact 20)', freedom_days_impact: 20, created_at: '2026-09-02T10:00:00Z' })
const actions = [seed1, nieuw, seed2]

const noop = async () => {}

function renderModal() {
  return render(
    <ActionListModal
      open
      onClose={() => {}}
      actions={actions}
      onStatusChange={noop}
      onUpdate={noop}
      onCreateAction={noop}
      isPartnerAssigned={() => false}
    />,
  )
}

const kaartTitels = () => screen.getAllByTestId('kaart').map((el) => el.textContent)

describe('ActionListModal — default-sortering = compacte lijst (WF-OVZ-20-bug1)', () => {
  it('opent op "Prioriteit" en toont exact de volgorde van compareActionsByPriority', () => {
    renderModal()
    expect(screen.getByRole('button', { name: /Sorteren op: Prioriteit/ })).toBeInTheDocument()
    const verwacht = [...actions].sort(compareActionsByPriority).map((a) => a.title)
    expect(kaartTitels()).toEqual(verwacht)
    // Bij het 3-weg gelijkspel wint created_at (nieuwste eerst) — niet de impact.
    expect(kaartTitels()).toEqual(['Nieuw (impact 20)', 'Seed 2 (impact 10)', 'Seed 1 (impact 45)'])
  })

  it('"Impact" blijft een expliciete keuze en sorteert dan op vrijheidsdagen', () => {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: /Sorteren op: Prioriteit/ }))
    fireEvent.click(screen.getByRole('option', { name: 'Impact' }))
    expect(kaartTitels()).toEqual(['Seed 1 (impact 45)', 'Nieuw (impact 20)', 'Seed 2 (impact 10)'])
    expect(screen.getByRole('button', { name: /Sorteren op: Impact/ })).toBeInTheDocument()
  })
})
