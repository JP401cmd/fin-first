import type { Metadata } from 'next'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { Box3Detail } from '@/components/overview/box3-detail'
import { BelastingBoxPageHeader } from '@/components/overview/belasting-box-page-header'

export const metadata: Metadata = {
  title: 'Box 3 · Sparen + beleggen — TriFinity',
  description: 'Vermogensheffing over sparen en beleggen — forfaitair rendement.',
}

/**
 * /overzicht/belasting/box3 — Box 3-subpagina (sparen + beleggen).
 *
 * Dunne wrapper rond de bestaande Box3Detail-component: die haalt zijn
 * eigen data op via /api/household/box3 (pure lib/box3-data.ts-engine) en
 * rendert de samenvatting + uitklapbare berekeningsstappen.
 */
export default function BelastingBox3Page() {
  return (
    <>
      <NavStackMeta title="Box 3" bottomBar={{ kind: 'tabs' }} />
      <BelastingBoxPageHeader
        number="3"
        title="Sparen + beleggen"
        subtitle="Cash, beleggingen en crypto. De Belastingdienst rekent met een forfaitair (fictief) rendement boven je heffingsvrije vermogen."
        infoKey="/overzicht/belasting/box3"
      />
      <Box3Detail year={2026} />
    </>
  )
}
