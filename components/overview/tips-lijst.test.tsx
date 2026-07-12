import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TipsLijst } from './tips-lijst'
import { ToastProvider } from '@/components/app/toast-provider'
import type { Recommendation } from '@/lib/recommendation-data'

/**
 * Tests voor TipsLijst — toptips bovenaan /overzicht/tips. Verifieert
 * sortering (priority + postponed-ready), filtering (pending +
 * postponed-ready), en de drie-knoppen-flow (Doe nu / Later / Negeren).
 */

const mockRefresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

const mockOpenWithMessage = vi.fn()
vi.mock('@/components/app/chat/chat-provider', () => ({
  useChatContextOptional: () => ({ openWithMessage: mockOpenWithMessage }),
}))

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

beforeEach(() => {
  mockRefresh.mockReset()
  mockOpenWithMessage.mockReset()
  fetchMock.mockReset()
})

const baseRec = (overrides: Partial<Recommendation>): Recommendation =>
  ({
    id: 'r1',
    user_id: 'u1',
    title: 'Default tip',
    description: 'desc',
    recommendation_type: 'budget_optimization',
    euro_impact_monthly: null,
    euro_impact_yearly: null,
    freedom_days_per_year: 5,
    priority_score: 3,
    suggested_actions: [],
    status: 'pending',
    related_budget_slug: null,
    current_value: null,
    proposed_value: null,
    postponed_until: null,
    decided_at: null,
    postpone_feedback: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }) as Recommendation

