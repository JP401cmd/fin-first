import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { NetWorthHistorySheet, type HistoryPoint } from './networth-history-sheet'

/**
 * Tests voor NetWorthHistorySheet — het netto-vermogen-verloop-modal.
 *
 * Focus: de bewerk-flow (Taak B). We mocken /api/snapshots/history (GET + POST)
 * en next/navigation's useRouter, en verifiëren dat:
 *  - de server-historie bij openen wordt opgehaald en getoond
 *  - de bewerk-modus de bestaande waardes voor-invult
 *  - opslaan alleen de gewijzigde maanden POST't en daarna re-GET + refresh doet
 */

// ── next/navigation mock ───────────────────────────────────────
const refreshMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn() }),
}))

const realFetch = global.fetch

/**
 * Mock fetch dat per route reageert: GET geeft `getEntries` terug, POST vangt
 * de body op in `postedBodies` en geeft `{ ok: true }`.
 */
function setupFetch(getEntries: { month: string; netWorth: number }[]) {
  const postedBodies: unknown[] = []
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      postedBodies.push(JSON.parse(String(init.body)))
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true, count: 1 }),
      })
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ entries: getEntries }),
    })
  })
  global.fetch = fetchMock as unknown as typeof fetch
  return { fetchMock, postedBodies }
}

const baseHistory: HistoryPoint[] = [
  { month: '2026-04', value: 90000 },
  { month: '2026-05', value: 95000 },
]

beforeEach(() => {
  refreshMock.mockClear()
})
afterEach(() => {
  global.fetch = realFetch
  vi.restoreAllMocks()
})

describe('NetWorthHistorySheet', () => {
  it('toont het huidige netto vermogen en de kassabon-tabel', async () => {
    setupFetch([])
    render(
      <NetWorthHistorySheet
        open
        onClose={() => {}}
        history={baseHistory}
        currentNetWorth={100000}
      />,
    )
    await waitFor(() => expect(screen.getByText('Vandaag')).toBeTruthy())
    // Hoofdbedrag €100.000 zichtbaar.
    expect(screen.getAllByText(/100\.000/).length).toBeGreaterThan(0)
  })

  it('haalt server-historie op bij openen en gebruikt die in de tabel', async () => {
    setupFetch([
      { month: '2026-03', netWorth: 80000 },
      { month: '2026-04', netWorth: 85000 },
    ])
    render(
      <NetWorthHistorySheet
        open
        onClose={() => {}}
        history={baseHistory}
        currentNetWorth={100000}
      />,
    )
    // Server-waarde €80.000 verschijnt zodra de GET klaar is (niet in de prop).
    await waitFor(() => expect(screen.getAllByText(/80\.000/).length).toBeGreaterThan(0))
  })

  it('opent de bewerk-modus voor-ingevuld met bestaande waardes', async () => {
    setupFetch([{ month: '2026-04', netWorth: 85000 }])
    render(
      <NetWorthHistorySheet
        open
        onClose={() => {}}
        history={baseHistory}
        currentNetWorth={100000}
      />,
    )
    await waitFor(() => screen.getByText('Historie bijwerken'))
    fireEvent.click(screen.getByRole('button', { name: 'Historie bijwerken' }))

    // 24 invoervelden + voor-ingevulde bestaande waarde.
    const aprInput = await screen.findByLabelText(/Netto vermogen apr 2026/i)
    expect((aprInput as HTMLInputElement).value).toBe('85000')
  })

  it('POST alleen gewijzigde maanden en doet daarna re-GET + router.refresh', async () => {
    const { fetchMock, postedBodies } = setupFetch([
      { month: '2026-04', netWorth: 85000 },
    ])
    render(
      <NetWorthHistorySheet
        open
        onClose={() => {}}
        history={baseHistory}
        currentNetWorth={100000}
      />,
    )
    await waitFor(() => screen.getByText('Historie bijwerken'))
    fireEvent.click(screen.getByRole('button', { name: 'Historie bijwerken' }))

    const aprInput = await screen.findByLabelText(/Netto vermogen apr 2026/i)
    // Wijzig apr (85000 → 88000) en vul een nieuwe maand mrt in.
    fireEvent.change(aprInput, { target: { value: '88000' } })
    const marInput = screen.getByLabelText(/Netto vermogen mrt 2026/i)
    fireEvent.change(marInput, { target: { value: '70000' } })

    const getCallsBefore = fetchMock.mock.calls.filter(
      (c) => !(c[1] as RequestInit | undefined)?.method,
    ).length

    fireEvent.click(screen.getByRole('button', { name: /Opslaan/ }))

    await waitFor(() => expect(postedBodies.length).toBe(1))

    const body = postedBodies[0] as { entries: { month: string; netWorth: number }[] }
    // Alleen de twee gewijzigde maanden, niet alle 24.
    expect(body.entries).toHaveLength(2)
    const byMonth = Object.fromEntries(body.entries.map((e) => [e.month, e.netWorth]))
    expect(byMonth['2026-04']).toBe(88000)
    expect(byMonth['2026-03']).toBe(70000)

    // Re-GET na opslaan (extra GET-call) + router.refresh.
    await waitFor(() => {
      const getCallsAfter = fetchMock.mock.calls.filter(
        (c) => !(c[1] as RequestInit | undefined)?.method,
      ).length
      expect(getCallsAfter).toBeGreaterThan(getCallsBefore)
    })
    expect(refreshMock).toHaveBeenCalled()
  })

  it('toont een nette foutmelding wanneer opslaan faalt', async () => {
    // GET ok, POST faalt met 400.
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: 'Ongeldige maand' }),
        })
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ entries: [] }),
      })
    })
    global.fetch = fetchMock as unknown as typeof fetch

    render(
      <NetWorthHistorySheet
        open
        onClose={() => {}}
        history={baseHistory}
        currentNetWorth={100000}
      />,
    )
    await waitFor(() => screen.getByText('Historie bijwerken'))
    fireEvent.click(screen.getByRole('button', { name: 'Historie bijwerken' }))

    const marInput = await screen.findByLabelText(/Netto vermogen mrt 2026/i)
    fireEvent.change(marInput, { target: { value: '70000' } })
    fireEvent.click(screen.getByRole('button', { name: /Opslaan/ }))

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText(/Ongeldige maand/)).toBeTruthy()
    // Bewerk-modus blijft open zodat de gebruiker kan corrigeren.
    expect(screen.getByText('Historie bijwerken')).toBeTruthy()
    expect(refreshMock).not.toHaveBeenCalled()
  })
})
