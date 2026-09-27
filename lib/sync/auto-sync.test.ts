import { describe, it, expect } from 'vitest'
import { BANK_DAILY_REQUEST_LIMIT } from '@/lib/bank-connection-status'
import {
  BROKER_ERROR_INVALID_CREDENTIALS,
  BROKER_ERROR_PERMISSION_DENIED,
} from '@/lib/integrations/broker-error-messages'
import {
  BANK_AUTO_SYNC_HEADROOM,
  buildSyncJobs,
  type BankSyncTarget,
} from '@/lib/sync/global-sync'
import {
  AUTO_SYNC_CLAIM_MS,
  AUTO_SYNC_MAX_DAILY_REQUESTS,
  AUTO_SYNC_STALE_MS,
  autoSyncClaimKey,
  claimAutoSync,
  isStaleForAutoSync,
  readAutoSyncEnabled,
  selectStaleBanks,
  selectStaleBrokers,
  type ClaimStorage,
} from './auto-sync'

/**
 * Bijwerken bij openen (W-018, ADR 0182) — de pure beslissing.
 *
 * Het zwaartepunt ligt op wat NIET vanzelf mee mag: een nooit-gesynchroniseerde
 * koppeling (ADR 0069-correctiemoment), een kapotte, en een bank waarvan de
 * dagrem al in de reserve voor de handmatige knop zit.
 */

const NOW = Date.parse('2026-09-27T12:00:00Z')
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString()
const STALE = iso(AUTO_SYNC_STALE_MS + 60_000)
const FRESH = iso(AUTO_SYNC_STALE_MS - 60_000)

function bank(id: string, extra: Partial<BankSyncTarget> = {}): BankSyncTarget {
  return { connectionAccountId: id, label: `Bank ${id}`, bankAccountId: `ba-${id}`, lastSyncedAt: STALE, ...extra }
}

describe('isStaleForAutoSync', () => {
  it('nooit gesynchroniseerd is NIET oud — de eerste ophaal is van ADR 0158 of de gebruiker', () => {
    expect(isStaleForAutoSync(null, NOW)).toBe(false)
    expect(isStaleForAutoSync('onzin', NOW)).toBe(false)
  })
  it('grens ligt op twaalf uur', () => {
    expect(isStaleForAutoSync(iso(AUTO_SYNC_STALE_MS), NOW)).toBe(true)
    expect(isStaleForAutoSync(iso(AUTO_SYNC_STALE_MS - 1), NOW)).toBe(false)
  })
  it('een stempel in de toekomst (klokverschil) telt als vers', () => {
    expect(isStaleForAutoSync(new Date(NOW + 60_000).toISOString(), NOW)).toBe(false)
  })
})

describe('selectStaleBanks', () => {
  it('neemt alleen oude, gezonde koppelingen mee', () => {
    const out = selectStaleBanks(
      [
        bank('oud'),
        bank('vers', { lastSyncedAt: FRESH }),
        bank('nooit', { lastSyncedAt: null }),
        bank('kapot', { linkBroken: true }),
        bank('zonder-drager', { bankAccountId: null }),
      ],
      NOW,
    )
    expect(out.map((b) => b.connectionAccountId)).toEqual(['oud'])
  })

  it('hooguit twee dagtikken — ook als de sync telkens mislukt en de sessiestempel weg is', () => {
    expect(selectStaleBanks([bank('a', { dailyRequests: AUTO_SYNC_MAX_DAILY_REQUESTS - 1 })], NOW)).toHaveLength(1)
    expect(selectStaleBanks([bank('a', { dailyRequests: AUTO_SYNC_MAX_DAILY_REQUESTS })], NOW)).toHaveLength(0)
    // En ruim binnen de reserve die de globale knop voor handmatig vrijhoudt.
    expect(AUTO_SYNC_MAX_DAILY_REQUESTS).toBeLessThan(BANK_DAILY_REQUEST_LIMIT - BANK_AUTO_SYNC_HEADROOM)
  })

  it('probeert een koppeling die dit tabblad net vergeefs probeerde niet opnieuw', () => {
    expect(selectStaleBanks([bank('a', { lastAttemptedAt: iso(5 * 60_000) })], NOW)).toHaveLength(0)
    expect(selectStaleBanks([bank('a', { lastAttemptedAt: iso(2 * 60 * 60_000) })], NOW)).toHaveLength(1)
  })

  it('wat hier doorkomt, plant de globale ronde zonder overslaan (geen blauwe ruis-melding)', () => {
    const banks = selectStaleBanks([bank('a'), bank('b')], NOW)
    const { jobs, skippedBanks } = buildSyncJobs({
      exchanges: [],
      wallets: [],
      banks,
      includePrices: false,
      nowMs: NOW,
    })
    expect(skippedBanks).toEqual([])
    expect(jobs.map((j) => j.kind)).toEqual(['bank', 'bank'])
  })
})

