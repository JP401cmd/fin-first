/**
 * Indeling van het bewerkformulier voor bezittingen, per type.
 *
 * `ASSET_TYPE_FIELDS` (lib/asset-data.ts) zegt welke kolommen bij een type
 * HOREN en dus bewaard blijven bij het opslaan. Dit bestand zegt waar het
 * formulier ze TOONT:
 *
 *  - `meer`     in het ingeklapte blok "Meer instellingen".
 *  - `verborgen` niet in het formulier. De opgeslagen waarde blijft staan:
 *               verbergen is geen wissen.
 *
 * Alles wat bij het type hoort en in geen van beide staat, staat in de kern.
 *
 * Server-safe en puur: geen 'use client', geen DOM, geen hooks.
 */
import { ASSET_TYPE_FIELDS, type AssetType } from './asset-data'
import { inclusieTekst } from './debt-form-layout'

/** Velden van het basisblok die elk type (behalve cash) deelt. */
export type AssetBaseField = 'purchase_value' | 'monthly_contribution' | 'purchase_date' | 'institution'

export type AssetFormPlacement = {
  meer: readonly string[]
  verborgen: readonly string[]
  /** Basisvelden die dit type niet toont. */
  basisVerborgen: readonly AssetBaseField[]
}

/**
 * `purchase_date` staat bij elk type op verborgen: de datum wordt alleen in
 * het eigen detailvenster getoond en voedt geen enkele berekening.
 */
export const ASSET_FORM_LAYOUT: Record<AssetType, AssetFormPlacement> = {
  // "Direct opneembaar" heeft hier geen effect: de opslag zet het altijd op waar.
  cash: { meer: [], verborgen: ['is_liquid'], basisVerborgen: ['purchase_date'] },
  // Spaargeld heeft geen aankoopwaarde.
  savings: { meer: [], verborgen: [], basisVerborgen: ['purchase_value', 'purchase_date'] },
  // De ticker volgt uit de holdings; het risicoprofiel heeft een standaard per subtype.
  investment: { meer: ['risk_profile'], verborgen: ['ticker_symbol'], basisVerborgen: ['purchase_date'] },
  crypto: { meer: ['risk_profile'], verborgen: ['ticker_symbol'], basisVerborgen: ['purchase_date'] },
  // "Fiscaal voordeel" verandert alleen een toelichting; het uitvoerder-type
  // dubbelt met het veld Instelling.
  retirement: {
    meer: ['risk_profile'],
    verborgen: ['tax_benefit', 'retirement_provider_type'],
    basisVerborgen: ['purchase_date'],
  },
  // Huur op de eigen woning rekent nergens in mee; het adres is alleen weergave.
  eigen_huis: {
    meer: ['address_postcode', 'address_house_number'],
    verborgen: ['rental_income'],
    basisVerborgen: ['purchase_date'],
  },
  real_estate: { meer: [], verborgen: [], basisVerborgen: ['monthly_contribution', 'purchase_date', 'institution'] },
  vehicle: { meer: [], verborgen: [], basisVerborgen: ['monthly_contribution', 'purchase_date', 'institution'] },
  physical: { meer: [], verborgen: [], basisVerborgen: ['monthly_contribution', 'purchase_date', 'institution'] },
  // Het KvK-nummer heeft geen lezer buiten het detailvenster.
  deelneming: {
    meer: ['risk_profile'],
    verborgen: ['kvk_number'],
    basisVerborgen: ['monthly_contribution', 'purchase_date'],
  },
  levensverzekering: { meer: ['risk_profile'], verborgen: [], basisVerborgen: ['purchase_date'] },
  vordering: { meer: [], verborgen: [], basisVerborgen: ['purchase_date'] },
  other: { meer: [], verborgen: [], basisVerborgen: ['monthly_contribution', 'purchase_date', 'institution'] },
}

/**
 * Velden die geen invoer in het blok "Details" zijn: `subtype` heeft een eigen
 * keuzelijst, `institution` staat in het basisblok en `sale_config` heeft een
 * eigen sectie.
 */
