import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { loadVasteLastenSummary } from '@/lib/vaste-lasten-summary'
import { buildVooruitblikItems, type VooruitblikItem } from '@/lib/checkin/vooruitblik'

const MONTH_NAMES = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
]

export async function GET() {
  const supabase = await createClient()
  const claims = await getAuthClaims(supabase)
  if (!claims) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const now = new Date()
  const nextMonth = now.getMonth() + 1
  const normalizedMonth = nextMonth > 11 ? 0 : nextMonth

  // Vaste lasten + abonnementen uit de gedeelde samenvatting (confirmed
  // recurring_transactions + auto-detectie over 12 maanden). Niet zelf
  // groeperen: die eigen weg liet eenmalige aankopen doorsijpelen.
  const [vasteLasten, lifeEventsRes] = await Promise.all([
    loadVasteLastenSummary(supabase),
    supabase
      .from('life_events')
      .select('name, annual_amount, start_year')
      .eq('user_id', claims.sub)
      .eq('is_active', true)
      .gte('start_year', now.getFullYear())
      .lte('start_year', now.getFullYear() + 1)
      .limit(5),
  ])

  const items: VooruitblikItem[] = buildVooruitblikItems(
    vasteLasten,
    MONTH_NAMES[normalizedMonth],
  )

  for (const event of lifeEventsRes.data || []) {
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
