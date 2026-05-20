import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EindstrategieBewerkenSheet } from './eindstrategie-bewerken-sheet'

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

describe('EindstrategieBewerkenSheet — render', () => {
  it('rendert de 4 strategie-opties uit STRATEGY_LABELS', () => {
    render(
      <EindstrategieBewerkenSheet
        currentStrategy="deplete"
        onClose={() => {}}
      />,
    )
    expect(screen.getByText('Vermogen opeten')).toBeTruthy()
    expect(screen.getByText('Nalatenschap')).toBeTruthy()
    expect(screen.getByText('Eeuwigdurend')).toBeTruthy()
    expect(screen.getByText('Pensioenleeftijd')).toBeTruthy()
  })

  it('current strategy heeft checked radio', () => {
    render(
      <EindstrategieBewerkenSheet
        currentStrategy="legacy"
        onClose={() => {}}
      />,
    )
    const radios = screen.getAllByRole('radio') as HTMLInputElement[]
    const legacy = radios.find((r) => r.value === 'legacy')
    expect(legacy?.checked).toBe(true)
  })

  it('toont subtitle per strategie', () => {
    render(
      <EindstrategieBewerkenSheet
        currentStrategy="deplete"
        onClose={() => {}}
      />,
    )
    expect(screen.getByText(/Vermogen volledig opgemaakt/i)).toBeTruthy()
    expect(screen.getByText(/Koopkracht blijft intact/i)).toBeTruthy()
  })
})

describe('EindstrategieBewerkenSheet — submit', () => {
  it('roept update wanneer andere strategie geselecteerd', async () => {
    const onClose = vi.fn()
    const { container } = render(
      <EindstrategieBewerkenSheet
        currentStrategy="deplete"
        onClose={onClose}
      />,
    )
    fireEvent.click(screen.getByText('Eeuwigdurend'))
    fireEvent.submit(container.querySelector('form')!)
    await new Promise((r) => setTimeout(r, 10))
    expect(mockUpdate).toHaveBeenCalled()
    expect(mockRefresh).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('skipt update wanneer gelijk', async () => {
    const onClose = vi.fn()
    const { container } = render(
      <EindstrategieBewerkenSheet
        currentStrategy="deplete"
        onClose={onClose}
      />,
    )
    fireEvent.submit(container.querySelector('form')!)
    await new Promise((r) => setTimeout(r, 10))
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('toont Supabase-fout-banner', async () => {
    mockUpdate.mockResolvedValueOnce({ error: { message: 'RLS denied' } })
    const { container } = render(
      <EindstrategieBewerkenSheet
        currentStrategy="deplete"
        onClose={() => {}}
      />,
    )
    fireEvent.click(screen.getByText('Pensioenleeftijd'))
    fireEvent.submit(container.querySelector('form')!)
    await new Promise((r) => setTimeout(r, 10))
    expect(screen.getByRole('alert').textContent).toMatch(/RLS denied/)
  })
})
