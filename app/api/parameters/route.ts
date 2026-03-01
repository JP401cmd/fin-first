import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// ── GET — Lees berekeningsparameters uit profiles ─────────────────────

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('expected_return, inflation_rate')
    .eq('id', user.id)
    .single()

  if (error) {
    return NextResponse.json({ error: 'Fout bij laden parameters' }, { status: 500 })
  }

  return NextResponse.json({
    expected_return: data?.expected_return ?? 0.07,
    inflation_rate: data?.inflation_rate ?? 0.02,
  })
}

// ── PUT — Sla berekeningsparameters op in profiles ────────────────────

export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  let body: { expected_return?: unknown; inflation_rate?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldig verzoek' }, { status: 400 })
  }

  const expectedReturn = Number(body.expected_return)
  const inflationRate = Number(body.inflation_rate)

  if (isNaN(expectedReturn) || expectedReturn < 0.01 || expectedReturn > 0.15) {
    return NextResponse.json({ error: 'Verwacht rendement moet tussen 1% en 15% liggen' }, { status: 400 })
  }
  if (isNaN(inflationRate) || inflationRate < 0 || inflationRate > 0.08) {
    return NextResponse.json({ error: 'Inflatie moet tussen 0% en 8% liggen' }, { status: 400 })
  }

  const { error } = await supabase
    .from('profiles')
    .upsert({
      id: user.id,
      expected_return: expectedReturn,
      inflation_rate: inflationRate,
      updated_at: new Date().toISOString(),
    })

  if (error) {
    return NextResponse.json({ error: 'Fout bij opslaan parameters' }, { status: 500 })
  }

  return NextResponse.json({ success: true, expected_return: expectedReturn, inflation_rate: inflationRate })
}
