import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isGoCardlessEnabled } from '@/lib/gocardless/feature-flag'

export async function POST(req: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!(await isGoCardlessEnabled(supabase))) {
    return NextResponse.json({ error: 'GoCardless is niet ingeschakeld' }, { status: 503 })
  }

  try {
    const { gc_account_id } = await req.json()

    if (!gc_account_id) {
      return NextResponse.json({ error: 'gc_account_id is vereist' }, { status: 400 })
    }

    // Soft disconnect: deactivate the gc_account, keep bank_accounts and transactions
    const { error } = await supabase
      .from('gocardless_accounts')
      .update({ is_active: false })
      .eq('id', gc_account_id)
      .eq('user_id', user.id)

    if (error) {
      return NextResponse.json({ error: 'Kon verbinding niet verbreken' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('GoCardless disconnect error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Verbinding verbreken mislukt' },
      { status: 500 }
    )
  }
}
