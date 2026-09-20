import { describe, expect, it } from 'vitest'
import { STOP_KNOP_VENSTER_JAAR, stopKnopBereik } from './scenario-events'

/**
 * De schaal van de stop-knop: tien jaar naar beide kanten rond waar het plan mee rekent,
 * met de huidige leeftijd en de eindleeftijd als HARDE grenzen (eigenaarskeuze 20 sep 2026).
 *
 * Die twee grenzen zijn het hele punt van deze helper: een schaal die eronder of erboven
 * uitsteekt toont standen die de kern niet aanneemt.
 */
describe('stopKnopBereik', () => {
  const basis = { huidigeLeeftijd: 40, eindLeeftijd: 95 }

  it('legt tien jaar aan weerszijden van waar het plan mee rekent', () => {
    expect(stopKnopBereik({ ...basis, basis: 62, huidig: 62 })).toEqual({ min: 52, max: 72 })
    expect(STOP_KNOP_VENSTER_JAAR).toBe(10)
  })

  it('de huidige leeftijd is een harde ondergrens — eerder stoppen dan vandaag bestaat niet', () => {
    expect(stopKnopBereik({ ...basis, basis: 44, huidig: 44 })).toEqual({ min: 40, max: 54 })
  })

  it('de eindleeftijd is een harde bovengrens — daarachter rekent de kern niet meer', () => {
    expect(stopKnopBereik({ ...basis, basis: 90, huidig: 90 })).toEqual({ min: 80, max: 95 })
  })

  it('beide grenzen tegelijk: het venster krimpt aan twee kanten', () => {
    expect(stopKnopBereik({ huidigeLeeftijd: 60, eindLeeftijd: 72, basis: 66, huidig: 66 })).toEqual({
      min: 60,
      max: 72,
    })
  })

  it('een bewaarde stand buiten het venster blijft aanwijsbaar, maar nooit buiten de harde grenzen', () => {
    // Plan rekent met 62, maar een bewaard doel staat op 80: de schaal rekt mee tot 80 …
    expect(stopKnopBereik({ ...basis, basis: 62, huidig: 80 })).toEqual({ min: 52, max: 80 })
    // … en tot de ondergrens, niet eronder.
    expect(stopKnopBereik({ ...basis, basis: 62, huidig: 38 })).toEqual({ min: 40, max: 72 })
  })

  it('rondt af op halve jaren — het raster van de knop', () => {
    expect(stopKnopBereik({ huidigeLeeftijd: 40.3, eindLeeftijd: 94.8, basis: 61.7, huidig: 61.7 })).toEqual({
      min: 51.5,
      max: 71.5,
    })
  })

  it('zonder eindleeftijd blijft het venster gewoon tien jaar breed', () => {
    expect(stopKnopBereik({ huidigeLeeftijd: 40, eindLeeftijd: null, basis: 62, huidig: 62 })).toEqual({
      min: 52,
      max: 72,
    })
  })

  it('geen bruikbaar venster → null, geen omgekeerde schaal', () => {
    expect(stopKnopBereik({ huidigeLeeftijd: 70, eindLeeftijd: 70, basis: 70, huidig: 70 })).toBeNull()
    expect(stopKnopBereik({ huidigeLeeftijd: NaN, eindLeeftijd: 95, basis: 62, huidig: 62 })).toBeNull()
  })
})
