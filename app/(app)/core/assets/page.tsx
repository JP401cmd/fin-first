import { createClient } from '@/lib/supabase/server'
import { loadAssetsData } from '@/lib/assets-data-loader'
import AssetsPage from '@/components/core/assets-client'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { getServerPerspective } from '@/lib/household/server-perspective'

export default async function AssetsServerPage() {
  const supabase = await createClient()
  const perspective = await getServerPerspective()

  try {
    const assetsData = await loadAssetsData(supabase, perspective)
    return (
      <>
        <NavStackMeta title="Bezittingen" bottomBar={{ kind: 'tabs' }} />
        <AssetsPage initialData={assetsData} />
      </>
    )
  } catch {
    // Fallback to client-side loading if server-side fails
    return (
      <>
        <NavStackMeta title="Bezittingen" bottomBar={{ kind: 'tabs' }} />
        <AssetsPage />
      </>
    )
  }
}
