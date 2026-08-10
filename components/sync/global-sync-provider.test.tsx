import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ToastProvider } from '@/components/app/toast-provider'
import { GlobalSyncProvider, useGlobalSync } from './global-sync-provider'
import type { BankSyncTarget } from '@/lib/sync/global-sync'

/**
 * Component-tests voor de meldingen die de globale sync-knop per bankkoppeling
 * toont: blauw (overgeslagen) en rood (mislukt). De pure planningsregel zelf is
 * gedekt in lib/sync/global-sync.test.ts — dit bewaakt alleen dat de provider
 * die uitkomst ook daadwerkelijk als toast oplevert.
 *
 * Bewaakt daarnaast dat de knop in de melding dóét wat zijn label zegt. Dat is
 * geen cosmetiek: de blauwe melding zegt "druk hier om zelf te synchroniseren"
 * en moet dan ook synchroniseren, niet ergens naartoe navigeren waar de
 * gebruiker de knop zelf nog moet zoeken. Bij een mislukte sync of een
 * kwijtgeraakte verbinding is navigeren juist wél het antwoord — daar is
 * opnieuw verbinden de handeling, niet nog een poging.
 */

const mockPush = vi.fn()
const mockRefresh = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}))

function Harness({ banks }: { banks: BankSyncTarget[] }) {
  const { triggerGlobalSync } = useGlobalSync()
  return (
    <button onClick={() => void triggerGlobalSync({ exchanges: [], wallets: [], banks })}>
      Sync
    </button>
  )
}

function renderHarness(banks: BankSyncTarget[]) {
  return render(
    <ToastProvider>
      <GlobalSyncProvider>
        <Harness banks={banks} />
      </GlobalSyncProvider>
    </ToastProvider>,
  )
}

const NOW = Date.now()

function skippedBank(): BankSyncTarget {
  return {
    connectionAccountId: 'bca-skip',
    label: 'ING · ···· 1234',
    bankAccountId: 'ba-skip',
    lastSyncedAt: new Date(NOW - 5 * 60 * 1000).toISOString(), // 5 min geleden → binnen het uur
    lastAttemptedAt: null,
    linkBroken: false,
    dailyRequests: 0,
  }
}

function failingBank(): BankSyncTarget {
  return {
    connectionAccountId: 'bca-fail',
    label: 'Rabobank · ···· 5678',
    bankAccountId: 'ba-fail',
    lastSyncedAt: null, // nooit gesynct → gaat mee, en faalt dan op de fetch
    lastAttemptedAt: null,
    linkBroken: false,
    dailyRequests: 0,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  mockPush.mockClear()
  mockRefresh.mockClear()
})

describe('GlobalSyncProvider — meldingen per bankkoppeling', () => {
  it('toont een info-toast waarvan de knop de sync daadwerkelijk uitvoert', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === '/api/holdings/refresh-prices') {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ itemsSynced: 0 }),
        })
      }
      if (url === '/api/bank-connect/sync') {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ new: 2 }),
        })
      }
      return Promise.resolve({ ok: true, status: 200, headers: new Headers(), json: async () => ({}) })
    })
    vi.stubGlobal('fetch', fetchMock)

    renderHarness([skippedBank()])
    fireEvent.click(screen.getByRole('button', { name: 'Sync' }))

    const melding = await screen.findByText(/ING · ···· 1234 niet gesynchroniseerd/i)
    const toast = melding.closest('[data-testid="toast-item"]') as HTMLElement
    expect(toast).toBeTruthy()
    expect(toast.textContent).toMatch(/hooguit één keer per uur automatisch mee/i)

    // De koppeling ging niet mee, dus de sync-route is nog niet aangeroepen.
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/bank-connect/sync')).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Nu synchroniseren' }))

    // De knop synchroniseert zélf — geen omweg via een pagina waar de gebruiker
    // de synchroniseer-knop nog moet zoeken.
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => url === '/api/bank-connect/sync')).toBe(true),
    )
    expect(mockPush).not.toHaveBeenCalled()
    expect(await screen.findByText(/ING · ···· 1234 bijgewerkt/i)).toBeTruthy()
  })

  it('toont een error-toast voor een koppeling die faalt', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/bank-connect/sync') {
          return Promise.resolve({
            ok: false,
            status: 500,
            headers: new Headers(),
            json: async () => ({ error: 'Serverfout' }),
          })
        }
        if (url === '/api/holdings/refresh-prices') {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers(),
            json: async () => ({ itemsSynced: 0 }),
          })
        }
        return Promise.resolve({ ok: true, status: 200, headers: new Headers(), json: async () => ({}) })
      }),
    )

    renderHarness([failingBank()])
    fireEvent.click(screen.getByRole('button', { name: 'Sync' }))

    const melding = await screen.findByText(/Rabobank · ···· 5678 niet gelukt/i)
    const toast = melding.closest('[data-testid="toast-item"]') as HTMLElement
    expect(toast).toBeTruthy()
    expect(toast.getAttribute('role')).toBe('alert')

    // Bij een MISLUKTE sync is navigeren het antwoord, niet nog een poging: de
    // rekening toont de fout én het herstelaanbod, en een tweede poging zou een
    // tik van de dagrem kosten zonder dat er iets veranderd is.
    const actieknop = await screen.findByRole('button', { name: 'Naar de rekening' })
    fireEvent.click(actieknop)
    expect(mockPush).toHaveBeenCalledWith('/core/assets/cash/ba-fail')
  })
})
