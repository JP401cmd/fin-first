import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TipsLijst } from './tips-lijst'
import type { Recommendation } from '@/lib/recommendation-data'

const mockUpdate = vi.fn()
const mockRefresh = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      update: vi.fn(() => ({ eq: () => mockUpdate() })),
    }),
  }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

beforeEach(() => {
  mockUpdate.mockReset()
  mockUpdate.mockResolvedValue({ error: null })
  mockRefresh.mockReset()
})

function makeRec(
  id: string,
  overrides: Partial<Recommendation> = {},
): Recommendation {
  return {
    id,
    title: `Tip ${id}`,
    description: `Beschrijving ${id}`,
    recommendation_type: 'savings_boost',
    status: 'pending',
    freedom_days_per_year: 5,
    priority_score: 50,
    ...overrides,
  } as unknown as Recommendation
}

describe('TipsLijst — render', () => {
  it('toont empty-state bij geen pending tips', () => {
    render(<TipsLijst recommendations={[]} />)
    expect(screen.getByText(/Geen openstaande tips/i)).toBeTruthy()
  })

  it('verbergt non-pending tips uit lijst', () => {
    render(
      <TipsLijst
        recommendations={[
          makeRec('1', { status: 'accepted' }),
          makeRec('2', { status: 'rejected' }),
        ]}
      />,
    )
    expect(screen.getByText(/Geen openstaande tips/i)).toBeTruthy()
  })

  it('rendert pending tips als prioriteerbare lijst', () => {
    render(
      <TipsLijst
        recommendations={[
          makeRec('1', { title: 'Sparen verhogen' }),
          makeRec('2', { title: 'Schuld aflossen' }),
        ]}
      />,
    )
    expect(screen.getByText('Sparen verhogen')).toBeTruthy()
    expect(screen.getByText('Schuld aflossen')).toBeTruthy()
  })

  it('eerste tip krijgt "Top tip deze week"-label', () => {
    render(<TipsLijst recommendations={[makeRec('1')]} />)
    expect(screen.getByText(/Top tip deze week/i)).toBeTruthy()
  })

  it('toont 3 actie-knoppen per tip: Doe nu / Later / Negeren', () => {
    render(<TipsLijst recommendations={[makeRec('1')]} />)
    expect(screen.getByText('Doe nu')).toBeTruthy()
    expect(screen.getByText('Later')).toBeTruthy()
    expect(screen.getByText('Negeren')).toBeTruthy()
  })

  it('toont hefboom-tag bij elke tip (plan T-3)', () => {
    render(
      <TipsLijst
        recommendations={[
          makeRec('1', { recommendation_type: 'debt_acceleration' }),
          makeRec('2', { recommendation_type: 'asset_reallocation' }),
          makeRec('3', { recommendation_type: 'savings_boost' }),
        ]}
      />,
    )
    expect(screen.getAllByTestId('hefboom-tag').length).toBe(3)
    expect(screen.getByText('Schulden')).toBeTruthy()
    expect(screen.getByText('Bezittingen')).toBeTruthy()
    expect(screen.getByText('Cashflow')).toBeTruthy()
  })

  it('toont vrijheidsdagen-badge bij positieve impact', () => {
    render(
      <TipsLijst
        recommendations={[
          makeRec('1', { freedom_days_per_year: 12 }),
        ]}
      />,
    )
    expect(screen.getByText(/\+12 dagen vrijheid\/jr/i)).toBeTruthy()
  })
})

describe('TipsLijst — acties', () => {
  it('klik op "Doe nu" roept supabase.update met accepted-status', async () => {
    render(<TipsLijst recommendations={[makeRec('1')]} />)
    fireEvent.click(screen.getByText('Doe nu'))
    await new Promise((r) => setTimeout(r, 10))
    expect(mockUpdate).toHaveBeenCalled()
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('tip wordt direct verborgen na actie (optimistic UI)', async () => {
    render(
      <TipsLijst
        recommendations={[
          makeRec('1', { title: 'Tip A' }),
          makeRec('2', { title: 'Tip B' }),
        ]}
      />,
    )
    fireEvent.click(screen.getAllByText('Negeren')[0]!)
    // Tip A verbergt direct (optimistic)
    expect(screen.queryByText('Tip A')).toBeNull()
    expect(screen.getByText('Tip B')).toBeTruthy()
  })

  it('toont error-banner bij Supabase-fout + rolt optimistic terug', async () => {
    mockUpdate.mockResolvedValueOnce({ error: { message: 'RLS denied' } })
    render(<TipsLijst recommendations={[makeRec('1', { title: 'Tip A' })]} />)
    fireEvent.click(screen.getByText('Later'))
    await new Promise((r) => setTimeout(r, 10))
    expect(screen.getByRole('alert').textContent).toMatch(/RLS denied/)
    // Tip is rolled back
    expect(screen.getByText('Tip A')).toBeTruthy()
  })
})
