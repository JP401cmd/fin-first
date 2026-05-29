'use client'

import { useState } from 'react'
import DebtsPage from '@/app/(app)/core/debts/page'
import { SchuldenFilter } from '@/components/overview/schulden-filter'
import type { DebtType } from '@/lib/debt-data'

/**
 * SchuldenView — client-wrapper rond `<DebtsPage>` die de filter-state
 * vasthoudt. Op /overzicht/schulden werkt de filter NIET meer als
 * route-redirect (oude gedrag) maar als client-side filter: dropdown +
 * categorie-lijst blijven op dezelfde pagina, alleen de gerenderde
 * categorieën worden ingeperkt.
 */
export function SchuldenView() {
  const [filter, setFilter] = useState<DebtType | null>(null)

  return (
    <DebtsPage
      toolbarFilter={<SchuldenFilter value={filter} onChange={setFilter} />}
      debtTypeFilter={filter}
    />
  )
}
