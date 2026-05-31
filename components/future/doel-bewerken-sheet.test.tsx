import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DoelBewerkenSheet } from './doel-bewerken-sheet'
import type { Goal, GoalType } from '@/lib/goal-data'

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'g1',
    user_id: 'u1',
    name: 'Spaargeld voor woning',
    description: null,
    goal_type: 'savings' as GoalType,
    target_value: 50000,
    current_value: 20000,
    target_date: null,
    linked_asset_id: null,
    linked_debt_id: null,
    icon: 'Target',
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

/**
 * Tests voor DoelBewerkenSheet — voortgang updaten + verwijderen.
 * Supabase + router worden gemockt. Test isolatie via .eq()-chaining
 * mock zodat .update().eq() en .delete().eq() beide werken.
 */

const mockUpdate = vi.fn()
const mockDelete = vi.fn()
const mockRefresh = vi.fn()

function mockEq(fn: ReturnType<typeof vi.fn>) {
  return () => fn()
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      update: vi.fn(() => ({ eq: mockEq(mockUpdate) })),
      delete: vi.fn(() => ({ eq: mockEq(mockDelete) })),
    }),
  }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

beforeEach(() => {
  mockUpdate.mockReset()
  mockUpdate.mockResolvedValue({ error: null })
  mockDelete.mockReset()
  mockDelete.mockResolvedValue({ error: null })
  mockRefresh.mockReset()
})

function renderSheet(
  onClose = () => {},
  opts: { goalType?: GoalType } = {},
) {
  const goal = makeGoal({ goal_type: opts.goalType ?? ('savings' as GoalType) })
  return render(<DoelBewerkenSheet goal={goal} onClose={onClose} />)
}

describe('DoelBewerkenSheet — render', () => {
  it('rendert dialog met goalName in heading', () => {
    renderSheet()
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText('Spaargeld voor woning')).toBeTruthy()
  })

  it('input is pre-filled met currentValue', () => {
    renderSheet()
    const input = screen.getByRole('spinbutton') as HTMLInputElement
    expect(input.value).toBe('20000')
  })

  it('toont voortgangs-percentage 40% (20k van 50k)', () => {
    renderSheet()
    expect(screen.getByText('40%')).toBeTruthy()
  })

  it('progressbar aria-valuenow update bij input-change', () => {
    const { container } = renderSheet()
    const input = container.querySelector('input[type="number"]')!
    fireEvent.change(input, { target: { value: '30000' } })
    // 30k van 50k = 60%
    const bar = container.querySelector('[role="progressbar"]')
    expect(bar?.getAttribute('aria-valuenow')).toBe('60')
  })
})

describe('DoelBewerkenSheet — bijdrage-monitor', () => {
  it('toont "Nog geen wijziging" bij ongewijzigde waarde', () => {
    renderSheet()
    const monitor = screen.getByTestId('bijdrage-monitor')
    expect(monitor.textContent).toMatch(/Nog geen wijziging/)
  })

  it('toont Will-suggesties-blok voor savings-doel', () => {
    renderSheet(() => {}, { goalType: 'savings' })
    const block = screen.getByTestId('will-suggesties')
    expect(block).toBeTruthy()
    expect(block.textContent).toMatch(/Will-suggesties/i)
  })

  it('toont 2 suggestie-items per default', () => {
    // 'wealth' was de legacy-key; in GoalType heet hij 'net_worth' →
    // suggesties komen via getGoalSuggestions die ook GoalKind-mapping
    // verzorgt. We forceren een GoalKind via cast.
    renderSheet(() => {}, { goalType: 'wealth' as unknown as GoalType })
    const block = screen.getByTestId('will-suggesties')
    const items = block.querySelectorAll('li')
    expect(items.length).toBe(2)
  })

  it('verbergt Will-suggesties-blok bij goal_type zonder suggesties', () => {
    // 'custom' heeft geen suggestion-set in lib/goal-suggestions.ts.
    renderSheet(() => {}, { goalType: 'custom' as GoalType })
    expect(screen.queryByTestId('will-suggesties')).toBeNull()
  })

  it('toont +bedrag en +pp delta bij verhoging', () => {
    const { container } = renderSheet()
    const input = container.querySelector('input[type="number"]')!
    fireEvent.change(input, { target: { value: '25000' } })
    const monitor = screen.getByTestId('bijdrage-monitor')
    // +5000, +10 pp (van 40% naar 50%)
    expect(monitor.textContent).toMatch(/\+/)
    expect(monitor.textContent).toMatch(/5\.000/)
    expect(monitor.textContent).toMatch(/10 pp/)
  })

  it('toont −bedrag en −pp delta bij verlaging', () => {
    const { container } = renderSheet()
    const input = container.querySelector('input[type="number"]')!
    fireEvent.change(input, { target: { value: '15000' } })
    const monitor = screen.getByTestId('bijdrage-monitor')
    expect(monitor.textContent).toMatch(/−/)
    expect(monitor.textContent).toMatch(/5\.000/)
    expect(monitor.textContent).toMatch(/10 pp/)
  })
})

