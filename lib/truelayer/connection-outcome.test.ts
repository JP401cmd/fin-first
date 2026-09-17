import { describe, expect, it } from 'vitest'
import { deriveConnectionOutcome, LINKING_GRACE_MS } from './connection-outcome'

/**
 * B-051: de uitkomst van één koppelpoging. De callback zet de rij op `active`
 * vóórdat hij de koppelrijen schrijft; een actieve rij zonder koppelrij is dus
 * eerst "nog bezig" en pas na de marge een mislukking.
 */

const now = new Date('2026-09-17T10:00:00Z')
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString()

describe('deriveConnectionOutcome', () => {
  it('pending → wachten (de gebruiker zit nog bij zijn bank)', () => {
    expect(deriveConnectionOutcome({ status: 'pending', authorizedAt: null, linkedAccounts: 0, now })).toBe('wachten')
  })

  it('active mét koppelrij → gelukt (nieuwe koppeling én herautorisatie)', () => {
    expect(deriveConnectionOutcome({ status: 'active', authorizedAt: ago(5_000), linkedAccounts: 1, now })).toBe('gelukt')
  })

  it('active zonder koppelrij, binnen de marge → wachten (callback schrijft nog)', () => {
    expect(deriveConnectionOutcome({ status: 'active', authorizedAt: ago(10_000), linkedAccounts: 0, now })).toBe('wachten')
  })

  it('active zonder koppelrij, na de marge → mislukt (geen_koppeling / drager_bezet)', () => {
    expect(
      deriveConnectionOutcome({ status: 'active', authorizedAt: ago(LINKING_GRACE_MS + 1), linkedAccounts: 0, now }),
    ).toBe('mislukt')
  })

  it('opgeruimde of verlopen rij → mislukt', () => {
    expect(deriveConnectionOutcome({ status: 'expired', authorizedAt: ago(1_000), linkedAccounts: 0, now })).toBe('mislukt')
  })
})
