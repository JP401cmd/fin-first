import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { loadAssetsData } from '@/lib/assets-data-loader'
import { loadHorizonData } from '@/lib/horizon-data-loader'
import AssetsPage from '@/components/core/assets-client'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { BezittingenFilter } from '@/components/overview/bezittingen-filter'
import { CompoundInsightCard } from '@/components/overview/compound-insight-card'
import { FeeImpactCard } from '@/components/overview/fee-impact-card'
import { BezittingenOverzichtStrip } from '@/components/overview/bezittingen-overzicht-strip'
import { PageInfoButton } from '@/components/editorial/page-info-button'
import { PAGE_INFO } from '@/lib/page-info-content'

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

  // Totalen per categorie voor BezittingenOverzichtStrip + Compound-Insight.
  // Hergebruikt asset_type-mapping uit horizon-data-loader.
  const assets = horizonData?.assets ?? []
  function sumByTypes(types: string[]): number {
    return assets
      .filter((a) => types.includes(a.asset_type ?? ''))
      .reduce((s, a) => s + Number(a.current_value ?? 0), 0)
  }
  const cashTotal = (horizonData?.unlinkedCash ?? 0) + sumByTypes(['cash', 'savings', 'checking'])
  const investmentTotal = sumByTypes(['investment', 'crypto'])
  // Eigen huis netto: woning-waarde minus hypotheek-balans uit
  // housingContext (al voorberekend in horizon-data-loader).
  const housingTotal = horizonData?.housingContext
    ? Math.max(0, horizonData.housingContext.eigenHuisValue - horizonData.housingContext.mortgageBalance)
    : sumByTypes(['eigen_huis', 'real_estate'])
  const pensioenTotal = sumByTypes(['retirement', 'levensverzekering'])

  // Item-tellingen per categorie voor CategoryCard.meta. unlinkedCash telt
  // als 1 logisch item zodra het > 0 is (alle ongekoppelde rekeningen
  // samen). Voor de andere categorieën tellen we per asset-type.
  function countByTypes(types: string[]): number {
    return assets.filter((a) => types.includes(a.asset_type ?? '')).length
  }
  const counts = {
    cash: countByTypes(['cash', 'savings', 'checking']) + ((horizonData?.unlinkedCash ?? 0) > 0 ? 1 : 0),
    investment: countByTypes(['investment', 'crypto']),
    eigen_huis: countByTypes(['eigen_huis', 'real_estate']),
    pensioen: countByTypes(['retirement', 'levensverzekering']),
  }

  // Liquide cash voor CompoundInsightCard — zelfde subset als cashTotal,
  // wordt apart geëxposed voor de slider-component.
  const liquidCash = cashTotal

  return (
    <>
      <NavStackMeta title="Bezittingen" bottomBar={{ kind: 'tabs' }} />
      <div className="relative mx-auto max-w-6xl px-4 pt-4 sm:px-6">
        <PageInfoButton
          description={PAGE_INFO['/overzicht/bezittingen'] ?? ''}
          className="absolute right-4 top-4 sm:right-6"
        />
      </div>
      <BezittingenOverzichtStrip
        cashTotal={cashTotal}
        investmentTotal={investmentTotal}
        housingTotal={housingTotal}
        pensioenTotal={pensioenTotal}
        counts={counts}
      />
      {liquidCash >= 10_000 && (
        <section className="mx-auto max-w-6xl px-4 pt-4 sm:px-6">
          <CompoundInsightCard liquidCash={liquidCash} />
        </section>
      )}
      {investmentTotal >= 25_000 && (
        <section className="mx-auto max-w-6xl px-4 pt-4 sm:px-6">
          <FeeImpactCard investmentTotal={investmentTotal} />
        </section>
      )}
      <div className="mx-auto max-w-6xl px-4 pt-4 sm:px-6">
        <BezittingenFilter />
      </div>
      {assetsData ? <AssetsPage initialData={assetsData} /> : <AssetsPage />}
    </>
  )
}
