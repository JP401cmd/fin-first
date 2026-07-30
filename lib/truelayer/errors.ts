/**
 * Fouttypen van de TrueLayer-koppeling.
 *
 * Bewust een eigen, Supabase-vrij bestand en niet `client.ts`: de sync-route
 * moet `instanceof` kunnen doen op deze klassen, terwijl de routetest juist
 * `@/lib/truelayer/client` mockt. Zaten de klassen in dat bestand, dan zou de
 * mock ze meenemen en zou `instanceof` in de test iets anders bewijzen dan in
 * productie. Dit bestand wordt door niemand gemockt.
 */

/**
 * Een mislukt HTTP-verzoek aan de TrueLayer data-API, mét de providerfoutcode.
 *
 * De oude vorm — `throw new Error(\`... mislukt: ${res.status}\`)` — verloor
 * precies het veld dat de call-site nodig heeft om te beslissen of ze mag
 * doorgaan: een 429 van óns rate-limit-plafond vraagt om iets anders dan een
 * 429 die de bank zelf oplegt.
 */
export class TrueLayerRequestError extends Error {
  readonly status: number
  /** `error` uit de JSON-body, bv. `provider_request_limit_exceeded`. */
  readonly providerErrorCode: string | null

  constructor(message: string, status: number, providerErrorCode: string | null) {
    super(message)
    this.name = 'TrueLayerRequestError'
    this.status = status
    this.providerErrorCode = providerErrorCode
  }
}

/**
 * De bánk (niet TrueLayer, niet wij) weigert nog meer verzoeken.
 *
 * Gemeten op een live Rabobank-koppeling: ~19 maanden historie (3.086
 * transacties) kwam binnen, daarna HTTP 429 met
 * `{"error":"provider_request_limit_exceeded"}`. Deze limiet staat los van onze
 * eigen 10/dag-rem en los van die van TrueLayer, en is per bank anders en
 * ongedocumenteerd. Een eerste ophaal die hier tegenaan loopt moet stoppen en
 * bewaren wat ze heeft — niet falen.
 */
export class TrueLayerProviderLimitError extends TrueLayerRequestError {
  constructor(message: string, status: number, providerErrorCode: string | null) {
    super(message, status, providerErrorCode)
    this.name = 'TrueLayerProviderLimitError'
  }
}

/** De providerfoutcode die de bank-eigen verzoeklimiet aanduidt. */
export const PROVIDER_REQUEST_LIMIT_CODE = 'provider_request_limit_exceeded'

export function isProviderLimitError(err: unknown): err is TrueLayerProviderLimitError {
  return err instanceof TrueLayerProviderLimitError
}

/**
 * De 401-tekst wanneer de autorisatie niet meer te verversen is — de meest
 * voorkomende manier waarop een bankverbinding kwijtraakt.
 *
 * Woont hier, en niet in één van de routes, omdat er twéé routes op uitkomen
 * (`sync` en `balances`) en dit **tekst is die de gebruiker leest**:
 * `connected-account-card.tsx` laat gecureerde meldingen door en zet ze in de
 * kaart. Twee literals zouden dus twee woorden voor één toestand worden.
 *
 * "Token verlopen, verbind opnieuw" — de oude formulering — is jargon én benoemt
 * een oorzaak; de neutrale-copy-regel van fase 7 verbiedt dat, omdat
 * `bank_connections.status` óók `revoked` kent zonder dat een datum verstreken is.
 * Zelfde woorden als het herkomst-symbool, de status-pil en de herstelband:
 * "verbinding kwijt" (glossarium — één woord per concept).
 */
export const RELINK_REQUIRED_MESSAGE = 'Verbinding kwijt — verbind opnieuw om weer bij te werken.'
