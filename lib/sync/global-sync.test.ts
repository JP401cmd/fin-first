import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  planBankSyncs,
  buildSyncJobs,
  bankManualHref,
  runGlobalSync,
  BANK_AUTO_SYNC_INTERVAL_MS,
  BANK_AUTO_SYNC_HEADROOM,
  type BankSyncTarget,
  type SyncJob,
} from './global-sync'
import { BANK_DAILY_REQUEST_LIMIT } from '@/lib/bank-connection-status'
import type { ExchangeConnectionRow, WalletAddressRow } from '@/lib/connections-data'

/**
 * Tests voor de bankstap op de globale sync-knop
 * (lib/sync/global-sync.ts — planBankSyncs/buildSyncJobs/runOne).
 *
 * Zwaartepunt op de pure, tijd-injecteerbare regel: de uur-rem, de
 * voorrangsvolgorde tussen de drie overslaan-redenen, en de regressie-eis dat
 * een aanroeper zonder `banks` exact het oude gedrag behoudt.
 */

const HOUR = BANK_AUTO_SYNC_INTERVAL_MS
const NOW = new Date('2026-08-10T12:00:00.000Z').getTime()

function makeBank(overrides: Partial<BankSyncTarget> = {}): BankSyncTarget {
  return {
    connectionAccountId: 'bca-1',
    label: 'ING · ···· 1234',
    bankAccountId: 'ba-1',
    lastSyncedAt: null,
    lastAttemptedAt: null,
    linkBroken: false,
    dailyRequests: 0,
    ...overrides,
  }
}

describe('planBankSyncs — uur-rem', () => {
  it('slaat een koppeling over die 59 minuten geleden is gesynchroniseerd', () => {
    const lastSyncedAt = new Date(NOW - 59 * 60 * 1000).toISOString()
    const { jobs, skipped } = planBankSyncs([makeBank({ lastSyncedAt })], NOW)

    expect(jobs).toEqual([])
    expect(skipped).toHaveLength(1)
    expect(skipped[0].reason).toBe('recent')
    expect(skipped[0].nextEligibleAt).toBe(new Date(new Date(lastSyncedAt).getTime() + HOUR).toISOString())
  })

  it('neemt een koppeling mee die 61 minuten geleden is gesynchroniseerd', () => {
    const lastSyncedAt = new Date(NOW - 61 * 60 * 1000).toISOString()
    const { jobs, skipped } = planBankSyncs([makeBank({ lastSyncedAt })], NOW)

    expect(skipped).toEqual([])
    expect(jobs).toHaveLength(1)
    expect(jobs[0].id).toBe('bca-1')
  })

  it('zit exact op de grens (elapsed === interval): telt als toegestaan, niet als "recent"', () => {
    // De code toetst `elapsed < BANK_AUTO_SYNC_INTERVAL_MS`; op exact de grens
    // is elapsed niet kleiner dan het interval, dus gaat de koppeling mee.
    const lastSyncedAt = new Date(NOW - HOUR).toISOString()
    const { jobs, skipped } = planBankSyncs([makeBank({ lastSyncedAt })], NOW)

    expect(skipped).toEqual([])
    expect(jobs).toHaveLength(1)
  })

  it('net binnen de grens (1ms te vroeg) wordt nog overgeslagen', () => {
    const lastSyncedAt = new Date(NOW - HOUR + 1).toISOString()
    const { jobs, skipped } = planBankSyncs([makeBank({ lastSyncedAt })], NOW)

    expect(jobs).toEqual([])
    expect(skipped[0].reason).toBe('recent')
  })
})

describe('planBankSyncs — nooit gesynct', () => {
  it('neemt een koppeling zonder lastSyncedAt en zonder attempt mee', () => {
    const { jobs, skipped } = planBankSyncs(
      [makeBank({ lastSyncedAt: null, lastAttemptedAt: null })],
      NOW,
    )

    expect(skipped).toEqual([])
    expect(jobs).toHaveLength(1)
  })
})

