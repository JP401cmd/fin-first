// app/(app)/core/debts/load-debts-page-data.ts
//
// SERVER-ONLY loader voor de schulden-pagina. Bouwt de first-paint-seed
// (`DebtsInitialData`) die de server-shells `/core/debts` en
// `/overzicht/schulden` als prop aan `<DebtsClient>` meegeven, zodat de eerste
// render meteen content toont i.p.v. een fullscreen-spinner en de eerste
// client-fetch na hydratie kan worden overgeslagen.
//
// Auth/RLS: de aanroeper geeft de cookie-server-client mee (RLS afgedwongen,
// GEEN service-role) — identieke handhaving als de client-fetch die deze seed
// vervangt. De data is byte-identiek aan wat `<DebtsClient>` anders zelf op
// mount zou laden:
//   • schulden + context → `loadPerspectiveDataServer` (== loadPerspectiveData,
//     request-gecachte context)
//   • assets → zelfde kolom-selectie als `loadUserAssets`
//   • woonstrategie-config → zelfde `profiles.housing_strategy_config`-read als
//     `loadHousingStrategy`

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Perspective } from '@/lib/household-data'
import { loadPerspectiveDataServer } from '@/lib/household/perspective-loader-server'
import type { Asset } from '@/lib/asset-data'
import type { DebtsInitialData, PerspectiveDebt } from './debts-client'

export async function loadDebtsPageData(
  supabase: SupabaseClient,
  perspective: Perspective,
): Promise<DebtsInitialData> {
  // Schulden + huishoud-context — dezelfde loader als de client, server-variant
  // met request-gecachte context (byte-identiek resultaat).
  const perspectiveData = await loadPerspectiveDataServer(supabase, perspective)

  // Assets voor de LTV-KPI's — exact dezelfde kolomselectie/-filtering als
  // `loadUserAssets` in de client.
  const { data: assetRows } = await supabase
    .from('assets')
    .select('id, name, asset_type, current_value, linked_asset_id, is_active')
    .eq('is_active', true)
    .order('name')

  // Woonstrategie-config (eigen-rij) — zelfde read als `loadHousingStrategy`.
  const { data: profileRow } = await supabase
    .from('profiles')
    .select('housing_strategy_config')
    .single()

  return {
    perspective,
    debts: perspectiveData.debts as unknown as PerspectiveDebt[],
    context: perspectiveData.context,
    assets: (assetRows ?? []) as Asset[],
    housingStrategyConfig: profileRow?.housing_strategy_config ?? null,
  }
}
