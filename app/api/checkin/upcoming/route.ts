import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { localMonthBounds, localMonthStart } from '@/lib/month-range'

const MONTH_NAMES = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
]

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const now = new Date()
  const nextMonth = now.getMonth() + 1
  const nextYear = nextMonth > 11 ? now.getFullYear() + 1 : now.getFullYear()
  const normalizedMonth = nextMonth > 11 ? 0 : nextMonth

  // Fetch recurring transactions (top spending patterns from last 3 months)
  const threeMonthsAgo = localMonthStart(new Date(now.getFullYear(), now.getMonth() - 3, 1))
  const currentMonthEnd = localMonthBounds(now).end

  const { data: recentTransactions } = await supabase
    .from('transactions')
    .select('amount, description, counterparty_name, date')
    .eq('user_id', user.id)
    .gte('date', threeMonthsAgo)
    .lt('date', currentMonthEnd)
    .order('amount', { ascending: true })
    .limit(200)

  // Group by counterparty to find recurring expenses
  const counterpartyMap: Record<string, { total: number; count: number; avgAmount: number }> = {}
  for (const t of recentTransactions || []) {
    const key = t.counterparty_name || t.description || 'Onbekend'
    if (!counterpartyMap[key]) {
      counterpartyMap[key] = { total: 0, count: 0, avgAmount: 0 }
    }
    counterpartyMap[key].total += t.amount || 0
    counterpartyMap[key].count += 1
  }

  // Filter for recurring (appeared in 2+ months) and compute average
  const recurring: { name: string; amount: number; date: string }[] = []
  for (const [name, data] of Object.entries(counterpartyMap)) {
    if (data.count >= 2) {
      recurring.push({
        name,
        amount: Math.round(data.total / data.count),
        date: MONTH_NAMES[normalizedMonth],
      })
    }
  }

  // Sort by absolute amount (largest first), limit to top 10
  recurring.sort((a, b) => Math.abs(a.amount) - Math.abs(b.amount))
  const items = recurring.slice(0, 10)

  // Also fetch life events / upcoming events
  const { data: lifeEvents } = await supabase
    .from('life_events')
    .select('name, annual_amount, start_year')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .gte('start_year', now.getFullYear())
    .lte('start_year', now.getFullYear() + 1)
    .limit(5)

  for (const event of lifeEvents || []) {
    if (event.annual_amount) {
      items.push({
        name: event.name,
        amount: -Math.abs(event.annual_amount),
        date: `${event.start_year}`,
      })
    }
  }

  return NextResponse.json({ items })
}
