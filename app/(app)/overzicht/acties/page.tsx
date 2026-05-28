import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { loadWillData } from '@/lib/will-data-loader'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { PageInfoButton } from '@/components/editorial/page-info-button'
import { PAGE_INFO } from '@/lib/page-info-content'
import { ActiesPool } from '@/components/overview/acties-pool'

export const metadata: Metadata = {
  title: 'Acties — TriFinity',
  description:
    'Open acties, uitgesteld werk en off-track doelen op één plek — alles wat aandacht vraagt.',
}

/**
 * /overzicht/acties — dedicated Acties-pool (vervangt /overzicht/tips).
 *
 * Plan §6.6: voorstellen verhuizen naar Will-chat (één-voor-één,
 * accepteren/uitstellen/afwijzen, niks doen = weg). Op de pool blijven
 * alleen acties zichtbaar — het werk dat uit voorstellen voortkomt of
 * dat de gebruiker zelf toevoegt — plus off-track doelen.
 */
export default async function OverzichtActiesPage() {
  const supabase = await createClient()
  const willData = await loadWillData(supabase)
  const description = PAGE_INFO['/overzicht/acties'] ?? ''

  return (
    <>
      <NavStackMeta title="Acties" bottomBar={{ kind: 'tabs' }} />
      <ActiesPool
        actions={willData.actions}
        goals={willData.goals}
        goalProgresses={willData.goalProgresses}
        partnerInfo={willData.partnerInfo}
        currentUserId={willData.currentUserId}
        infoDescription={description}
      />
    </>
  )
}