describe('planBankSyncs — lastAttemptedAt telt mee', () => {
  it('slaat over als lastSyncedAt van gisteren is maar lastAttemptedAt 5 minuten geleden', () => {
    const lastSyncedAt = new Date(NOW - 24 * 60 * 60 * 1000).toISOString()
    const lastAttemptedAt = new Date(NOW - 5 * 60 * 1000).toISOString()
    const { jobs, skipped } = planBankSyncs(
      [makeBank({ lastSyncedAt, lastAttemptedAt })],
      NOW,
    )

    expect(jobs).toEqual([])
    expect(skipped[0].reason).toBe('recent')
    // De klok gaat uit vanaf het meest recente stempel (de attempt), niet de sync.
    expect(skipped[0].nextEligibleAt).toBe(
      new Date(new Date(lastAttemptedAt).getTime() + HOUR).toISOString(),
    )
  })
})

describe('planBankSyncs — voorrangsvolgorde', () => {
  it('linkBroken wint van de dagrem', () => {
    const { jobs, skipped } = planBankSyncs(
      [makeBank({ linkBroken: true, dailyRequests: 10 })],
      NOW,
    )

    expect(jobs).toEqual([])
    expect(skipped[0].reason).toBe('link-broken')
  })

  it('de dagrem wint van de uur-rem', () => {
    // Binnen het uur EN op de daglimiet: het antwoord is de dagrem, niet 'recent'.
    const lastSyncedAt = new Date(NOW - 5 * 60 * 1000).toISOString()
    const { jobs, skipped } = planBankSyncs(
      [makeBank({ lastSyncedAt, dailyRequests: 10 })],
      NOW,
    )

    expect(jobs).toEqual([])
    expect(skipped[0].reason).toBe('rate-limited')
  })

  it('dailyRequests boven de limiet (>10) blijft rate-limited', () => {
    const { jobs, skipped } = planBankSyncs([makeBank({ dailyRequests: 11 })], NOW)

    expect(jobs).toEqual([])
    expect(skipped[0].reason).toBe('rate-limited')
  })

  // De drempel voor het AUTOMATISCHE meeliften is niet 10 maar 10 − 3 = 7: de
  // laatste drie verzoeken blijven voor de gebruiker die zélf op synchroniseren
  // drukt. Die twee assertions staan hier omdat ze de enige zijn die
  // `BANK_AUTO_SYNC_HEADROOM` daadwerkelijk vastpinnen — zonder deze test blijft
  // de hele suite groen als iemand de reserve op 0 zet, en dan is precies de
  // bescherming weg waarvoor de constante bestaat.
  it('laat de laatste verzoeken over voor de handmatige sync (drempel = limiet − reserve)', () => {
    const drempel = BANK_DAILY_REQUEST_LIMIT - BANK_AUTO_SYNC_HEADROOM
    expect(drempel).toBe(7)

    const netEronder = planBankSyncs([makeBank({ dailyRequests: drempel - 1 })], NOW)
    expect(netEronder.skipped).toEqual([])
    expect(netEronder.jobs).toHaveLength(1)

    const opDeDrempel = planBankSyncs([makeBank({ dailyRequests: drempel })], NOW)
    expect(opDeDrempel.jobs).toEqual([])
    expect(opDeDrempel.skipped[0].reason).toBe('rate-limited')
  })

  // Regressie: de route weigert een koppeling zonder dragende rekening met een
  // 409 die VÓÓR `reserve_bank_sync_slot` valt. Zo'n poging tikt de dagteller
  // dus nooit aan, waardoor de dagrem hem nooit gaat afremmen — plannen zou
  // betekenen: rode fout bij élke klik, na elke refresh opnieuw.
  it('slaat een koppeling zonder dragende rekening over (409 zou nooit afgeremd worden)', () => {
    const { jobs, skipped } = planBankSyncs([makeBank({ bankAccountId: null })], NOW)

    expect(jobs).toEqual([])
    expect(skipped).toHaveLength(1)
    expect(skipped[0].reason).toBe('link-broken')
    // De uitweg blijft de landingspagina; er is geen rekening om naartoe te linken.
    expect(skipped[0].manualHref).toBe('/overzicht/cashflow')
  })

  it('wint van de uur-rem én van de dagrem: geen drager = altijd overslaan', () => {
    const { jobs, skipped } = planBankSyncs(
      [makeBank({ bankAccountId: null, dailyRequests: 0, lastSyncedAt: null })],
      NOW,
    )

    expect(jobs).toEqual([])
    expect(skipped[0].reason).toBe('link-broken')
  })

  it('reden-veld klopt in alle drie de gevallen', () => {
    const linkBroken = planBankSyncs([makeBank({ connectionAccountId: 'a', linkBroken: true })], NOW)
    const rateLimited = planBankSyncs([makeBank({ connectionAccountId: 'b', dailyRequests: 10 })], NOW)
    const recent = planBankSyncs(
      [makeBank({ connectionAccountId: 'c', lastSyncedAt: new Date(NOW - 5 * 60 * 1000).toISOString() })],
      NOW,
    )

    expect(linkBroken.skipped[0].reason).toBe('link-broken')
    expect(rateLimited.skipped[0].reason).toBe('rate-limited')
    expect(recent.skipped[0].reason).toBe('recent')
  })
})

