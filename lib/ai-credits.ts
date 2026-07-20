import type { SupabaseClient } from '@supabase/supabase-js'

// ── Features + credit-kosten per actie ───────────────────────────────────────
// Kosten zijn (voorlopig) code-constanten; de maandbudgetten zijn admin-
// instelbaar (zie AiCreditConfig). Notion-stijl: elke AI-actie kost credits.

export type AiFeatureKey =
  | 'chat'
  | 'briefing'
  | 'recommendations'
  | 'report'
  | 'extraction'
  | 'categorize'
  | 'news'

export interface AiFeatureDef {
  key: AiFeatureKey
  label: string
  cost: number
}

export const AI_FEATURES: AiFeatureDef[] = [
  { key: 'chat', label: 'Fin-chat', cost: 1 },
  { key: 'briefing', label: 'Briefing', cost: 2 },
  { key: 'recommendations', label: 'Aanbevelingen', cost: 2 },
  { key: 'report', label: 'Rapporten', cost: 5 },
  { key: 'extraction', label: 'Extractie', cost: 2 },
  { key: 'categorize', label: 'Categorisatie', cost: 1 },
  { key: 'news', label: 'Nieuws', cost: 1 },
]

const COST_BY_KEY: Record<string, number> = Object.fromEntries(AI_FEATURES.map((f) => [f.key, f.cost]))
const LABEL_BY_KEY: Record<string, string> = Object.fromEntries(AI_FEATURES.map((f) => [f.key, f.label]))

export function featureLabel(key: string): string {
  return LABEL_BY_KEY[key] ?? key
}
export function featureCost(key: AiFeatureKey): number {
  return COST_BY_KEY[key] ?? 1
}

// ── Maandbudget (admin-instelbaar via app_settings 'ai_credit_config') ────────

export interface AiCreditConfig {
  budgets: { ai: number; gratis: number }
}

export const DEFAULT_AI_CREDIT_CONFIG: AiCreditConfig = {
  budgets: { ai: 500, gratis: 50 },
}

export function parseAiCreditConfig(raw: string | null | undefined): AiCreditConfig {
  if (!raw) return DEFAULT_AI_CREDIT_CONFIG
  try {
    const v = JSON.parse(raw) as { budgets?: { ai?: unknown; gratis?: unknown } }
    const ai = Number(v?.budgets?.ai)
    const gratis = Number(v?.budgets?.gratis)
    return {
      budgets: {
        ai: Number.isFinite(ai) && ai >= 0 ? ai : DEFAULT_AI_CREDIT_CONFIG.budgets.ai,
        gratis: Number.isFinite(gratis) && gratis >= 0 ? gratis : DEFAULT_AI_CREDIT_CONFIG.budgets.gratis,
      },
    }
  } catch {
    return DEFAULT_AI_CREDIT_CONFIG
  }
}

/** Maandbudget voor een gebruiker op basis van het AI-abonnement. */
export function budgetForUser(config: AiCreditConfig, hasAi: boolean): number {
  return hasAi ? config.budgets.ai : config.budgets.gratis
}

// ── Periode: kalendermaand ────────────────────────────────────────────────────

export interface Period {
  start: Date
  end: Date
  resetDate: Date
}

export function currentPeriod(now: Date): Period {
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return { start, end, resetDate: end }
}

// ── Verbruik samenvatten (voor de weergave) ───────────────────────────────────

export interface UsageRow {
  feature: string
  credits: number
  created_at: string
}

export interface UsageSummary {
  used: number
  budget: number
  remaining: number
  pct: number
  resetDate: string
  byFeature: { key: string; label: string; credits: number }[]
  /** Cumulatief verbruik per dag van de periode (voor de grafiek). */
  dailyCumulative: { day: number; used: number }[]
  /** Lineaire prognose van het eindverbruik van de periode. */
  forecast: number
  daysInPeriod: number
  dayOfPeriod: number
}

export function summarizeUsage(rows: UsageRow[], budget: number, now: Date): UsageSummary {
  const { start, end, resetDate } = currentPeriod(now)
  const inPeriod = rows.filter((r) => {
    const d = new Date(r.created_at)
    return d >= start && d < end
  })
  const used = inPeriod.reduce((s, r) => s + r.credits, 0)

  // Per-feature, hoogste eerst.
  const featMap = new Map<string, number>()
  for (const r of inPeriod) featMap.set(r.feature, (featMap.get(r.feature) ?? 0) + r.credits)
  const byFeature: { key: string; label: string; credits: number }[] = []
  for (const f of AI_FEATURES) {
    const c = featMap.get(f.key) ?? 0
    if (c > 0) byFeature.push({ key: f.key, label: f.label, credits: c })
  }
  for (const [k, v] of featMap) {
    if (!AI_FEATURES.some((f) => f.key === k)) byFeature.push({ key: k, label: featureLabel(k), credits: v })
  }
  byFeature.sort((a, b) => b.credits - a.credits)

  // Cumulatief per dag.
  const daysInPeriod = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000))
  const dayOfPeriod = Math.min(
    daysInPeriod,
    Math.floor((now.getTime() - start.getTime()) / 86_400_000) + 1,
  )
  const perDay = new Array(daysInPeriod).fill(0)
  for (const r of inPeriod) {
    const d = Math.floor((new Date(r.created_at).getTime() - start.getTime()) / 86_400_000)
    if (d >= 0 && d < daysInPeriod) perDay[d] += r.credits
  }
  let acc = 0
  const dailyCumulative = perDay.map((c, i) => {
    acc += c
    return { day: i + 1, used: acc }
  })

  const forecast = dayOfPeriod > 0 ? Math.round((used / dayOfPeriod) * daysInPeriod) : used

  return {
    used,
    budget,
    remaining: Math.max(0, budget - used),
    pct: budget > 0 ? Math.min(100, Math.round((used / budget) * 100)) : 0,
    resetDate: resetDate.toISOString(),
    byFeature,
    dailyCumulative,
    forecast,
    daysInPeriod,
    dayOfPeriod,
  }
}

// ── Recording (defensief: AI-actie mag nooit falen door metering) ─────────────

export async function recordAiUsage(
  client: SupabaseClient,
  userId: string,
  feature: AiFeatureKey,
): Promise<void> {
  try {
    await client.from('ai_usage').insert({ user_id: userId, feature, credits: featureCost(feature) })
  } catch {
    // Metering mag de AI-actie nooit breken.
  }
}
