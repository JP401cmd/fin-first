import { createClient } from '@/lib/supabase/server'
import { loadConnectionsData } from '@/lib/connections-data'
import { loadBrokerConnectionsForUser } from '@/lib/broker-connections-data'
import { loadAangifteImports } from '@/lib/aangifte/imports-loader'
import { isTrueLayerEnabled } from '@/lib/truelayer/feature-flag'
import { KoppelingenClient } from './koppelingen-client'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'

export default async function KoppelingenPage() {
  const supabase = await createClient()
  // Parallel loaders — the page renders the union. Broker-koppelingen
  // (Trading 212) en aangifte imports zijn aparte secties naast crypto/bank/etc.
  // `bankConnectEnabled` leest de runtime-vlag `truelayer_enabled` uit
  // app_settings (globale, niet-secret tak — leesbaar met de anon-RLS-client,
  // géén service-role) zodat de bank-sectie nooit iets belooft wat de vlag
  // tegenspreekt.
  const [data, brokerConnections, aangifteImports, bankConnectEnabled] = await Promise.all([
    loadConnectionsData(supabase),
    loadBrokerConnectionsForUser(supabase),
    loadAangifteImports(supabase),
    isTrueLayerEnabled(supabase),
  ])

  return (
    <>
      <NavStackMeta title="Koppelingen" bottomBar={{ kind: 'tabs' }} />
      <KoppelingenClient
        initialData={data}
        brokerConnections={brokerConnections}
        aangifteImports={aangifteImports}
        bankConnectEnabled={bankConnectEnabled}
      />
    </>
  )
}
