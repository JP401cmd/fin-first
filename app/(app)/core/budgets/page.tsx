import { createClient } from '@/lib/supabase/server'
import { loadBudgetsData } from '@/lib/budgets-data-loader'
import BudgetsClient from '@/components/app/budgets-client'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { getAppSetupStatus } from '@/lib/app-setup-status'
import { AppSetupGate } from '@/components/app/app-setup/app-setup-gate'
import { PageInfoButton } from '@/components/editorial/page-info-button'
import { PageStatusDot } from '@/components/app/page-status-dot'
import { getPageInfo } from '@/lib/page-info-content'

export default async function BudgetsPage() {
  const supabase = await createClient()

  // Gate-check op de canonical Budgetteren-slug. Bij first-time gebruikers
  // (geen marker én geen budgets) tonen we de setup-gate; bestaande
  // gebruikers met budgets worden door `getAppSetupStatus` als-voltooid
  // gemarkeerd via lazy backfill.
  const setupStatus = await getAppSetupStatus(supabase, ['budgetteren'])
  if (!setupStatus.budgetteren) {
    return (
      <>
        <NavStackMeta title="Budgetten" bottomBar={{ kind: 'tabs' }} />
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <AppSetupGate appKey="budgetteren" />
        </div>
      </>
    )
  }

  const data = await loadBudgetsData(supabase)

  return (
    <>
      <NavStackMeta title="Budgetten" bottomBar={{ kind: 'tabs' }} />
      <div className="relative mx-auto max-w-6xl px-4 pt-4 sm:px-6">
        <PageStatusDot className="absolute right-[52px] top-4 sm:right-[60px]" />
        <PageInfoButton
          content={getPageInfo('/core/budgets')}
          className="absolute right-4 top-4 sm:right-6"
        />
      </div>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <BudgetsClient initialData={data} />
      </div>
    </>
  )
}
