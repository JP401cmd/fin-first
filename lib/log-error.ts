import type { SupabaseClient } from '@supabase/supabase-js'
import { shouldPersistErrorLog } from '@/lib/observability/runtime-environment'

/**
 * Server-side foutlog-helper voor expliciete catch-blokken. Defensief: mag de
 * aanroeper nooit laten falen. `client` moet als ingelogde gebruiker of
 * service-role draaien (RLS-insert). Client-side fouten lopen via /api/log-error.
 *
 * Dit is de gedeelde SINK van het server-schrijfpad en daarmee de plek van de
 * dev/prod-guard: een lokale `next dev` tegen de productie-Supabase schrijft
 * anders Turbopack/HMR-ruis in de inbox van /beheer/errors. Lokaal blijft de
 * fout wél zichtbaar — op de console in plaats van in de gedeelde tabel.
 */
export async function logError(
  client: SupabaseClient,
  params: {
    userId?: string | null
    context?: string
    message: string
    stack?: string
    url?: string
  },
): Promise<void> {
  if (!shouldPersistErrorLog()) {
    // Niet stil laten vallen: lokaal is de console het foutkanaal.
    console.error(`[error_logs:dev] ${params.context ?? 'geen-context'} — ${params.message}`)
    return
  }
  try {
    await client.from('error_logs').insert({
      user_id: params.userId ?? null,
      context: params.context ?? null,
      message: params.message.slice(0, 2000),
      stack: params.stack?.slice(0, 8000) ?? null,
      url: params.url ?? null,
      level: 'error',
    })
  } catch {
    // Logging mag de aanroeper nooit breken.
  }
}
