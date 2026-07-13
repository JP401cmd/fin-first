import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { VoorkeurBewerkenSheet } from './voorkeur-bewerken-sheet'

const mockUpdate = vi.fn()
const mockRefresh = vi.fn()
const mockGetUser = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      update: vi.fn(() => ({ eq: () => mockUpdate() })),
    }),
    auth: { getUser: mockGetUser },
  }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

beforeEach(() => {
  mockUpdate.mockReset()
  mockUpdate.mockResolvedValue({ error: null })
  mockRefresh.mockReset()
  mockGetUser.mockReset()
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
})

function renderSheet(props: Partial<Parameters<typeof VoorkeurBewerkenSheet>[0]> = {}) {
  return render(
    <VoorkeurBewerkenSheet
      title="Inflatie"
      column="inflation_rate"
      currentValuePct={2.5}
      onClose={() => {}}
      {...props}
    />,
  )
}

describe('VoorkeurBewerkenSheet — render', () => {
  it('rendert dialog met title in heading', () => {
    renderSheet()
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getAllByText('Inflatie').length).toBeGreaterThan(0)
  })

  it('input pre-filled met currentValuePct', () => {
    renderSheet()
    const input = screen.getByRole('spinbutton') as HTMLInputElement
    expect(input.value).toBe('2.5')
  })

  it('toont helperText wanneer aanwezig', () => {
    renderSheet({ helperText: 'NL-default 2.5% per jaar.' })
    expect(screen.getByText(/NL-default 2.5%/i)).toBeTruthy()
  })
})

describe('VoorkeurBewerkenSheet — submit', () => {
  it('persisteert als fractie (5% → 0.05)', async () => {
    const onClose = vi.fn()
    const { container } = renderSheet({
      column: 'expected_return',
      currentValuePct: 6,
      onClose,
    })
    const input = document.querySelector('input[type="number"]')!
    fireEvent.change(input, { target: { value: '5' } })
    fireEvent.submit(document.querySelector('form')!)
    await new Promise((r) => setTimeout(r, 10))
    expect(mockUpdate).toHaveBeenCalled()
    expect(mockRefresh).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('toont fout-melding bij waarde buiten range', async () => {
    const { container } = renderSheet({ minPct: 0, maxPct: 10 })
    const input = document.querySelector('input[type="number"]')!
    fireEvent.change(input, { target: { value: '15' } })
    fireEvent.submit(document.querySelector('form')!)
    expect(screen.getByRole('alert').textContent).toMatch(/tussen 0%/i)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('toont fout bij waarde onder min', async () => {
    const { container } = renderSheet({ minPct: 1, maxPct: 10 })
    const input = document.querySelector('input[type="number"]')!
    fireEvent.change(input, { target: { value: '0' } })
    fireEvent.submit(document.querySelector('form')!)
    expect(screen.getByRole('alert').textContent).toMatch(/tussen 1%/i)
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})

describe('VoorkeurBewerkenSheet — sluiten', () => {
  it('Annuleer-knop roept onClose', () => {
    const onClose = vi.fn()
    renderSheet({ onClose })
    fireEvent.click(screen.getByText('Annuleer'))
    expect(onClose).toHaveBeenCalled()
  })

  it('X-knop roept onClose', () => {
    const onClose = vi.fn()
    renderSheet({ onClose })
    fireEvent.click(screen.getByLabelText('Sluiten'))
    expect(onClose).toHaveBeenCalled()
  })
})
