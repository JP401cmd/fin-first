import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { loadCashflowData } from '@/lib/cashflow-data-loader'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { KoppelRekeningBanner } from '@/components/overview/koppel-rekening-banner'
import { TransactiesGeldstroom } from '@/components/overview/transacties-geldstroom'
import { CashflowSankey } from '@/components/overview/cashflow-sankey'
import { TransactiesFeed } from '@/components/app/transacties-feed'
import { PageInfoButton } from '@/components/editorial/page-info-button'
import { PAGE_INFO } from '@/lib/page-info-content'

export const metadata: Metadata = {
  title: 'Transacties — TriFinity',
  description: 'Inkomsten en uitgaven van deze maand — onderdeel van cashflow.',
}

/**
 * /overzicht/cashflow/transacties — losse Transacties-pagina (was de
 * "Transacties"-tab). Koppel-banner + geldstroom-KPIs + sankey + feed,
 * gevoed door de gedeelde cashflow-loader.
 */
export default async function OverzichtCashflowTransactiesPage() {
  const supabase = await createClient()
  const { transactions, monthLabel, accountCount } = await loadCashflowData(supabase)

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
        <TransactiesGeldstroom transactions={transactions} monthLabel={monthLabel} />
        <CashflowSankey transactions={transactions} monthLabel={monthLabel} />
        <TransactiesFeed transactions={transactions} monthLabel={monthLabel} />
      </div>
    </>
  )
}
