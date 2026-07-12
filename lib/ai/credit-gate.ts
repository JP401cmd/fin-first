// lib/ai/credit-gate.ts
//
// Per-gebruiker AI-rate-limit door het BESTAANDE maand-creditbudget af te
// dwingen (Notion: "1 credit per bericht, gebruik huidige systeem, 1 bucket").
// Credits werden tot nu toe wél geregistreerd (recordAiUsage → ai_usage) maar
// NERGENS gehandhaafd — een AI-abonnee kon zo onbeperkt AI-kosten veroorzaken.
//
// Deze gate leest het verbruik van de huidige kalendermaand (één gedeelde
// bucket over alle AI-features) en vergelijkt het met het budget dat bij het
// abonnement hoort (budgetForUser: ai=500 / gratis=50, admin-instelbaar via
// app_settings 'ai_credit_config'). De actie mag door zolang het verbruik ná
// deze actie binnen het budget blijft.
//
// Scheiding van zorgen (spiegel van lib/calculator/rate-limit.ts): deze module
// weet niets van HTTP. Elke AI-route roept `checkCreditBudget` aan direct NA
// checkTierGate en VÓÓR getModel()/de LLM-call, en geeft bij overschrijding een
// 429 met Retry-After terug.
//
// Fail-open: bij een DB-leesfout wordt de actie toegestaan — een database-hik
// mag geen AI-uitval geven. De metering blijft dan intact via recordAiUsage.

import type { SupabaseClient } from '@supabase/supabase-js'
import { hasSubscription } from '@/lib/feature-registry'
import {
  parseAiCreditConfig,
  budgetForUser,
  currentPeriod,
  featureCost,
  type AiFeatureKey,
} from '@/lib/ai-credits'

export interface CreditGateResult {
  /** True zolang de actie binnen het maandbudget past. */
  allowed: boolean
  /** Reeds verbruikte credits in de huidige periode. */
  used: number
  /** Maandbudget voor deze gebruiker (op basis van abonnement). */
  budget: number
  /** Resterende credits vóór deze actie. */
  remaining: number
  /** ISO-tijd waarop de teller reset (begin volgende kalendermaand). */
  resetDate: string
  /** Seconden tot reset — voor de Retry-After-header. */
  retryAfterSeconds: number
}

/**
 * Controleer of een AI-actie binnen het maand-creditbudget van de gebruiker
 * past. Verhoogt de teller NIET — dat blijft de verantwoordelijkheid van
 * recordAiUsage ná een geslaagde call (zelfde bucket).
 */
export async function checkCreditBudget(
  supabase: SupabaseClient,
  userId: string,
  feature: AiFeatureKey,
  now: Date = new Date(),
): Promise<CreditGateResult> {
  const { start, end } = currentPeriod(now)
  const retryAfterSeconds = Math.max(1, Math.ceil((end.getTime() - now.getTime()) / 1000))

  try {
    const [{ data: profile }, { data: configRow }, { data: usage, error: usageError }] =
      await Promise.all([
        supabase.from('profiles').select('active_subscriptions').eq('id', userId).single(),
        supabase.from('app_settings').select('value').eq('key', 'ai_credit_config').maybeSingle(),
        supabase
          .from('ai_usage')
          .select('credits')
          .eq('user_id', userId)
          .gte('created_at', start.toISOString()),
      ])

    if (usageError) throw usageError

    const config = parseAiCreditConfig(configRow?.value)
    const hasAi = hasSubscription((profile?.active_subscriptions as string[]) ?? [], 'ai')
    const budget = budgetForUser(config, hasAi)
    const used = ((usage ?? []) as { credits: number | null }[]).reduce(
      (s, r) => s + (r.credits ?? 0),
      0,
    )
    const cost = featureCost(feature)

    return {
      allowed: used + cost <= budget,
      used,
      budget,
      remaining: Math.max(0, budget - used),
      resetDate: end.toISOString(),
      retryAfterSeconds,
    }
  } catch {
    // Fail-open: een metering-leesfout mag AI niet blokkeren.
    return {
      allowed: true,
      used: 0,
      budget: 0,
      remaining: 0,
      resetDate: end.toISOString(),
      retryAfterSeconds,
    }
  }
}

/** Nette Nederlandse 429-melding bij een bereikt maandbudget. */
export function creditLimitMessage(gate: CreditGateResult): string {
  const reset = new Date(gate.resetDate).toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'long',
  })
  return `Je hebt je maandelijkse AI-limiet bereikt (${gate.budget} credits). De teller reset op ${reset}.`
}