describe('DoelBewerkenSheet — doel-behaald-celebratie', () => {
  it('toont geen banner bij waarde < target', () => {
    renderSheet()
    expect(screen.queryByTestId('doel-behaald')).toBeNull()
  })

  it('toont banner zodra waarde = target', () => {
    const { container } = renderSheet()
    const input = container.querySelector('input[type="number"]')!
    fireEvent.change(input, { target: { value: '50000' } })
    expect(screen.getByTestId('doel-behaald').textContent).toMatch(
      /Doel behaald/i,
    )
  })

  it('toont banner ook bij waarde > target', () => {
    const { container } = renderSheet()
    const input = container.querySelector('input[type="number"]')!
    fireEvent.change(input, { target: { value: '60000' } })
    expect(screen.getByTestId('doel-behaald')).toBeTruthy()
  })

  it('submit markeert is_completed=true bij target bereikt', async () => {
    const onClose = vi.fn()
    const { container } = renderSheet(onClose)
    const input = container.querySelector('input[type="number"]')!
    fireEvent.change(input, { target: { value: '50000' } })
    fireEvent.submit(container.querySelector('form')!)
    await new Promise((r) => setTimeout(r, 10))
    expect(mockUpdate).toHaveBeenCalled()
  })
})

describe('DoelBewerkenSheet — submit', () => {
  it('roept supabase.update met current_value', async () => {
    const onClose = vi.fn()
    const { container } = renderSheet(onClose)
    const input = container.querySelector('input[type="number"]')!
    fireEvent.change(input, { target: { value: '35000' } })
    fireEvent.submit(container.querySelector('form')!)
    await new Promise((r) => setTimeout(r, 10))
    expect(mockUpdate).toHaveBeenCalled()
    expect(mockRefresh).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('toont fout-melding bij negatieve waarde', async () => {
    const { container } = renderSheet()
    const input = container.querySelector('input[type="number"]')!
    fireEvent.change(input, { target: { value: '-100' } })
    fireEvent.submit(container.querySelector('form')!)
    expect(screen.getByRole('alert').textContent).toMatch(/getal ≥ 0/i)
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})

describe('DoelBewerkenSheet — verwijderen', () => {
  it('toont confirm-bevestiging na klik op "Verwijder doel"', () => {
    renderSheet()
    fireEvent.click(screen.getByText('Verwijder doel'))
    expect(screen.getByText(/Weet je zeker/i)).toBeTruthy()
    expect(screen.getByText('Ja, verwijder')).toBeTruthy()
  })

  it('annuleer-knop in confirm sluit alleen confirm, niet sheet', () => {
    renderSheet()
    fireEvent.click(screen.getByText('Verwijder doel'))
    expect(screen.getByText(/Weet je zeker/i)).toBeTruthy()
    // Eerste Annuleer-knop is van confirm-blok
    const annuleerKnoppen = screen.getAllByText('Annuleer')
    fireEvent.click(annuleerKnoppen[0]!)
    expect(screen.queryByText(/Weet je zeker/i)).toBeNull()
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('roept supabase.delete bij confirm', async () => {
    const onClose = vi.fn()
    renderSheet(onClose)
    fireEvent.click(screen.getByText('Verwijder doel'))
    fireEvent.click(screen.getByText('Ja, verwijder'))
    await new Promise((r) => setTimeout(r, 10))
    expect(mockDelete).toHaveBeenCalled()
    expect(mockRefresh).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })
})
