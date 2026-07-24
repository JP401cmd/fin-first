'use client'

import { useState } from 'react'
import { DebtsClient, type DebtsInitialData } from '@/app/(app)/core/debts/debts-client'
import { SchuldenFilter } from '@/components/overview/schulden-filter'
import type { DebtType } from '@/lib/debt-data'

/**
 * SchuldenView — client-wrapper rond `<DebtsClient>` die de filter-state
 * vasthoudt. Op /overzicht/schulden werkt de filter NIET meer als
 * route-redirect (oude gedrag) maar als client-side filter: dropdown +
 * categorie-lijst blijven op dezelfde pagina, alleen de gerenderde
 * categorieën worden ingeperkt.
 *
 * `initialData` = de server-geseede first-paint-data (zie de server-shell
 * `overzicht/schulden/page.tsx`); wordt doorgegeven aan `<DebtsClient>` voor
 * de content-first render.
 */
export function SchuldenView({ initialData }: { initialData?: DebtsInitialData }) {
  const [filter, setFilter] = useState<DebtType | null>(null)

  return (
    <DebtsClient
      toolbarFilter={<SchuldenFilter value={filter} onChange={setFilter} />}
      debtTypeFilter={filter}
      initialData={initialData}
      // De page-shell (`overzicht/schulden/page.tsx`) rendert de i +
      // statuspunt; onderdruk de ingebouwde i hier.
      showPageInfo={false}
    />
  )
}
