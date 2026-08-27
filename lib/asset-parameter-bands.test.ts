import { describe, expect, it } from 'vitest'
import {
  ASSET_AMOUNT_CONFIRM_THRESHOLD,
  ASSET_AMOUNT_LIMITS,
  ASSET_RETURN_BANDS,
  EXPECTED_RETURN_DB_BAND,
  assetReturnBand,
  isPurchaseDateInFuture,
  isWithinAssetAmountLimit,
  isWithinAssetReturnBand,
  todayIso,
} from './asset-parameter-bands'
import { TYPICAL_RETURNS, type AssetType } from './asset-data'

/** Regressie op bevinding H8 — "Onmogelijke bedragen zonder vraag geaccepteerd". */
describe('rendementsband per asset-type', () => {
  it('weigert de gemelde 665,5% op elk type (H1/H7)', () => {
    for (const type of Object.keys(ASSET_RETURN_BANDS) as AssetType[]) {
      expect(isWithinAssetReturnBand(type, 665.5)).toBe(false)
    }
  })

  it('staat afschrijving toe waar dat een echte domeinregel is', () => {
    // Productiewaarden op 27-08-2026: vehicle −12, physical −10. Een uniforme
    // band die deze weigert zou legitieme invoer breken.
    expect(isWithinAssetReturnBand('vehicle', -12)).toBe(true)
    expect(isWithinAssetReturnBand('physical', -10)).toBe(true)
  })

  it('houdt spaargeld en cash op een niet-negatieve band', () => {
    expect(isWithinAssetReturnBand('savings', -1)).toBe(false)
    expect(isWithinAssetReturnBand('cash', -1)).toBe(false)
    expect(isWithinAssetReturnBand('savings', 3)).toBe(true)
  })

  it('accepteert elke bestaande TYPICAL_RETURNS-default', () => {
    // De app vult deze waarden zelf in als default. Een band die zijn eigen
    // default weigert, blokkeert een leeg formulier.
    for (const [type, pct] of Object.entries(TYPICAL_RETURNS) as [AssetType, number][]) {
      expect(isWithinAssetReturnBand(type, pct), `${type} default ${pct}`).toBe(true)
    }
  })

  it('valt volledig binnen de databasegrens', () => {
    // De CHECK-constraint (migratie 20260827140000) is de buitenste ring. Een
    // app-band die daarbuiten valt zou een waarde accepteren die de database
    // vervolgens met een 23514 weigert — een 500 op geldige invoer.
    for (const [type, band] of Object.entries(ASSET_RETURN_BANDS)) {
      expect(band.min, `${type} min`).toBeGreaterThanOrEqual(EXPECTED_RETURN_DB_BAND.min)
      expect(band.max, `${type} max`).toBeLessThanOrEqual(EXPECTED_RETURN_DB_BAND.max)
      expect(band.min, `${type} min<max`).toBeLessThan(band.max)
    }
  })

  it('valt voor een onbekend type terug op de ruime DB-band', () => {
    expect(assetReturnBand('bestaat-niet')).toEqual(EXPECTED_RETURN_DB_BAND)
  })

  it('weigert NaN', () => {
    expect(isWithinAssetReturnBand('investment', Number.NaN)).toBe(false)
  })
})

describe('bedragengrenzen', () => {
  it('weigert de gemelde 999.999.999.999 op de servergrens', () => {
    expect(isWithinAssetAmountLimit('current_value', 999_999_999_999)).toBe(false)
    expect(isWithinAssetAmountLimit('purchase_value', 999_999_999_999)).toBe(false)
  })

  it('weigert negatief maar staat nul toe (lege rekening is legitiem)', () => {
    expect(isWithinAssetAmountLimit('current_value', -1)).toBe(false)
    expect(isWithinAssetAmountLimit('current_value', 0)).toBe(true)
  })

  it('laat een plausibel groot vermogen door — de client vraagt door, blokkeert niet', () => {
    // Besluit eigenaar (optie B): server ruim, client toont vanaf €10 mln een
    // bevestigingsstap. De drempel moet dus ver ONDER de servergrens liggen,
    // anders vraagt de client nooit door voordat de server al geweigerd heeft.
    expect(isWithinAssetAmountLimit('current_value', 50_000_000)).toBe(true)
    expect(ASSET_AMOUNT_CONFIRM_THRESHOLD).toBeLessThan(ASSET_AMOUNT_LIMITS.current_value.max)
  })
})

describe('aankoopdatum', () => {
  const vandaag = new Date('2026-08-27T12:00:00Z')

  it('weigert morgen', () => {
    expect(isPurchaseDateInFuture('2026-08-28', vandaag)).toBe(true)
  })

  it('staat vandaag en het verleden toe', () => {
    expect(isPurchaseDateInFuture('2026-08-27', vandaag)).toBe(false)
    expect(isPurchaseDateInFuture('1999-01-01', vandaag)).toBe(false)
  })

  it('beschouwt leeg of onleesbaar niet als toekomst', () => {
    expect(isPurchaseDateInFuture('', vandaag)).toBe(false)
    expect(isPurchaseDateInFuture('geen-datum', vandaag)).toBe(false)
  })

  it('levert todayIso in de vorm die een date-input als `max` verwacht', () => {
    expect(todayIso(vandaag)).toBe('2026-08-27')
  })
})
