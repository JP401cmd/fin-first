/**
 * Classificeert een mislukte cloud-AI-aanroep als structureel of tijdelijk
 * (UR3-09 / ADR 0132).
 *
 * AANLEIDING: van 24 augustus t/m 5 september stond het providertegoed op
 * (HTTP 400 `invalid_request_error`). Geen enkele retry kon slagen, maar de
 * chat toonde altijd "Probeer het zo nog eens" — er was geen onderscheid
 * tussen "dit lukt zo weer" en "dit lukt nooit, welke retry dan ook". De
 * AI-SDK kent dat onderscheid al via `APICallError.isRetryable`
 * (408/409/429/5xx, bij Anthropic ook 529 overloaded = retryable; 400/401/
 * 402/403/404 = niet-retryable) — dit bestand leest dat signaal uit in
 * plaats van zelf statuscodes te herclassificeren, zodat het meebeweegt als
 * een provider zijn eigen retry-beleid bijstelt.
 *
 * CLIENT-VEILIG: importeert alleen typedeclaraties uit 'ai' (tree-shakebaar),
 * geen server-only code — herbruikbaar in zowel route-handlers als de
 * SDK-middleware.
 */

import { APICallError, LoadAPIKeyError } from 'ai'

/**
 * - `refused`   — de provider weigert het verzoek zelf; opnieuw proberen kan
 *   dit per definitie niet oplossen (tegoed op, sleutel ongeldig/ontbreekt,
 *   verzoek geweigerd). Toon GEEN retry-affordance.
 * - `transient` — een voorbijgaande storing (rate limit, 5xx, overloaded,
 *   netwerk, timeout). Een volgende poging kan slagen — bestaand gedrag
 *   (retry-knop) blijft hier ongewijzigd.
 * - `unknown`   — geen herkend providerfouttype. Behandelen als `transient`
 *   voor de gebruikerstekst (niet aannemen dat het structureel is), maar wel
 *   apart gehouden voor de gezondheidsafleiding (`ai-health.ts`).
 */
export type ProviderErrorKind = 'refused' | 'transient' | 'unknown'

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}

function isNetworkError(err: unknown): boolean {
  // De AI-SDK-transport en de provider-fetch gooien een kale `TypeError` bij
  // een mislukte fetch ("fetch failed" / "Failed to fetch") — geen
  // APICallError, want de call bereikte de provider nooit. Dat is per
  // definitie tijdelijk (netwerk), nooit een providerweigering.
  return err instanceof TypeError && /fetch/i.test(err.message)
}

/**
 * Classificeert een fout uit `doGenerate`/`doStream` of een stream-error-part.
 *
 * `.isInstance()`, geen `instanceof` — de AI-SDK-foutklassen dragen daarvoor
 * bewust een eigen marker-symbool (codebase-conventie, zie
 * `lib/ai/build-calculator.ts`): `instanceof` kan stil `false` teruggeven
 * zodra de fout via een andere gebundelde kopie van `@ai-sdk/provider` is
 * gegooid dan de kopie die hier importeert.
 */
export function classifyProviderError(err: unknown): ProviderErrorKind {
  if (LoadAPIKeyError.isInstance(err)) return 'refused'
  if (APICallError.isInstance(err)) return err.isRetryable ? 'transient' : 'refused'
  if (isAbortError(err) || isNetworkError(err)) return 'transient'
  return 'unknown'
}

/** Korte gemaksfunctie voor route-handlers: is dit een niet-retrybare providerweigering? */
export function isRefusedProviderError(err: unknown): boolean {
  return classifyProviderError(err) === 'refused'
}
