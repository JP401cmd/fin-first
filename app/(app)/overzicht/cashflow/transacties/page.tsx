import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { loadCashflowData } from '@/lib/cashflow-data-loader'
import { getServerPerspective } from '@/lib/household/server-perspective'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { KoppelRekeningBanner } from '@/components/overview/koppel-rekening-banner'
import { TransactiesAnalyse } from '@/components/overview/transacties/transacties-analyse'
import { PageInfoButton } from '@/components/editorial/page-info-button'
import { PAGE_INFO } from '@/lib/page-info-content'

export const metadata: Metadata = {
  title: 'Transacties — TriFinity',
  description: 'Analyseer je transacties per periode: geldstroom, top-tegenpartijen en patronen.',
}

/**
 * /overzicht/cashflow/transacties — periode-gestuurde transactie-analyse.
 * De analyse is een client-component (TransactiesAnalyse) die zélf data ophaalt
 * per gekozen periode; de server levert enkel het accountCount voor de
 * koppel-banner (uit de gedeelde, gecachte cashflow-loader).
 */
export default async function OverzichtCashflowTransactiesPage() {
  const supabase = await createClient()
  const perspective = await getServerPerspective()
  const { accountCount } = await loadCashflowData(supabase, perspective)

  return (
    <>
      <NavStackMeta title="Transacties" bottomBar={{ kind: 'tabs' }} />
      <div className="relative mx-auto max-w-6xl px-4 pt-4 sm:px-6">
        <PageInfoButton
          description={PAGE_INFO['/overzicht/cashflow/transacties'] ?? ''}
          className="absolute right-4 top-4 sm:right-6"
        />
      </div>
      <div className="mx-auto max-w-6xl space-y-6 px-4 pt-4 sm:px-6">
        <KoppelRekeningBanner accountCount={accountCount} />
        <TransactiesAnalyse />
      </div>
    </>
  )
}
