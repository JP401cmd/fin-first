import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { loadAssetsData } from '@/lib/assets-data-loader'
import AssetsPage from '@/components/core/assets-client'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'

export const metadata: Metadata = {
  title: 'Bezittingen — TriFinity',
  description: 'Cash, beleggingen, huis en pensioen — de hefboom bezittingen.',
}

/**
 * /overzicht/bezittingen — eerste hefboom-verdieping in nieuwe architectuur.
 *
 * Vervangt /core/assets. Voor nu rendert AssetsPage met dezelfde data zodat
 * de UI direct werkt onder de nieuwe URL. Toekomstige verbeteringen:
 *  - segmented-control [Alles | Cash | Beleggen | Huis | Pensioen]
 *  - progressive-disclosure uitbreidingen via "⋯ Meer" (Crypto, NFT, ...)
 *  - Holdings, revalue, etc. worden interne tabs i.p.v. aparte sub-routes
 */
export default async function OverzichtBezittingenPage() {
  const supabase = await createClient()

  try {
    const assetsData = await loadAssetsData(supabase)
    return (
      <>
        <NavStackMeta title="Bezittingen" bottomBar={{ kind: 'tabs' }} />
        <AssetsPage initialData={assetsData} />
      </>
    )
  } catch {
    return (
      <>
        <NavStackMeta title="Bezittingen" bottomBar={{ kind: 'tabs' }} />
        <AssetsPage />
      </>
    )
  }
}
