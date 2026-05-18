import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { loadAssetsData } from '@/lib/assets-data-loader'
import AssetsPage from '@/components/core/assets-client'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { BezittingenSegmented } from '@/components/overview/bezittingen-segmented'

export const metadata: Metadata = {
  title: 'Bezittingen — TriFinity',
  description: 'Cash, beleggingen, huis en pensioen — de hefboom bezittingen.',
}

/**
 * /overzicht/bezittingen — eerste hefboom-verdieping in nieuwe architectuur.
 *
 * Toont "Alles"-view via AssetsPage. Voor specifieke categorieën navigeert
 * de segmented-control naar /overzicht/bezittingen/[type] (re-exports van
 * /core/assets/[type]). Toekomstige verbeteringen:
 *  - progressive-disclosure uitbreidingen via "⋯ Meer" (Crypto, NFT, ...)
 *  - Holdings, revalue, etc. worden interne tabs i.p.v. aparte sub-routes
 */
async function tryLoadAssetsData(supabase: Awaited<ReturnType<typeof createClient>>) {
  try {
    return await loadAssetsData(supabase)
  } catch {
    return undefined
  }
}

export default async function OverzichtBezittingenPage() {
  const supabase = await createClient()
  const assetsData = await tryLoadAssetsData(supabase)

  return (
    <>
      <NavStackMeta title="Bezittingen" bottomBar={{ kind: 'tabs' }} />
      <div className="mx-auto max-w-6xl px-4 pt-4 sm:px-6">
        <BezittingenSegmented />
      </div>
      {assetsData ? <AssetsPage initialData={assetsData} /> : <AssetsPage />}
    </>
  )
}
