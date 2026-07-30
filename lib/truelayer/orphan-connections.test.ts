import { describe, it, expect } from 'vitest'
import { selectOrphanConnectionIds, PENDING_ORPHAN_GRACE_MS, type OrphanCandidate } from './orphan-connections'

// Directe unit-dekking van de pure selectiefunctie — geen database, geen route.
// De regressie-case ob-bank-callback-orphan-cleanup-pending-threshold
// (lib/regression-tests/suites/bank-connectie-flow.ts) importeert dezelfde
// functie voor het integratieverhaal (callback-stap 6); hier zitten de
// scenario's die de selectielogica zelf scherp pinnen.

describe('selectOrphanConnectionIds', () => {
  const NOW = 1_800_000_000_000 // vast tijdstip, geen Date.now()-afhankelijkheid

  function iso(msAgo: number): string {
    return new Date(NOW - msAgo).toISOString()
  }

  it('laat verbindingen die nog een rekening dragen (inUse) altijd met rust, ongeacht status', () => {
    const connections: OrphanCandidate[] = [
      { id: 'active-in-use', status: 'active', created_at: iso(0) },
      { id: 'pending-in-use-oud', status: 'pending', created_at: iso(2 * PENDING_ORPHAN_GRACE_MS) },
    ]
    const inUse = new Set(['active-in-use', 'pending-in-use-oud'])

    expect(selectOrphanConnectionIds(connections, inUse, NOW)).toEqual([])
  })

  it('laat expired en revoked altijd met rust, ook zonder rekening en ongeacht ouderdom', () => {
    const connections: OrphanCandidate[] = [
      { id: 'conn-expired', status: 'expired', created_at: iso(2 * PENDING_ORPHAN_GRACE_MS) },
      { id: 'conn-revoked', status: 'revoked', created_at: iso(2 * PENDING_ORPHAN_GRACE_MS) },
    ]

    expect(selectOrphanConnectionIds(connections, new Set(), NOW)).toEqual([])
  })

  it('ruimt een verweesde active verbinding op ongeacht ouderdom (bewijs dat ze net is opgevolgd)', () => {
    const connections: OrphanCandidate[] = [
      { id: 'conn-net-verweesd', status: 'active', created_at: iso(0) },
      { id: 'conn-al-lang-verweesd', status: 'active', created_at: iso(365 * 24 * 60 * 60 * 1000) },
    ]

    expect(selectOrphanConnectionIds(connections, new Set(), NOW).sort()).toEqual(
      ['conn-al-lang-verweesd', 'conn-net-verweesd'].sort(),
    )
  })

  it('laat een verse pending (binnen de respijttermijn) met rust — kan een andere, nog lopende koppeling zijn', () => {
    const connections: OrphanCandidate[] = [
      { id: 'conn-pending-vers', status: 'pending', created_at: iso(PENDING_ORPHAN_GRACE_MS - 1000) },
    ]

    expect(selectOrphanConnectionIds(connections, new Set(), NOW)).toEqual([])
  })

  it('ruimt een pending op zodra ze ouder is dan de respijttermijn', () => {
    const connections: OrphanCandidate[] = [
      { id: 'conn-pending-oud', status: 'pending', created_at: iso(PENDING_ORPHAN_GRACE_MS + 1000) },
    ]

    expect(selectOrphanConnectionIds(connections, new Set(), NOW)).toEqual(['conn-pending-oud'])
  })

  it('laat een pending zonder (leesbare) created_at met rust in plaats van haar te slopen', () => {
    const connections: OrphanCandidate[] = [
      { id: 'conn-pending-null', status: 'pending', created_at: null },
      { id: 'conn-pending-onleesbaar', status: 'pending', created_at: 'niet-een-datum' },
    ]

    expect(selectOrphanConnectionIds(connections, new Set(), NOW)).toEqual([])
  })

  it('behandelt elke overige status (bv. active zonder expliciete match hierboven) als altijd opruimbaar wanneer niet in use', () => {
    const connections: OrphanCandidate[] = [{ id: 'conn-onbekende-status', status: 'iets-anders', created_at: iso(0) }]

    expect(selectOrphanConnectionIds(connections, new Set(), NOW)).toEqual(['conn-onbekende-status'])
  })
})
