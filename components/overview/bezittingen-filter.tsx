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
 */
const ITEMS: FilterItem<AssetType>[] = (
  Object.entries(ASSET_TYPE_LABELS) as [AssetType, string][]
).map(([key, label]) => ({ key, label }))

type BezittingenFilterProps = {
  value: AssetType | null
  onChange: (value: AssetType | null) => void
}

export function BezittingenFilter({ value, onChange }: BezittingenFilterProps) {
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
