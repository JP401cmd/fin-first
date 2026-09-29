/**
 * Indeling van het bezittingen-bewerkformulier (`lib/asset-form-layout.ts`).
 *
 * Regressie-eis: het formulier mag minder tonen, maar nooit een veld tonen dat
 * niet bij het type hoort — dan zet het opslaan de waarde op null terwijl de
 * gebruiker hem net heeft ingevuld.
 */
import { describe, it, expect } from 'vitest'
import { ASSET_TYPE_FIELDS, type AssetType } from './asset-data'
import { samenvattingVan } from '@/components/app/form-inklapblok'
import {
  ASSET_FORM_LAYOUT,
  assetGegevensTitel,
  assetTeltMeeDelen,
  kernAssetFields,
  showsAssetBaseField,
  showsAssetFieldInKern,
  showsAssetFieldInMeer,
} from './asset-form-layout'

const TYPES = Object.keys(ASSET_TYPE_FIELDS) as AssetType[]

describe('ASSET_FORM_LAYOUT', () => {
  it.each(TYPES)('%s: elk veld in meer of verborgen hoort bij het type', (type) => {
    const { meer, verborgen } = ASSET_FORM_LAYOUT[type]
    for (const field of [...meer, ...verborgen]) {
      expect(ASSET_TYPE_FIELDS[type]).toContain(field)
    }
  })

  it.each(TYPES)('%s: geen veld staat in meer én in verborgen', (type) => {
    const { meer, verborgen } = ASSET_FORM_LAYOUT[type]
    expect(meer.filter((f) => verborgen.includes(f))).toEqual([])
  })

  it.each(TYPES)('%s: de aankoopdatum staat niet in het formulier', (type) => {
    expect(showsAssetBaseField(type, 'purchase_date')).toBe(false)
  })
})

describe('kernvelden per type', () => {
  it('velden die een berekening voeden staan in de kern', () => {
    expect(kernAssetFields('eigen_huis')).toEqual(['woz_value'])
    expect(kernAssetFields('real_estate')).toEqual(['rental_income', 'woz_value'])
    expect(kernAssetFields('vehicle')).toEqual(['depreciation_rate'])
    expect(kernAssetFields('physical')).toEqual(['depreciation_rate'])
    expect(kernAssetFields('savings')).toEqual(['is_liquid', 'lock_end_date'])
    expect(kernAssetFields('levensverzekering')).toEqual(['is_liquid', 'lock_end_date'])
    expect(kernAssetFields('vordering')).toEqual(['lock_end_date'])
  })

  it('deelneming toont belang en dividend: Box 2 leest beide', () => {
    expect(kernAssetFields('deelneming')).toEqual(['ownership_percentage', 'annual_dividend'])
  })

  it('types zonder rekenend detailveld hebben een lege kern', () => {
    expect(kernAssetFields('cash')).toEqual([])
    expect(kernAssetFields('investment')).toEqual([])
    expect(kernAssetFields('crypto')).toEqual([])
    expect(kernAssetFields('retirement')).toEqual([])
    expect(kernAssetFields('other')).toEqual([])
  })

  it('het risicoprofiel staat in meer, niet in de kern', () => {
    for (const type of ['investment', 'crypto', 'retirement', 'deelneming', 'levensverzekering'] as AssetType[]) {
      expect(showsAssetFieldInMeer(type, 'risk_profile')).toBe(true)
      expect(showsAssetFieldInKern(type, 'risk_profile')).toBe(false)
    }
  })

  it('een veld dat niet bij het type hoort wordt nergens getoond', () => {
    expect(showsAssetFieldInKern('cash', 'woz_value')).toBe(false)
    expect(showsAssetFieldInMeer('cash', 'risk_profile')).toBe(false)
  })

  it('velden zonder rekenwerk zijn verborgen', () => {
    expect(ASSET_FORM_LAYOUT.cash.verborgen).toContain('is_liquid')
    expect(ASSET_FORM_LAYOUT.investment.verborgen).toContain('ticker_symbol')
    expect(ASSET_FORM_LAYOUT.retirement.verborgen).toEqual(['tax_benefit', 'retirement_provider_type'])
    expect(ASSET_FORM_LAYOUT.eigen_huis.verborgen).toContain('rental_income')
  })
})

