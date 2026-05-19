'use client'

import { useRouter, usePathname } from 'next/navigation'
import { ASSET_TYPE_LABELS, type AssetType } from '@/lib/asset-data'
import { FilterDropdown, type FilterItem } from './filter-dropdown'

/**
 * BezittingenFilter — dropdown-filter op /overzicht/bezittingen. Levert
 * filter-items uit ASSET_TYPE_LABELS aan generic FilterDropdown, met
 * router-binding naar /overzicht/bezittingen/[type].
 */

const ITEMS: FilterItem<AssetType>[] = (
  Object.entries(ASSET_TYPE_LABELS) as [AssetType, string][]
).map(([key, label]) => ({ key, label }))

export function BezittingenFilter() {
  const router = useRouter()
  const pathname = usePathname() ?? '/overzicht/bezittingen'

  const activeType: AssetType | null = (() => {
    const match = pathname.match(/^\/overzicht\/bezittingen\/([^/]+)/)
    if (!match) return null
    const type = match[1] as AssetType
    return type in ASSET_TYPE_LABELS ? type : null
  })()

  function handleSelect(key: AssetType | null) {
    router.push(key ? `/overzicht/bezittingen/${key}` : '/overzicht/bezittingen')
  }

  return (
    <FilterDropdown<AssetType>
      items={ITEMS}
      activeKey={activeType}
      allLabel="Alle bezittingen"
      onSelect={handleSelect}
      minWidth="240px"
    />
  )
}
