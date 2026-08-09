'use client'

import { ASSET_TYPE_LABELS, type AssetType } from '@/lib/asset-data'
import { FilterDropdown, type FilterItem } from './filter-dropdown'

/**
 * BezittingenFilter — controlled dropdown-filter op /overzicht/bezittingen.
 *
 * State leeft in de parent (BezittingenView): `value` is het actieve
 * asset-type of `null` voor "alle bezittingen"; `onChange` ontvangt de
 * nieuwe selectie. De parent geeft hetzelfde `value` ook door aan
 * `AssetsPage.assetTypeFilter` zodat de dropdown en de categorie-lijst
 * onder de toolbar synchroon blijven — selecteren = lijst filteren, geen
 * route-navigatie meer.
 *
 * BEZ-2 (drempel): onder de `BEZITTINGEN_FILTER_MIN_ITEMS`-drempel rendert de
 * filter niets. Wie zes bezittingen heeft ziet de hele lijst toch al in één
 * oogopslag; de dropdown is dan puur ruis boven de lijst.
 */
const ITEMS: FilterItem<AssetType>[] = (
  Object.entries(ASSET_TYPE_LABELS) as [AssetType, string][]
).map(([key, label]) => ({ key, label }))

/**
 * Vanaf hoeveel bezittingen het categoriefilter verschijnt (audit BEZ-2,
 * "pas tonen vanaf ~8 items").
 *
 * Bewust NIET modus-afhankelijk: de reden om de dropdown te verbergen is het
 * áántal items, niet het ervaringsniveau van de lezer. Een korte lijst filteren
 * is in Volledig net zo zinloos als in Eenvoudig — een tweede regel ("in
 * Eenvoudig pas vanaf 8, in Volledig altijd") zou het gedrag onvoorspelbaar
 * maken zonder iets op te lossen.
 */
export const BEZITTINGEN_FILTER_MIN_ITEMS = 8

type BezittingenFilterProps = {
  value: AssetType | null
  onChange: (value: AssetType | null) => void
  /**
   * Aantal actieve bezittingen op de pagina — dezelfde telling die de
   * pagina-deck als "N bezittingen" toont (live uit `AssetsPage`, dus ook
   * correct na een perspectief-wissel of het toevoegen/verwijderen van een
   * bezitting). Onder de drempel rendert de filter niet.
   */
  assetCount: number
}

export function BezittingenFilter({ value, onChange, assetCount }: BezittingenFilterProps) {
  // Een actieve selectie houdt de dropdown zichtbaar, óók onder de drempel:
  // anders zou de lijst gefilterd blijven zonder bediening om dat terug te
  // draaien (bv. na het verwijderen van bezittingen tot onder de 8).
  if (assetCount < BEZITTINGEN_FILTER_MIN_ITEMS && value === null) return null

  return (
    <FilterDropdown<AssetType>
      items={ITEMS}
      activeKey={value}
      allLabel="Alle bezittingen"
      onSelect={onChange}
      minWidth="240px"
    />
  )
}
