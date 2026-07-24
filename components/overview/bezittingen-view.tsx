'use client'

import { useState, type ReactNode } from 'react'
import AssetsPage from '@/components/core/assets-client'
import { BezittingenFilter } from '@/components/overview/bezittingen-filter'
import type { AssetType } from '@/lib/asset-data'
import type { AssetsPageData } from '@/lib/assets-data-loader'

/**
 * BezittingenView — client-wrapper rond `<AssetsPage>` die de filter-state
 * vasthoudt. Op /overzicht/bezittingen werkt de filter NIET meer als
 * route-redirect (oude gedrag) maar als client-side filter: dropdown +
 * categorie-lijst blijven op dezelfde pagina, alleen de gerenderde
 * categorieën worden ingeperkt.
 *
 * Inspiratie-blokken (CompoundInsight/FeeImpact) renderen via prop omdat
 * hun drempel-logica op de page-server gebeurt; de filter-state mag die
 * niet beïnvloeden — een gebruiker die op "Cash" filtert moet de
 * fee-impact-tip nog steeds zien als hij €25k+ belegd heeft.
 */
interface BezittingenViewProps {
  initialData?: AssetsPageData
  inspirationCards: ReactNode
}

export function BezittingenView({ initialData, inspirationCards }: BezittingenViewProps) {
  const [filter, setFilter] = useState<AssetType | null>(null)

  return (
    <AssetsPage
      initialData={initialData}
      toolbarFilter={<BezittingenFilter value={filter} onChange={setFilter} />}
      inspirationCards={inspirationCards}
      assetTypeFilter={filter}
      // De page-shell (`overzicht/bezittingen/page.tsx`) rendert de i +
      // statuspunt + insight-toggle; onderdruk de ingebouwde i hier.
      showPageInfo={false}
    />
  )
}
