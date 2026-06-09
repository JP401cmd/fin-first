import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// ── PUT — Sla het handmatige bruto-jaarinkomen voor de Box 1-pagina op ──
//
// Body: { grossIncome: number | null }
//   • number > 0  → handmatig bruto, wint op de cashflow-schatting (alleen Box 1)
//   • null        → terug naar de automatische schatting
//
// Beïnvloedt ALLEEN de belasting/Box 1-pagina, niet FIRE/cashflow/dashboard
// (die lezen hun eigen netto-bron net_monthly_income).

export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldig verzoek' }, { status: 400 })
  }

  const raw = body.grossIncome
  let grossIncome: number | null
  if (raw === null) {
    grossIncome = null // terug naar automatische schatting
  } else {
    const n = Number(raw)
    if (!Number.isFinite(n) || n <= 0 || n > 10_000_000) {
      return NextResponse.json(
        { error: 'Bruto-jaarinkomen moet tussen €1 en €10.000.000 liggen' },
        { status: 400 },
      )
    }
    grossIncome = Math.round(n)
  }

  const { error } = await supabase
    .from('profiles')
    .update({ box1_gross_income: grossIncome, updated_at: new Date().toISOString() })
    .eq('id', user.id)

  if (error) {
    return NextResponse.json({ error: 'Fout bij opslaan inkomen' }, { status: 500 })
  }

  return NextResponse.json({ success: true, box1_gross_income: grossIncome })
}
