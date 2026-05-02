// DELETE /api/integrations/wallets/[id]
//
// Removes a wallet-address row plus its audit trail in `external_data_sources`.
// Standalone wallet-assets (created during sync) and any holdings inside a
// linked asset are intentionally left in place — they may have been edited or
// merged with manual entries. The user can clean those up via the holdings UI.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'Wallet-id is verplicht' }, { status: 400 })
  }

  await supabase
    .from('external_data_sources')
    .delete()
    .eq('user_id', user.id)
    .eq('source_type', 'wallet')
    .eq('source_ref_id', id)

  const { error } = await supabase
    .from('wallet_addresses')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: 'Kon wallet niet verwijderen.' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
