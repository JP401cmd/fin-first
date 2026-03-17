import { createClient } from '@/lib/supabase/server'
import { loadBudgetsData } from '@/lib/budgets-data-loader'
import BudgetsClient from '@/components/app/budgets-client'

export default async function BudgetsPage() {
  const supabase = await createClient()
  const data = await loadBudgetsData(supabase)

  return <BudgetsClient initialData={data} />
}
