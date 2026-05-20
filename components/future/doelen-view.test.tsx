import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DoelenView } from './doelen-view'
import type { GoalWithBudget } from '@/lib/will-data-loader'

// DoelenView mount DoelToevoegenSheet die next/navigation + supabase
// client gebruikt. Mock beide zodat de view in isolatie test-baar
// blijft. Hook useViewMode valt zonder provider terug op default.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({ insert: vi.fn().mockResolvedValue({ error: null }) }),
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
  }),
}))

/**
 * Tests voor DoelenView — Doelen-tab op /toekomst met status-flags
 * (on-track / aandacht / off-track / behaald).
 */

function mockGoal(overrides: Partial<GoalWithBudget> = {}): GoalWithBudget {
  return {
    id: 'g1',
    name: 'Spaargeld voor woning',
    description: '',
    goal_type: 'savings',
    target_value: 50000,
    current_value: 20000,
    target_date: '2027-12-31',
    color: 'teal',
    icon: 'Target',
    is_completed: false,
    sort_order: 0,
    user_id: 'u1',
    created_at: '2026-01-01',
    custom_unit: null,
    budgets: null,
    ...overrides,
  } as unknown as GoalWithBudget
}

describe('DoelenView — basis-render', () => {
  it('rendert empty-state CTA wanneer geen doelen', () => {
    render(<DoelenView goals={[]} goalProgresses={[]} />)
    expect(screen.getByText('Nog geen doelen')).toBeTruthy()
    expect(screen.getByText('Eerste doel formuleren')).toBeTruthy()
  })

  it('rendert doel-cards met naam en bedragen', () => {
    render(
      <DoelenView
        goals={[mockGoal()]}
        goalProgresses={[
          { current: 20000, target: 50000, pct: 40, onTrack: false, eta: 'over 2 jaar' },
        ]}
      />,
    )
    expect(screen.getByText('Spaargeld voor woning')).toBeTruthy()
    // formatCurrency rendert €
    expect(screen.getAllByText(/€/).length).toBeGreaterThan(0)
  })

  it('toont status "Op koers" bij onTrack progress', () => {
    render(
      <DoelenView
        goals={[mockGoal()]}
        goalProgresses={[
          { current: 30000, target: 50000, pct: 60, onTrack: true, eta: null },
        ]}
      />,
    )
    expect(screen.getByText('Op koers')).toBeTruthy()
  })

  it('toont status "Behaald" bij pct >= 100', () => {
    render(
      <DoelenView
        goals={[mockGoal()]}
        goalProgresses={[
          { current: 50000, target: 50000, pct: 100, onTrack: true, eta: null },
        ]}
      />,
    )
    expect(screen.getByText('Behaald')).toBeTruthy()
  })

  it('toont status "Aandacht" bij pct >= 50 maar niet onTrack', () => {
    render(
      <DoelenView
        goals={[mockGoal()]}
        goalProgresses={[
          { current: 30000, target: 50000, pct: 60, onTrack: false, eta: null },
        ]}
      />,
    )
    expect(screen.getByText('Aandacht')).toBeTruthy()
  })

  it('toont status "Achter op planning" bij pct < 50 en niet onTrack', () => {
    render(
      <DoelenView
        goals={[mockGoal()]}
        goalProgresses={[
          { current: 5000, target: 50000, pct: 10, onTrack: false, eta: null },
        ]}
      />,
    )
    expect(screen.getByText('Achter op planning')).toBeTruthy()
  })

  it('sorteert off-track doelen bovenaan', () => {
    const goals = [
      mockGoal({ id: 'g1', name: 'Op koers doel' }),
      mockGoal({ id: 'g2', name: 'Off-track doel' }),
    ]
    const progresses = [
      { current: 30000, target: 50000, pct: 60, onTrack: true, eta: null },
      { current: 5000, target: 50000, pct: 10, onTrack: false, eta: null },
    ]
    render(<DoelenView goals={goals} goalProgresses={progresses} />)
    const headings = screen.getAllByRole('heading', { level: 3 })
    // Off-track moet vóór Op koers staan
    expect(headings[0]?.textContent).toContain('Off-track doel')
    expect(headings[1]?.textContent).toContain('Op koers doel')
  })

  it('rendert progressbar met juiste aria-valuenow', () => {
    const { container } = render(
      <DoelenView
        goals={[mockGoal()]}
        goalProgresses={[
          { current: 20000, target: 50000, pct: 40, onTrack: false, eta: null },
        ]}
      />,
    )
    const bar = container.querySelector('[role="progressbar"]')
    expect(bar?.getAttribute('aria-valuenow')).toBe('40')
  })

  it('rendert mijlpaal-markers op 25/50/75% van progressbar', () => {
    const { container } = render(
      <DoelenView
        goals={[mockGoal()]}
        goalProgresses={[
          { current: 20000, target: 50000, pct: 40, onTrack: false, eta: null },
        ]}
      />,
    )
    const bar = container.querySelector('[role="progressbar"]')
    expect(bar).toBeTruthy()
    // Drie aria-hidden mijlpaal-spans als directe children
    const markers = bar?.querySelectorAll('span[aria-hidden="true"]')
    expect(markers?.length).toBe(3)
    // Posities 25%, 50%, 75%
    const positions = Array.from(markers ?? []).map((s) =>
      (s as HTMLElement).style.left,
    )
    expect(positions).toEqual(['25%', '50%', '75%'])
  })

  it('toont aantal doelen in header', () => {
    render(
      <DoelenView
        goals={[mockGoal({ id: 'a' }), mockGoal({ id: 'b' })]}
        goalProgresses={[
          { current: 10, target: 100, pct: 10, onTrack: false, eta: null },
          { current: 20, target: 100, pct: 20, onTrack: false, eta: null },
        ]}
      />,
    )
    expect(screen.getByText('2 actieve doelen')).toBeTruthy()
  })
})
