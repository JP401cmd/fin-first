import { createClient } from '@/lib/supabase/server'
import { loadConnectionsData } from '@/lib/connections-data'
import { KoppelingenClient } from './koppelingen-client'

export default async function KoppelingenPage() {
  const supabase = await createClient()
  const data = await loadConnectionsData(supabase)

  return <KoppelingenClient initialData={data} />
}
