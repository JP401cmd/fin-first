import { describe, it, expect } from 'vitest'
import { formatMaskedCurrency, MASKED_AMOUNT_PLACEHOLDER } from '@/lib/format'
import type { VermogenAssetItem } from '@/lib/vermogen-report-data'
import { buildAssetDetailParts, GEBRUIKELIJK_LOON_MIN_2025 } from './detail-parts'

/**
 * Regressie bij WF-RAPP-13: met privacy-masking AAN mag géén persoonlijk
 * EUR-bedrag meer uit de detail-regels lekken (WOZ / Verhuur / Dividend).
 */

const fc = (masked: boolean) => (v: number) => formatMaskedCurrency(v, masked)

function makeAsset(overrides: Partial<VermogenAssetItem> = {}): VermogenAssetItem {
  return {
    id: 'a1',
    name: 'Woning',
    subtypeLabel: null,
    subtype: null,
    currentValue: 600_000,
    inclusionPct: 100,
    weightedValue: 600_000,
    expectedReturnPct: null,
    monthlyContribution: 0,
    ownership: 'personal',
    wozValue: null,
    addressLine: null,
    rentalIncomeYearly: null,
    riskProfile: null,
    tickerSymbol: null,
    retirementProvider: null,
    institution: null,
    kvkNumber: null,
    ownershipPercentage: null,
    annualDividend: null,
    depreciationRate: null,
    expiryDate: null,
    beneficiary: null,
    linkedAssetName: null,
    hasBudgetTracking: false,
    hasHoldingsTracking: false,
    hasWoonbalansTracking: false,
    hasRentalTracking: false,
    ...overrides,
  }
}

describe('buildAssetDetailParts — privacy-maskering', () => {
  const persoonlijk = makeAsset({
    wozValue: 540_000,
    rentalIncomeYearly: 11_400,
    annualDividend: 90_000,
  })

  it('toont de bedragen open wanneer masking uit staat', () => {
    const open = fc(false)
    const parts = buildAssetDetailParts(persoonlijk, open)
    expect(parts).toContain(`WOZ ${open(540_000)}`)
    expect(parts).toContain(`Verhuur ${open(11_400)}/jr`)
    expect(parts).toContain(`Dividend ${open(90_000)}/jr`)
    expect(parts.join(' · ')).toMatch(/540\.000.+11\.400.+90\.000/)
  })

  it('maskeert WOZ, verhuurinkomen en dividend wanneer masking aan staat', () => {
    const parts = buildAssetDetailParts(persoonlijk, fc(true))
    expect(parts).toContain(`WOZ ${MASKED_AMOUNT_PLACEHOLDER}`)
    expect(parts).toContain(`Verhuur ${MASKED_AMOUNT_PLACEHOLDER}/jr`)
    expect(parts).toContain(`Dividend ${MASKED_AMOUNT_PLACEHOLDER}/jr`)
    // Geen enkel cijfer uit de bedragen mag herleidbaar overblijven.
    for (const part of parts) {
      expect(part).not.toMatch(/540|11\.400|90\.000/)
    }
  })

  it('laat het wettelijke gebruikelijk-loon-minimum ook gemaskeerd zichtbaar', () => {
    const parts = buildAssetDetailParts(makeAsset({ subtype: 'holding_bv' }), fc(true))
    const loon = parts.find(p => p.startsWith('Gebruikelijk loon'))
    expect(loon).toBeDefined()
    expect(loon).toContain(String(GEBRUIKELIJK_LOON_MIN_2025 / 1000)) // "56" in € 56.000
    expect(loon).not.toContain(MASKED_AMOUNT_PLACEHOLDER)
  })

  it('laat niet-EUR details (adres, ticker, belang) ongemoeid bij masking', () => {
    const parts = buildAssetDetailParts(
      makeAsset({ addressLine: '1234AB 12', tickerSymbol: 'VWRL', ownershipPercentage: 100 }),
      fc(true),
    )
    expect(parts).toEqual(['1234AB 12', 'VWRL', 'Belang 100%'])
  })
})