describe('samenvatting "Hoe telt dit mee"', () => {
  const basis = {
    assetType: 'investment' as AssetType,
    netWorthInclusionPct: 100,
    ownership: 'personal' as const,
    risicoLabel: null,
    verkoopStand: null,
  }

  it('volledig meetellen is de korte standaard', () => {
    expect(assetTeltMeeDelen(basis)).toEqual(['telt volledig mee'])
  })

  it('percentage, gedeeld en risicoprofiel', () => {
    expect(assetTeltMeeDelen({ ...basis, netWorthInclusionPct: 50, ownership: 'shared', risicoLabel: 'Middel' }))
      .toEqual(['telt voor 50% mee', 'gedeeld', 'risicoprofiel middel'])
  })

  it('risicoprofiel alleen bij types die het tonen', () => {
    expect(assetTeltMeeDelen({ ...basis, assetType: 'savings', risicoLabel: 'Laag' })).toEqual(['telt volledig mee'])
  })

  it('verkoopstrategie alleen bij types met een verkoopstrategie', () => {
    expect(assetTeltMeeDelen({ ...basis, assetType: 'vehicle', verkoopStand: 'wanneer_nodig' })).toContain('verkoop bij behoefte')
    expect(assetTeltMeeDelen({ ...basis, assetType: 'real_estate', verkoopStand: 'niet_verkopen' })).toContain('niet verkopen')
    expect(assetTeltMeeDelen({ ...basis, assetType: 'other', verkoopStand: 'vast_moment' })).toContain('verkoop op een vast moment')
    expect(assetTeltMeeDelen({ ...basis, assetType: 'investment', verkoopStand: 'niet_verkopen' })).toEqual(['telt volledig mee'])
  })
})

describe('samenvattingVan', () => {
  it('alleen de eerste letter van de regel wordt een hoofdletter', () => {
    expect(samenvattingVan(['telt volledig mee', 'risicoprofiel middel'])).toBe('Telt volledig mee · risicoprofiel middel')
    expect(samenvattingVan(['met notitie'])).toBe('Met notitie')
    expect(samenvattingVan([false, 'hypotheekplanner aan', null, 'met notitie'])).toBe('Hypotheekplanner aan · met notitie')
  })

  it('niets ingevuld: geen regel', () => {
    expect(samenvattingVan([])).toBeNull()
    expect(samenvattingVan([false, null, undefined, ''])).toBeNull()
  })
})

describe('titel van het tweede blok', () => {
  it('"en koppelingen" alleen bij types met een app of externe koppeling', () => {
    for (const type of ['savings', 'investment', 'crypto', 'retirement', 'eigen_huis', 'real_estate'] as AssetType[]) {
      expect(assetGegevensTitel(type, true)).toBe('Meer gegevens en koppelingen')
    }
    for (const type of ['vehicle', 'physical', 'deelneming', 'levensverzekering', 'vordering', 'other'] as AssetType[]) {
      expect(assetGegevensTitel(type, true)).toBe('Meer gegevens')
    }
  })

  it('bij cash hangt het aan de budgetmodule', () => {
    expect(assetGegevensTitel('cash', true)).toBe('Meer gegevens en koppelingen')
    expect(assetGegevensTitel('cash', false)).toBe('Meer gegevens')
  })
})

describe('basisvelden per type', () => {
  it('spaargeld heeft geen aankoopwaarde', () => {
    expect(showsAssetBaseField('savings', 'purchase_value')).toBe(false)
    expect(showsAssetBaseField('investment', 'purchase_value')).toBe(true)
    expect(showsAssetBaseField('vehicle', 'purchase_value')).toBe(true)
  })

  it('inleg staat alleen waar je inlegt, premie betaalt of aflossing ontvangt', () => {
    for (const type of ['savings', 'investment', 'crypto', 'retirement', 'levensverzekering', 'vordering'] as AssetType[]) {
      expect(showsAssetBaseField(type, 'monthly_contribution')).toBe(true)
    }
    for (const type of ['real_estate', 'vehicle', 'physical', 'deelneming', 'other'] as AssetType[]) {
      expect(showsAssetBaseField(type, 'monthly_contribution')).toBe(false)
    }
  })

  it('een opgeslagen inleg blijft zichtbaar, zodat hij niet onzichtbaar meerekent', () => {
    expect(showsAssetBaseField('other', 'monthly_contribution', 200)).toBe(true)
    expect(showsAssetBaseField('vehicle', 'monthly_contribution', -50)).toBe(true)
    expect(showsAssetBaseField('other', 'monthly_contribution', 0)).toBe(false)
    expect(showsAssetBaseField('other', 'monthly_contribution', null)).toBe(false)
    expect(showsAssetBaseField('other', 'monthly_contribution', undefined)).toBe(false)
  })

  it('de uitzondering geldt alleen voor de inleg', () => {
    expect(showsAssetBaseField('other', 'institution', 200)).toBe(false)
    expect(showsAssetBaseField('savings', 'purchase_value', 200)).toBe(false)
  })

  it('instelling staat niet bij tastbaar bezit', () => {
    for (const type of ['real_estate', 'vehicle', 'physical', 'other'] as AssetType[]) {
      expect(showsAssetBaseField(type, 'institution')).toBe(false)
    }
    expect(showsAssetBaseField('retirement', 'institution')).toBe(true)
    expect(showsAssetBaseField('deelneming', 'institution')).toBe(true)
  })
})
