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
    .select('expected_return, inflation_rate, box3_method')
    .eq('id', user.id)
    .single()

  if (error) {
    return NextResponse.json({ error: 'Fout bij laden parameters' }, { status: 500 })
  }

  return NextResponse.json({
    expected_return: data?.expected_return ?? 0.07,
    inflation_rate: data?.inflation_rate ?? 0.02,
    box3_method: data?.box3_method ?? 'forfaitair',
  })
}

// ── PUT — Sla berekeningsparameters op in profiles ────────────────────

export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  let body: { expected_return?: unknown; inflation_rate?: unknown; box3_method?: unknown }
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

  // Validate box3_method if provided
  const box3Method = body.box3_method as string | undefined
  if (box3Method !== undefined && box3Method !== 'forfaitair' && box3Method !== 'werkelijk') {
    return NextResponse.json({ error: 'Box 3 methode moet "forfaitair" of "werkelijk" zijn' }, { status: 400 })
  }

  const updateData: Record<string, unknown> = {
    id: user.id,
    expected_return: expectedReturn,
    inflation_rate: inflationRate,
    updated_at: new Date().toISOString(),
  }
  if (box3Method !== undefined) {
    updateData.box3_method = box3Method
  }

  const { error } = await supabase
    .from('profiles')
    .upsert(updateData)

  if (error) {
    return NextResponse.json({ error: 'Fout bij opslaan parameters' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    expected_return: expectedReturn,
    inflation_rate: inflationRate,
    box3_method: box3Method ?? 'forfaitair',
  })
}
