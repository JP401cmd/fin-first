// DELETE /api/integrations/exchanges/[id]
//
// Removes an exchange-connection plus its audit trail in
// `external_data_sources`. Holdings + assets created by previous syncs are
// intentionally left in place — they may have manual transactions attached.
// The user can deactivate or delete them via the holdings UI.

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
    return NextResponse.json({ error: 'Koppeling-id is verplicht' }, { status: 400 })
  }

  // Cleanup audit log first (best-effort) so we never end up with orphan
  // sync rows pointing at a non-existent connection. RLS scopes deletes to
  // the current user.
  await supabase
    .from('external_data_sources')
    .delete()
    .eq('user_id', user.id)
    .eq('source_type', 'exchange')
    .eq('source_ref_id', id)

  const { error } = await supabase
    .from('exchange_connections')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: 'Kon koppeling niet verwijderen.' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
