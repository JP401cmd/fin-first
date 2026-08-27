/**
 * Unit-tests op het minimaliseren/escaleren van de tekort-lening-melding.
 *
 * Kern van de grendel: de melding mag ingeklapt BLIJVEN zolang de situatie niet
 * materieel verslechtert, en moet ONVOORWAARDELIJK heropenen zodra de piek meer
 * dan 10% groeit. Dat is het punt van de conventie ("escalatie heropent") — een
 * melding die blijft hangen na een echte planwijziging is precies de bug die
 * deze module moet uitsluiten.
 */

import { describe, it, expect } from 'vitest'
import {
  DEFICIT_ESCALATION_FACTOR,
  DEFICIT_NOTICE_MINIMIZE_KEY,
  asDeficitMinimizedPeak,
  resolveDeficitNoticeDisplay,
} from '@/lib/horizon/deficit-loan-minimize'

describe('DEFICIT_NOTICE_MINIMIZE_KEY', () => {
  it('is de route-achtige sleutel in de gedeelde jsonb-pref', () => {
    expect(DEFICIT_NOTICE_MINIMIZE_KEY).toBe('/toekomst/tekort-lening')
  })
})

describe('asDeficitMinimizedPeak', () => {
  it('accepteert een niet-negatief eindig getal en rondt af op hele euro’s', () => {
    expect(asDeficitMinimizedPeak(42000)).toBe(42000)
    expect(asDeficitMinimizedPeak(41999.6)).toBe(42000)
    expect(asDeficitMinimizedPeak(0)).toBe(0)
  })

  it('weigert de stoplicht-niveaus van de /overzicht-banners', () => {
    // Dezelfde jsonb-map draagt óók 'warn'/'bad'/'info' — die mogen hier nooit
    // als bedrag landen (anders zou een /overzicht-pref de melding stil dempen).
    expect(asDeficitMinimizedPeak('warn')).toBeNull()
    expect(asDeficitMinimizedPeak('bad')).toBeNull()
    expect(asDeficitMinimizedPeak('info')).toBeNull()
  })

  it('weigert onzin-waarden', () => {
    expect(asDeficitMinimizedPeak(null)).toBeNull()
    expect(asDeficitMinimizedPeak(undefined)).toBeNull()
    expect(asDeficitMinimizedPeak(-1)).toBeNull()
    expect(asDeficitMinimizedPeak(Number.NaN)).toBeNull()
    expect(asDeficitMinimizedPeak(Number.POSITIVE_INFINITY)).toBeNull()
    expect(asDeficitMinimizedPeak('42000')).toBeNull()
    expect(asDeficitMinimizedPeak({ peak: 42000 })).toBeNull()
  })
})

describe('resolveDeficitNoticeDisplay', () => {
  it("geeft 'none' zonder tekort-lening", () => {
    expect(resolveDeficitNoticeDisplay(null, null)).toBe('none')
    expect(resolveDeficitNoticeDisplay(null, 42000)).toBe('none')
  })

  it("geeft 'expanded' zolang de gebruiker niet geminimaliseerd heeft", () => {
    expect(resolveDeficitNoticeDisplay(42000, null)).toBe('expanded')
  })

  it("geeft 'minimized' bij een ongewijzigde piek", () => {
    expect(resolveDeficitNoticeDisplay(42000, 42000)).toBe('minimized')
  })

  it('blijft ingeklapt bij een KLEINERE piek (krimp is geen verslechtering)', () => {
    expect(resolveDeficitNoticeDisplay(10000, 42000)).toBe('minimized')
  })

  it('blijft ingeklapt bij groei onder de drempel (ruis van een herberekening)', () => {
    expect(resolveDeficitNoticeDisplay(42000 * 1.05, 42000)).toBe('minimized')
    // Exact op de drempel telt nog niet als escalatie (strikt groter dan).
    expect(resolveDeficitNoticeDisplay(42000 * DEFICIT_ESCALATION_FACTOR, 42000)).toBe(
      'minimized',
    )
  })

  it('heropent bij groei bóven de drempel (echte planwijziging)', () => {
    expect(resolveDeficitNoticeDisplay(42000 * 1.11, 42000)).toBe('expanded')
    expect(resolveDeficitNoticeDisplay(84000, 42000)).toBe('expanded')
  })

  it('is magnitude-onafhankelijk: 10% werkt bij een kleine én een grote piek', () => {
    expect(resolveDeficitNoticeDisplay(5600, 5000)).toBe('expanded')
    expect(resolveDeficitNoticeDisplay(5400, 5000)).toBe('minimized')
    expect(resolveDeficitNoticeDisplay(324_000, 300_000)).toBe('minimized')
    expect(resolveDeficitNoticeDisplay(336_000, 300_000)).toBe('expanded')
  })

  it("toont de melding bij een onzinnige opgeslagen ondergrens (0)", () => {
    // Met 0 als drempel zou élke piek escaleren én tegelijk elke drempel nul
    // zijn — dan is 'expanded' de veilige uitkomst.
    expect(resolveDeficitNoticeDisplay(42000, 0)).toBe('expanded')
  })

  it("geeft 'none' bij een niet-eindige huidige piek", () => {
    expect(resolveDeficitNoticeDisplay(Number.NaN, 42000)).toBe('none')
  })
})
