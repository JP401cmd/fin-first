import type { Instrumentation } from 'next'

/**
 * Next.js instrumentation (App Router). `register()` draait eenmalig bij het
 * opstarten van de server-runtime; nu bewust licht (geen OTel/vendor). Gereserveerd
 * voor toekomstige init. De echte waarde zit in `onRequestError` hieronder.
 */
export async function register(): Promise<void> {
  // no-op — reserved for future observability init.
}

/**
 * Vangt onafgevangen server-fouten (Server Components / Route Handlers / Server
 * Actions) en persisteert ze naar `error_logs` (zichtbaar op /beheer/errors).
 *
 * `onRequestError` draait op zowel de node- als de edge-runtime; de
 * foutpersistentie gebruikt de service-role Supabase-client (node-only). Daarom:
 * alleen op de node-runtime de (node-)helper dynamisch laden, best-effort, en
 * nooit throwen — observability mag een request nooit breken.
 *
 * NB: helper-logica staat bewust in een sibling-module (lib/observability/
 * request-error.ts) en niet hier — Next staat geen niet-conventionele exports
 * uit instrumentation.ts toe (71002-val) en de helper is zo unit-testbaar.
 */
export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context,
) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  try {
    const { captureRequestError } = await import('@/lib/observability/request-error')
    await captureRequestError(err, request, context)
  } catch {
    // Observability mag een request nooit breken.
  }
}
