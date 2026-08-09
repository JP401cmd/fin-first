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
 *
 * De filter komt als render-functie mee zodat `<AssetsPage>` z'n LIVE
 * bezittingen-telling kan doorgeven (BEZ-2-drempel). Die telling herladen we
 * hier bewust niet zelf: `AssetsPage` is de enige plek die de lijst na een
 * perspectief-wissel of CRUD ververst — een eigen telling uit `initialData`
 * zou daar stil van weg driften.
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
      toolbarFilter={({ assetCount }: { assetCount: number }) => (
        <BezittingenFilter value={filter} onChange={setFilter} assetCount={assetCount} />
      )}
      inspirationCards={inspirationCards}
      assetTypeFilter={filter}
      // De page-shell (`overzicht/bezittingen/page.tsx`) rendert de i +
      // statuspunt + insight-toggle; onderdruk de ingebouwde i hier.
      showPageInfo={false}
    />
  )
}
