import { createClient } from '@/lib/supabase/server'
import { loadConnectionsData } from '@/lib/connections-data'
import { loadBrokerConnectionsForUser } from '@/lib/broker-connections-data'
import { loadAangifteImports } from '@/lib/aangifte/imports-loader'
import { KoppelingenClient } from './koppelingen-client'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'

export default async function KoppelingenPage() {
  const supabase = await createClient()
  // Parallel loaders — the page renders the union. Broker-koppelingen
  // (Trading 212) en aangifte imports zijn aparte secties naast crypto/bank/etc.
  const [data, brokerConnections, aangifteImports] = await Promise.all([
    loadConnectionsData(supabase),
    loadBrokerConnectionsForUser(supabase),
    loadAangifteImports(supabase),
  ])

  return (
    <>
      <NavStackMeta title="Koppelingen" bottomBar={{ kind: 'tabs' }} />
      <KoppelingenClient
        initialData={data}
        brokerConnections={brokerConnections}
        aangifteImports={aangifteImports}
      />
    </>
  )
}
