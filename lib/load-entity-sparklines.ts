/**
 * Per-entiteit sparkline-loader voor categoriepagina's en losse asset/debt
 * kaarten. Spiegelt de aggregatie-logica van `categorySparklines` in
 * `core-data-loader.ts`, maar groepeert op `entity_id` i.p.v. categorie.
 *
 * Output: `Record<entity_id, number[6]>` — 6 maandwaarden (oudste →
 * nieuwste), gewogen met `net_worth_inclusion_pct`. Bij ontbrekende
 * maanden vullen we forward (laatst bekende waarde). Categorieën zonder
 * variatie of zonder snapshots vallen in de UI terug op een rechte
 * scheidingslijn — hier in de loader retourneren we ze met de gevonden
 * waarden zodat de UI kan kiezen.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

type EntityType = 'asset' | 'debt'

interface SnapRow {
  snapshot_date: string
  entity_id: string
  balance: number | string
  net_worth_inclusion_pct: number | string | null
}

export async function loadEntitySparklines(
  supabase: SupabaseClient,
  entityType: EntityType,
  entityIds: string[],
): Promise<Record<string, number[]>> {
  if (entityIds.length === 0) return {}
  const now = new Date()
  const sixMonthsAgo = new Date(
    Date.UTC(now.getFullYear(), now.getMonth() - 5, 1),
  )
    .toISOString()
    .split('T')[0]

  try {
    const result = await supabase
      .from('balance_snapshots')
      .select('snapshot_date, entity_id, balance, net_worth_inclusion_pct')
      .eq('entity_type', entityType)
      .in('entity_id', entityIds)
      .gte('snapshot_date', sixMonthsAgo)
      .order('snapshot_date', { ascending: true })
    const rows = (result.data ?? []) as SnapRow[]
    if (rows.length === 0) return {}

    const monthKeys: string[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() - i, 1))
      monthKeys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
    }
    const monthIdx = new Map<string, number>(monthKeys.map((k, i) => [k, i]))

    // Per (entity_id, month) → laatste snapshot_date.
    const latestDateByEntityMonth = new Map<string, string>()
    for (const r of rows) {
      const month = r.snapshot_date.substring(0, 7)
      if (!monthIdx.has(month)) continue
      const k = `${r.entity_id}|${month}`
      const cur = latestDateByEntityMonth.get(k)
      if (!cur || r.snapshot_date > cur) {
        latestDateByEntityMonth.set(k, r.snapshot_date)
      }
    }

    // Pak alleen de laatste snapshot per entity per maand, gewogen × inclusie%.
    const valByEntityMonth = new Map<string, number>()
    for (const r of rows) {
      const month = r.snapshot_date.substring(0, 7)
      if (!monthIdx.has(month)) continue
      const k = `${r.entity_id}|${month}`
      if (latestDateByEntityMonth.get(k) !== r.snapshot_date) continue
      const weight = Number(r.net_worth_inclusion_pct ?? 100) / 100
      valByEntityMonth.set(k, Number(r.balance) * weight)
    }

    const out: Record<string, number[]> = {}
    for (const id of entityIds) {
      const series = monthKeys.map((m) => valByEntityMonth.get(`${id}|${m}`) ?? null)
      const firstReal = series.find((v) => v != null) ?? null
      if (firstReal == null) continue
      let last = firstReal
      const filled: number[] = []
      for (const v of series) {
        if (v != null) last = v
        filled.push(last)
      }
      out[id] = filled
    }
    return out
  } catch {
    return {}
  }
}
