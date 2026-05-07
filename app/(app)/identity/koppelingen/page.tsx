import { createClient } from '@/lib/supabase/server'
import { loadConnectionsData } from '@/lib/connections-data'
import { loadAangifteImports } from '@/lib/aangifte/imports-loader'
import { KoppelingenClient } from './koppelingen-client'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'

export default async function KoppelingenPage() {
  const supabase = await createClient()
  // Two parallel loaders — the page renders the union. Aangifte imports
  // are surfaced as a dedicated section alongside crypto/bank/etc.
  const [data, aangifteImports] = await Promise.all([
    loadConnectionsData(supabase),
    loadAangifteImports(supabase),
  ])

  return (
    <>
      <NavStackMeta title="Koppelingen" bottomBar={{ kind: 'tabs' }} />
      <KoppelingenClient initialData={data} aangifteImports={aangifteImports} />
    </>
  )
}
