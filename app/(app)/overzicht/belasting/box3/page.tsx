import type { Metadata } from 'next'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { Box3Detail } from '@/components/overview/box3-detail'
import { BelastingBoxPageHeader } from '@/components/overview/belasting-box-page-header'
import { createClient } from '@/lib/supabase/server'
import { getServerPerspective } from '@/lib/household/server-perspective'
import { loadPerspectiveBox3 } from '@/lib/household-tax'
import { CURRENT_TAX_YEAR } from '@/lib/box3-data'

export const metadata: Metadata = {
  title: 'Box 3 · Sparen + beleggen — TriFinity',
  description: 'Vermogensheffing over sparen en beleggen — forfaitair rendement.',
}

const YEAR = CURRENT_TAX_YEAR

/**
 * /overzicht/belasting/box3 — Box 3-subpagina (sparen + beleggen).
 *
 * Server-first: we lezen het perspectief uit de cookie en berekenen de Box 3-
 * belasting via het huishoud-fundament (`loadPerspectiveBox3` →
 * `loadPerspectiveData` → ONGEWIJZIGDE `calculateBox3`/`optimizePartnerAllocation`).
 * Het resultaat gaat als `initialData` naar de client-component, die op een
 * in-sessie perspectief-wissel zelf herlaadt via de browser-client.
 */
export default async function BelastingBox3Page() {
  const supabase = await createClient()
  const perspective = await getServerPerspective()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  let currentUserName = 'Jij'
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle()
    currentUserName = (profile?.full_name as string | null) ?? 'Jij'
  }

  const box3 = await loadPerspectiveBox3(supabase, perspective, YEAR, currentUserName)

  return (
    <>
      <NavStackMeta title="Box 3" bottomBar={{ kind: 'tabs' }} />
      <BelastingBoxPageHeader
        number="3"
        title="Sparen + beleggen"
        subtitle="Cash, beleggingen en crypto. De Belastingdienst rekent met een forfaitair (fictief) rendement boven je heffingsvrije vermogen."
        infoKey="/overzicht/belasting/box3"
      />
      <Box3Detail year={YEAR} initialData={box3} />
    </>
  )
}