const GEEN_DETAILVELD: readonly string[] = ['subtype', 'institution', 'sale_config']

/** Type-specifieke velden die het formulier in de kern toont (blok "Details"). */
export function kernAssetFields(assetType: AssetType): string[] {
  const { meer, verborgen } = ASSET_FORM_LAYOUT[assetType]
  return ASSET_TYPE_FIELDS[assetType].filter(
    (f) => !GEEN_DETAILVELD.includes(f) && !meer.includes(f) && !verborgen.includes(f),
  )
}

const VERKOOP_TEKST: Record<'wanneer_nodig' | 'vast_moment' | 'niet_verkopen', string> = {
  wanneer_nodig: 'verkoop bij behoefte',
  vast_moment: 'verkoop op een vast moment',
  niet_verkopen: 'niet verkopen',
}

/**
 * Samenvatting van het blok "Hoe telt dit mee" in het bezittingenformulier:
 * alles wat de cijfers van deze bezitting verandert, in één regel.
 */
export function assetTeltMeeDelen(s: {
  assetType: AssetType
  netWorthInclusionPct: number
  ownership: 'personal' | 'shared'
  /** Label van het gekozen risicoprofiel, of `null` als er geen is gekozen. */
  risicoLabel: string | null
  verkoopStand: keyof typeof VERKOOP_TEKST | null
}): string[] {
  const delen = [inclusieTekst(s.netWorthInclusionPct)]
  if (s.ownership === 'shared') delen.push('gedeeld')
  if (showsAssetFieldInMeer(s.assetType, 'risk_profile') && s.risicoLabel) {
    delen.push(`risicoprofiel ${s.risicoLabel.toLowerCase()}`)
  }
  if (ASSET_TYPE_FIELDS[s.assetType].includes('sale_config') && s.verkoopStand) {
    delen.push(VERKOOP_TEKST[s.verkoopStand])
  }
  return delen
}

/** Types met een app-schakelaar of een externe koppeling in het formulier. */
const TYPES_MET_KOPPELINGEN: readonly AssetType[] = [
  'cash', 'savings', 'investment', 'crypto', 'retirement', 'eigen_huis', 'real_estate',
]

/**
 * Titel van het tweede blok: "Meer gegevens en koppelingen" alleen waar het blok
 * ook echt een koppeling bevat. Bij cash hangt dat aan de budgetmodule.
 */
export function assetGegevensTitel(assetType: AssetType, budgetingActive: boolean): string {
  const heeftKoppelingen = assetType === 'cash' ? budgetingActive : TYPES_MET_KOPPELINGEN.includes(assetType)
  return heeftKoppelingen ? 'Meer gegevens en koppelingen' : 'Meer gegevens'
}

/** Toont het formulier dit type-specifieke veld in de kern? */
export function showsAssetFieldInKern(assetType: AssetType, field: string): boolean {
  return kernAssetFields(assetType).includes(field)
}

/** Toont het formulier dit type-specifieke veld in "Meer instellingen"? */
export function showsAssetFieldInMeer(assetType: AssetType, field: string): boolean {
  return ASSET_TYPE_FIELDS[assetType].includes(field) && ASSET_FORM_LAYOUT[assetType].meer.includes(field)
}

/**
 * Toont het formulier dit basisveld?
 *
 * `monthly_contribution` telt mee in de maandelijkse inleg van het dashboard en
 * de horizon. Staat er bij een type dat het veld normaal niet toont tóch een
 * bedrag opgeslagen, dan blijft het veld zichtbaar: een waarde die meerekent
 * mag niet onzichtbaar en onwijzigbaar worden. Zelfde regel als
 * `showsMinimumPayment` bij schulden.
 */
export function showsAssetBaseField(
  assetType: AssetType,
  field: AssetBaseField,
  storedMonthlyContribution?: number | null,
): boolean {
  if (!ASSET_FORM_LAYOUT[assetType].basisVerborgen.includes(field)) return true
  if (field !== 'monthly_contribution') return false
  const stored = Number(storedMonthlyContribution)
  return Number.isFinite(stored) && stored !== 0
}
