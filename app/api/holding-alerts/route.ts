import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { unauthorized, serverError } from '@/lib/api/respond'

export type HoldingAlertType = 'price_above' | 'price_below' | 'return_threshold' | 'rebalance_drift'

export type HoldingAlert = {
  id: string
  user_id: string
  /** Typed FK's sinds migratie 20260502000004 — precies één is gezet. */
  investment_holding_id: string | null
  crypto_holding_id: string | null
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
 *
 * NB: het API-contract spreekt nog `holding_id` (de client op de holdings-
 * detailpagina stuurt dat veld); de route vertaalt dat naar de typed kolom
 * `investment_holding_id` — de legacy DB-kolom is gedropt en gaf 400's.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return unauthorized()
  }

  const { searchParams } = new URL(request.url)
  const holdingId = searchParams.get('holding_id')

  let query = supabase
    .from('holding_alerts')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (holdingId) {
    query = query.eq('investment_holding_id', holdingId)
  }

  const { data: alerts, error } = await query

  if (error) {
    return serverError(error, 'holding-alerts:GET')
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
    return unauthorized()
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

    // De DB-CHECK (holding_alerts_one_typed_fk) eist precies één typed FK —
    // óók voor rebalance_drift; de UI stuurt altijd een holding mee, dus
    // portfolio-breed zonder holding is geen geldig insert-pad meer.
    if (!holding_id) {
      return NextResponse.json({ error: 'holding_id is required' }, { status: 400 })
    }

    const { data: alert, error } = await supabase
      .from('holding_alerts')
      .insert({
        user_id: user.id,
        investment_holding_id: holding_id,
        type,
        threshold: Number(threshold),
        is_active: true,
      })
      .select()
      .single()

    if (error) {
      return serverError(error, 'holding-alerts:POST')
    }

    return NextResponse.json({ alert }, { status: 201 })
  } catch (err) {
    return serverError(err, 'holding-alerts:POST')
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
    return unauthorized()
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
      return serverError(error, 'holding-alerts:PATCH')
    }

    return NextResponse.json({ alert })
  } catch (err) {
    return serverError(err, 'holding-alerts:PATCH')
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
    return unauthorized()
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
    return serverError(error, 'holding-alerts:DELETE')
  }

  return NextResponse.json({ success: true })
}
