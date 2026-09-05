/**
 * De accountleeftijd-gate van de check-in-banner (UR3-10, AC 3).
 *
 * De regel is optie C1 (besluit eigenaar 5 sep 2026): het account moet zijn
 * aangemaakt vóór de 1e van de HUIDIGE maand. Bewust een gate op TIJD — een
 * gate op data ("pas als er transacties zijn") zou functionaliteit verbergen op
 * grond van iemands financiële situatie, wat ADR 0001 uitsluit.
 */

import { describe, it, expect } from 'vitest'
import { isCheckinBannerEligible } from './banner-seeds'

const nu = (iso: string) => new Date(iso)

describe('isCheckinBannerEligible', () => {
  it('houdt de banner weg bij een account van dezelfde maand', () => {
    // Vers account, aangemaakt op 3 september; de banner mag pas in oktober.
    expect(isCheckinBannerEligible('2026-09-03T09:00:00Z', nu('2026-09-05T10:00:00'))).toBe(false)
  })

  it('houdt de banner weg op de dag van aanmelden zelf', () => {
    expect(isCheckinBannerEligible('2026-09-05T08:00:00Z', nu('2026-09-05T10:00:00'))).toBe(false)
  })

  it('toont de banner zodra de maandgrens gepasseerd is', () => {
    // Zelfde account, nu 2 oktober: de terugblik gaat over september.
    expect(isCheckinBannerEligible('2026-09-03T09:00:00Z', nu('2026-10-02T10:00:00'))).toBe(true)
  })

  it('toont de banner voor een account van vorig jaar', () => {
    expect(isCheckinBannerEligible('2025-11-20T09:00:00Z', nu('2026-01-03T10:00:00'))).toBe(true)
  })

  it('behandelt de jaargrens correct', () => {
    // Aangemaakt in december, eerste week januari → mag.
    expect(isCheckinBannerEligible('2025-12-28T09:00:00Z', nu('2026-01-04T10:00:00'))).toBe(true)
    // Aangemaakt in januari, eerste week januari → niet.
    expect(isCheckinBannerEligible('2026-01-02T09:00:00Z', nu('2026-01-04T10:00:00'))).toBe(false)
  })

  it('behandelt een onbekende aanmaakdatum als NIET geschikt (ADR 0131)', () => {
    // Onbekend mag nooit stil "oud genoeg" gaan betekenen.
    expect(isCheckinBannerEligible(null, nu('2026-10-02T10:00:00'))).toBe(false)
    expect(isCheckinBannerEligible(undefined, nu('2026-10-02T10:00:00'))).toBe(false)
    expect(isCheckinBannerEligible('geen datum', nu('2026-10-02T10:00:00'))).toBe(false)
  })
})
