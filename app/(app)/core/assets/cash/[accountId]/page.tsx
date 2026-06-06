import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/**
 * De per-rekening detailpagina is opgegaan in de cashflow-landing. We mappen
 * de bank_account-id naar zijn gekoppelde asset en sturen door naar de focus-
 * weergave op /overzicht/cashflow. Zonder mapping: gewoon de landing.
 */
export default async function CashAccountRedirect({
  params,
}: {
  params: Promise<{ accountId: string }>
}) {
  const { accountId } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from('bank_accounts')
    .select('linked_asset_id')
    .eq('id', accountId)
    .maybeSingle()

  if (data?.linked_asset_id) {
    redirect(`/overzicht/cashflow#rekening-${data.linked_asset_id}`)
  }
  redirect('/overzicht/cashflow')
}
