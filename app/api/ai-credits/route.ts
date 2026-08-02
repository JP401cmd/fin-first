import { NextResponse } from 'next/server'
import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { unauthorized } from '@/lib/api/respond'
import { hasSubscription } from '@/lib/feature-registry'
import {
  parseAiCreditConfig,
  budgetForUser,
  currentPeriod,
  summarizeUsage,
  type UsageRow,
} from '@/lib/ai-credits'

/** GET — AI-creditverbruik van de ingelogde gebruiker voor de huidige periode. */
export async function GET() {
  const supabase = await createClient()
  const claims = await getAuthClaims(supabase)
  if (!claims) {
    return unauthorized()
  }

  const now = new Date()
  const { start } = currentPeriod(now)

  const [{ data: profile }, { data: configRow }, { data: usage }] = await Promise.all([
    supabase.from('profiles').select('active_subscriptions').eq('id', claims.sub).single(),
    supabase.from('app_settings').select('value').eq('key', 'ai_credit_config').maybeSingle(),
    supabase
      .from('ai_usage')
      .select('feature, credits, created_at')
      .eq('user_id', claims.sub)
      .gte('created_at', start.toISOString())
      .order('created_at', { ascending: true }),
  ])

  const config = parseAiCreditConfig(configRow?.value)
  const hasAi = hasSubscription((profile?.active_subscriptions as string[]) ?? [], 'ai')
  const budget = budgetForUser(config, hasAi)
  const summary = summarizeUsage((usage ?? []) as UsageRow[], budget, now)

  return NextResponse.json({ hasAi, ...summary })
}
