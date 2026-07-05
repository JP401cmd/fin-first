import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/service'
import { isSuperAdmin } from '@/lib/admin'

type TransitionKind = 'regressie' | 'hersteld' | 'niet_opnieuw' | 'ongewijzigd' | 'nieuw'

interface ResultRow {
  scenario_id: string
  sub: string
  platform: string
  status: string
}

const PASSED = 'geslaagd'
const FAILING = new Set(['gefaald', 'geblokkeerd'])

function keyOf(row: Pick<ResultRow, 'scenario_id' | 'sub' | 'platform'>): string {
  return `${row.scenario_id}::${row.sub}::${row.platform}`
}

function classify(baseStatus: string | undefined, targetStatus: string | undefined): TransitionKind {
  if (baseStatus === undefined && targetStatus !== undefined) return 'nieuw'
  if (baseStatus !== undefined && targetStatus === undefined) return 'niet_opnieuw'
  if (baseStatus === targetStatus) return 'ongewijzigd'
  if (baseStatus === PASSED && targetStatus !== undefined && FAILING.has(targetStatus)) return 'regressie'
  if (baseStatus !== undefined && FAILING.has(baseStatus) && targetStatus === PASSED) return 'hersteld'
  return 'ongewijzigd'
}

/**
 * GET /api/admin/uat/compare?base=<roundId>&target=<roundId> — regressie-
 * vergelijking tussen twee testrondes per (scenario_id, sub, platform).
 * Zie docs/uat/uat-plan.md Deel 3 §3.4: 'geslaagd' → 'gefaald'/'geblokkeerd' is
 * een regressie, het omgekeerde is hersteld, een status die in target ontbreekt
 * is 'niet_opnieuw' uitgevoerd.
 */
export async function GET(req: Request) {
  const supabase = await createClient()
  if (!(await isSuperAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const base = searchParams.get('base')
  const target = searchParams.get('target')
  if (!base || !target) {
    return NextResponse.json({ error: 'base en target zijn verplicht' }, { status: 400 })
  }

  const svc = getServiceClient()
  const [baseRes, targetRes] = await Promise.all([
    svc.from('uat_results').select('scenario_id, sub, platform, status').eq('round_id', base),
    svc.from('uat_results').select('scenario_id, sub, platform, status').eq('round_id', target),
  ])

  if (baseRes.error) {
    console.error('[api/admin/uat/compare] basisronde ophalen mislukte', baseRes.error)
    return NextResponse.json({ error: 'Databasefout' }, { status: 500 })
  }
  if (targetRes.error) {
    console.error('[api/admin/uat/compare] doelronde ophalen mislukte', targetRes.error)
    return NextResponse.json({ error: 'Databasefout' }, { status: 500 })
  }

  const baseMap = new Map<string, ResultRow>()
  for (const row of (baseRes.data ?? []) as ResultRow[]) baseMap.set(keyOf(row), row)
  const targetMap = new Map<string, ResultRow>()
  for (const row of (targetRes.data ?? []) as ResultRow[]) targetMap.set(keyOf(row), row)

  const allKeys = new Set<string>([...baseMap.keys(), ...targetMap.keys()])

  const transitions = [...allKeys].map((key) => {
    const baseRow = baseMap.get(key)
    const targetRow = targetMap.get(key)
    const [scenario_id, sub, platform] = key.split('::')
    const kind = classify(baseRow?.status, targetRow?.status)
    return {
      scenario_id,
      sub,
      platform,
      baseStatus: baseRow?.status ?? null,
      targetStatus: targetRow?.status ?? null,
      kind,
    }
  })

  const summary = {
    regressies: transitions.filter((t) => t.kind === 'regressie').length,
    hersteld: transitions.filter((t) => t.kind === 'hersteld').length,
  }

  return NextResponse.json({ transitions, summary })
}
