/**
 * TeBesprekenSection — het oppervlak van de "te bespreken"-lijst (ADR 0128).
 *
 * Bewaakt: de lege staat noemt de partner; een rij toont melder + notitie;
 * "Intrekken" verschijnt alléén op je eigen vlag; "Besproken" doet een PATCH
 * naar status=resolved en ververst daarna via router.refresh(); een 4xx uit de
 * API landt als leesbare fout op het scherm (geen stille no-op).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PrivacyProvider } from '@/lib/hooks/use-privacy'
import type { TransactionFlagsData } from '@/lib/household/transaction-flags'
import { TeBesprekenSection } from './te-bespreken-section'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

const data: TransactionFlagsData = {
  partnerName: 'Sam',
  resolvedCount: 2,
  open: [
    {
      id: 'f-mine',
      transactionId: 'tx-1',
      status: 'open',
      note: 'hoort dit bij de vakantiepot?',
      createdAt: '2026-09-03T10:00:00Z',
      flaggedByMe: true,
      flaggedByLabel: 'jij',
      transaction: { id: 'tx-1', date: '2026-09-01', amount: -42.5, description: 'Albert Heijn', counterparty_name: 'AH', account_id: 'a' },
    },
    {
      id: 'f-partner',
      transactionId: 'tx-2',
      status: 'open',
      note: null,
      createdAt: '2026-09-02T10:00:00Z',
      flaggedByMe: false,
      flaggedByLabel: 'Sam',
      transaction: { id: 'tx-2', date: '2026-08-30', amount: 1200, description: 'Salaris', counterparty_name: null, account_id: 'a' },
    },
  ],
}

function renderSection(d: TransactionFlagsData, onOpen = vi.fn()) {
  return render(
    <PrivacyProvider>
      <TeBesprekenSection data={d} onOpenTransaction={onOpen} />
    </PrivacyProvider>,
  )
}

beforeEach(() => {
  refresh.mockReset()
  vi.restoreAllMocks()
})

describe('TeBesprekenSection', () => {
  it('lege staat noemt de partner en de weg naar de knop', () => {
    renderSection({ partnerName: 'Sam', open: [], resolvedCount: 0 })
    expect(screen.getByText(/Te bespreken met Sam/)).toBeInTheDocument()
    expect(screen.getByText(/Niets open/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Besproken/ })).not.toBeInTheDocument()
  })

  it('toont per rij melder en notitie; "Intrekken" alleen op de eigen vlag', () => {
    renderSection(data)
    expect(screen.getByText(/gemarkeerd door jij/)).toBeInTheDocument()
    expect(screen.getByText(/gemarkeerd door Sam/)).toBeInTheDocument()
    expect(screen.getByText(/hoort dit bij de vakantiepot\?/)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Besproken/ })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: /intrekken/i })).toHaveLength(1)
    expect(screen.getByText(/2 eerder besproken/)).toBeInTheDocument()
  })

  it('een rij openen geeft het boeking-id door aan het bewerkformulier', () => {
    const onOpen = vi.fn()
    renderSection(data, onOpen)
    fireEvent.click(screen.getByText('Salaris'))
    expect(onOpen).toHaveBeenCalledWith('tx-2')
  })

  it('"Besproken" doet een PATCH naar resolved en ververst daarna', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'f-partner', status: 'resolved' }), { status: 200 }),
    )
    renderSection(data)
    fireEvent.click(screen.getAllByRole('button', { name: /Besproken/ })[1])
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/transaction-flags')
    expect(init?.method).toBe('PATCH')
    expect(JSON.parse(String(init?.body))).toEqual({ id: 'f-partner', status: 'resolved' })
  })

  it('"Intrekken" doet een DELETE op het eigen vlag-id', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    )
    renderSection(data)
    fireEvent.click(screen.getByRole('button', { name: /intrekken/i }))
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/transaction-flags?id=f-mine')
    expect(init?.method).toBe('DELETE')
  })

  it('toont de foutmelding uit de envelope en ververst dan NIET', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'Deze vlag kun je niet wijzigen.' }), { status: 403 }),
    )
    renderSection(data)
    fireEvent.click(screen.getAllByRole('button', { name: /Besproken/ })[0])
    expect(await screen.findByRole('alert')).toHaveTextContent('Deze vlag kun je niet wijzigen.')
    expect(refresh).not.toHaveBeenCalled()
  })
})
