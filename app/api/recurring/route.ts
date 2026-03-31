import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * POST /api/recurring — Confirm a detected pattern as a recurring transaction.
 *
 * Body (required: name, amount, frequency):
 *   name               string
 *   amount             number   (negative = expense)
 *   frequency          'weekly' | 'monthly' | 'quarterly' | 'yearly'
 *   counterparty_name  string   (defaults to name)
 *   category_override  'subscription' | 'vaste_kosten' | 'excluded' | null
 *   day_of_month       number | null
 *   day_of_week        number | null
 *   budget_id          string | null
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

    const body = await request.json()
    const {
      name,
      amount,
      frequency,
      counterparty_name,
      category_override,
      day_of_month,
      day_of_week,
      budget_id,
    } = body

    if (!name || amount === undefined || !frequency) {
      return NextResponse.json(
        { error: 'Naam, bedrag en frequentie zijn verplicht' },
        { status: 400 },
      )
    }

    // Validate frequency
    const validFrequencies = ['weekly', 'monthly', 'quarterly', 'yearly']
    if (!validFrequencies.includes(frequency)) {
      return NextResponse.json({ error: 'Ongeldige frequentie' }, { status: 400 })
    }

    // Validate category_override when provided
    const validOverrides = ['subscription', 'vaste_kosten', 'excluded', null, undefined]
    if (!validOverrides.includes(category_override)) {
      return NextResponse.json({ error: 'Ongeldige categorie' }, { status: 400 })
    }

    // Get user's first account as default
    const { data: accounts } = await supabase
      .from('bank_accounts')
      .select('id')
      .limit(1)

    const accountId = accounts?.[0]?.id
    if (!accountId) {
      return NextResponse.json({ error: 'Geen bankrekening gevonden' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('recurring_transactions')
      .insert({
        user_id: user.id,
        account_id: accountId,
        name,
        amount: Number(amount),
        counterparty_name: counterparty_name || name,
        frequency,
        day_of_month: day_of_month || null,
        day_of_week: day_of_week || null,
        start_date: new Date().toISOString().split('T')[0],
        is_active: category_override !== 'excluded',
        category_override: category_override || null,
        budget_id: budget_id || null,
      })
      .select()
      .single()

    if (error) {
      console.error('[POST /api/recurring]', error)
      return NextResponse.json({ error: 'Toevoegen mislukt' }, { status: 500 })
    }

    return NextResponse.json({ success: true, recurring: data })
  } catch (err) {
    console.error('[POST /api/recurring]', err)
    return NextResponse.json({ error: 'Interne fout' }, { status: 500 })
  }
}
