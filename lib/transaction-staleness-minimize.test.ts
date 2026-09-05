/**
 * Unit-tests op het minimaliseren/escaleren van de "Gegevens verouderd"-melding.
 *
 * Kern van de grendel: de melding mag ingeklapt BLIJVEN zolang de achterstand
 * niet materieel groeit (dus NIET bij elke maandwissel — dat is de expliciete
 * ontwerpkeuze, zie de kop van de module), en moet ONVOORWAARDELIJK heropenen
 * zodra er nog eens `TX_STALE_AFTER_MONTHS` maanden stilte bij komt.
 */

import { describe, it, expect } from 'vitest'
import {
  STALE_TX_ESCALATION_MONTHS,
  STALE_TX_NOTICE_MINIMIZE_KEY,
  asStaleMinimizedMonths,
  resolveStaleNoticeDisplay,
} from '@/lib/transaction-staleness-minimize'
import { TX_STALE_AFTER_MONTHS } from '@/lib/transaction-staleness'

describe('STALE_TX_NOTICE_MINIMIZE_KEY', () => {
  it('is de route-achtige sleutel in de gedeelde jsonb-pref', () => {
    expect(STALE_TX_NOTICE_MINIMIZE_KEY).toBe('/overzicht/gegevens-verouderd')
  })
})

describe('STALE_TX_ESCALATION_MONTHS', () => {
  it('is afgeleid van de onset-drempel — dezelfde grootheid, één bron', () => {
    expect(STALE_TX_ESCALATION_MONTHS).toBe(TX_STALE_AFTER_MONTHS)
  })

  it('is groter dan één maand, zodat de melding niet elke maandwissel heropent', () => {
    // De maat loopt vanzelf op met de kalender; +1 zou 12x per jaar heropenen.
    expect(STALE_TX_ESCALATION_MONTHS).toBeGreaterThan(1)
  })
})

describe('asStaleMinimizedMonths', () => {
  it('accepteert een niet-negatief eindig getal en rondt af op hele maanden', () => {
    expect(asStaleMinimizedMonths(5)).toBe(5)
    expect(asStaleMinimizedMonths(4.6)).toBe(5)
    expect(asStaleMinimizedMonths(0)).toBe(0)
  })

  it('weigert de stoplicht-niveaus van de /overzicht-banners', () => {
    // Dezelfde jsonb-map draagt óók 'warn'/'bad'/'info' — die mogen hier nooit
    // als maandaantal landen (anders zou een /overzicht-pref deze melding dempen).
    expect(asStaleMinimizedMonths('warn')).toBeNull()
    expect(asStaleMinimizedMonths('bad')).toBeNull()
    expect(asStaleMinimizedMonths('info')).toBeNull()
  })

  it('weigert onzin-waarden', () => {
    expect(asStaleMinimizedMonths(null)).toBeNull()
    expect(asStaleMinimizedMonths(undefined)).toBeNull()
    expect(asStaleMinimizedMonths(-1)).toBeNull()
    expect(asStaleMinimizedMonths(Number.NaN)).toBeNull()
    expect(asStaleMinimizedMonths(Number.POSITIVE_INFINITY)).toBeNull()
    expect(asStaleMinimizedMonths(Number.NEGATIVE_INFINITY)).toBeNull()
    expect(asStaleMinimizedMonths('5')).toBeNull()
    expect(asStaleMinimizedMonths(true)).toBeNull()
    expect(asStaleMinimizedMonths({ monthsBehind: 5 })).toBeNull()
    expect(asStaleMinimizedMonths([5])).toBeNull()
  })
})

describe('resolveStaleNoticeDisplay', () => {
  it("geeft 'none' zonder melding (verse data / geen historie)", () => {
    expect(resolveStaleNoticeDisplay(null, null)).toBe('none')
    expect(resolveStaleNoticeDisplay(null, 5)).toBe('none')
    expect(resolveStaleNoticeDisplay(Number.NaN, 5)).toBe('none')
  })

  it("geeft 'expanded' zolang de gebruiker niet geminimaliseerd heeft", () => {
    expect(resolveStaleNoticeDisplay(5, null)).toBe('expanded')
    expect(resolveStaleNoticeDisplay(TX_STALE_AFTER_MONTHS, null)).toBe('expanded')
  })

  it('blijft ingeklapt op dezelfde achterstand', () => {
    expect(resolveStaleNoticeDisplay(5, 5)).toBe('minimized')
  })

  it('blijft ingeklapt bij één maand extra — de kalender is geen escalatie', () => {
    expect(resolveStaleNoticeDisplay(6, 5)).toBe('minimized')
  })

  it(`heropent bij +${STALE_TX_ESCALATION_MONTHS} maanden of meer`, () => {
    expect(resolveStaleNoticeDisplay(5 + STALE_TX_ESCALATION_MONTHS, 5)).toBe('expanded')
    expect(resolveStaleNoticeDisplay(5 + STALE_TX_ESCALATION_MONTHS + 3, 5)).toBe('expanded')
  })

  it('escaleert niet bij krimp — een jongere boeking is vooruitgang', () => {
    expect(resolveStaleNoticeDisplay(3, 5)).toBe('minimized')
    expect(resolveStaleNoticeDisplay(2, 9)).toBe('minimized')
  })

  it('valt bij een corrupte 0 in de map naar de veilige kant (tonen)', () => {
    // Minimaliseren kan alleen terwijl de melding staat, dus monthsBehind is dan
    // altijd >= TX_STALE_AFTER_MONTHS; een 0 kan geen legitieme opslag zijn.
    expect(resolveStaleNoticeDisplay(TX_STALE_AFTER_MONTHS, 0)).toBe('expanded')
  })
})
