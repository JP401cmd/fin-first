// De vaste foutteksten die `classifyBrokerError` in `broker_connections.last_sync_error`
// laat landen, voor de twee fouten die NIET vanzelf overgaan.
//
// Apart bestand (zonder imports) omdat ook clientcode ze leest: het automatische
// bijwerken (`lib/sync/auto-sync.ts`, ADR 0182) slaat een broker met zo'n fout
// over, maar probeert een tijdelijke fout (rem, netwerk) de volgende keer gewoon
// opnieuw. `broker-adapter.ts` importeert de Trading 212-client en hoort niet in
// de clientbundel.

/** `invalid_credentials` — de sleutel werkt niet meer; alleen opnieuw koppelen helpt. */
export const BROKER_ERROR_INVALID_CREDENTIALS = 'Key ongeldig — opnieuw koppelen'

/** `permission_denied` — de sleutel mist leesrechten; alleen een nieuwe sleutel helpt. */
export const BROKER_ERROR_PERMISSION_DENIED = 'API-key mist leesrechten'

/** Fouten waarbij een automatische nieuwe poging per definitie zinloos is. */
export const PERMANENT_BROKER_ERRORS: readonly string[] = [
  BROKER_ERROR_INVALID_CREDENTIALS,
  BROKER_ERROR_PERMISSION_DENIED,
]
