import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EventBewerkenSheet } from './event-bewerken-sheet'
import type { LifeEvent } from '@/lib/horizon-data'

const mockUpdate = vi.fn()
const mockDelete = vi.fn()
const mockRefresh = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      update: vi.fn(() => ({ eq: () => mockUpdate() })),
      delete: vi.fn(() => ({ eq: () => mockDelete() })),
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

function mockEvent(overrides: Partial<LifeEvent> = {}): LifeEvent {
  return {
    id: 'e1',
    name: 'Tweede kind',
    event_type: 'child',
    target_age: 35,
    target_date: null,
    one_time_cost: 5000,
    monthly_cost_change: 0,
    monthly_income_change: 0,
    duration_months: 0,
    icon: 'child',
    is_active: true,
    sort_order: 0,
    is_indexed: false,
    ...overrides,
  }
}

describe('EventBewerkenSheet — render', () => {
  it('rendert dialog met event-naam in heading', () => {
    render(<EventBewerkenSheet event={mockEvent()} onClose={() => {}} />)
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText('Tweede kind')).toBeTruthy()
  })

  it('input pre-filled met huidige waarden', () => {
    const { container } = render(
      <EventBewerkenSheet event={mockEvent()} onClose={() => {}} />,
    )
    const nameInput = container.querySelector('input[type="text"]') as HTMLInputElement
    expect(nameInput.value).toBe('Tweede kind')
    const numInputs = container.querySelectorAll('input[type="number"]')
    expect((numInputs[0] as HTMLInputElement).value).toBe('35')
    expect((numInputs[1] as HTMLInputElement).value).toBe('5000')
  })
})

describe('EventBewerkenSheet — submit', () => {
  it('roept update bij geldige input', async () => {
    const onClose = vi.fn()
    const { container } = render(
      <EventBewerkenSheet event={mockEvent()} onClose={onClose} />,
    )
    const nameInput = container.querySelector('input[type="text"]')!
    fireEvent.change(nameInput, { target: { value: 'Eerste kind' } })
    fireEvent.submit(container.querySelector('form')!)
    await new Promise((r) => setTimeout(r, 10))
    expect(mockUpdate).toHaveBeenCalled()
    expect(mockRefresh).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('toont fout bij lege naam', () => {
    const { container } = render(
      <EventBewerkenSheet event={mockEvent()} onClose={() => {}} />,
    )
    const nameInput = container.querySelector('input[type="text"]')!
    fireEvent.change(nameInput, { target: { value: '   ' } })
    fireEvent.submit(container.querySelector('form')!)
    expect(screen.getByRole('alert').textContent).toMatch(/Naam is verplicht/i)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('toont fout bij leeftijd buiten range', () => {
    const { container } = render(
      <EventBewerkenSheet event={mockEvent()} onClose={() => {}} />,
    )
    const numInputs = container.querySelectorAll('input[type="number"]')
    fireEvent.change(numInputs[0]!, { target: { value: '10' } })
    fireEvent.submit(container.querySelector('form')!)
    expect(screen.getByRole('alert').textContent).toMatch(/tussen 18 en 120/i)
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})

describe('EventBewerkenSheet — verwijderen', () => {
  it('toont confirm-bevestiging na klik op "Verwijder"', () => {
    render(<EventBewerkenSheet event={mockEvent()} onClose={() => {}} />)
    fireEvent.click(screen.getByText('Verwijder'))
    expect(screen.getByText(/Weet je zeker/i)).toBeTruthy()
    expect(screen.getByText('Ja, verwijder')).toBeTruthy()
  })

  it('roept delete bij confirm', async () => {
    const onClose = vi.fn()
    render(<EventBewerkenSheet event={mockEvent()} onClose={onClose} />)
    fireEvent.click(screen.getByText('Verwijder'))
    fireEvent.click(screen.getByText('Ja, verwijder'))
    await new Promise((r) => setTimeout(r, 10))
    expect(mockDelete).toHaveBeenCalled()
    expect(mockRefresh).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })
})
