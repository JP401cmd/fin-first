import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { loadHorizonData } from '@/lib/horizon-data-loader'
import HorizonPage from '@/components/app/horizon/horizon-client'
import { ToekomstTabs } from '@/components/future/toekomst-tabs'

export const metadata: Metadata = {
  title: 'Toekomst — TriFinity',
  description: 'Tijdas, doelen, gebeurtenissen en toekomst-voorkeuren — keuzes maken voor later.',
}

/**
 * /toekomst — canonieke toekomst-pagina (nieuwe navigatie-architectuur).
 *
 * Plan §6.3 vier-tab-structuur:
 *  - Tab 1: Tijdas (default) — toont bestaande HorizonPage met grafiek
 *           + Risk Lab + drag&drop events (toekomstige extractie)
 *  - Tab 2: Doelen — placeholder met deeplink naar Will-doelen
 *  - Tab 3: Gebeurtenissen — placeholder met deeplinks naar strategie/whatif
 *  - Tab 4: Voorkeuren — placeholder met deeplinks naar parameters/instellingen
 *
 * Niet-destructieve scaffolding: Tijdas-tab rendert het bestaande
 * HorizonPage 1-op-1, alleen verpakt in de segmented-control. De andere
 * tabs tonen voor nu placeholder-cards met links naar de huidige routes
 * — in komende iteraties wordt hun content nativ uit HorizonPage
 * geëxtraheerd.
 */
export default async function ToekomstPage() {
  const supabase = await createClient()
  const horizonData = await loadHorizonData(supabase)
  return (
    <ToekomstTabs tijdasView={<HorizonPage initialData={horizonData} />} />
  )
}