describe('planBankSyncs — stempel in de toekomst', () => {
  it('slaat over bij een lastSyncedAt in de toekomst (klokverschil)', () => {
    const lastSyncedAt = new Date(NOW + 10 * 60 * 1000).toISOString()
    const { jobs, skipped } = planBankSyncs([makeBank({ lastSyncedAt })], NOW)

    expect(jobs).toEqual([])
    expect(skipped[0].reason).toBe('recent')
  })
})

describe('planBankSyncs — job-vorm', () => {
  it('bouwt een bank-job met kind, url, body en manualHref', () => {
    const { jobs } = planBankSyncs(
      [makeBank({ connectionAccountId: 'bca-42', bankAccountId: 'ba-42', label: 'Rabobank · ···· 9999' })],
      NOW,
    )

    expect(jobs).toHaveLength(1)
    const job = jobs[0]
    expect(job.kind).toBe('bank')
    expect(job.url).toBe('/api/bank-connect/sync')
    expect(JSON.parse(job.body!)).toEqual({ connection_account_id: 'bca-42' })
    expect(job.manualHref).toBe('/core/assets/cash/ba-42')
  })

  // Deze test legde eerder vast dat een koppeling ZONDER dragende rekening wél
  // een job werd, met `/overzicht/cashflow` als terugvallink. Dat gedrag is
  // bewust weg: de route weigert zo'n koppeling met een 409 die vóór de
  // dagteller valt, dus die job kon alleen maar mislukken en werd door geen
  // enkele rem afgeknepen. De terugvallink zelf is niet verdwenen — hij reist nu
  // mee op de overgeslagen koppeling (zie de regressietest in
  // 'planBankSyncs — voorrangsvolgorde') en staat los getest in
  // 'bankManualHref direct getest' hieronder.
  it('een koppeling zonder dragende rekening levert geen job maar een overslaan', () => {
    const { jobs, skipped } = planBankSyncs([makeBank({ bankAccountId: null })], NOW)

    expect(jobs).toEqual([])
    expect(skipped[0].manualHref).toBe('/overzicht/cashflow')
  })

  it('bankManualHref direct getest', () => {
    expect(bankManualHref('abc')).toBe('/core/assets/cash/abc')
    expect(bankManualHref(null)).toBe('/overzicht/cashflow')
  })

  it('een overgeslagen koppeling draagt ook een manualHref', () => {
    const { skipped } = planBankSyncs(
      [makeBank({ bankAccountId: 'ba-9', linkBroken: true })],
      NOW,
    )

    expect(skipped[0].manualHref).toBe('/core/assets/cash/ba-9')
  })
})

