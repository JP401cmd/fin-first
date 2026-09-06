import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { TipsLijst, TIP_UNDO_DELAY_MS } from './tips-lijst'
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

// De lokale tips-generator leest de uitvoervoorkeur (`useExecutionMode` →
// /api/ai-execution-prefs) en zou die fetch in ELKE test hieronder meetellen —
// terwijl deze suite over de beslis-flow gaat, niet over lokale AI. Stub 'm dus,
// maar wél met een herkenbare marker zodat de wiring hier aantoonbaar blijft.
// Eigen dekking: components/overview/lokale-tips-generator.test.tsx.
vi.mock('./lokale-tips-generator', () => ({
  LokaleTipsGenerator: () => <div data-testid="lokale-tips-generator" />,
}))

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

beforeEach(() => {
  mockRefresh.mockReset()
  mockOpenWithMessage.mockReset()
  fetchMock.mockReset()
})

// Delayed-commit (E-05) draait op timers; wie fake timers opzet in een test,
// wordt hier weer op echte timers gezet zodat de niet-timer-tests ongemoeid blijven.
afterEach(() => {
  vi.useRealTimers()
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
  it('shows empty state CTA that opens the Fin-chat in-place (geen navigatie)', () => {
    render(<TipsLijst recommendations={[]} />)
    expect(screen.getByText(/Geen tips wachten/i)).toBeInTheDocument()
    // Mag GEEN navigerende link naar /berichten meer zijn — dat verliet de
    // pagina onnodig en daar staan de tips niet.
    expect(screen.queryByRole('link', { name: /Vraag Fin/i })).not.toBeInTheDocument()
    const cta = screen.getByRole('button', { name: /Vraag Fin om tips/i })
    fireEvent.click(cta)
    expect(mockOpenWithMessage).toHaveBeenCalledTimes(1)
    expect(mockOpenWithMessage).toHaveBeenCalledWith(
      expect.stringContaining('Doorlicht mijn financiën'),
    )
  })

  it('biedt de lokale tips-generator aan in BEIDE takken (leeg én met tips)', () => {
    // De generator rendert zichzelf alleen wanneer de groep 'tips' op 'lokaal'
    // staat; TipsLijst moet 'm hoe dan ook aanbieden, anders is de lokale route
    // in één van beide takken onbereikbaar.
    const { unmount } = render(<TipsLijst recommendations={[]} />)
    expect(screen.getByTestId('lokale-tips-generator')).toBeInTheDocument()
    unmount()

    render(<TipsLijst recommendations={[baseRec({ id: 'r1', title: 'Een tip' })]} />)
    expect(screen.getByTestId('lokale-tips-generator')).toBeInTheDocument()
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

  it('accept: verbergt de tip direct maar POST pas ná het undo-venster (E-05)', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValue({ ok: true })
    const onChanged = vi.fn()
    const onAccepted = vi.fn()

    render(
      <ToastProvider>
        <TipsLijst
          recommendations={[baseRec({ id: 'r1', title: 'Click me' })]}
          onChanged={onChanged}
          onAccepted={onAccepted}
        />
      </ToastProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: /Doe nu/i }))

    // Optimistisch: tip meteen weg, maar nog GEEN server-call en geen refresh.
    expect(screen.queryByText('Click me')).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(onChanged).not.toHaveBeenCalled()

    // Undo-venster verloopt → de echte POST volgt.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TIP_UNDO_DELAY_MS + 10)
    })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ai/recommendations/r1',
      expect.objectContaining({ method: 'PATCH' }),
    )
    const call = fetchMock.mock.calls[0][1] as { body: string }
    expect(JSON.parse(call.body)).toEqual({ action: 'accept' })
    // Refresh/callbacks pas ná de echte POST.
    expect(onChanged).toHaveBeenCalled()
    expect(onAccepted).toHaveBeenCalled()
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it('undo binnen het venster annuleert de POST zonder server-call en toont de tip weer (E-05)', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValue({ ok: true })

    render(
      <ToastProvider>
        <TipsLijst recommendations={[baseRec({ id: 'r1', title: 'Click me' })]} />
      </ToastProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: /Negeren/i }))
    // Tip weg + undo-toast verschenen.
    expect(screen.queryByText('Click me')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Ongedaan maken/i }))
    // Tip meteen terug, zonder enige server-call.
    expect(screen.getByText('Click me')).toBeInTheDocument()

    // Ook nadat het venster ruim verstreken is: geen POST — undo was gratis.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TIP_UNDO_DELAY_MS + 1000)
    })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it('sends postponed_until ~14 days ahead on Later (ná het venster)', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValue({ ok: true })

    render(
      <ToastProvider>
        <TipsLijst recommendations={[baseRec({ id: 'r1', title: 'Click me' })]} />
      </ToastProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: /Later/i }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TIP_UNDO_DELAY_MS + 10)
    })

    expect(fetchMock).toHaveBeenCalled()
    const call = fetchMock.mock.calls[0][1] as { body: string }
    const body = JSON.parse(call.body) as { action: string; postponed_until: string }
    expect(body.action).toBe('postpone')
    const ahead = (new Date(body.postponed_until).getTime() - Date.now()) / 86400_000
    expect(ahead).toBeGreaterThan(13.5)
    expect(ahead).toBeLessThan(14.5)
  })

  it('toont een foutmelding en zet de tip terug als het opslaan faalt (E-04)', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValue({ ok: false, status: 500 })

    render(
      <ToastProvider>
        <TipsLijst recommendations={[baseRec({ id: 'r1', title: 'Click me' })]} />
      </ToastProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: /Doe nu/i }))
    // Commit draait pas ná het venster; dán faalt de POST.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TIP_UNDO_DELAY_MS + 10)
    })

    // Foutmelding zichtbaar...
    expect(
      screen.getByText('Je keuze is niet opgeslagen — probeer het opnieuw.'),
    ).toBeInTheDocument()
    // ...en de tip komt terug zodat de gebruiker opnieuw kan klikken.
    expect(screen.getByText('Click me')).toBeInTheDocument()
  })

  it('sends action:reject on Negeren (ná het venster)', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValue({ ok: true })

    render(
      <ToastProvider>
        <TipsLijst recommendations={[baseRec({ id: 'r1', title: 'Click me' })]} />
      </ToastProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: /Negeren/i }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TIP_UNDO_DELAY_MS + 10)
    })

    expect(fetchMock).toHaveBeenCalled()
    const call = fetchMock.mock.calls[0][1] as { body: string }
    expect(JSON.parse(call.body)).toEqual({ action: 'reject' })
  })

  it('flush bij unmount: wegnavigeren vóór het venster voert de POST alsnog direct uit (E-05)', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValue({ ok: true })

    const { unmount } = render(
      <ToastProvider>
        <TipsLijst recommendations={[baseRec({ id: 'r1', title: 'Click me' })]} />
      </ToastProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: /Negeren/i }))
    expect(fetchMock).not.toHaveBeenCalled()

    // Unmount (wegnavigeren) vóór het venster verloopt → pending keuze wordt
    // direct geflusht, dus de keuze gaat niet verloren.
    unmount()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ai/recommendations/r1',
      expect.objectContaining({ method: 'PATCH' }),
    )
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
    expect(cta).toHaveAttribute('href', '/overzicht/budget?budget=streaming')
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
