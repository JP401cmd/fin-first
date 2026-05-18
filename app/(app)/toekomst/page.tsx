import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { loadHorizonData } from '@/lib/horizon-data-loader'
import HorizonPage from '@/components/app/horizon/horizon-client'

export const metadata: Metadata = {
  title: 'Toekomst — TriFinity',
  description: 'Tijdas, doelen, gebeurtenissen en toekomst-voorkeuren — keuzes maken voor later.',
}

/**
 * /toekomst — canonieke toekomst-pagina (nieuwe navigatie-architectuur).
 *
 * Vervangt /horizon. Voor nu rendert HorizonPage (= horizon-client) zodat
 * preview-functionaliteit meteen werkt onder de nieuwe URL. HorizonPage
 * heeft al een PageInfoButton intern met PAGE_INFO['/horizon']-content —
 * geen wrapper-knop hier om duplicatie te voorkomen.
 *
 * In komende fases wordt HorizonPage zelf hervormd naar de vier-tab-structuur:
 *  - Tab 1: Tijdas (fase-bar onder grafiek, drag&drop, Risk Lab inline)
 *  - Tab 2: Doelen (status-flags Wealthfolio-stijl, detail-pane)
 *  - Tab 3: Gebeurtenissen (events + 3 levensstrategieën: AOW · Pensioen · Huis)
 *  - Tab 4: Toekomst voorkeuren (eindstrategie + onttrekking + verdeling)
 *
 * Bij die refactor wordt PAGE_INFO['/toekomst'] (al toegevoegd in
 * lib/page-info-content.ts) opgepakt — voor nu valt /toekomst nog terug
 * op de generieke /horizon-tekst die alsnog passend is.
 */
export default async function ToekomstPage() {
  const supabase = await createClient()
  const horizonData = await loadHorizonData(supabase)
  return <HorizonPage initialData={horizonData} />
}
