import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/**
 * De per-rekening detailpagina is opgegaan in de cash-categoriepagina. We mappen
 * de bank_account-id naar zijn gekoppelde asset en sturen door naar de
 * focus-weergave daar. Zonder mapping: gewoon de categoriepagina.
 *
 * Stond eerder op /overzicht/cashflow#rekening-<assetId>; die hub is opgeheven
 * en rekeningen wonen nu bij de bezittingen.
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
    redirect(`/overzicht/bezittingen/cash?asset=${data.linked_asset_id}`)
  }
  redirect('/overzicht/bezittingen/cash')
}