describe('TipsLijst', () => {
  it('shows empty state CTA that opens the Will-chat in-place (geen navigatie)', () => {
    render(<TipsLijst recommendations={[]} />)
    expect(screen.getByText(/Geen tips wachten/i)).toBeInTheDocument()
    // Mag GEEN navigerende link naar /berichten meer zijn — dat verliet de
    // pagina onnodig en daar staan de tips niet.
    expect(screen.queryByRole('link', { name: /Vraag Will/i })).not.toBeInTheDocument()
    const cta = screen.getByRole('button', { name: /Vraag Will om tips/i })
    fireEvent.click(cta)
    expect(mockOpenWithMessage).toHaveBeenCalledTimes(1)
    expect(mockOpenWithMessage).toHaveBeenCalledWith(
      expect.stringContaining('Doorlicht mijn financiën'),
    )
  })

  it('header "Vraag meer" opent de chat in-place i.p.v. te navigeren', () => {
    render(
      <TipsLijst recommendations={[baseRec({ id: 'r1', title: 'Een tip' })]} />,
    )
    const meer = screen.getByRole('button', { name: /Vraag meer/i })
    fireEvent.click(meer)
    expect(mockOpenWithMessage).toHaveBeenCalledTimes(1)
    expect(mockOpenWithMessage).toHaveBeenCalledWith(
      expect.stringContaining('Doorlicht mijn financiën'),
    )
  })

  it('filters out rejected, accepted, and not-yet-ready postponed recs', () => {
    const future = new Date(Date.now() + 24 * 86400 * 1000).toISOString()
    const past = new Date(Date.now() - 24 * 86400 * 1000).toISOString()

    render(
      <TipsLijst
        recommendations={[
          baseRec({ id: 'pending', title: 'Pending tip', status: 'pending' }),
          baseRec({ id: 'ready', title: 'Ready tip', status: 'postponed', postponed_until: past }),
          baseRec({ id: 'waiting', title: 'Waiting tip', status: 'postponed', postponed_until: future }),
          baseRec({ id: 'rejected', title: 'Rejected tip', status: 'rejected' }),
          baseRec({ id: 'accepted', title: 'Accepted tip', status: 'accepted' }),
        ]}
      />,
    )

    expect(screen.getByText('Pending tip')).toBeInTheDocument()
    expect(screen.getByText('Ready tip')).toBeInTheDocument()
    expect(screen.queryByText('Waiting tip')).not.toBeInTheDocument()
    expect(screen.queryByText('Rejected tip')).not.toBeInTheDocument()
    expect(screen.queryByText('Accepted tip')).not.toBeInTheDocument()
  })

  it('orders by priority_score descending with postponed-ready first', () => {
    const past = new Date(Date.now() - 86400 * 1000).toISOString()
    render(
      <TipsLijst
        recommendations={[
          baseRec({ id: 'low', title: 'Low prio', priority_score: 1 }),
          baseRec({ id: 'high', title: 'High prio', priority_score: 5 }),
          baseRec({ id: 'medium-ready', title: 'Medium ready', priority_score: 3, status: 'postponed', postponed_until: past }),
        ]}
      />,
    )

    const titles = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    // Postponed-ready komt eerst (binnen prio-bucket), daarna prio-desc
    expect(titles).toEqual(['Medium ready', 'High prio', 'Low prio'])
  })

  it('calls PATCH with action:accept and removes the tip on success', async () => {
    fetchMock.mockResolvedValue({ ok: true })
    const onChanged = vi.fn()
    const onAccepted = vi.fn()

    render(
      <TipsLijst
        recommendations={[baseRec({ id: 'r1', title: 'Click me' })]}
        onChanged={onChanged}
        onAccepted={onAccepted}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Doe nu/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/ai/recommendations/r1',
        expect.objectContaining({ method: 'PATCH' }),
      )
    })
    const call = fetchMock.mock.calls[0][1] as { body: string }
    expect(JSON.parse(call.body)).toEqual({ action: 'accept' })

    await waitFor(() => {
      expect(screen.queryByText('Click me')).not.toBeInTheDocument()
    })
    expect(onChanged).toHaveBeenCalled()
    // Bij accept delegeert TipsLijst de refresh aan de parent zodat
    // die ook kan scrollen naar de nieuwe actie.
    expect(onAccepted).toHaveBeenCalled()
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it('sends postponed_until ~14 days ahead on Later', async () => {
    fetchMock.mockResolvedValue({ ok: true })

    render(
      <TipsLijst recommendations={[baseRec({ id: 'r1', title: 'Click me' })]} />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Later/i }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const call = fetchMock.mock.calls[0][1] as { body: string }
    const body = JSON.parse(call.body) as { action: string; postponed_until: string }
    expect(body.action).toBe('postpone')
    const ahead = (new Date(body.postponed_until).getTime() - Date.now()) / 86400_000
    expect(ahead).toBeGreaterThan(13.5)
    expect(ahead).toBeLessThan(14.5)
  })

  it('toont een foutmelding en laat de tip staan als het opslaan faalt (E-04)', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 })

    render(
      <ToastProvider>
        <TipsLijst recommendations={[baseRec({ id: 'r1', title: 'Click me' })]} />
      </ToastProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: /Doe nu/i }))

    // Foutmelding zichtbaar...
    expect(
      await screen.findByText('Je keuze is niet opgeslagen — probeer het opnieuw.'),
    ).toBeInTheDocument()
    // ...en de tip blijft in de lijst zodat de gebruiker opnieuw kan klikken.
    expect(screen.getByText('Click me')).toBeInTheDocument()
  })

  it('sends action:reject on Negeren', async () => {
    fetchMock.mockResolvedValue({ ok: true })

    render(
      <TipsLijst recommendations={[baseRec({ id: 'r1', title: 'Click me' })]} />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Negeren/i }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const call = fetchMock.mock.calls[0][1] as { body: string }
    expect(JSON.parse(call.body)).toEqual({ action: 'reject' })
  })

  it('shows an "Eerder uitgesteld" badge on ready-again postponed tips', () => {
    const past = new Date(Date.now() - 86400 * 1000).toISOString()
    render(
      <TipsLijst
        recommendations={[
          baseRec({ id: 'r1', title: 'Came back', status: 'postponed', postponed_until: past }),
        ]}
      />,
    )
    expect(screen.getByText(/Eerder uitgesteld/i)).toBeInTheDocument()
  })

  it('rendert een deep-link CTA naar de plek van handelen (related veld wint)', () => {
    render(
      <TipsLijst
        recommendations={[
          baseRec({ id: 'r1', title: 'Streaming-tip', related_budget_slug: 'streaming' }),
        ]}
      />,
    )
    const cta = screen.getByRole('link', { name: /Open budget/i })
    expect(cta).toHaveAttribute('href', '/overzicht/cashflow?budget=streaming')
  })

  it('valt terug op een type-gebaseerde deep-link CTA zonder related veld', () => {
    render(
      <TipsLijst
        recommendations={[
          baseRec({
            id: 'r1',
            title: 'Schuld-tip',
            recommendation_type: 'debt_acceleration',
            related_budget_slug: null,
          }),
        ]}
      />,
    )
    const cta = screen.getByRole('link', { name: /Open schulden/i })
    expect(cta).toHaveAttribute('href', '/overzicht/schulden')
  })
})
