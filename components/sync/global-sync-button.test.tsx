import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ToastProvider } from '@/components/app/toast-provider'
import { GlobalSyncProvider } from './global-sync-provider'
import { GlobalSyncButton } from './global-sync-button'

/**
 * De voortgangsteller onder de sync-knop telt BRONNEN, en een bron is elke job
 * die de ronde daadwerkelijk uitvoert — de prijzenverversing dus net zo goed als
 * een exchange- of bankkoppeling.
 *
 * Dat is de enige definitie in de app: de eindmelding ("2 van 2 bronnen") telt
 * al zo. Toen deze teller nog los daarvan de prijzenstap oversloeg, sprak één
 * ronde zichzelf tegen — de melding zei "2 van 2" terwijl de teller er 1 zag en
 * zichzelf daarom helemaal verborg (waargenomen 10 aug 2026: een gebruiker met
 * één crypto-koppeling, prijzen en een overgeslagen bankrekening zag "0/2" en
 * daarna niets meer).
 *
 * Een OVERGESLAGEN bankkoppeling is bewust géén bron: die doet geen verzoek. Ze
 * heeft haar eigen melding.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

/** Belofte die we met de hand oplossen, zodat we de ronde halverwege kunnen bekijken. */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, headers: new Headers(), json: async () => body }
}

const EXCHANGE = {
  id: 'exch-1',
  exchange: 'bitvavo' as const,
  label: null,
  apiKeyLast4: '1234',
  lastSyncedAt: null,
  lastSyncError: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  linkedAssetId: 'asset-1',
  linkedAssetName: 'Crypto',
  linkedAssetType: 'crypto',
}

/** Eén bankkoppeling die 5 minuten geleden synchroniseerde → valt binnen de uur-rem. */
const RECENTLY_SYNCED_BANK = {
  id: 'bca-1',
  account_name: 'Betaalrekening',
  iban_tail: '0596',
  provider_name: 'Rabobank',
  provider_logo: null,
  provider_id: 'ob-rabobank',
  health: {
    state: 'linked' as const,
    expiringSoon: false,
    daysUntilExpiry: 80,
    lastSyncedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  },
  bank_account_id: 'ba-1',
  carrier_name: 'Rabobank betaalrekening',
  carrier_iban_tail: '0596',
  last_synced_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  daily_requests: 1,
  rate_limit_reset_date: null,
  balance_change: null,
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('GlobalSyncButton — voortgangsteller telt bronnen', () => {
  it('telt de prijzenstap mee en blijft zichtbaar als de bank wordt overgeslagen', async () => {
    const exchangeSync = deferred<unknown>()
    const pricesSync = deferred<unknown>()

    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/integrations/connections') {
          return Promise.resolve(jsonResponse({ exchanges: [EXCHANGE], wallets: [], recentSyncs: [] }))
        }
        if (url === '/api/bank-connect/linked-accounts') {
          return Promise.resolve(jsonResponse({ accounts: [RECENTLY_SYNCED_BANK] }))
        }
        if (url === '/api/integrations/exchanges/exch-1/sync') return exchangeSync.promise
        if (url === '/api/holdings/refresh-prices') return pricesSync.promise
        return Promise.resolve(jsonResponse({}))
      }),
    )

    render(
      <ToastProvider>
        <GlobalSyncProvider>
          <GlobalSyncButton onOpenReport={() => {}} />
        </GlobalSyncProvider>
      </ToastProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Synchroniseer alle koppelingen' }))

    // Twee bronnen doen een verzoek: de crypto-koppeling en de prijzen. De
    // bankkoppeling is overgeslagen (uur-rem) en telt dus niet mee.
    expect(await screen.findByText('0/2')).toBeTruthy()

    exchangeSync.resolve(jsonResponse({ itemsSynced: 3 }))
    expect(await screen.findByText('1/2')).toBeTruthy()

    pricesSync.resolve(jsonResponse({ itemsSynced: 21 }))
    await waitFor(() => expect(screen.queryByText('1/2')).toBeNull())
  })
})
