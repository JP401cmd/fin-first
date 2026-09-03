import type { SupabaseClient } from '@supabase/supabase-js'
import { getServiceClient } from '@/lib/supabase/service'
import { logError } from '@/lib/log-error'
import { shouldPersistErrorLog } from '@/lib/observability/runtime-environment'

/**
 * Server-side error-capture achter de Next.js `onRequestError`-hook
 * (instrumentation.ts). Vangt onafgevangen fouten uit Server Components,
 * Route Handlers en Server Actions die NIET al via `serverError()` in
 * `error_logs` landen, en persisteert ze best-effort met een grep-bare tag
 * (`onRequestError:<routeType>`). Zichtbaar op /beheer/errors.
 *
 * Bewust GEEN mail-per-request (floodrisico) — mail blijft voor crons.
 * AVG: alleen message + (afgekapte) stack + pad; geen request-body/headers.
 */

/** Vorm van de Next.js `onRequestError`-argumenten (structureel, geen next-dep). */
type RequestErrorRequest = {
  path?: string
  method?: string
}
type RequestErrorContext = {
  routerKind?: string
  routePath?: string
  routeType?: string
}

/**
 * Next.js gooit `redirect()` / `notFound()` als "fouten" met een `digest`.
 * Dat is normale control-flow, geen echte fout — filteren om ruis te weren.
 */
export function isNextControlFlowError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const digest = (err as { digest?: unknown }).digest
  if (typeof digest !== 'string') return false
  return (
    digest.startsWith('NEXT_REDIRECT') ||
    digest === 'NEXT_NOT_FOUND' ||
    digest.startsWith('NEXT_HTTP_ERROR_FALLBACK')
  )
}

export async function captureRequestError(
  err: unknown,
  request: RequestErrorRequest | undefined,
  context: RequestErrorContext | undefined,
  deps?: { getClient?: () => SupabaseClient },
): Promise<void> {
  try {
    // Alleen op de node-runtime persisteren (service-role-client = node-pad).
    // instrumentation.ts guardt hier al op, maar dubbel is defensief.
    if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== 'nodejs') return
    if (isNextControlFlowError(err)) return
    // Dev/prod-guard, laag 1 van 2: een lokale `next dev` tegen de productie-DB
    // mag /beheer/errors niet vervuilen. Bewust vóór getServiceClient(), zodat
    // lokaal ook geen service-role-client wordt opgetuigd. Laag 2 is de sink
    // zelf (lib/log-error.ts) — dezelfde twee-lagen-houding als DEV_ONLY_PATHS.
    if (!shouldPersistErrorLog()) return

    const client = (deps?.getClient ?? getServiceClient)()
    const message = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack : undefined

    await logError(client, {
      context: `onRequestError:${context?.routeType ?? context?.routerKind ?? 'unknown'}`,
      message,
      stack,
      url: request?.path,
    })
  } catch {
    // Observability mag een request nooit breken.
  }
}
