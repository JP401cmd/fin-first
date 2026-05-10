import { createClient } from '@/lib/supabase/server'
import { loadBudgetsData } from '@/lib/budgets-data-loader'
import BudgetsClient from '@/components/app/budgets-client'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'

export default async function BudgetsPage() {
  const supabase = await createClient()
  const data = await loadBudgetsData(supabase)

  return (
    <>
      <NavStackMeta title="Budgetten" bottomBar={{ kind: 'tabs' }} />
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <BudgetsClient initialData={data} />
      </div>
    </>
  )
}
