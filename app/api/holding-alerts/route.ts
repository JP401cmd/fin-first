import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export type HoldingAlertType = 'price_above' | 'price_below' | 'return_threshold' | 'rebalance_drift'

export type HoldingAlert = {
  id: string
  user_id: string
  holding_id: string | null
  type: HoldingAlertType
  threshold: number
  is_active: boolean
  last_triggered_at: string | null
  created_at: string
  updated_at: string
}

/**
 * GET /api/holding-alerts?holding_id=<uuid>
 *
 * List active alerts for a specific holding or all holdings.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const holdingId = searchParams.get('holding_id')

  let query = supabase
    .from('holding_alerts')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (holdingId) {
    query = query.eq('holding_id', holdingId)
  }

  const { data: alerts, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ alerts: alerts || [] })
}

/**
 * POST /api/holding-alerts
 *
 * Create a new alert.
 * Body: { holding_id?, type, threshold }
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { holding_id, type, threshold } = body

    if (!type || threshold === undefined || threshold === null) {
      return NextResponse.json({ error: 'type and threshold are required' }, { status: 400 })
    }

    const validTypes: HoldingAlertType[] = ['price_above', 'price_below', 'return_threshold', 'rebalance_drift']
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: `type must be one of: ${validTypes.join(', ')}` }, { status: 400 })
    }

    // For rebalance_drift, holding_id is optional (portfolio-wide)
    // For price/return alerts, holding_id is required
    if (type !== 'rebalance_drift' && !holding_id) {
      return NextResponse.json({ error: 'holding_id is required for price and return alerts' }, { status: 400 })
    }

    const { data: alert, error } = await supabase
      .from('holding_alerts')
      .insert({
        user_id: user.id,
        holding_id: holding_id || null,
        type,
        threshold: Number(threshold),
        is_active: true,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ alert }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Onbekende fout'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * PATCH /api/holding-alerts
 *
 * Update an alert (toggle active, change threshold).
 * Body: { id, is_active?, threshold? }
 */
export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { id, is_active, threshold } = body

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (is_active !== undefined) update.is_active = is_active
    if (threshold !== undefined) update.threshold = Number(threshold)

    const { data: alert, error } = await supabase
      .from('holding_alerts')
      .update(update)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ alert })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Onbekende fout'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * DELETE /api/holding-alerts?id=<uuid>
 *
 * Delete an alert permanently.
 */
export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('holding_alerts')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
