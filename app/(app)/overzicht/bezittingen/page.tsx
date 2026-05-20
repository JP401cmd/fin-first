import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { loadAssetsData } from '@/lib/assets-data-loader'
import { loadHorizonData } from '@/lib/horizon-data-loader'
import AssetsPage from '@/components/core/assets-client'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { BezittingenFilter } from '@/components/overview/bezittingen-filter'
import { CompoundInsightCard } from '@/components/overview/compound-insight-card'

export const metadata: Metadata = {
  title: 'Bezittingen — TriFinity',
  description: 'Cash, beleggingen, huis en pensioen — de hefboom bezittingen.',
}

/**
 * /overzicht/bezittingen — eerste hefboom-verdieping in nieuwe architectuur.
 *
 * Toont:
 *  - CompoundInsightCard (plan T-4) bovenaan voor cash-zware users —
 *    dramatic reveal van wat samengestelde rente over 30 jaar oplevert.
 *    Drempel €10k liquide cash en hasDramaticDelta=true zorgen voor
 *    relevantie.
 *  - BezittingenFilter — dropdown naar asset-type sub-routes
 *  - AssetsPage — bestaande detail-rendering uit /core/assets
 *
 * Voor specifieke categorieën navigeert de segmented-control naar
 * /overzicht/bezittingen/[type] (re-exports van /core/assets/[type]).
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
  const [assetsData, horizonData] = await Promise.all([
    tryLoadAssetsData(supabase),
    loadHorizonData(supabase).catch(() => null),
  ])

  // Liquide cash voor CompoundInsightCard — zelfde berekening als
  // /overzicht page: unlinkedCash + cash/savings/checking-typed assets.
  const liquidCash = horizonData
    ? (horizonData.unlinkedCash ?? 0) +
      (horizonData.assets ?? [])
        .filter((a) => ['cash', 'savings', 'checking'].includes(a.asset_type ?? ''))
        .reduce((s, a) => s + Number(a.current_value ?? 0), 0)
    : 0

  return (
    <>
      <NavStackMeta title="Bezittingen" bottomBar={{ kind: 'tabs' }} />
      {liquidCash >= 10_000 && (
        <section className="mx-auto max-w-6xl px-4 pt-4 sm:px-6">
          <CompoundInsightCard liquidCash={liquidCash} />
        </section>
      )}
      <div className="mx-auto max-w-6xl px-4 pt-4 sm:px-6">
        <BezittingenFilter />
      </div>
      {assetsData ? <AssetsPage initialData={assetsData} /> : <AssetsPage />}
    </>
  )
}
