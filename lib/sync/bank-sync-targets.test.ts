import { describe, it, expect } from 'vitest'
import { bankSyncLabel, toBankSyncTargets } from './bank-sync-targets'
import type { LinkedAccountView } from '@/lib/truelayer/linked-account'
import { deriveBankLinkHealth } from '@/lib/bank-connection-status'

/**
 * Tests voor de mapping van `LinkedAccountView` (wire-vorm van
 * `GET /api/bank-connect/linked-accounts`) naar `BankSyncTarget` (de vorm die
 * de sync-planner nodig heeft).
 */

function makeAccount(overrides: Partial<LinkedAccountView> = {}): LinkedAccountView {
  return {
    id: 'bca-1',
    account_name: 'Betaalrekening',
    iban_tail: '1234',
    provider_name: 'ING',
    provider_logo: null,
    provider_id: 'ing-nl',
    health: deriveBankLinkHealth({
      linkIsActive: true,
      connectionStatus: 'active',
      tokenExpiresAt: null,
      lastSyncedAt: null,
    }),
    bank_account_id: 'ba-1',
    carrier_name: 'Betaalrekening',
    carrier_iban_tail: '1234',
    last_synced_at: null,
    daily_requests: 0,
    rate_limit_reset_date: null,
    balance_change: null,
    ...overrides,
  } as LinkedAccountView
}

describe('bankSyncLabel', () => {
  it('bank + IBAN-staartje', () => {
    expect(bankSyncLabel(makeAccount({ provider_name: 'ING', iban_tail: '4567' }))).toBe('ING · ···· 4567')
  })

  it('valt terug op carrier_name als provider_name ontbreekt', () => {
    expect(
      bankSyncLabel(
        makeAccount({ provider_name: null, carrier_name: 'Spaarrekening', iban_tail: '9999' }),
      ),
    ).toBe('Spaarrekening · ···· 9999')
  })

  it('valt terug op "Bankrekening" als beide namen ontbreken', () => {
    expect(
      bankSyncLabel(makeAccount({ provider_name: null, carrier_name: null, iban_tail: '9999' })),
    ).toBe('Bankrekening · ···· 9999')
  })

  it('laat het staartje weg als er geen tail bekend is', () => {
    expect(
      bankSyncLabel(makeAccount({ provider_name: 'ING', iban_tail: null, carrier_iban_tail: null })),
    ).toBe('ING')
  })

  it('valt terug op carrier_iban_tail als iban_tail ontbreekt', () => {
    expect(
      bankSyncLabel(makeAccount({ provider_name: 'ING', iban_tail: null, carrier_iban_tail: '5555' })),
    ).toBe('ING · ···· 5555')
  })
})

describe('toBankSyncTargets', () => {
  it('linkBroken komt uit health.state === "linked-broken"', () => {
    const broken = makeAccount({
      health: deriveBankLinkHealth({
        linkIsActive: true,
        connectionStatus: 'expired',
        tokenExpiresAt: null,
        lastSyncedAt: null,
      }),
    })
    const healthy = makeAccount({
      health: deriveBankLinkHealth({
        linkIsActive: true,
        connectionStatus: 'active',
        tokenExpiresAt: null,
        lastSyncedAt: null,
      }),
    })

    const [brokenTarget] = toBankSyncTargets([broken])
    const [healthyTarget] = toBankSyncTargets([healthy])

    expect(brokenTarget.linkBroken).toBe(true)
    expect(healthyTarget.linkBroken).toBe(false)
  })

  it('dailyRequests telt alleen als rate_limit_reset_date de huidige dag (Europe/Amsterdam) is', () => {
    const now = new Date('2026-08-10T10:00:00.000Z') // 12:00 Amsterdam-tijd (zomertijd)
    const vandaag = makeAccount({ daily_requests: 4, rate_limit_reset_date: '2026-08-10' })
    const gisteren = makeAccount({ daily_requests: 4, rate_limit_reset_date: '2026-08-09' })

    const [vandaagTarget] = toBankSyncTargets([vandaag], { now })
    const [gisterenTarget] = toBankSyncTargets([gisteren], { now })

    expect(vandaagTarget.dailyRequests).toBe(4)
    expect(gisterenTarget.dailyRequests).toBe(0)
  })

  it('geen rate_limit_reset_date → dailyRequests 0', () => {
    const account = makeAccount({ daily_requests: 7, rate_limit_reset_date: null })
    const [target] = toBankSyncTargets([account], { now: new Date('2026-08-10T10:00:00.000Z') })

    expect(target.dailyRequests).toBe(0)
  })

  it('neemt lastSyncedAt, lastAttemptedAt (uit attempts) en bankAccountId over', () => {
    const account = makeAccount({ id: 'bca-77', bank_account_id: 'ba-77', last_synced_at: '2026-08-01T00:00:00Z' })
    const [target] = toBankSyncTargets([account], { attempts: { 'bca-77': '2026-08-10T11:55:00Z' } })

    expect(target.connectionAccountId).toBe('bca-77')
    expect(target.bankAccountId).toBe('ba-77')
    expect(target.lastSyncedAt).toBe('2026-08-01T00:00:00Z')
    expect(target.lastAttemptedAt).toBe('2026-08-10T11:55:00Z')
  })

  it('lastAttemptedAt is null als er geen attempt voor deze koppeling bekend is', () => {
    const account = makeAccount({ id: 'bca-88' })
    const [target] = toBankSyncTargets([account], { attempts: { 'bca-99': '2026-08-10T11:55:00Z' } })

    expect(target.lastAttemptedAt).toBeNull()
  })

  it('levert een lege array voor een lege lijst (regressie-eis)', () => {
    expect(toBankSyncTargets([])).toEqual([])
  })
})
