import { createClient } from '@/lib/supabase/server'
import { loadHorizonData } from '@/lib/horizon-data-loader'
import HorizonPage from '@/components/app/horizon/horizon-client'

export default async function HorizonServerPage() {
  const supabase = await createClient()
  const horizonData = await loadHorizonData(supabase)
  return <HorizonPage initialData={horizonData} />
}
