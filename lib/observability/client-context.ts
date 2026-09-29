/**
 * De `context` van een foutmelding die uit de BROWSER komt.
 *
 * `/api/log-error` neemt de context over van de client. Een deel van de
 * context-tags is echter van de server zelf en stuurt beheer aan:
 *
 *  - `ai:<feature>` (lib/ai/ai-failure-middleware.ts) voedt de AI-gezondheid
 *    (`loadAiHealth`) en de telling van mislukte AI-aanroepen op het
 *    beheerdashboard;
 *  - `serverError:<domein>` (lib/observability/server-error-log.ts) en
 *    `onRequestError:<type>` (lib/observability/request-error.ts) zijn de
 *    foutcategorieën van de server.
 *
 * Een ingelogde gebruiker kon met één POST een regel met context `ai:chat`
 * schrijven en zo een AI-storing op de beheerpagina's laten verschijnen. Die
 * voorvoegsels zijn daarom niet door de browser te claimen: een melding die er
 * toch mee binnenkomt, krijgt `client:` ervoor. De melding blijft bewaard en
 * leesbaar, maar telt niet mee als serversignaal.
 *
 * Puur: geen IO.
 */

const SERVER_VOORVOEGSELS = ['ai:', 'servererror:', 'onrequesterror:'] as const

export const CLIENT_CONTEXT_MAX = 200
const CLIENT_VOORVOEGSEL = 'client:'

export function isServerContext(context: string): boolean {
  const schoon = context.trim().toLowerCase()
  return SERVER_VOORVOEGSELS.some((v) => schoon.startsWith(v))
}

/** De context zoals hij voor een melding uit de browser wordt opgeslagen. */
export function clientContext(rauw: unknown): string | null {
  if (rauw === null || rauw === undefined || rauw === '') return null
  const tekst = String(rauw).trim()
  if (!tekst) return null
  const veilig = isServerContext(tekst) ? `${CLIENT_VOORVOEGSEL}${tekst}` : tekst
  return veilig.slice(0, CLIENT_CONTEXT_MAX)
}
