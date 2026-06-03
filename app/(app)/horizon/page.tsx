import { createClient } from '@/lib/supabase/server'
import { loadHorizonData } from '@/lib/horizon-data-loader'
import { getServerPerspective } from '@/lib/household/server-perspective'
import HorizonPage from '@/components/app/horizon/horizon-client'

export default async function HorizonServerPage() {
  const supabase = await createClient()
  // First paint volgt het cookie-perspectief; de client her-laadt bij in-sessie
  // wissels via usePerspective(). Solo-gebruikers krijgen 'personal' (identiek).
  const perspective = await getServerPerspective()
  const horizonData = await loadHorizonData(supabase, perspective)
  return <HorizonPage initialData={horizonData} />
}
