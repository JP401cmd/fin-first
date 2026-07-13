import type { Metadata } from 'next'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { SchuldenView } from '@/components/overview/schulden-view'
import { PageInfoButton } from '@/components/editorial/page-info-button'
import { PageStatusDot } from '@/components/app/page-status-dot'
import { PAGE_INFO } from '@/lib/page-info-content'
import { createClient } from '@/lib/supabase/server'
import { getServerPerspective } from '@/lib/household/server-perspective'
import { loadDebtsPageData } from '../../core/debts/load-debts-page-data'

export const metadata: Metadata = {
  title: 'Schulden — TriFinity',
  description: 'Hypotheek, leningen en studieschuld — de hefboom schulden.',
}

/**
 * /overzicht/schulden — tweede hefboom-verdieping (server-shell, content-first).
 *
 * Layout: PageInfo rechtsboven, SchuldenView (client-wrapper) toont
 * DebtsClient met de SchuldenFilter naast de "Schuld toevoegen"-knop in
 * de toolbar. Filter werkt client-side: selecteren beperkt de
 * categorie-lijst eronder zonder route-navigatie.
 *
 * De schulden-data wordt hier server-side geladen (cookie-server-client, RLS
 * afgedwongen, geen service-role) en als seed aan SchuldenView → DebtsClient
 * meegegeven, zodat de first paint content bevat i.p.v. een spinner. Faalt de
 * load, dan valt DebtsClient terug op de oude client-fetch (byte-identiek).
 */
export default async function OverzichtSchuldenPage() {
  const supabase = await createClient()
  const perspective = await getServerPerspective()
  const initialData = await loadDebtsPageData(supabase, perspective).catch(() => undefined)

  return (
    <>
      <NavStackMeta title="Schulden" bottomBar={{ kind: 'tabs' }} />
      <div className="relative mx-auto max-w-6xl px-4 pt-4 sm:px-6">
        <PageStatusDot className="absolute right-[52px] top-4 sm:right-[60px]" />
        <PageInfoButton
          description={PAGE_INFO['/overzicht/schulden'] ?? ''}
          className="absolute right-4 top-4 sm:right-6"
        />
      </div>
      <SchuldenView initialData={initialData} />
    </>
  )
}
