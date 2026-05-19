'use client'

import { useRouter, usePathname } from 'next/navigation'
import { DEBT_TYPE_LABELS, type DebtType } from '@/lib/debt-data'
import { FilterDropdown, type FilterItem } from './filter-dropdown'

/**
 * SchuldenFilter — dropdown-filter op /overzicht/schulden. Levert
 * filter-items uit DEBT_TYPE_LABELS aan generic FilterDropdown, met
 * router-binding naar /overzicht/schulden/[type].
 */

const ITEMS: FilterItem<DebtType>[] = (
  Object.entries(DEBT_TYPE_LABELS) as [DebtType, string][]
).map(([key, label]) => ({ key, label }))

export function SchuldenFilter() {
  const router = useRouter()
  const pathname = usePathname() ?? '/overzicht/schulden'

  const activeType: DebtType | null = (() => {
    const match = pathname.match(/^\/overzicht\/schulden\/([^/]+)/)
    if (!match) return null
    const type = match[1] as DebtType
    return type in DEBT_TYPE_LABELS ? type : null
  })()

  function handleSelect(key: DebtType | null) {
    router.push(key ? `/overzicht/schulden/${key}` : '/overzicht/schulden')
  }

  return (
    <FilterDropdown<DebtType>
      items={ITEMS}
      activeKey={activeType}
      allLabel="Alle schulden"
      onSelect={handleSelect}
    />
  )
}
