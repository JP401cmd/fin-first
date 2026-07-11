import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { GoalForm } from './goal-form'
import type { Goal, GoalType } from '@/lib/goal-data'

/**
 * Tests voor GoalForm — ronde 4 §G: viaLab-doelen (verwacht rendement,
 * vrijheidsleeftijd) worden via het /toekomst-lab beheerd en zijn NIET vrij
 * aanmaakbaar. Ze verdwijnen uit de type-dropdown bij een nieuw doel; bij een
 * onverhoopte edit van zo'n rij staat de type-select vast met een hint.
 */

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'x' }, error: null }) }) }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
  }),
}))

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'g1',
    user_id: 'u1',
    name: 'Vrijheidsleeftijd',
    description: null,
    goal_type: 'fire_age' as GoalType,
    target_value: 52,
    current_value: 54,
    target_date: null,
    linked_asset_id: null,
    linked_debt_id: null,
    icon: 'Hourglass',
    color: 'teal',
    is_completed: false,
    completed_at: null,
    sort_order: 0,
    ownership: 'personal',
    household_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

beforeEach(() => {
  // Household-status fetch in useEffect → geen huishouden.
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ has_household: false }) }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('GoalForm — viaLab-types filteren', () => {
  it('nieuw doel: viaLab-types staan NIET in de type-dropdown', () => {
    render(
      <GoalForm assets={[]} debts={[]} onClose={() => {}} onSaved={() => {}} />,
    )
    const select = screen.getByLabelText('Type doel')
    // Normale types zijn er wel.
    expect(within(select).getByRole('option', { name: 'Spaardoel' })).toBeTruthy()
    expect(within(select).getByRole('option', { name: 'Salaris' })).toBeTruthy()
    // viaLab-types (lab-beheerd) zijn eruit gefilterd.
    expect(within(select).queryByRole('option', { name: 'Verwacht rendement' })).toBeNull()
    expect(within(select).queryByRole('option', { name: 'Vrijheidsleeftijd' })).toBeNull()
  })

  it('edit van een viaLab-doel: type-select disabled + hint', () => {
    render(
      <GoalForm
        goal={makeGoal({ goal_type: 'fire_age' as GoalType })}
        assets={[]}
        debts={[]}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )
    const select = screen.getByLabelText('Type doel') as HTMLSelectElement
    expect(select.disabled).toBe(true)
    // Het eigen type blijft zichtbaar in de (vaste) select.
    expect(within(select).getByRole('option', { name: 'Vrijheidsleeftijd' })).toBeTruthy()
    expect(
      screen.getByText('Wordt beheerd via je doelsituatie op de tijdas.'),
    ).toBeTruthy()
  })

  it('edit van een gewoon doel: type-select blijft bewerkbaar, geen hint', () => {
    render(
      <GoalForm
        goal={makeGoal({ goal_type: 'savings' as GoalType })}
        assets={[]}
        debts={[]}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    )
    const select = screen.getByLabelText('Type doel') as HTMLSelectElement
    expect(select.disabled).toBe(false)
    expect(
      screen.queryByText('Wordt beheerd via je doelsituatie op de tijdas.'),
    ).toBeNull()
  })
})
