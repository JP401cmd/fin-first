import { createClient } from '@/lib/supabase/server'
import { loadAssetsData } from '@/lib/assets-data-loader'
import AssetsPage from '@/components/core/assets-client'

export default async function AssetsServerPage() {
  const supabase = await createClient()

  try {
    const assetsData = await loadAssetsData(supabase)
    return <AssetsPage initialData={assetsData} />
  } catch {
    // Fallback to client-side loading if server-side fails
    return <AssetsPage />
  }
}
