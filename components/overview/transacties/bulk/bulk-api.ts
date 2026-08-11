/**
 * De dunne fetch-laag van de bulkbewerk-overlay.
 *
 * ── Eén plek, en waarom ─────────────────────────────────────────────────────
 * De overlay doet GEEN client-directe Supabase-reads of -writes (ADR 0058,
 * R-NF1); `npm run check:client-reads` maakt zo'n lezer hard rood. Alles loopt
 * over `/api/transactions/**`. Door alle routes hier te bundelen is er precies
 * één bestand dat de padnamen en de foutvorm kent — de UI-componenten kennen
 * alleen de contracttypes uit `lib/transactions/bulk-contract.ts`.
 *
 * ── Foutvorm ────────────────────────────────────────────────────────────────
 * De routes gebruiken de gedeelde envelope uit `lib/api/respond.ts`: plat
 * `{ error: string }` met optioneel `code`. We lezen `data.error` als string
 * (zoals de rest van de app) en houden `code` apart, omdat de overlay op
 * `selection_too_large` een eigen, uitlegbare tekst toont in plaats van een
 * generieke foutmelding.
 *
 * ── Elke selectie gaat door het manifest, ook een expliciete ────────────────
 * "Selecteer alle N" stuurt het criterium; aangevinkte rijen sturen hun id's.
 * Beide leveren hetzelfde selectiemanifest (ADR 0104 besluit 1): id's, sommen én
 * waarschuwingen uit één-en-dezelfde server-uitvoering.
 *
 * Dat gold eerst alleen voor "alle N", op de redenering dat aangevinkte rijen al
 * bevroren zijn. Dat klopt voor de id's, maar niet voor de AFGELEIDEN die de
 * bevestiging moet stellen — en één daarvan is dodelijk: de tegenboekingen die
 * standaard meeverdwijnen (`linked_transfer_id`, óók automatisch gelegd door
 * `lib/transfer-matching.ts` bij elke bankimport) zitten per definitie BUITEN de
 * selectie. Zonder manifest noemde de knop "Verwijder 5 transacties" terwijl de
 * server er 6 verwijderde. Eén uitvoering, één getal, één verzameling.
 */

import type {
  BulkBudgetRequest,
  BulkBudgetResponse,
  BulkDeleteRequest,
  BulkDeleteResponse,
  BulkRuleRequest,
  BulkRuleResponse,
  SelectionManifest,
  SelectionManifestRequest,
  TransactionSearchRequest,
  TransactionSearchResponse,
} from '@/lib/transactions/bulk-contract'

export type { SelectionManifestRequest }

/**
 * Pad ÉN methode per route, in één object.
 *
 * Ze staan bewust bij elkaar. Stonden de paden hier en de methode in een
 * gedeelde `fetch`-helper, dan is "welke verb hoort bij dit pad" nergens
 * opgeschreven — en precies dat ging hier mis: de helper stuurde overal `POST`
 * terwijl `bulk-budget` server-side alleen `PATCH` exporteert. Dat is een 405 in
 * de browser, en geen enkele testsuite ving het: de UI testte tegen een eigen
 * mock, de route tegen zijn handler. `bulk-api.parity.test.ts` leest daarom de
 * route-bestanden en vergelijkt de verbs met deze tabel.
 *
 * De reads zijn POST en geen GET: het criterium is een object met lijsten en
 * nulls, het moet byte-voor-byte gelijk zijn aan wat de manifest-route krijgt,
 * en de zoekterm is gebruikerscontent die niet in een URL of serverlog hoort.
 * Beide routes muteren niets.
 */
export const BULK_ROUTES = {
  search: { path: '/api/transactions/search', method: 'POST' },
  manifest: { path: '/api/transactions/search/manifest', method: 'POST' },
  budget: { path: '/api/transactions/bulk-budget', method: 'PATCH' },
  delete: { path: '/api/transactions/bulk-delete', method: 'POST' },
  rule: { path: '/api/transactions/bulk-budget/regel', method: 'POST' },
} as const

type BulkRoute = (typeof BULK_ROUTES)[keyof typeof BULK_ROUTES]

export class BulkApiError extends Error {
  readonly code?: string
  readonly status: number
  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'BulkApiError'
    this.status = status
    this.code = code
  }
}

async function send<TReq, TRes>(route: BulkRoute, body: TReq, signal?: AbortSignal): Promise<TRes> {
  const res = await fetch(route.path, {
    method: route.method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })

  // Een niet-JSON-antwoord (proxy-foutpagina, deploy-scheefstand) mag hier geen
  // parse-crash worden: dat kost de gebruiker het hele scherm i.p.v. één actie.
  let payload: unknown = null
  try {
    payload = await res.json()
  } catch {
    payload = null
  }

  if (!res.ok) {
    const envelope = (payload ?? {}) as { error?: unknown; code?: unknown }
    const message =
      typeof envelope.error === 'string' && envelope.error.length > 0
        ? envelope.error
        : 'Er ging iets mis. Probeer het opnieuw.'
    const code = typeof envelope.code === 'string' ? envelope.code : undefined
    throw new BulkApiError(message, res.status, code)
  }

  return payload as TRes
}

export function searchTransactions(
  body: TransactionSearchRequest,
  signal?: AbortSignal,
): Promise<TransactionSearchResponse> {
  return send<TransactionSearchRequest, TransactionSearchResponse>(BULK_ROUTES.search, body, signal)
}

/**
 * Materialiseert een selectie één keer tot een bevroren manifest (ADR 0104).
 * Body is óf het criterium ("alle N") óf een expliciete id-lijst — nooit beide.
 */
export function fetchSelectionManifest(
  body: SelectionManifestRequest,
  signal?: AbortSignal,
): Promise<SelectionManifest> {
  return send<SelectionManifestRequest, SelectionManifest>(BULK_ROUTES.manifest, body, signal)
}

export function bulkSetBudget(body: BulkBudgetRequest): Promise<BulkBudgetResponse> {
  return send<BulkBudgetRequest, BulkBudgetResponse>(BULK_ROUTES.budget, body)
}

export function bulkDelete(body: BulkDeleteRequest): Promise<BulkDeleteResponse> {
  return send<BulkDeleteRequest, BulkDeleteResponse>(BULK_ROUTES.delete, body)
}

export function createBulkRule(body: BulkRuleRequest): Promise<BulkRuleResponse> {
  return send<BulkRuleRequest, BulkRuleResponse>(BULK_ROUTES.rule, body)
}
