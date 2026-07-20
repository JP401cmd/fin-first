import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { loadFinData } from '@/lib/fin-data-loader'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { PAGE_INFO } from '@/lib/page-info-content'
import { TipsActiesPage } from '@/components/overview/tips-acties-page'

export const metadata: Metadata = {
  title: 'Tips & acties — TriFinity',
  description:
    'Toptips van Fin bovenaan, open acties eronder. Eén plek voor alles wat je nu kunt doen.',
}

/**
 * /overzicht/tips — canoniek scherm voor tips + open acties.
 *
 * Bovenaan: TipsLijst met pending en postponed-ready recommendations
 * van Fin (inline beslissen: Doe nu / Later / Negeren). Eronder:
 * ActionBoard met de open acties die voortkomen uit geaccepteerde
 * tips én handmatig toegevoegde werkitems.
 *
 * Off-track doelen leven op /toekomst (DoelenView), niet hier.
 */
export default async function OverzichtTipsPage() {
  const supabase = await createClient()
  const finData = await loadFinData(supabase)
  const description = PAGE_INFO['/overzicht/tips'] ?? ''

  return (
    <>
      <NavStackMeta title="Tips & acties" bottomBar={{ kind: 'tabs' }} />
      <TipsActiesPage
        recommendations={finData.recommendations}
        actions={finData.actions}
        partnerInfo={finData.partnerInfo}
        currentUserId={finData.currentUserId}
        infoDescription={description}
      />
    </>
  )
}
