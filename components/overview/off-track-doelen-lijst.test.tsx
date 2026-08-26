import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OffTrackDoelenLijst } from './off-track-doelen-lijst'
import type { GoalWithBudget } from '@/lib/fin-data-loader'

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

describe('OffTrackDoelenLijst', () => {
  it('rendert niets bij lege doelen', () => {
    const { container } = render(
      <OffTrackDoelenLijst goals={[]} goalProgresses={[]} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('rendert niets als alle doelen op koers of behaald zijn', () => {
    const { container } = render(
      <OffTrackDoelenLijst
        goals={[mockGoal()]}
        goalProgresses={[
          { current: 30000, target: 50000, pct: 60, onTrack: true, eta: null },
        ]}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  // Bevinding M31 — tweede oppervlak. Een zojuist aangemaakt doel hoort niet in
  // de actielijst. De guard zit bij de bron (computeGoalProgress houdt `onTrack`
  // op true zolang er niets te meten valt), niet in dit component; deze test
  // pint vast dat die keuze hier daadwerkelijk doorwerkt.
  it('toont een vers doel niet: onTrack blijft true zolang er niets gemeten is', () => {
    const { container } = render(
      <OffTrackDoelenLijst
        goals={[mockGoal({ current_value: 0 })]}
        goalProgresses={[
          { current: 0, target: 50000, pct: 0, onTrack: true, eta: 'jul 2027' },
        ]}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('toont alleen off-track doelen (niet onTrack, pct < 100)', () => {
    render(
      <OffTrackDoelenLijst
        goals={[
          mockGoal({ id: 'g1', name: 'Off-track A' }),
          mockGoal({ id: 'g2', name: 'Op koers B' }),
          mockGoal({ id: 'g3', name: 'Behaald C' }),
        ]}
        goalProgresses={[
          { current: 5000, target: 50000, pct: 10, onTrack: false, eta: null },
          { current: 30000, target: 50000, pct: 60, onTrack: true, eta: null },
          { current: 50000, target: 50000, pct: 100, onTrack: true, eta: null },
        ]}
      />,
    )
    expect(screen.getByText('Off-track A')).toBeTruthy()
    expect(screen.queryByText('Op koers B')).toBeNull()
    expect(screen.queryByText('Behaald C')).toBeNull()
  })

  it('sorteert lager pct eerst', () => {
    render(
      <OffTrackDoelenLijst
        goals={[
          mockGoal({ id: 'g1', name: 'Bijna' }),
          mockGoal({ id: 'g2', name: 'Slecht' }),
        ]}
        goalProgresses={[
          { current: 40000, target: 50000, pct: 80, onTrack: false, eta: null },
          { current: 5000, target: 50000, pct: 10, onTrack: false, eta: null },
        ]}
      />,
    )
    const headings = screen.getAllByRole('heading', { level: 3 })
    expect(headings[0]?.textContent).toContain('Slecht')
    expect(headings[1]?.textContent).toContain('Bijna')
  })

  it('toont "Aandacht"-badge bij pct ≥ 50', () => {
    render(
      <OffTrackDoelenLijst
        goals={[mockGoal()]}
        goalProgresses={[
          { current: 30000, target: 50000, pct: 60, onTrack: false, eta: null },
        ]}
      />,
    )
    expect(screen.getByText('Aandacht')).toBeTruthy()
  })

  it('toont "Achter op planning"-badge bij pct < 50', () => {
    render(
      <OffTrackDoelenLijst
        goals={[mockGoal()]}
        goalProgresses={[
          { current: 5000, target: 50000, pct: 10, onTrack: false, eta: null },
        ]}
      />,
    )
    expect(screen.getByText('Achter op planning')).toBeTruthy()
  })

  it('linkt naar /toekomst?tab=doelen', () => {
    const { container } = render(
      <OffTrackDoelenLijst
        goals={[mockGoal()]}
        goalProgresses={[
          { current: 5000, target: 50000, pct: 10, onTrack: false, eta: null },
        ]}
      />,
    )
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) =>
      a.getAttribute('href'),
    )
    expect(hrefs.every((h) => h === '/toekomst?tab=doelen')).toBe(true)
  })

  it('toont aantal off-track-doelen in header', () => {
    const { container } = render(
      <OffTrackDoelenLijst
        goals={[
          mockGoal({ id: 'g1' }),
          mockGoal({ id: 'g2' }),
        ]}
        goalProgresses={[
          { current: 5000, target: 50000, pct: 10, onTrack: false, eta: null },
          { current: 8000, target: 50000, pct: 16, onTrack: false, eta: null },
        ]}
      />,
    )
    // Header-tekst kan worden gesplitst door React-fragments (n + en)
    // Combineer container-textContent in plaats van getByText.
    expect(container.textContent).toMatch(/2 doelen vragen aandacht/i)
  })
})
