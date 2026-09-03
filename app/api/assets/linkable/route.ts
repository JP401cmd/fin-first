import { NextRequest, NextResponse } from 'next/server'
import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { badRequest, serverError, unauthorized } from '@/lib/api/respond'
import { linkableAssetTypesForDebt } from '@/lib/asset-data'
import { QUICK_ADD_DEBT_ORDER, type DebtType } from '@/lib/debt-data'

/**
 * GET /api/assets/linkable?debtType=<DebtType>
 *
 * De bezittingen waaraan dít schuldtype gekoppeld mag worden — id, naam en
 * type, meer niet. Bedoeld voor de quick-add-wizard, die bij een DGA-schuld de
 * "Gekoppelde deelneming"-keuze moet tonen (WF-SCHULD-20 sub c) maar geen
 * server-loader boven zich heeft: de wizard hangt onder zes verschillende
 * client-oppervlakken (/core, de categorie-pagina's, de cash-overview).
 *
 * Waarom een route en geen client-directe query (ADR 0058): weergavedata haalt
 * de browser niet zelf uit Supabase. Dit is het toegestane "on-demand/lazy"
 * geval — de lijst past niet in een loader-bundel omdat hij pas nodig is zodra
 * de gebruiker in de wizard een DGA-schuld kiest.
 *
 * Twee dingen bewust expliciet:
 *  - **Kolomlijst, geen `select('*')`.** `assets` draagt `*_encrypted` /
 *    `*_hash`-kolommen (server-only sleutel); die horen nooit in een
 *    client-respons.
 *  - **`.eq('user_id', …)`.** De SELECT-policy op `assets` is HUISHOUD-gedeeld,
 *    dus zonder deze filter zou de lijst de deelnemingen van de partner
 *    bevatten — en daar kan de gebruiker zijn schuld niet eens aan koppelen
 *    (`assertAssetOwned` in de Server Action filtert op `user_id`).
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()

  const claims = await getAuthClaims(supabase)
  if (!claims) {
    return unauthorized()
  }

  const raw = new URL(request.url).searchParams.get('debtType')
  if (!raw || !QUICK_ADD_DEBT_ORDER.includes(raw as DebtType)) {
    return badRequest('Onbekend schuldtype')
  }
  const debtType = raw as DebtType

  // Types zonder koppelpaar (bv. creditcard) leveren een lege lijst i.p.v. een
  // query zonder `in`-filter, die álle bezittingen zou teruggeven.
  const assetTypes = linkableAssetTypesForDebt(debtType)
  if (assetTypes.length === 0) {
    return NextResponse.json({ assets: [] })
  }

  try {
    const { data, error } = await supabase
      .from('assets')
      .select('id, name, asset_type')
      .eq('user_id', claims.sub)
      .eq('is_active', true)
      .in('asset_type', assetTypes)
      .order('name', { ascending: true })

    if (error) {
      return serverError(error, 'assets-linkable:GET')
    }
    return NextResponse.json({ assets: data ?? [] })
  } catch (err) {
    return serverError(err, 'assets-linkable:GET')
  }
}
