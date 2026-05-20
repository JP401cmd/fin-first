import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { loadHorizonData } from '@/lib/horizon-data-loader'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { BelastingOverzichtStrip } from '@/components/overview/belasting-overzicht-strip'
import BelastingPage from '../../core/belasting/page'

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
 *  2. BelastingPage — bestaande detail-sectie met alle berekeningen,
 *     filters en breakdowns per box
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

  // Box 1-schatting: netto-maandinkomen ≈ bruto × (1 − marginaal_tarief),
  // dus bruto-inkomen ≈ netto / (1 − marginaal). Box 1-druk ≈ bruto × marg.
  // Versimpelde benadering — voldoende voor KPI-tegel context, niet voor
  // aangifte. effectiveInput.monthlyIncome is netto.
  let box1Tax: number | null = null
  const netMonthly = horizonData.effectiveInput?.monthlyIncome ?? 0
  const marg = horizonData.fireParams?.marginaalTarief ?? 0.3697
  if (netMonthly > 0 && marg > 0 && marg < 1) {
    const grossYearly = (netMonthly * 12) / (1 - marg)
    box1Tax = Math.round(grossYearly * marg)
  }

  return (
    <>
      <NavStackMeta title="Belasting" bottomBar={{ kind: 'tabs' }} />
      <BelastingOverzichtStrip
        box1Tax={box1Tax}
        box2Tax={null}
        box3Tax={box3Tax}
      />
      <BelastingPage />
    </>
  )
}
