import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isTrueLayerEnabled } from '@/lib/truelayer/feature-flag'

export async function POST(req: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!(await isTrueLayerEnabled(supabase))) {
    return NextResponse.json({ error: 'Bank Connect is niet ingeschakeld' }, { status: 503 })
  }

  try {
    const { connection_account_id } = await req.json()

    if (!connection_account_id) {
      return NextResponse.json({ error: 'connection_account_id is vereist' }, { status: 400 })
    }

    // Soft disconnect: deactivate the connection account, keep bank_accounts and transactions
    const { error } = await supabase
      .from('bank_connection_accounts')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', connection_account_id)
      .eq('user_id', user.id)

    if (error) {
      return NextResponse.json({ error: 'Kon verbinding niet verbreken' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('TrueLayer disconnect error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Verbinding verbreken mislukt' },
      { status: 500 }
    )
  }
}
