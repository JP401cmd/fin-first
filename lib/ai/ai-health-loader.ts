// lib/ai/ai-health-loader.ts
//
// Server-loader voor de AI-gezondheidsstatus op /beheer (hub-strip) en
// /beheer/ai (statuskaart). Leest via de service-role — spiegel
// app/(app)/beheer/ai-verbruik/page.tsx: `ai_token_usage` heeft alleen een
// eigen-rij-select-policy en `error_logs` een superadmin-select-policy, dus
// beheer leest hier cross-user via service-role, NA `isSuperAdmin()` in de
// aanroepende pagina (ADR 0006).

import type { SupabaseClient } from '@supabase/supabase-js'
import { getServiceClient } from '@/lib/supabase/service'
import { isSuperAdmin } from '@/lib/admin'
import { deriveAiHealth, type AiFailureSignal, type AiHealthResult } from '@/lib/ai/ai-health'

export interface AiHealthSnapshot extends Omit<AiHealthResult, 'status'> {
  status: AiHealthResult['status'] | 'unknown'
}

const FAILURE_KIND_PREFIX = /^(refused|transient|unknown)\b/
/** Hoeveel recente `ai:*`-foutregels we hoogstens bekijken — ruim boven de
 *  drempel van 2, zodat een korte terugval niet per ongeluk wordt afgekapt. */
const FAILURE_ROW_LIMIT = 200

function parseFailureKind(message: string | null): AiFailureSignal['kind'] {
  const match = FAILURE_KIND_PREFIX.exec(message ?? '')
  const kind = match?.[1]
  return kind === 'refused' || kind === 'transient' ? kind : 'unknown'
}

/**
 * Bepaalt de huidige AI-gezondheid uit `ai_token_usage` + `error_logs`.
 *
 * Twee sloten, zoals `lib/beheer-inbox-counts.ts`: (1) `isSuperAdmin(supabase)`
 * hier — `supabase` is de sessie van de aanroeper, niet service-role; (2) pas
 * ná die check gaat de lezing zelf via de service-role, want `ai_token_usage`
 * heeft alleen een eigen-rij-select-policy (precedent
 * `/beheer/ai-verbruik/page.tsx`). Geen admin-sessie → `'unknown'`, nooit een
 * stille terugval op service-role zonder de check.
 */
export async function loadAiHealth(supabase: SupabaseClient): Promise<AiHealthSnapshot> {
  if (!(await isSuperAdmin(supabase))) {
    return { status: 'unknown', sinceAt: null, failureCount: 0, lastSuccessAt: null }
  }

  const service = getServiceClient()

  const [successRes, failureRes] = await Promise.all([
    service
      .from('ai_token_usage')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    service
      .from('error_logs')
      .select('created_at, message')
      .like('context', 'ai:%')
      .order('created_at', { ascending: false })
      .limit(FAILURE_ROW_LIMIT),
  ])

  if (successRes.error || failureRes.error) {
    return { status: 'unknown', sinceAt: null, failureCount: 0, lastSuccessAt: null }
  }

  const lastSuccessAt = (successRes.data?.created_at as string | undefined) ?? null
  const lastSuccessMs = lastSuccessAt ? Date.parse(lastSuccessAt) : Number.NEGATIVE_INFINITY

  const failuresSinceSuccess: AiFailureSignal[] = (failureRes.data ?? [])
    .filter((row) => Date.parse(row.created_at as string) > lastSuccessMs)
    .map((row) => ({
      at: row.created_at as string,
      kind: parseFailureKind(row.message as string | null),
    }))

  return deriveAiHealth({ lastSuccessAt, failuresSinceSuccess })
}
