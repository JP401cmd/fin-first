import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import type { BankSyncTarget } from '@/lib/sync/global-sync'
import { AUTO_SYNC_STALE_MS, autoSyncClaimKey } from '@/lib/sync/auto-sync'
import { AutomatischBijwerken, __resetAutomatischBijwerken } from './automatisch-bijwerken'

/**
 * Bijwerken bij openen (W-018, ADR 0182) — de trigger op /overzicht.
 *
 * Een oude koppeling triggert precies één ronde, een verse niet, een
 * uitgeschakelde schakelaar nooit — en een tweede tabblad binnen het
 * claim-venster evenmin.
 */

const triggerGlobalSync = vi.fn()
const fetchBankSyncTargets = vi.fn()
let quiet = false
let phase: 'idle' | 'syncing' = 'idle'

vi.mock('./global-sync-provider', () => ({
  useGlobalSync: () => ({ state: { phase }, triggerGlobalSync, getBankAttempts: () => ({}) }),
}))
vi.mock('./load-bank-sync-targets', () => ({
  fetchBankSyncTargets: (...args: unknown[]) => fetchBankSyncTargets(...args),
}))
vi.mock('@/lib/hooks/use-attention-quiet', () => ({
  useAttentionQuiet: () => quiet,
}))

const OUD = () => new Date(Date.now() - AUTO_SYNC_STALE_MS - 60_000).toISOString()
const VERS = () => new Date(Date.now() - 60_000).toISOString()

function bank(id: string, lastSyncedAt: string | null): BankSyncTarget {
  return { connectionAccountId: id, label: `Bank ${id}`, bankAccountId: `ba-${id}`, lastSyncedAt }
}

const USER = 'user-1'

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  __resetAutomatischBijwerken()
  window.localStorage.clear()
  quiet = false
  phase = 'idle'
  // Een geslaagde ronde levert een aggregaat; `null` betekent "er liep al een ronde".
  triggerGlobalSync.mockReset().mockResolvedValue({ results: [] })
  fetchBankSyncTargets.mockReset().mockResolvedValue([bank('oud', OUD())])
})

afterEach(() => {
  vi.useRealTimers()
})

async function laatRijpen() {
  await vi.advanceTimersByTimeAsync(4500)
}

describe('AutomatischBijwerken', () => {
  it('werkt een oude bankkoppeling bij — zonder prijsstap en zonder crypto', async () => {
    render(<AutomatischBijwerken enabled userId={USER} brokers={[]} />)
    await laatRijpen()
    await waitFor(() => expect(triggerGlobalSync).toHaveBeenCalledTimes(1))
    const arg = triggerGlobalSync.mock.calls[0][0]
    expect(arg.banks.map((b: BankSyncTarget) => b.connectionAccountId)).toEqual(['oud'])
    expect(arg).toMatchObject({ exchanges: [], wallets: [], brokers: [], includePrices: false })
  })

  it('vuurt niet vóór de wachttijd — de eerste ophaal van ADR 0158 (2 s) gaat voor', async () => {
    render(<AutomatischBijwerken enabled userId={USER} brokers={[]} />)
    await vi.advanceTimersByTimeAsync(2500)
    expect(fetchBankSyncTargets).not.toHaveBeenCalled()
  })

  it('doet niets als de schakelaar uit staat — geen enkel verzoek', async () => {
    render(<AutomatischBijwerken enabled={false} userId={USER} brokers={[]} />)
    await laatRijpen()
    expect(fetchBankSyncTargets).not.toHaveBeenCalled()
    expect(triggerGlobalSync).not.toHaveBeenCalled()
  })

  it('laat verse en nooit-gesynchroniseerde koppelingen met rust', async () => {
    fetchBankSyncTargets.mockResolvedValue([bank('vers', VERS()), bank('nooit', null)])
    render(
      <AutomatischBijwerken
        enabled
        userId={USER}
        brokers={[{ id: 'b', label: 'Trading 212', lastSyncedAt: VERS(), lastSyncError: null }]}
      />,
    )
    await laatRijpen()
    await waitFor(() => expect(fetchBankSyncTargets).toHaveBeenCalled())
    expect(triggerGlobalSync).not.toHaveBeenCalled()
    // Niets te doen = ook geen claim: een ander tabblad wordt niet geblokkeerd.
    expect(window.localStorage.getItem(autoSyncClaimKey(USER))).toBeNull()
  })

  it('neemt een oude broker mee, ook zonder bank', async () => {
    fetchBankSyncTargets.mockResolvedValue([])
    render(
      <AutomatischBijwerken
        enabled
        userId={USER}
        brokers={[{ id: 'bc-1', label: 'Trading 212', lastSyncedAt: OUD(), lastSyncError: null }]}
      />,
    )
    await laatRijpen()
    await waitFor(() => expect(triggerGlobalSync).toHaveBeenCalledTimes(1))
    expect(triggerGlobalSync.mock.calls[0][0].brokers).toEqual([{ id: 'bc-1', label: 'Trading 212' }])
  })

  it('wacht tot het stil is (rondleiding gaat voor)', async () => {
    quiet = true
    render(<AutomatischBijwerken enabled userId={USER} brokers={[]} />)
    await laatRijpen()
    expect(fetchBankSyncTargets).not.toHaveBeenCalled()
  })

  it('een tweede tabblad binnen het claim-venster start geen tweede ronde', async () => {
    const eerste = render(<AutomatischBijwerken enabled userId={USER} brokers={[]} />)
    await laatRijpen()
    await waitFor(() => expect(triggerGlobalSync).toHaveBeenCalledTimes(1))
    eerste.unmount()

    // Een ander tabblad heeft een eigen module-scope, dus alleen de apparaatclaim remt.
    __resetAutomatischBijwerken()
    render(<AutomatischBijwerken enabled userId={USER} brokers={[]} />)
    await laatRijpen()
    await waitFor(() => expect(fetchBankSyncTargets).toHaveBeenCalledTimes(2))
    expect(triggerGlobalSync).toHaveBeenCalledTimes(1)
  })

  it('wacht tot een lopende ronde klaar is', async () => {
    phase = 'syncing'
    render(<AutomatischBijwerken enabled userId={USER} brokers={[]} />)
    await laatRijpen()
    expect(fetchBankSyncTargets).not.toHaveBeenCalled()
  })

  it('kwam de ronde er niet door (null), dan gaan claim en tabblad-rem terug', async () => {
    triggerGlobalSync.mockResolvedValue(null)
    const eerste = render(<AutomatischBijwerken enabled userId={USER} brokers={[]} />)
    await laatRijpen()
    await waitFor(() => expect(triggerGlobalSync).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(window.localStorage.getItem(autoSyncClaimKey(USER))).toBeNull())
    eerste.unmount()

    triggerGlobalSync.mockResolvedValue({ results: [] })
    render(<AutomatischBijwerken enabled userId={USER} brokers={[]} />)
    await laatRijpen()
    await waitFor(() => expect(triggerGlobalSync).toHaveBeenCalledTimes(2))
  })

  it('binnen één tabblad: heen-en-weer navigeren kijkt niet opnieuw', async () => {
    const eerste = render(<AutomatischBijwerken enabled userId={USER} brokers={[]} />)
    await laatRijpen()
    await waitFor(() => expect(triggerGlobalSync).toHaveBeenCalledTimes(1))
    eerste.unmount()
    render(<AutomatischBijwerken enabled userId={USER} brokers={[]} />)
    await laatRijpen()
    expect(fetchBankSyncTargets).toHaveBeenCalledTimes(1)
  })
})
