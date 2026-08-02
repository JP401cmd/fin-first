import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { loadAccountCount } from '@/lib/account-count'
import { getServerPerspective } from '@/lib/household/server-perspective'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { KoppelRekeningBanner } from '@/components/overview/koppel-rekening-banner'
import { TransactiesAnalyse } from '@/components/overview/transacties/transacties-analyse'
import { PageInfoButton } from '@/components/editorial/page-info-button'
import { PageStatusDot } from '@/components/app/page-status-dot'
import { PageOpening } from '@/components/editorial'
import { PAGE_INFO } from '@/lib/page-info-content'

export const metadata: Metadata = {
  title: 'Transacties — TriFinity',
  description: 'Analyseer je transacties per periode: geldstroom, top-tegenpartijen en patronen.',
}

/**
 * /overzicht/cashflow/transacties — periode-gestuurde transactie-analyse.
 * De analyse is een client-component (TransactiesAnalyse) die zélf data ophaalt
 * per gekozen periode; de server levert enkel het accountCount voor de
 * koppel-banner.
 *
 * Dat aantal komt uit `loadAccountCount` — één perspectief-gescopede count-query
 * op bank_accounts. Voorheen draaide deze pagina daarvoor de volledige
 * `loadCashflowData` (perspectief-keten, 6 maanden transacties, recurrings, een
 * 500-rijen join-fetch) om er precies één integer uit te lezen; de rest van die
 * bundel wordt op deze route nergens gebruikt.
 */
export default async function OverzichtCashflowTransactiesPage() {
  const supabase = await createClient()
  const perspective = await getServerPerspective()
  const accountCount = await loadAccountCount(supabase, perspective)

  return (
    <>
      <NavStackMeta title="Transacties" bottomBar={{ kind: 'tabs' }} />
      <div className="relative mx-auto max-w-6xl px-4 pt-4 sm:px-6">
        <PageStatusDot className="absolute right-[52px] top-4 sm:right-[60px]" />
        <PageInfoButton
          description={PAGE_INFO['/overzicht/cashflow/transacties'] ?? ''}
          className="absolute right-4 top-4 sm:right-6"
        />
      </div>
      <div className="mx-auto max-w-6xl space-y-6 px-4 pt-4 sm:px-6">
        {/* Editorial header — gedeeld kop-patroon met de cashflow-familie. */}
        <PageOpening
          kicker="Je geldstroom"
          titleBefore="Waar gaat je "
          emphasis="tijd"
          titleAfter=" naartoe?"
          deck="Elke transactie is gekochte of verkochte tijd — bekijk waar je uren heen gaan."
        />
        <KoppelRekeningBanner accountCount={accountCount} />
        <TransactiesAnalyse />
      </div>
    </>
  )
}
