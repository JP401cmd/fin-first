import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { loadCashflowData } from '@/lib/cashflow-data-loader'
import { getServerPerspective } from '@/lib/household/server-perspective'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { VasteLastenLoader } from '@/components/overview/vaste-lasten-loader'
import { CashflowKalender } from '@/components/overview/cashflow-kalender'
import { PageInfoButton } from '@/components/editorial/page-info-button'
import { PAGE_INFO } from '@/lib/page-info-content'

export const metadata: Metadata = {
  title: 'Vaste lasten — TriFinity',
  description: 'Abonnementen en terugkerende kosten — onderdeel van cashflow.',
}

/**
 * /overzicht/cashflow/vaste-lasten — losse Vaste-lasten-pagina (was de
 * "Vaste lasten"-tab). Abonnementen-/vaste-kosten-analyse + kalender van
 * terugkerende transacties.
 */
export default async function OverzichtCashflowVasteLastenPage() {
  const supabase = await createClient()
  const perspective = await getServerPerspective()
  const { recurrings, fullName } = await loadCashflowData(supabase, perspective)

  return (
    <>
      <NavStackMeta title="Vaste lasten" bottomBar={{ kind: 'tabs' }} />
      <div className="relative mx-auto max-w-6xl px-4 pt-4 sm:px-6">
        <PageInfoButton
          description={PAGE_INFO['/overzicht/cashflow/vaste-lasten'] ?? ''}
          className="absolute right-4 top-4 sm:right-6"
        />
      </div>
      <div className="mx-auto max-w-6xl space-y-6 px-4 pt-4 sm:px-6">
        <VasteLastenLoader fullName={fullName} />
        <CashflowKalender recurrings={recurrings} />
      </div>
    </>
  )
}
