import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { loadAssetsData } from '@/lib/assets-data-loader'
import { loadHorizonRaw } from '@/lib/horizon-data-loader'
import { getServerPerspective } from '@/lib/household/server-perspective'
import type { Perspective } from '@/lib/household-data'
import { BezittingenView } from '@/components/overview/bezittingen-view'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { CompoundInsightCard, COMPOUND_INSIGHT_ID } from '@/components/overview/compound-insight-card'
import { FeeImpactCard, FEE_IMPACT_ID } from '@/components/overview/fee-impact-card'
import { PageInfoButton } from '@/components/editorial/page-info-button'
import { InsightToggleButton } from '@/components/editorial/insight-toggle-button'
import { PageStatusDot } from '@/components/app/page-status-dot'
import { HideInSimple } from '@/components/app/hide-in-simple'
import { PAGE_INFO } from '@/lib/page-info-content'
import { hasInvestedAssets } from '@/lib/dashboard-wealth-weighting'

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
async function tryLoadAssetsData(
  supabase: Awaited<ReturnType<typeof createClient>>,
  perspective: Perspective,
) {
  try {
    return await loadAssetsData(supabase, perspective)
  } catch {
    return undefined
  }
}

export default async function OverzichtBezittingenPage() {
  const supabase = await createClient()
  const perspective = await getServerPerspective()
  const [assetsData, horizonData] = await Promise.all([
    tryLoadAssetsData(supabase, perspective),
    loadHorizonRaw(supabase).catch(() => null),
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
  // OVZ-5, beperkt uitgevoerd (S11): in Eenvoudig hóógstens één inspiratiekaart,
  // en pas ná de figures-strip (die volgorde staat al vast in `assets-client`).
  // De beheerkosten-simulator gaat naar Volledig: hij rekent een hypothetische
  // 0,5% fee door over 30 jaar terwijl de gebruiker die kosten nergens in de app
  // kan aflezen — in Eenvoudig stond dat bedrag er dus wél en het eigen
  // rendement niet. De samengestelde-rente-kaart blijft: die is de enige
  // "waarom zou ik"-motivatie op de pagina voor wie nog niet belegt.
  // `HideInSimple` is client, de kaarten blijven server-gerenderd (children over
  // de grens) — deze pagina blijft dus een server-component.
  const inspirationCards = showCompound || showFee
    ? (
        <>
          {showCompound && (
            <CompoundInsightCard
              liquidCash={liquidCash}
              hasInvestments={hasInvestedAssets(assets)}
            />
          )}
          {showFee && (
            <HideInSimple>
              <FeeImpactCard investmentTotal={investmentTotal} />
            </HideInSimple>
          )}
        </>
      )
    : null

  return (
    <>
      <NavStackMeta title="Bezittingen" bottomBar={{ kind: 'tabs' }} />
      <div className="relative mx-auto max-w-6xl px-4 pt-4 sm:px-6">
        <InsightToggleButton
          ids={[COMPOUND_INSIGHT_ID, FEE_IMPACT_ID]}
          className="absolute right-[84px] top-4 sm:right-[92px]"
        />
        <PageStatusDot className="absolute right-[52px] top-4 sm:right-[60px]" />
        <PageInfoButton
          description={PAGE_INFO['/overzicht/bezittingen'] ?? ''}
          className="absolute right-4 top-4 sm:right-6"
        />
      </div>
      <BezittingenView
        initialData={assetsData}
        inspirationCards={inspirationCards}
      />
    </>
  )
}
