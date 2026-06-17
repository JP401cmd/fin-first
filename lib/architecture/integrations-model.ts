// ── Integraties-view: externe koppelingen en bestandsimports van TriFinity ───
// De /beheer/integraties-pagina geeft een overzicht van alle 14 externe
// integraties — API-koppelingen, bestandsimports en OAuth-flows — met hun
// health-status, versieregister en formaat-contracten.
//
// Eén principe: *feiten gescand, betekenis gecureerd, zelf-actualiserend*.
//
//   FEITEN   — scripts/architecture/generate.mjs → architecture.json.integrationClients
//              (sourceFile-paden, base-URL-consts, adapter-vlaggen)
//   BETEKENIS — dit bestand: 14 gecureerde entries met auth, probe, contract.
//
// Houd dit bij wanneer een integratie verschijnt, verdwijnt of van auth verandert.
// De drift-guard test (integrations-model.test.ts) bewaakt de sync.

import type { IntegrationClientFact } from './facts'

// ── Types ────────────────────────────────────────────────────────────────────

export type IntegrationKind = 'api' | 'csv' | 'json' | 'mt940' | 'ofx' | 'oauth'

export type AuthMethod =
  | 'hmac-sha256'
  | 'hmac-sha512'
  | 'jwt'
  | 'apiKey'
  | 'oauth2'
  | 'upload'
  | 'none'

export type ProbeKind = 'public' | 'authed' | 'admin-test' | 'none'

export interface HealthProbe {
  kind: ProbeKind
  /** URL voor public-probe (verplicht als kind='public'). */
  url?: string
  method?: 'GET' | 'POST'
  expectStatus?: number
  /** Toelichting voor kind='none' of 'admin-test' (verplicht als kind='none'). */
  note?: string
}

/** Lichtgewicht formaat-contract: ref naar de gecureerde naam + beschrijving. */
export interface FormatContract {
  kind: IntegrationKind
  /** Stabiele naam/sleutel die verwijst naar FORMAT_CONTRACTS (lib/parsers/format-contracts.ts). */
  ref: string
  description: string
}

export interface IntegrationEntry {
  /** Stabiele id — overeenkomstig de plan-tabel. */
  id: string
  name: string
  kind: IntegrationKind
  provider: string
  authMethod: AuthMethod
  /** Gepinde API-versie (string, bv. 'v2', 'v6', 'legacy v0'). */
  apiVersionPinned: string | null
  /** Gecureerde base-URL (ter vergelijking met de gescande const). */
  baseUrl: string | null
  /** Relatieve paden naar de bronbestanden (ter vergelijking met schijf). */
  sourceFiles: string[]
  /** API-routes die deze integratie aanroepen/bedienen. */
  apiRoutes: string[]
  /** DB-tabel voor opgeslagen credentials (null als geen persistentie). */
  dbTable: string | null
  docsUrl: string
  changelogUrl: string
  healthProbe: HealthProbe
  formatContract?: FormatContract
}

// ── Gecureerde lijst (14 integraties) ────────────────────────────────────────

