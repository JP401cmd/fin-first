import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isGoCardlessEnabled } from '@/lib/gocardless/feature-flag'
import { getAccessToken, getBalances } from '@/lib/gocardless/client'

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

    const { data: gcAccount } = await supabase
      .from('gocardless_accounts')
      .select('*')
      .eq('id', gc_account_id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()

    if (!gcAccount) {
      return NextResponse.json({ error: 'Account niet gevonden' }, { status: 404 })
    }

    const token = await getAccessToken(supabase)
    const balancesResponse = await getBalances(supabase, token, gcAccount.gc_account_id)

    // Find the most relevant balance (prefer closingBooked or expected)
    const balances = balancesResponse.balances
    const preferred = balances.find((b) => b.balanceType === 'closingBooked')
      ?? balances.find((b) => b.balanceType === 'expected')
      ?? balances[0]

    if (preferred && gcAccount.bank_account_id) {
      const balance = parseFloat(preferred.balanceAmount.amount)

      await supabase
        .from('bank_accounts')
        .update({
          balance,
          updated_at: new Date().toISOString(),
        })
        .eq('id', gcAccount.bank_account_id)

      return NextResponse.json({ balance, balance_type: preferred.balanceType })
    }

    return NextResponse.json({ balance: null, balances })
  } catch (err) {
    console.error('GoCardless balances error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Saldo ophalen mislukt' },
      { status: 500 }
    )
  }
}
