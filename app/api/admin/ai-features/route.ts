import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'
import {
  parseAiCreditConfig,
  currentPeriod,
  AI_FEATURES,
  featureLabel,
  DEFAULT_AI_CREDIT_CONFIG,
} from '@/lib/ai-credits'

export async function GET() {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: settingsRows } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', ['news_max_refreshes_per_week', 'ai_credit_config'])

  const settings: Record<string, string> = {}
  for (const row of settingsRows ?? []) settings[row.key] = row.value
  const config = parseAiCreditConfig(settings['ai_credit_config'])

  // ── Verbruik-aggregaat deze periode (superadmin leest alle ai_usage via RLS) ──
  const { start } = currentPeriod(new Date())
  const { data: usageRows } = await supabase
    .from('ai_usage')
    .select('user_id, feature, credits')
    .gte('created_at', start.toISOString())

  const rows = (usageRows ?? []) as { user_id: string; feature: string; credits: number }[]
  const total = rows.reduce((s, r) => s + r.credits, 0)

  const featMap = new Map<string, number>()
  const userMap = new Map<string, number>()
  for (const r of rows) {
    featMap.set(r.feature, (featMap.get(r.feature) ?? 0) + r.credits)
    userMap.set(r.user_id, (userMap.get(r.user_id) ?? 0) + r.credits)
  }

  const byFeature: { key: string; label: string; credits: number }[] = []
  for (const f of AI_FEATURES) {
    const c = featMap.get(f.key) ?? 0
    if (c > 0) byFeature.push({ key: f.key, label: f.label, credits: c })
  }
  for (const [k, v] of featMap) {
    if (!AI_FEATURES.some((f) => f.key === k)) byFeature.push({ key: k, label: featureLabel(k), credits: v })
  }
  byFeature.sort((a, b) => b.credits - a.credits)

  const topEntries = [...userMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
  const topIds = topEntries.map((e) => e[0])
  let names: Record<string, string> = {}
  if (topIds.length > 0) {
    const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', topIds)
    for (const p of profs ?? []) names[p.id] = (p.full_name as string | null) ?? p.id
  }
  const topUsers = topEntries.map(([id, credits]) => ({
    id,
    name: names[id] ?? `${id.slice(0, 8)}…`,
    credits,
  }))

  return NextResponse.json({
    news_max_refreshes_per_week: settings['news_max_refreshes_per_week'] ?? null,
    aiCreditBudgets: config.budgets,
    usage: { total, byFeature, topUsers },
  })
}

export async function PUT(req: Request) {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Nieuws-verversingen
  if ('news_max_refreshes_per_week' in body) {
    const { error } = await supabase.from('app_settings').upsert(
      {
        key: 'news_max_refreshes_per_week',
        value: String(body.news_max_refreshes_per_week),
        updated_at: new Date().toISOString(),
        updated_by: user?.id,
      },
      { onConflict: 'key' },
    )
    if (error) {
      return NextResponse.json({ error: `Failed to update news setting: ${error.message}` }, { status: 500 })
    }
  }

  // AI-credit-budgetten
  if ('aiCreditBudgets' in body && body.aiCreditBudgets && typeof body.aiCreditBudgets === 'object') {
    const ai = Number(body.aiCreditBudgets.ai)
    const gratis = Number(body.aiCreditBudgets.gratis)
    const budgets = {
      ai: Number.isFinite(ai) && ai >= 0 ? Math.round(ai) : DEFAULT_AI_CREDIT_CONFIG.budgets.ai,
      gratis: Number.isFinite(gratis) && gratis >= 0 ? Math.round(gratis) : DEFAULT_AI_CREDIT_CONFIG.budgets.gratis,
    }
    const { error } = await supabase.from('app_settings').upsert(
      {
        key: 'ai_credit_config',
        value: JSON.stringify({ budgets }),
        updated_at: new Date().toISOString(),
        updated_by: user?.id,
      },
      { onConflict: 'key' },
    )
    if (error) {
      return NextResponse.json({ error: `Failed to update credit budgets: ${error.message}` }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true })
}
