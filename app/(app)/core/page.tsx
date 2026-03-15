import { createClient } from '@/lib/supabase/server'
import { loadCoreData } from '@/lib/core-data-loader'
import CorePage from '@/components/core/core-client'

export default async function CoreServerPage() {
  const supabase = await createClient()

  try {
    const coreData = await loadCoreData(supabase)
    return <CorePage initialData={coreData} />
  } catch {
    // Fallback to client-side loading if server-side fails
    return <CorePage />
  }
}
