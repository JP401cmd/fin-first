import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { OnttrekkingsBewerkenSheet } from './onttrekkings-bewerken-sheet'

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

describe('OnttrekkingsBewerkenSheet — render', () => {
  it('rendert dialog met de 4 strategie-opties', () => {
    render(
      <OnttrekkingsBewerkenSheet
        currentStrategy="static"
        onClose={() => {}}
      />,
    )
    expect(screen.getByText('Vast (4%)')).toBeTruthy()
    expect(screen.getByText('Guardrails')).toBeTruthy()
    expect(screen.getByText('VPW')).toBeTruthy()
    expect(screen.getByText('Bucket')).toBeTruthy()
  })

  it('current strategy heeft checked radio', () => {
    render(
      <OnttrekkingsBewerkenSheet
        currentStrategy="guardrails"
        onClose={() => {}}
      />,
    )
    const radios = screen.getAllByRole('radio') as HTMLInputElement[]
    const guardrails = radios.find((r) => r.value === 'guardrails')
    expect(guardrails?.checked).toBe(true)
  })

  it('toont beschrijving per strategie', () => {
    render(
      <OnttrekkingsBewerkenSheet
        currentStrategy="static"
        onClose={() => {}}
      />,
    )
    expect(screen.getByText(/Klassiek SWR/i)).toBeTruthy()
    expect(screen.getByText(/Dynamische bandbreedte/i)).toBeTruthy()
    expect(screen.getByText(/stijgt met je leeftijd/i)).toBeTruthy()
    expect(screen.getByText(/Cash-buffer/i)).toBeTruthy()
  })
})

describe('OnttrekkingsBewerkenSheet — submit', () => {
  it('roept update wanneer ander strategy geselecteerd', async () => {
    const onClose = vi.fn()
    const { container } = render(
      <OnttrekkingsBewerkenSheet
        currentStrategy="static"
        onClose={onClose}
      />,
    )
    fireEvent.click(screen.getByText('Guardrails'))
    fireEvent.submit(container.querySelector('form')!)
    await new Promise((r) => setTimeout(r, 10))
    expect(mockUpdate).toHaveBeenCalled()
    expect(mockRefresh).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('skipt update wanneer dezelfde strategy geselecteerd blijft', async () => {
    const onClose = vi.fn()
    const { container } = render(
      <OnttrekkingsBewerkenSheet
        currentStrategy="static"
        onClose={onClose}
      />,
    )
    fireEvent.submit(container.querySelector('form')!)
    await new Promise((r) => setTimeout(r, 10))
    expect(mockUpdate).not.toHaveBeenCalled()
    // Sluit wel direct
    expect(onClose).toHaveBeenCalled()
  })

  it('Annuleer-knop sluit zonder update', () => {
    const onClose = vi.fn()
    render(
      <OnttrekkingsBewerkenSheet
        currentStrategy="static"
        onClose={onClose}
      />,
    )
    fireEvent.click(screen.getByText('Vast (4%)')) // verandert nothing
    fireEvent.click(screen.getByText('Annuleer'))
    expect(onClose).toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})
