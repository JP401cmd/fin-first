import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { loadBudgetsData } from '@/lib/budgets-data-loader'
import BudgetsClient from '@/components/app/budgets-client'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { getAppSetupStatus } from '@/lib/app-setup-status'
import { AppSetupGate } from '@/components/app/app-setup/app-setup-gate'
import { PageInfoButton } from '@/components/editorial/page-info-button'
import { PageStatusDot } from '@/components/app/page-status-dot'
import { getPageInfo } from '@/lib/page-info-content'

export const metadata: Metadata = {
  title: 'Budget — TriFinity',
  description: 'Plan en volg je maandbudgetten — onderdeel van cashflow.',
}

/**
 * /overzicht/cashflow/budget — losse Budget-pagina (was de "Budget"-tab van de
 * cashflow-view-switcher). Setup-gate op budgetteren; hydreert BudgetsClient
 * met de gedeelde budgets-loader.
 */
export default async function OverzichtCashflowBudgetPage() {
  const supabase = await createClient()

  const setupStatus = await getAppSetupStatus(supabase, ['budgetteren'])
  if (!setupStatus.budgetteren) {
    return (
      <>
        <NavStackMeta title="Budgetteren" bottomBar={{ kind: 'tabs' }} />
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <AppSetupGate appKey="budgetteren" />
        </div>
      </>
    )
  }

  const data = await loadBudgetsData(supabase)

  // showKoppelNudge: toon ná het doorlopen van de setup éénmalig de koppel-nudge
  // (BudgetKoppelNudge). Zelf-beperkend: alleen als de eenmalige marker ontbreekt
  // ÉN de gebruiker nog géén bank_accounts en géén transacties heeft. De 0-data-
  // guard voorkomt dat bestaande (backfill-)gebruikers de nudge zien. User-scoped
  // tellen (.eq('user_id', …)), niet via gedeelde huishoud-RLS, zodat partner-data
  // niet meetelt. Slug-string spiegelt BUDGET_KOPPEL_NUDGE_SHOWN_SLUG uit
  // components/app/budget-koppel-nudge.tsx.
  const {
    data: { user },
  } = await supabase.auth.getUser()
  let showKoppelNudge = false
  if (user) {
    const [markerRes, accountsRes, txRes] = await Promise.all([
      supabase
        .from('user_feature_visits')
        .select('feature_slug')
        .eq('user_id', user.id)
        .eq('feature_slug', 'budget_koppel_nudge_shown')
        .maybeSingle(),
      supabase
        .from('bank_accounts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id),
      supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id),
    ])
    const markerAbsent = !markerRes.data
    const noAccounts = (accountsRes.count ?? 0) === 0
    const noTransactions = (txRes.count ?? 0) === 0
    showKoppelNudge = markerAbsent && noAccounts && noTransactions
  }

  return (
    <>
      <NavStackMeta title="Budgetteren" bottomBar={{ kind: 'tabs' }} />
      <div className="relative mx-auto max-w-6xl px-4 pt-4 sm:px-6">
        <PageStatusDot className="absolute right-[52px] top-4 sm:right-[60px]" />
        <PageInfoButton
          content={getPageInfo('/overzicht/cashflow/budget')}
          className="absolute right-4 top-4 sm:right-6"
        />
      </div>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <BudgetsClient initialData={data} showKoppelNudge={showKoppelNudge} />
      </div>
    </>
  )
}
