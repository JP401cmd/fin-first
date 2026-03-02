import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { BalanceSnapshot, EntityBalanceHistory } from '@/lib/net-worth-data'

/**
 * GET /api/snapshots/balances
 *
 * Returns per-entity balance history for the authenticated user.
 * Grouped by entity_id, with chronological data points.
 *
 * Query params:
 * - type: 'asset' | 'debt' | 'all' (default: 'all')
 * - limit: max snapshots per entity (default: 24)
 */
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const url = new URL(request.url)
  const typeFilter = url.searchParams.get('type') ?? 'all'
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 24), 120)

  let query = supabase
    .from('balance_snapshots')
    .select('*')
    .eq('user_id', user.id)
    .order('snapshot_date', { ascending: true })

  if (typeFilter === 'asset' || typeFilter === 'debt') {
    query = query.eq('entity_type', typeFilter)
  }

  const { data, error } = await query

  if (error) {
    // Table might not exist yet
    if (error.message.includes('relation') || error.code === '42P01') {
      return NextResponse.json({ entities: [], count: 0, note: 'balance_snapshots table not yet available' })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as BalanceSnapshot[]

  // Group by entity_id
  const grouped = new Map<string, EntityBalanceHistory>()

  for (const row of rows) {
    let entity = grouped.get(row.entity_id)
    if (!entity) {
      entity = {
        entity_id: row.entity_id,
        entity_name: row.entity_name,
        entity_type: row.entity_type,
        entity_subtype: row.entity_subtype,
        points: [],
      }
      grouped.set(row.entity_id, entity)
    }
    // Always use the latest name for the entity
    entity.entity_name = row.entity_name
    entity.points.push({ date: row.snapshot_date, balance: Number(row.balance) })
  }

  // Apply limit per entity (keep most recent N points)
  const entities = Array.from(grouped.values()).map(e => ({
    ...e,
    points: e.points.slice(-limit),
  }))

  // Sort: assets first (descending by latest balance), then debts
  entities.sort((a, b) => {
    if (a.entity_type !== b.entity_type) return a.entity_type === 'asset' ? -1 : 1
    const aLast = a.points[a.points.length - 1]?.balance ?? 0
    const bLast = b.points[b.points.length - 1]?.balance ?? 0
    return bLast - aLast
  })

  return NextResponse.json({
    entities,
    count: entities.length,
  })
}
