import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { loadAssetsData } from '@/lib/assets-data-loader'
import { loadHorizonData } from '@/lib/horizon-data-loader'
import AssetsPage from '@/components/core/assets-client'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { BezittingenFilter } from '@/components/overview/bezittingen-filter'
import { CompoundInsightCard, COMPOUND_INSIGHT_ID } from '@/components/overview/compound-insight-card'
import { FeeImpactCard, FEE_IMPACT_ID } from '@/components/overview/fee-impact-card'
import { PageInfoButton } from '@/components/editorial/page-info-button'
import { InsightToggleButton } from '@/components/editorial/insight-toggle-button'
import { PAGE_INFO } from '@/lib/page-info-content'

export const metadata: Metadata = {
  title: 'Bezittingen — TriFinity',
  description: 'Cash, beleggingen, huis en pensioen — de hefboom bezittingen.',
}

/**
 * /overzicht/bezittingen — eerste hefboom-verdieping.
 *
 * Layout:
 *  - InsightToggle + PageInfo rechtsboven (zichtbaarheid-toggles).
 *  - AssetsPage met `BezittingenFilter` in de toolbar (naast Herwaarderen /
 *    Bezitting toevoegen) en `CompoundInsightCard` / `FeeImpactCard` direct
 *    onder de toolbar als inspiratie — alleen wanneer drempels gehaald.
 *
 * De losse vierdeling-strook (cash / beleggen / eigen huis / pensioen) is
 * op verzoek verwijderd; de categorie-lijst in AssetsPage toont de
 * bezittingen weer in hun oorspronkelijke groepering.
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

  // Drempel-data voor de twee inspiratie-blokken. Alleen renderen wanneer
  // de gebruiker voldoende liquide cash of belegd vermogen heeft — geen
  // lege space voor wie de drempel nog niet haalt.
  const assets = horizonData?.assets ?? []
  function sumByTypes(types: string[]): number {
    return assets
      .filter((a) => types.includes(a.asset_type ?? ''))
      .reduce((s, a) => s + Number(a.current_value ?? 0), 0)
  }
  const liquidCash = (horizonData?.unlinkedCash ?? 0) + sumByTypes(['cash', 'savings', 'checking'])
  const investmentTotal = sumByTypes(['investment', 'crypto'])

  const showCompound = liquidCash >= 10_000
  const showFee = investmentTotal >= 25_000
  const inspirationCards = showCompound || showFee
    ? (
        <>
          {showCompound && <CompoundInsightCard liquidCash={liquidCash} />}
          {showFee && <FeeImpactCard investmentTotal={investmentTotal} />}
        </>
      )
    : null

  return (
    <>
      <NavStackMeta title="Bezittingen" bottomBar={{ kind: 'tabs' }} />
      <div className="relative mx-auto max-w-6xl px-4 pt-4 sm:px-6">
        <InsightToggleButton
          ids={[COMPOUND_INSIGHT_ID, FEE_IMPACT_ID]}
          className="absolute right-[52px] top-4 sm:right-[60px]"
        />
        <PageInfoButton
          description={PAGE_INFO['/overzicht/bezittingen'] ?? ''}
          className="absolute right-4 top-4 sm:right-6"
        />
      </div>
      <AssetsPage
        initialData={assetsData}
        toolbarFilter={<BezittingenFilter />}
        inspirationCards={inspirationCards}
      />
    </>
  )
}
