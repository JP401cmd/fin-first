import { NextResponse } from 'next/server'

/**
 * Gedeelde API-error-envelope + respond-helpers (ADR 0044).
 *
 * SINGLE SOURCE voor de HTTP-foutvorm van alle route-handlers onder `app/api/*`.
 * De envelope is bewust PLAT — `{ error: string }` (+ optioneel machine-`code`) —
 * omdat de frontend op ~59 plekken `data.error` als string leest
 * (`data.error || 'fallback'`). Nooit een geneste `{ ok, error: { … } }`-vorm:
 * dat breekt al die reads.
 *
 * Beveiligingsregel (CLAUDE.md / AVG): een route mag NOOIT een rauwe
 * `error.message` / stack naar de client sturen — die bevat DB-/driver-details.
 * Gebruik `serverError(err, tag)` in catch-blokken: dat logt de echte fout
 * server-side met tag en stuurt een generieke tekst naar de client.
 */

export interface ErrorEnvelope {
  error: string
  /** Optioneel machine-leesbaar foutlabel; breekt de string-reads niet. */
  code?: string
}

/** Bouwt de standaard platte error-envelope met de juiste statuscode. */
export function errorResponse(message: string, status: number, code?: string): NextResponse {
  const body: ErrorEnvelope = code ? { error: message, code } : { error: message }
  return NextResponse.json(body, { status })
}

/** 401 — niet ingelogd. App-brede standaardtekst: 'Niet ingelogd'. */
export function unauthorized(message = 'Niet ingelogd'): NextResponse {
  return errorResponse(message, 401, 'unauthorized')
}

/** 403 — ingelogd maar geen toegang (bv. geen superadmin, geen tier). */
export function forbidden(message = 'Geen toegang'): NextResponse {
  return errorResponse(message, 403, 'forbidden')
}

/** 400 — ongeldige invoer. `message` is client-veilig (geen interne details). */
export function badRequest(message: string, code?: string): NextResponse {
  return errorResponse(message, 400, code)
}

/** 404 — resource niet gevonden. */
export function notFound(message = 'Niet gevonden'): NextResponse {
  return errorResponse(message, 404, 'not_found')
}

/** 409 — conflict (bv. duplicaat, optimistic-concurrency). */
export function conflict(message: string, code?: string): NextResponse {
  return errorResponse(message, 409, code)
}

/**
 * 410 — endpoint bestaat nog, maar is bewust gesloten (opvolger elders).
 *
 * Bewust géén 404: die leest als "kapot/verdwenen" en lokt een bugmelding uit.
 * 410 zegt "dit was hier, het komt niet terug" — de `message` hoort daarom
 * altijd naar de opvolger te wijzen (ADR 0096).
 */
export function gone(message: string, code = 'gone'): NextResponse {
  return errorResponse(message, 410, code)
}

/**
 * Vormt een onbekende fout om tot één leesbare LOGREGEL (server-side).
 *
 * Waarom dit meer is dan `String(err)`: een `PostgrestError` van supabase-js is
 * GEEN `Error`-instantie maar een plat object `{ message, details, hint, code }`.
 * `String(…)` maakt daar `[object Object]` van — precies het nuttigste deel van
 * een DB-fout verdween dus uit de logs, op elke plek waar een `.from()`-fout
 * werd doorgegeven. Vandaar de expliciete uitlezing van die vorm.
 *
 * Blijft server-only: de aanroeper stuurt nooit de uitkomst hiervan naar de
 * client (zie `serverError`).
 */
function describeError(err: unknown): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object') {
    const shaped = err as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown }
    if (typeof shaped.message === 'string') {
      // Volgorde = aflopende bruikbaarheid bij het debuggen van een DB-fout.
      const parts = [
        shaped.message,
        typeof shaped.code === 'string' ? `code=${shaped.code}` : null,
        typeof shaped.details === 'string' ? `details=${shaped.details}` : null,
        typeof shaped.hint === 'string' ? `hint=${shaped.hint}` : null,
      ].filter(Boolean)
      return parts.join(' · ')
    }
    // Geen message-veld: JSON is nog altijd leesbaarder dan [object Object].
    try {
      return JSON.stringify(err)
    } catch {
      return String(err)
    }
  }
  return String(err)
}

/**
 * 500 — onverwachte serverfout. Logt de ECHTE fout server-side met `tag`
 * (grep-baar, geen PII naar de client) en retourneert een generieke tekst.
 * Optioneel `status` voor evidente upstream-fouten (502/503).
 */
export function serverError(
  err: unknown,
  tag: string,
  clientMessage = 'Er ging iets mis. Probeer het later opnieuw.',
  status = 500,
): NextResponse {
  const stack = err instanceof Error ? err.stack : undefined
  console.error(`[${tag}] ${describeError(err)}`, stack ?? '')
  return errorResponse(clientMessage, status, 'server_error')
}
