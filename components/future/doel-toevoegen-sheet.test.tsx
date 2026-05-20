import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DoelToevoegenSheet } from './doel-toevoegen-sheet'

/**
 * Tests voor DoelToevoegenSheet — modal-flow voor nieuwe doel-insert.
 * Supabase + router worden gemockt.
 */

const mockInsert = vi.fn()
const mockRefresh = vi.fn()
const mockGetUser = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({ insert: mockInsert }),
    auth: { getUser: mockGetUser },
  }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

beforeEach(() => {
  mockInsert.mockReset()
  mockInsert.mockResolvedValue({ error: null })
  mockRefresh.mockReset()
  mockGetUser.mockReset()
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
})

describe('DoelToevoegenSheet — UI-flow', () => {
  it('opent sheet bij klik op "Doel toevoegen"', () => {
    render(<DoelToevoegenSheet />)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByText('Doel toevoegen'))
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('sluit sheet bij X-knop', () => {
    render(<DoelToevoegenSheet />)
    fireEvent.click(screen.getByText('Doel toevoegen'))
    fireEvent.click(screen.getByLabelText('Sluiten'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('rendert verplichte velden + type-select', () => {
    render(<DoelToevoegenSheet />)
    fireEvent.click(screen.getByText('Doel toevoegen'))
    expect(screen.getByText('Naam')).toBeTruthy()
    expect(screen.getByText('Doelbedrag (€)')).toBeTruthy()
    expect(screen.getByText(/Streefdatum/i)).toBeTruthy()
    expect(screen.getByText('Type')).toBeTruthy()
  })
})

describe('DoelToevoegenSheet — validation', () => {
  it('toont fout-melding bij lege naam', async () => {
    render(<DoelToevoegenSheet />)
    fireEvent.click(screen.getByText('Doel toevoegen'))
    fireEvent.submit(screen.getByRole('dialog').querySelector('form')!)
    expect(screen.getByRole('alert').textContent).toMatch(/Naam is verplicht/i)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('toont fout-melding bij negatief doelbedrag', async () => {
    render(<DoelToevoegenSheet />)
    fireEvent.click(screen.getByText('Doel toevoegen'))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(dialog.querySelector('input[type="text"]')!, {
      target: { value: 'Test-doel' },
    })
    fireEvent.change(dialog.querySelector('input[type="number"]')!, {
      target: { value: '-100' },
    })
    fireEvent.submit(dialog.querySelector('form')!)
    expect(screen.getByRole('alert').textContent).toMatch(/positief getal/i)
    expect(mockInsert).not.toHaveBeenCalled()
  })
})

describe('DoelToevoegenSheet — insert-flow', () => {
  it('roept supabase.insert met juiste payload', async () => {
    render(<DoelToevoegenSheet />)
    fireEvent.click(screen.getByText('Doel toevoegen'))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(dialog.querySelector('input[type="text"]')!, {
      target: { value: 'Spaargeld voor woning' },
    })
    fireEvent.change(dialog.querySelector('input[type="number"]')!, {
      target: { value: '50000' },
    })
    fireEvent.change(dialog.querySelector('input[type="date"]')!, {
      target: { value: '2027-12-31' },
    })
    fireEvent.submit(dialog.querySelector('form')!)
    await new Promise((r) => setTimeout(r, 10))
    expect(mockInsert).toHaveBeenCalledTimes(1)
    const payload = mockInsert.mock.calls[0]?.[0]
    expect(payload.name).toBe('Spaargeld voor woning')
    expect(payload.target_value).toBe(50000)
    expect(payload.target_date).toBe('2027-12-31')
    expect(payload.goal_type).toBe('savings')
    expect(payload.current_value).toBe(0)
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('toont fout-melding bij Supabase-fout', async () => {
    mockInsert.mockResolvedValueOnce({ error: { message: 'RLS denied' } })
    render(<DoelToevoegenSheet />)
    fireEvent.click(screen.getByText('Doel toevoegen'))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(dialog.querySelector('input[type="text"]')!, {
      target: { value: 'Test' },
    })
    fireEvent.change(dialog.querySelector('input[type="number"]')!, {
      target: { value: '1000' },
    })
    fireEvent.submit(dialog.querySelector('form')!)
    await new Promise((r) => setTimeout(r, 10))
    expect(screen.getByRole('alert').textContent).toMatch(/RLS denied/)
  })
})

describe('DoelToevoegenSheet — presets', () => {
  it('toont 3 preset-buttons (Noodfonds / Schuldvrij / Vrijheidsgetal)', () => {
    render(<DoelToevoegenSheet />)
    fireEvent.click(screen.getByText('Doel toevoegen'))
    expect(screen.getByText('Noodfonds')).toBeTruthy()
    expect(screen.getByText('Schuldvrij')).toBeTruthy()
    expect(screen.getByText('Vrijheidsgetal')).toBeTruthy()
  })

  it('klik op Noodfonds-preset vult naam + bedrag in', () => {
    render(<DoelToevoegenSheet />)
    fireEvent.click(screen.getByText('Doel toevoegen'))
    fireEvent.click(screen.getByText('Noodfonds'))
    const dialog = screen.getByRole('dialog')
    const nameInput = dialog.querySelector('input[type="text"]') as HTMLInputElement
    const targetInput = dialog.querySelector('input[type="number"]') as HTMLInputElement
    expect(nameInput.value).toBe('Noodfonds')
    expect(targetInput.value).toBe('5000')
  })

  it('klik op Schuldvrij-preset zet goalType naar debt', () => {
    render(<DoelToevoegenSheet />)
    fireEvent.click(screen.getByText('Doel toevoegen'))
    fireEvent.click(screen.getByText('Schuldvrij'))
    const dialog = screen.getByRole('dialog')
    const select = dialog.querySelector('select') as HTMLSelectElement
    expect(select.value).toBe('debt')
  })
})
