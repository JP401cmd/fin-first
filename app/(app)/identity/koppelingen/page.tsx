import { createClient } from '@/lib/supabase/server'
import { loadConnectionsData } from '@/lib/connections-data'
import { KoppelingenClient } from './koppelingen-client'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'

export default async function KoppelingenPage() {
  const supabase = await createClient()
  const data = await loadConnectionsData(supabase)

  return (
    <>
      <NavStackMeta title="Koppelingen" bottomBar={{ kind: 'tabs' }} />
      <KoppelingenClient initialData={data} />
    </>
  )
}
