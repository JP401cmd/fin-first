import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { loadBudgetsData } from '@/lib/budgets-data-loader'
import BudgetsClient from '@/components/app/budgets-client'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { getAppSetupStatus } from '@/lib/app-setup-status'
import { AppSetupGate } from '@/components/app/app-setup/app-setup-gate'

export const metadata: Metadata = {
  title: 'Cashflow — TriFinity',
  description: 'Budget, transacties en vaste lasten — de hefboom cashflow.',
}

/**
 * /overzicht/cashflow — derde hefboom-verdieping in nieuwe architectuur.
 *
 * Vervangt /core/budgets. Cashflow wordt in de nieuwe architectuur een
 * volwaardig domein (was sub-app onder Cash-asset-type).
 *
 * Voor nu rendert BudgetsClient zodat de bestaande budgetting-UI direct
 * werkt onder de nieuwe URL. Toekomstige verbeteringen:
 *  - segmented-control [Budget | Transacties | Vaste lasten]
 *  - vaste-kosten-analyse versmelt onder Vaste lasten-tab
 *  - transacties uit /core/assets/cash worden Transacties-tab hier
 */
export default async function OverzichtCashflowPage() {
  const supabase = await createClient()

  // Setup-gate: nieuwe gebruikers zonder budgetten zien een eenvoudige
  // intro-pagina. Bestaande gebruikers met budgetten worden direct doorgelaten.
  const setupStatus = await getAppSetupStatus(supabase, ['budgetteren'])
  if (!setupStatus.budgetteren) {
    return (
      <>
        <NavStackMeta title="Cashflow" bottomBar={{ kind: 'tabs' }} />
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <AppSetupGate appKey="budgetteren" />
        </div>
      </>
    )
  }

  const data = await loadBudgetsData(supabase)

  return (
    <>
      <NavStackMeta title="Cashflow" bottomBar={{ kind: 'tabs' }} />
      <BudgetsClient initialData={data} />
    </>
  )
}
