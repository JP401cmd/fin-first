// ── Integratie-versieregister ─────────────────────────────────────────────────
// Handmatig bijgehouden register van gepinde API-versies, documentatie en
// changelog-links per integratie. "Heeft iemand de changelog dit kwartaal
// bekeken?" wordt een gedateerd artefact. Geen HTML-poller — bewust low-tech.
//
// Bijhouden: update `lastCheckedAt` telkens als je een changelog hebt gecontroleerd.
// De `/beheer/integraties` Contracten-tab toont dit register.

export interface IntegrationVersionEntry {
  /** Stabiele id — overeenkomt met INTEGRATIONS[*].id in integrations-model.ts. */
  id: string
  /** De versie die in productie gebruikt wordt (string, bv. 'v2', 'legacy v0'). */
  pinnedApiVersion: string | null
  baseUrl: string
  docsUrl: string
  changelogUrl: string
  statusPageUrl: string
  /** ISO 8601 datum — laatste keer dat de changelog handmatig is gecontroleerd. */
  lastCheckedAt: string
}

/**
 * Versieregister voor de 9 API/OAuth-integraties (de 5 bestandsimports
 * hebben geen externe API-versie om bij te houden).
 */
export const INTEGRATION_VERSIONS: Record<string, IntegrationVersionEntry> = {
  bitvavo: {
    id: 'bitvavo',
    pinnedApiVersion: 'v2',
    baseUrl: 'https://api.bitvavo.com/v2',
    docsUrl: 'https://docs.bitvavo.com/',
    changelogUrl: 'https://docs.bitvavo.com/#section/Changelog',
    statusPageUrl: 'https://status.bitvavo.com/',
    lastCheckedAt: '2026-06-17',
  },
  kraken: {
    id: 'kraken',
    pinnedApiVersion: '0',
    baseUrl: 'https://api.kraken.com',
    docsUrl: 'https://docs.kraken.com/api/',
    changelogUrl: 'https://docs.kraken.com/api/docs/changelog',
    statusPageUrl: 'https://status.kraken.com/',
    lastCheckedAt: '2026-06-17',
  },
  coinbase: {
    id: 'coinbase',
    pinnedApiVersion: 'v2',
    baseUrl: 'https://api.coinbase.com',
    docsUrl: 'https://docs.cdp.coinbase.com/',
    changelogUrl: 'https://docs.cdp.coinbase.com/changelog',
    statusPageUrl: 'https://status.coinbase.com/',
    lastCheckedAt: '2026-06-17',
  },
  trading212: {
    id: 'trading212',
    pinnedApiVersion: 'v0',
    baseUrl: 'https://live.trading212.com',
    docsUrl: 'https://t212public-api-docs.redoc.ly/',
    changelogUrl: '', // TODO: Trading 212 publiceert geen publieke changelog
    statusPageUrl: '', // TODO: geen bekende statuspagina
    lastCheckedAt: '2026-06-17',
  },
  blockchair: {
    id: 'blockchair',
    pinnedApiVersion: null,
    baseUrl: 'https://api.blockchair.com',
    docsUrl: 'https://blockchair.com/api/docs',
    changelogUrl: '', // TODO: geen publieke changelog gevonden
    statusPageUrl: '', // TODO: geen bekende statuspagina
    lastCheckedAt: '2026-06-17',
  },
  coingecko: {
    id: 'coingecko',
    pinnedApiVersion: 'v3',
    baseUrl: 'https://api.coingecko.com/api/v3',
    docsUrl: 'https://docs.coingecko.com/',
    changelogUrl: 'https://docs.coingecko.com/changelog',
    statusPageUrl: 'https://status.coingecko.com/',
    lastCheckedAt: '2026-06-17',
  },
  fmp: {
    id: 'fmp',
    pinnedApiVersion: 'stable/v3',
    baseUrl: 'https://financialmodelingprep.com',
    docsUrl: 'https://site.financialmodelingprep.com/developer/docs',
    changelogUrl: '', // TODO: geen publieke changelog-pagina gevonden
    statusPageUrl: '', // TODO: geen bekende statuspagina
    lastCheckedAt: '2026-06-17',
  },
  truelayer: {
    id: 'truelayer',
    pinnedApiVersion: null,
    baseUrl: 'https://api.truelayer.com',
    docsUrl: 'https://docs.truelayer.com/',
    changelogUrl: 'https://docs.truelayer.com/changelog',
    statusPageUrl: 'https://status.truelayer.com/',
    lastCheckedAt: '2026-06-17',
  },
  nibud: {
    id: 'nibud',
    pinnedApiVersion: 'v6',
    baseUrl: 'https://api.nibud.nl/v6',
    docsUrl: 'https://www.nibud.nl/',
    changelogUrl: '', // TODO: NIBUD publiceert geen machine-leesbare changelog
    statusPageUrl: '', // TODO: geen bekende statuspagina
    lastCheckedAt: '2026-06-17',
  },
}