export const INTEGRATIONS: IntegrationEntry[] = [
  // ── API-koppelingen (crypto exchanges) ──
  {
    id: 'bitvavo',
    name: 'Bitvavo',
    kind: 'api',
    provider: 'Bitvavo B.V.',
    authMethod: 'hmac-sha256',
    apiVersionPinned: 'v2',
    baseUrl: 'https://api.bitvavo.com/v2',
    sourceFiles: ['lib/integrations/bitvavo-client.ts'],
    apiRoutes: ['/api/integrations/exchange/bitvavo/connect', '/api/integrations/exchange/bitvavo/sync'],
    dbTable: 'exchange_connections',
    docsUrl: 'https://docs.bitvavo.com/',
    changelogUrl: 'https://docs.bitvavo.com/#section/Changelog',
    healthProbe: {
      kind: 'public',
      url: 'https://api.bitvavo.com/v2/markets',
      method: 'GET',
      expectStatus: 200,
    },
  },
  {
    id: 'kraken',
    name: 'Kraken',
    kind: 'api',
    provider: 'Payward Inc.',
    authMethod: 'hmac-sha512',
    apiVersionPinned: '0',
    baseUrl: 'https://api.kraken.com',
    sourceFiles: ['lib/integrations/kraken-client.ts'],
    apiRoutes: ['/api/integrations/exchange/kraken/connect', '/api/integrations/exchange/kraken/sync'],
    dbTable: 'exchange_connections',
    docsUrl: 'https://docs.kraken.com/api/',
    changelogUrl: 'https://docs.kraken.com/api/docs/changelog',
    healthProbe: {
      kind: 'public',
      url: 'https://api.kraken.com/0/public/SystemStatus',
      method: 'GET',
      expectStatus: 200,
    },
  },
  {
    id: 'coinbase',
    name: 'Coinbase',
    kind: 'api',
    provider: 'Coinbase Inc.',
    authMethod: 'jwt',
    apiVersionPinned: 'v2',
    baseUrl: 'https://api.coinbase.com',
    sourceFiles: ['lib/integrations/coinbase-client.ts'],
    apiRoutes: ['/api/integrations/exchange/coinbase/connect', '/api/integrations/exchange/coinbase/sync'],
    dbTable: 'exchange_connections',
    docsUrl: 'https://docs.cdp.coinbase.com/',
    changelogUrl: 'https://docs.cdp.coinbase.com/changelog',
    healthProbe: {
      kind: 'public',
      url: 'https://api.coinbase.com/v2/time',
      method: 'GET',
      expectStatus: 200,
    },
  },
  // ── API-koppelingen (broker) ──
  {
    id: 'trading212',
    name: 'Trading 212',
    kind: 'api',
    provider: 'Trading 212 Ltd.',
    authMethod: 'apiKey',
    apiVersionPinned: 'v0',
    baseUrl: 'https://live.trading212.com',
    sourceFiles: ['lib/integrations/trading212-client.ts'],
    apiRoutes: ['/api/integrations/broker/trading212/connect', '/api/integrations/broker/trading212/sync'],
    dbTable: 'broker_connections',
    docsUrl: 'https://t212public-api-docs.redoc.ly/',
    changelogUrl: '',
    healthProbe: {
      kind: 'none',
      note: 'Alle endpoints vereisen credentials (apiKey in Authorization-header). Publieke probe niet beschikbaar.',
    },
  },
  // ── API-koppelingen (on-chain wallets) ──
  {
    id: 'blockchair',
    name: 'Blockchair + JSON-RPC',
    kind: 'api',
    provider: 'Blockchair B.V. + publieke RPC-nodes',
    authMethod: 'none',
    apiVersionPinned: null,
    baseUrl: 'https://api.blockchair.com',
    sourceFiles: ['lib/integrations/blockchair-client.ts'],
    apiRoutes: ['/api/integrations/wallet/sync'],
    dbTable: 'wallet_addresses',
    docsUrl: 'https://blockchair.com/api/docs',
    changelogUrl: '',
    healthProbe: {
      kind: 'public',
      url: 'https://api.blockchair.com/bitcoin/stats',
      method: 'GET',
      expectStatus: 200,
    },
  },
  // ── API-koppelingen (marktdata) ──
  {
    id: 'coingecko',
    name: 'CoinGecko',
    kind: 'api',
    provider: 'GeckoTerminal / CoinGecko',
    authMethod: 'apiKey',
    apiVersionPinned: 'v3',
    baseUrl: 'https://api.coingecko.com/api/v3',
    sourceFiles: ['lib/integrations/coingecko-client.ts'],
    apiRoutes: ['/api/holdings/refresh-prices/cron'],
    dbTable: null,
    docsUrl: 'https://docs.coingecko.com/',
    changelogUrl: 'https://docs.coingecko.com/changelog',
    healthProbe: {
      kind: 'public',
      url: 'https://api.coingecko.com/api/v3/ping',
      method: 'GET',
      expectStatus: 200,
    },
  },
  {
    id: 'fmp',
    name: 'FMP ISIN-resolver',
    kind: 'api',
    provider: 'Financial Modeling Prep',
    authMethod: 'apiKey',
    apiVersionPinned: 'stable/v3',
    baseUrl: 'https://financialmodelingprep.com',
    sourceFiles: ['lib/integrations/fmp-client.ts'],
    apiRoutes: ['/api/integrations/market-data/isin-lookup'],
    dbTable: null,
    docsUrl: 'https://site.financialmodelingprep.com/developer/docs',
    changelogUrl: '',
    healthProbe: {
      kind: 'none',
      note: 'Alle endpoints vereisen een API-key (query-param apikey). Publieke probe niet beschikbaar.',
    },
  },
  // ── OAuth2 (bank-connect) ──
  {
    id: 'truelayer',
    name: 'TrueLayer PSD2',
    kind: 'oauth',
    provider: 'TrueLayer Ltd.',
    authMethod: 'oauth2',
    apiVersionPinned: null,
    // baseUrl is runtime-dynamisch (sandbox vs. prod via app_settings) — null om false drift te vermijden
    baseUrl: null,
    sourceFiles: ['lib/truelayer/client.ts'],
    apiRoutes: ['/api/bank-connect/auth', '/api/bank-connect/callback', '/api/bank-connect/accounts', '/api/bank-connect/transactions'],
    dbTable: 'bank_connections',
    docsUrl: 'https://docs.truelayer.com/',
    changelogUrl: 'https://docs.truelayer.com/changelog',
    healthProbe: {
      kind: 'admin-test',
      note: 'Bestaande admin-test via POST /api/admin/bank-connect/test-connection (hergebruikt getBaseUrls+getProviders).',
    },
  },
  // ── API-koppelingen (referentiedata) ──
  {
    id: 'nibud',
    name: 'NIBUD Uitgaven API',
    kind: 'api',
    provider: 'NIBUD',
    authMethod: 'apiKey',
    apiVersionPinned: 'v6',
    baseUrl: 'https://api.nibud.nl/v6',
    sourceFiles: ['lib/nibud/api-client.ts'],
    apiRoutes: ['/api/budgets/nibud-reference'],
    dbTable: null,
    docsUrl: 'https://www.nibud.nl/',
    changelogUrl: '',
    healthProbe: {
      kind: 'none',
      note: 'Alle endpoints vereisen NIBUD_API_KEY. Publieke probe niet beschikbaar.',
    },
  },
  // ── Bestandsimports ──
  {
    id: 'mt940',
    name: 'MT940-import',
    kind: 'mt940',
    provider: 'Bankstandaard (SWIFT MT940)',
    authMethod: 'upload',
    apiVersionPinned: null,
    baseUrl: null,
    sourceFiles: ['lib/parsers/mt940.ts'],
    apiRoutes: ['/api/transactions/import'],
    dbTable: null,
    docsUrl: 'https://www.sepaforcorporates.com/swift-for-corporates/a-guide-to-the-mt-940-bank-statement-message/',
    changelogUrl: '',
    healthProbe: {
      kind: 'none',
      note: 'Bestandsimport — geen API-endpoint te proben; validatie vindt server-side plaats bij upload.',
    },
    formatContract: {
      kind: 'mt940',
      ref: 'mt940',
      description: 'SWIFT MT940 bank statement — veld 60F/61/86 parsing via mt940js',
    },
  },
  {
    id: 'ofx',
    name: 'OFX-import',
    kind: 'ofx',
    provider: 'Bankstandaard (OFX/QFX)',
    authMethod: 'upload',
    apiVersionPinned: null,
    baseUrl: null,
    sourceFiles: ['lib/parsers/ofx.ts'],
    apiRoutes: ['/api/transactions/import'],
    dbTable: null,
    docsUrl: 'https://ofx.net/',
    changelogUrl: '',
    healthProbe: {
      kind: 'none',
      note: 'Bestandsimport — geen API-endpoint te proben.',
    },
    formatContract: {
      kind: 'ofx',
      ref: 'ofx',
      description: 'OFX/QFX SGML-like bank statement',
    },
  },
  {
    id: 'bank-csv',
    name: 'Bank-CSV (ING/Rabo/ABN/PayPal)',
    kind: 'csv',
    provider: 'ING / Rabobank / ABN AMRO / PayPal',
    authMethod: 'upload',
    apiVersionPinned: null,
    baseUrl: null,
    sourceFiles: ['lib/parsers/csv.ts'],
    apiRoutes: ['/api/transactions/import'],
    dbTable: null,
    docsUrl: '',
    changelogUrl: '',
    healthProbe: {
      kind: 'none',
      note: 'Bestandsimport — geen API-endpoint te proben. Formatdetectie via header-markers.',
    },
    formatContract: {
      kind: 'csv',
      ref: 'bank-csv',
      description: 'Bank-CSV: ING (semicolon), Rabobank (comma), ABN AMRO (comma), PayPal (comma)',
    },
  },
  {
    id: 'broker-csv',
    name: 'Broker-CSV (DEGIRO/Saxo/ING/T212/eToro)',
    kind: 'csv',
    provider: 'DEGIRO / Saxo / ING Beleggen / Trading 212 / eToro',
    authMethod: 'upload',
    apiVersionPinned: null,
    baseUrl: null,
    sourceFiles: ['lib/parsers/broker-csv.ts'],
    apiRoutes: ['/api/holdings/import'],
    dbTable: null,
    docsUrl: '',
    changelogUrl: '',
    healthProbe: {
      kind: 'none',
      note: 'Bestandsimport — geen API-endpoint te proben. Broker-detectie via *_MARKERS.',
    },
    formatContract: {
      kind: 'csv',
      ref: 'broker-csv',
      description: 'Broker-CSV: DEGIRO/Saxo (semicolon, Dutch), Trading 212/eToro (comma, English)',
    },
  },
  {
    id: 'pension-pdf',
    name: 'Pensioen PDF→AI',
    kind: 'json',
    provider: 'Mijn Pensioen Overzicht / AI-extractie',
    authMethod: 'upload',
    apiVersionPinned: null,
    baseUrl: null,
    sourceFiles: ['app/api/pension/parse/route.ts'],
    apiRoutes: ['/api/pension/parse'],
    dbTable: null,
    docsUrl: 'https://www.mijnpensioenoverzicht.nl/',
    changelogUrl: '',
    healthProbe: {
      kind: 'none',
      note: 'Bestandsimport via AI-extractie — geen publiek endpoint. Route vereist authenticatie.',
    },
    formatContract: {
      kind: 'json',
      ref: 'pension-pdf',
      description: 'Pensioen PDF via pdfjs-dist → AI-extractie naar PensionParseResultSchema (JSON)',
    },
  },
]

