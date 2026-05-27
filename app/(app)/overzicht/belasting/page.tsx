import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { loadHorizonData } from '@/lib/horizon-data-loader'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { BelastingOverzichtStrip } from '@/components/overview/belasting-overzicht-strip'
import { JaarruimteCard } from '@/components/overview/jaarruimte-card'
import { Box3Detail } from '@/components/overview/box3-detail'
import { Box2Detail } from '@/components/overview/box2-detail'
import { PageInfoButton } from '@/components/editorial/page-info-button'
import { PAGE_INFO } from '@/lib/page-info-content'

export const metadata: Metadata = {
  title: 'Belasting — TriFinity',
  description: 'Box 1, Box 2 en Box 3 — de hefboom belasting.',
}

/**
 * /overzicht/belasting — vierde hefboom-verdieping.
 *
 * Layout:
 *  1. BelastingOverzichtStrip — 3-tegel KPI-strip met Box 1/2/3
 *     (server-side data uit horizonData)
 *  2. JaarruimteCard — pensioen-aftrekruimte (Box 1)
 *  3. Box3Detail — compacte, inklapbare Box 3-berekening (vervangt het
 *     volledige /core/belasting-embed; zelfde pure engine via
 *     /api/household/box3). /core/belasting redirect hierheen.
 *
 * Box-data bronnen:
 *  - Box 3: horizonData.healthScoreInput.taxData.box3Tax (echte forfaitair
 *    berekening)
 *  - Box 1: schatting via netto-inkomen × marginaal-tarief (afgeleid
 *    uit fireParams.marginaalTarief). Niet een aangifte-berekening
 *    maar wel een snelle indicatie van orde-grootte
 *  - Box 2: 0 voor MVP — geen deelnemingen-tracking in TriFinity
 */
export default async function OverzichtBelastingPage() {
  const supabase = await createClient()
  const horizonData = await loadHorizonData(supabase)

  const box3Tax = horizonData.healthScoreInput.taxData?.box3Tax ?? null

  // Aanmerkelijk belang (Box 2): alleen tonen als de gebruiker een
  // deelneming-asset heeft. We detecteren dat server-side zodat de
  // Box 2-sectie niet flitst voor de ~99% niet-DGA's.
  const { data: { user } } = await supabase.auth.getUser()
  let hasAanmerkelijkBelang = false
  if (user) {
    const { data: deelnemingen } = await supabase
      .from('assets')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .eq('asset_type', 'deelneming')
      .limit(1)
    hasAanmerkelijkBelang = (deelnemingen?.length ?? 0) > 0
  }

  // Box 1-schatting: netto-maandinkomen ≈ bruto × (1 − marginaal_tarief),
  // dus bruto-inkomen ≈ netto / (1 − marginaal). Box 1-druk ≈ bruto × marg.
  // Versimpelde benadering — voldoende voor KPI-tegel context, niet voor
  // aangifte. effectiveInput.monthlyIncome is netto.
  let box1Tax: number | null = null
  let grossYearly = 0
  const netMonthly = horizonData.effectiveInput?.monthlyIncome ?? 0
  const marg = horizonData.fireParams?.marginaalTarief ?? 0.3697
  if (netMonthly > 0 && marg > 0 && marg < 1) {
    grossYearly = (netMonthly * 12) / (1 - marg)
    box1Tax = Math.round(grossYearly * marg)
  }

  return (
    <>
      <NavStackMeta title="Belasting" bottomBar={{ kind: 'tabs' }} />
      <div className="relative mx-auto max-w-6xl px-4 pt-4 sm:px-6">
        <PageInfoButton
          description={PAGE_INFO['/overzicht/belasting'] ?? ''}
          className="absolute right-4 top-4 sm:right-6"
        />
      </div>
      <BelastingOverzichtStrip
        box1Tax={box1Tax}
        box2Tax={null}
        box3Tax={box3Tax}
      />
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-2" id="jaarruimte" style={{ scrollMarginTop: '5rem' }}>
        <JaarruimteCard
          grossYearlyIncome={grossYearly}
          pensioenAangroei={0}
          marginaalTarief={marg}
        />
      </section>
      <div id="box3" style={{ scrollMarginTop: '5rem' }}>
        <Box3Detail year={2026} />
      </div>
      {hasAanmerkelijkBelang && (
        <div id="box2" style={{ scrollMarginTop: '5rem' }}>
          <Box2Detail year={2026} />
        </div>
      )}
    </>
  )
}
