import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Server-side foutlog-helper voor expliciete catch-blokken. Defensief: mag de
 * aanroeper nooit laten falen. `client` moet als ingelogde gebruiker of
 * service-role draaien (RLS-insert). Client-side fouten lopen via /api/log-error.
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