describe('selectStaleBrokers', () => {
  it('oud en zonder blijvende sleutelfout — en geeft alleen id + label door', () => {
    const out = selectStaleBrokers(
      [
        { id: 'oud', label: 'Trading 212', lastSyncedAt: STALE, lastSyncError: null },
        { id: 'vers', label: 'x', lastSyncedAt: FRESH, lastSyncError: null },
        { id: 'nooit', label: 'x', lastSyncedAt: null, lastSyncError: null },
        { id: 'sleutel', label: 'x', lastSyncedAt: STALE, lastSyncError: BROKER_ERROR_INVALID_CREDENTIALS },
        { id: 'rechten', label: 'x', lastSyncedAt: STALE, lastSyncError: BROKER_ERROR_PERMISSION_DENIED },
        // Een tijdelijke fout (rem, netwerk) blokkeert niet: de volgende keer weer mee.
        { id: 'rem', label: 'Rem', lastSyncedAt: STALE, lastSyncError: 'Broker limiteert tijdelijk — probeer later' },
      ],
      NOW,
    )
    expect(out).toEqual([
      { id: 'oud', label: 'Trading 212' },
      { id: 'rem', label: 'Rem' },
    ])
  })

  it('wordt een broker-job op de bestaande sync-route, zonder prijsstap', () => {
    const { jobs } = buildSyncJobs({
      exchanges: [],
      wallets: [],
      brokers: [{ id: 'bc-1', label: 'Trading 212' }],
      includePrices: false,
      nowMs: NOW,
    })
    expect(jobs).toEqual([
      expect.objectContaining({
        id: 'bc-1',
        kind: 'broker',
        url: '/api/integrations/brokers/bc-1/sync',
        manualHref: '/mijn/koppelingen',
      }),
    ])
  })
})

describe('claimAutoSync', () => {
  function memory(): ClaimStorage & { map: Map<string, string> } {
    const map = new Map<string, string>()
    return {
      map,
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => void map.set(k, v),
      removeItem: (k) => void map.delete(k),
    }
  }

  it('eerste tabblad claimt, het tweede binnen het venster niet', () => {
    const s = memory()
    expect(claimAutoSync(s, 'u1', NOW)).toBe(true)
    expect(claimAutoSync(s, 'u1', NOW + 1000)).toBe(false)
    expect(claimAutoSync(s, 'u1', NOW + AUTO_SYNC_CLAIM_MS)).toBe(true)
  })

  it('is per account: op een gedeelde browser remt A B niet', () => {
    const s = memory()
    expect(claimAutoSync(s, 'u1', NOW)).toBe(true)
    expect(claimAutoSync(s, 'u2', NOW)).toBe(true)
    expect([...s.map.keys()]).toEqual([autoSyncClaimKey('u1'), autoSyncClaimKey('u2')])
  })

  it('opslag die gooit of ontbreekt blokkeert niet (gemaksrem, geen beveiliging)', () => {
    const kapot: ClaimStorage = {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {},
      removeItem: () => {},
    }
    expect(claimAutoSync(kapot, 'u1', NOW)).toBe(true)
    expect(claimAutoSync(null, 'u1', NOW)).toBe(true)
  })
})

describe('readAutoSyncEnabled — fail-closed', () => {
  it('alleen een expliciete true is aan', () => {
    expect(readAutoSyncEnabled({ auto_sync_enabled: true })).toBe(true)
    expect(readAutoSyncEnabled({ auto_sync_enabled: false })).toBe(false)
    // Kolom nog niet gemigreerd → select('*') levert hem niet.
    expect(readAutoSyncEnabled({ full_name: 'x' })).toBe(false)
    expect(readAutoSyncEnabled(null)).toBe(false)
    expect(readAutoSyncEnabled({ auto_sync_enabled: 'true' })).toBe(false)
  })
})