// ── Gecureerd model ───────────────────────────────────────────────────────────

export interface IntegrationWithFacts extends IntegrationEntry {
  /** Of elk gecureerd sourceFile daadwerkelijk op schijf bestaat (scan-merge). */
  sourceFilesExist: boolean[]
  /** Gescande base-URL (kan afwijken van gecureerde als er drift is). */
  scannedBaseUrl: string | null
  /** Drift: gecureerde baseUrl wijkt af van gescande const. */
  baseUrlDrift: boolean
}

export interface IntegrationsModel {
  /** Alle 14 integraties met merged-feiten. */
  entries: IntegrationWithFacts[]
  /** Gegroepeerd per kind. */
  byKind: Record<IntegrationKind, IntegrationWithFacts[]>
  counts: {
    total: number
    perKind: Record<IntegrationKind, number>
    /** Integraties met kind='public' probe. */
    probeerbaar: number
    /** Integraties met een ExchangeAdapter of BrokerAdapter. */
    metAdapter: number
    /** Integraties met een DB-tabel voor credentials. */
    metDbTable: number
  }
}

/**
 * Bouwt het gecureerde integraties-model uit de gescande feiten. Puur en
 * defensief: ontbrekende/lege feiten leveren een leeg-maar-geldig model.
 */
export function buildIntegrationsModel(facts: IntegrationClientFact[] | undefined | null): IntegrationsModel {
  const factMap = new Map<string, IntegrationClientFact>()
  for (const f of (Array.isArray(facts) ? facts : [])) {
    factMap.set(f.file, f)
  }

  const entries: IntegrationWithFacts[] = INTEGRATIONS.map((entry) => {
    // match op elk bronbestand van de entry
    const matchedFacts = entry.sourceFiles.map((sf) => factMap.get(sf) ?? null)
    const sourceFilesExist = matchedFacts.map((f) => f !== null && f.exists)
    // neem de base-URL van het eerste gematchte bronbestand
    const firstMatch = matchedFacts.find((f) => f !== null)
    const scannedBaseUrl = firstMatch?.baseUrl ?? null
    const baseUrlDrift = entry.baseUrl !== null && scannedBaseUrl !== null && scannedBaseUrl !== entry.baseUrl

    return { ...entry, sourceFilesExist, scannedBaseUrl, baseUrlDrift }
  })

  const byKind: Record<IntegrationKind, IntegrationWithFacts[]> = {
    api: [], csv: [], json: [], mt940: [], ofx: [], oauth: [],
  }
  for (const e of entries) {
    byKind[e.kind].push(e)
  }

  const perKind = Object.fromEntries(
    Object.entries(byKind).map(([k, v]) => [k, v.length])
  ) as Record<IntegrationKind, number>

  return {
    entries,
    byKind,
    counts: {
      total: entries.length,
      perKind,
      probeerbaar: entries.filter((e) => e.healthProbe.kind === 'public').length,
      metAdapter: entries.filter((e) => entry_hasAdapter(e, factMap)).length,
      metDbTable: entries.filter((e) => e.dbTable !== null).length,
    },
  }
}

function entry_hasAdapter(entry: IntegrationEntry, factMap: Map<string, IntegrationClientFact>): boolean {
  return entry.sourceFiles.some((sf) => factMap.get(sf)?.hasAdapter === true)
}
