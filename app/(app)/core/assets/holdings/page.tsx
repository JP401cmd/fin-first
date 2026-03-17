import { createClient } from '@/lib/supabase/server'
import { loadHoldingsData } from '@/lib/holdings-data-loader'
import HoldingsPage from '@/components/core/holdings-client'

export default async function HoldingsServerPage() {
  const supabase = await createClient()

  try {
    const holdingsData = await loadHoldingsData(supabase)
    return <HoldingsPage initialData={holdingsData} />
  } catch {
    // Fallback to client-side loading if server-side fails
    return <HoldingsPage />
  }
}