describe('buildSyncJobs — regressie zonder banks', () => {
  const exchanges: ExchangeConnectionRow[] = [
    {
      id: 'ex-1',
      exchange: 'bitvavo',
      label: null,
      apiKeyLast4: '1234',
      lastSyncedAt: null,
      lastSyncError: null,
      createdAt: '2026-01-01T00:00:00Z',
      linkedAssetId: 'asset-1',
      linkedAssetName: 'Bitvavo',
      linkedAssetType: 'crypto',
    } as ExchangeConnectionRow,
  ]

  const wallets: WalletAddressRow[] = [
    {
      id: 'wa-1',
      chain: 'bitcoin',
      address: 'bc1...',
      label: null,
      linkedAssetId: 'asset-2',
      linkedAssetName: 'Bitcoin wallet',
      linkedAssetType: 'crypto',
      lastSyncedAt: null,
      lastBalanceNative: null,
      lastBalanceEur: null,
    } as WalletAddressRow,
  ]

  it('levert exact dezelfde jobs als vóór de bankuitbreiding: exchange, wallet, prijzen', () => {
    const { jobs, skippedBanks } = buildSyncJobs({ exchanges, wallets })

    expect(skippedBanks).toEqual([])
    expect(jobs.map((j) => j.kind)).toEqual(['exchange', 'wallet', 'prices'])
    expect(jobs[0]).toMatchObject({ id: 'ex-1', kind: 'exchange', label: 'Bitvavo', url: '/api/integrations/exchanges/ex-1/sync' })
    expect(jobs[1]).toMatchObject({ id: 'wa-1', kind: 'wallet', label: 'Bitcoin-wallet', url: '/api/integrations/wallets/wa-1/sync' })
    expect(jobs[2]).toMatchObject({ id: 'prices', kind: 'prices', label: 'Prijzen verversen', url: '/api/holdings/refresh-prices' })
  })

  it('zonder banks-param (undefined) is skippedBanks leeg en verandert er niets', () => {
    const { jobs, skippedBanks } = buildSyncJobs({ exchanges: [], wallets: [] })

    expect(skippedBanks).toEqual([])
    expect(jobs).toHaveLength(1)
    expect(jobs[0].kind).toBe('prices')
  })

  it('bankJobs komen vóór de prijzen-job, ná exchange/wallet', () => {
    const banks: BankSyncTarget[] = [makeBank({ connectionAccountId: 'bca-x' })]
    const { jobs } = buildSyncJobs({ exchanges, wallets, banks, nowMs: NOW })

    expect(jobs.map((j) => j.kind)).toEqual(['exchange', 'wallet', 'bank', 'prices'])
  })
})

describe('toBankSyncTargets/runOne via runGlobalSync', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('een bank-job stuurt de body mee en wordt NIET opnieuw geprobeerd bij een 429', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Headers(),
      json: async () => ({ error: 'Daglimiet bereikt' }),
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const job: SyncJob = {
      id: 'bca-1',
      kind: 'bank',
      label: 'ING',
      url: '/api/bank-connect/sync',
      body: JSON.stringify({ connection_account_id: 'bca-1' }),
    }

    const result = await runGlobalSync([job])

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0]
    expect(init.body).toBe(job.body)
    expect(result.results[0].outcome).toBe('error')
  })

  it('een niet-bank-job probeert wél opnieuw bij een 429', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Headers(),
      json: async () => ({ error: 'Rate limited' }),
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const job: SyncJob = {
      id: 'ex-1',
      kind: 'exchange',
      label: 'Bitvavo',
      url: '/api/integrations/exchanges/ex-1/sync',
    }

    await runGlobalSync([job])

    // retries: 2 voor niet-bank-jobs → 3 pogingen totaal.
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1)
  }, 15_000)

  it('itemsSynced valt terug op body.new: { new: 3, duplicates: 1 } → itemsSynced 3', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ new: 3, duplicates: 1 }),
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const job: SyncJob = {
      id: 'bca-1',
      kind: 'bank',
      label: 'ING',
      url: '/api/bank-connect/sync',
      body: JSON.stringify({ connection_account_id: 'bca-1' }),
    }

    const result = await runGlobalSync([job])

    expect(result.results[0].itemsSynced).toBe(3)
    expect(result.results[0].outcome).toBe('success')
  })
})
