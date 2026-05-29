'use client'

import { DEBT_TYPE_LABELS, type DebtType } from '@/lib/debt-data'
import { FilterDropdown, type FilterItem } from './filter-dropdown'

/**
 * SchuldenFilter — controlled dropdown-filter op /overzicht/schulden.
 *
 * State leeft in de parent (SchuldenView): `value` is het actieve
 * debt-type of `null` voor "alle schulden"; `onChange` ontvangt de nieuwe
 * selectie. Voor synchronisatie met de categorie-lijst eronder geeft de
 * parent dezelfde `value` ook door aan `DebtsPage.debtTypeFilter`.
 */
const ITEMS: FilterItem<DebtType>[] = (
  Object.entries(DEBT_TYPE_LABELS) as [DebtType, string][]
).map(([key, label]) => ({ key, label }))

type SchuldenFilterProps = {
  value: DebtType | null
  onChange: (value: DebtType | null) => void
}

export function SchuldenFilter({ value, onChange }: SchuldenFilterProps) {
  return (
    <FilterDropdown<DebtType>
      items={ITEMS}
      activeKey={value}
      allLabel="Alle schulden"
      onSelect={onChange}
    />
  )
}
