/**
 * REGRESSIE — een toegangstoken van één uur is geen aflopende bankautorisatie
 * (W-014 / ADR 0161; Notion 3dff9e8d-568a-81ee-a993-c588b3021d66).
 *
 * Wat er misging: `bank_connections.token_expires_at` wordt in de callback, de
 * sync-route en de balances-route gezet op `now + expires_in` — de levensduur
 * van het TrueLayer-TOEGANGSTOKEN (3600 s; live in élke rij exact 1,00 uur na
 * `updated_at`). `deriveBankLinkHealth` las die kolom als de bankautorisatie
 * (90/180 dagen). Met `Math.ceil` op hele dagen betekende dat: direct na elke
 * sync "Verloopt over 1d" plus een bericht, en ~25 uur later `linked-broken`
 * ("Verbinding kwijt") met een herstelknop die een NIEUWE autorisatie startte.
 * Dezelfde Rabobank-koppeling is zo in zeven weken 18× opnieuw geautoriseerd.
 *
 * De norm sinds de fix: de afleiding kent het toegangstoken niet meer. Haar
 * signaal is `consentExpiresAt` (`bank_connections.consent_expires_at`, uit
 * TrueLayer's `GET /data/v1/me`), en het toegangstoken is voor de afleiding
 * type-onzichtbaar — dat laatste bewaakt de `@ts-expect-error` hieronder:
 * wie `tokenExpiresAt` ooit terugzet in `BankLinkSignals`, krijgt hier een
 * compile-fout.
 */

import { describe, it, expect } from 'vitest'
import { deriveBankLinkHealth, type BankLinkSignals } from './bank-connection-status'

const EEN_UUR = 60 * 60 * 1000
const EEN_DAG = 24 * EEN_UUR
/** `updated_at` van een echte rij; de callback schreef 1 uur later als tokenvervaldatum. */
const NET_GESYNCT = new Date('2026-09-18T19:01:28.931Z')
/** Wat TrueLayer als consent-einde meldt: 90 dagen na de autorisatie. */
const CONSENT_VERLOOPT = new Date(NET_GESYNCT.getTime() + 90 * EEN_DAG).toISOString()

function versGekoppeld(): BankLinkSignals {
  return {
    linkIsActive: true,
    connectionStatus: 'active',
    consentExpiresAt: CONSENT_VERLOOPT,
    lastSyncedAt: NET_GESYNCT.toISOString(),
  }
}

describe('een toegangstoken van één uur is geen aflopende bankautorisatie (ADR 0161)', () => {
  it('direct na een sync meldt de koppeling niet "verloopt bijna"', () => {
    const health = deriveBankLinkHealth(versGekoppeld(), NET_GESYNCT)
    expect(health.state).toBe('linked')
    expect(health.expiringSoon).toBe(false)
    expect(health.daysUntilExpiry).toBe(90)
  })

  it('26 uur na de laatste sync (het token is al lang verlopen) is de verbinding niet "kwijt"', () => {
    const eenDagLater = new Date(NET_GESYNCT.getTime() + 26 * EEN_UUR)
    expect(deriveBankLinkHealth(versGekoppeld(), eenDagLater).state).toBe('linked')
  })

  it('zonder bekende consent-einddatum velt de afleiding geen oordeel op datum', () => {
    const health = deriveBankLinkHealth({ ...versGekoppeld(), consentExpiresAt: null }, NET_GESYNCT)
    expect(health.state).toBe('linked')
    expect(health.expiringSoon).toBe(false)
    expect(health.daysUntilExpiry).toBeNull()
  })

  it('het toegangstoken is voor de afleiding type-onzichtbaar', () => {
    const signals: BankLinkSignals = {
      linkIsActive: true,
      connectionStatus: 'active',
      consentExpiresAt: CONSENT_VERLOOPT,
      lastSyncedAt: NET_GESYNCT.toISOString(),
      // @ts-expect-error — `tokenExpiresAt` hoort niet in BankLinkSignals: het
      // 1-uurs toegangstoken mag de gezondheid nooit meer bepalen (ADR 0161).
      tokenExpiresAt: new Date(NET_GESYNCT.getTime() + EEN_UUR).toISOString(),
    }
    expect(deriveBankLinkHealth(signals, NET_GESYNCT).state).toBe('linked')
  })
})
