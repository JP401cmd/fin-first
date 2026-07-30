import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getServiceClient } from '@/lib/supabase/service'
import { recordContractEvent } from '@/lib/contract-events'
import { fingerprintKeys } from '@/lib/parsers/shared'
import {
  PROVIDER_REQUEST_LIMIT_CODE,
  TrueLayerProviderLimitError,
  TrueLayerRequestError,
} from './errors'
import type {
  TLProvider,
  TLAccount,
  TLBalance,
  TLTransaction,
  TLTokenResponse,
} from './types'

// keyprintOf is vervangen door de gedeelde SHA-256 fingerprintKeys uit
// lib/parsers/shared.ts (zie emitContractViolation-aanroepen hieronder).

const TLAccountSchema = z.object({
  account_id: z.string(),
  account_type: z.string(),
  display_name: z.string(),
  currency: z.string(),
  account_number: z.object({
    iban: z.string().optional(),
    number: z.string().optional(),
    sort_code: z.string().optional(),
  }).optional(),
})

// `meta` draagt de provider-specifieke verrijking. Bij de Nederlandse xs2a-banken
// (Rabobank/ING) zit de tegenpartij UITSLUITEND hier — `merchant_name` blijft
// leeg. Bewust een looseObject: zod strip onbekende sleutels bij een geslaagde
// parse, en dat is precies hoe de tegenpartij eerder verloren ging. Loose houdt
// de overige provider-velden intact zonder ze te hoeven kennen.
const TLTransactionMetaSchema = z.looseObject({
  transaction_type: z.string().optional(),
  counter_party_preferred_name: z.string().optional(),
  counter_party_iban: z.string().optional(),
})

const TLTransactionSchema = z.object({
  transaction_id: z.string(),
  timestamp: z.string(),
  amount: z.number(),
  currency: z.string(),
  description: z.string(),
  transaction_type: z.string(),
  transaction_category: z.string(),
  merchant_name: z.string().optional(),
  running_balance: z.object({ amount: z.number(), currency: z.string() }).optional(),
  meta: TLTransactionMetaSchema.optional(),
})

const SANDBOX_AUTH_URL = 'https://auth.truelayer-sandbox.com'
const SANDBOX_DATA_URL = 'https://api.truelayer-sandbox.com'
const PRODUCTION_AUTH_URL = 'https://auth.truelayer.com'
const PRODUCTION_DATA_URL = 'https://api.truelayer.com'

export async function getBaseUrls(supabase: SupabaseClient): Promise<{ authUrl: string; dataUrl: string }> {
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'truelayer_environment')
    .single()

  if (data?.value === 'production') {
    return { authUrl: PRODUCTION_AUTH_URL, dataUrl: PRODUCTION_DATA_URL }
  }
  return { authUrl: SANDBOX_AUTH_URL, dataUrl: SANDBOX_DATA_URL }
}

/**
 * Read the (non-secret) TrueLayer client_id via the service-role client.
 * Het client_id is geen secret maar staat wél in het via service-role
 * afgeschermde app_settings; deze losse getter laat call-sites (bv. de
 * providers-route) het client_id ophalen zonder ook het secret te raken.
 */
export async function getClientId(): Promise<string> {
  const service = getServiceClient()
  const { data: clientIdRow } = await service
    .from('app_settings')
    .select('value')
    .eq('key', 'truelayer_client_id')
    .single()

  if (!clientIdRow?.value) {
    throw new Error('TrueLayer credentials niet geconfigureerd')
  }

  return clientIdRow.value
}

async function getCredentials(_supabase: SupabaseClient): Promise<{ clientId: string; clientSecret: string }> {
  // Credentials zijn secrets: sinds de app_settings-verharding alleen via de
  // service-role leesbaar (server-only pad), niet via de gebruikerssessie.
  const clientId = await getClientId()
  const service = getServiceClient()
  const { data: clientSecretRow } = await service
    .from('app_settings')
    .select('value')
    .eq('key', 'truelayer_client_secret')
    .single()

  if (!clientSecretRow?.value) {
    throw new Error('TrueLayer credentials niet geconfigureerd')
  }

  return { clientId, clientSecret: clientSecretRow.value }
}

/**
 * Build the TrueLayer authorization URL for user-level OAuth flow.
 */
export async function buildAuthLink(
  supabase: SupabaseClient,
  redirectUri: string,
  state: string,
  providerId?: string
): Promise<string> {
  const { authUrl } = await getBaseUrls(supabase)
  const { clientId } = await getCredentials(supabase)

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: 'accounts balance transactions offline_access',
    redirect_uri: redirectUri,
    state,
  })

  if (providerId) {
    // TrueLayer eist dat de bank uit `provider_id` óók in `providers` staat;
    // een individueel provider-id is zelf een geldige `providers`-waarde
    // (`nl-all` is geen gedocumenteerde grouping). Geldt zowel in sandbox als
    // productie.
    params.set('provider_id', providerId)
    params.set('providers', providerId)
  }
  // Zonder providerId zetten we bewust géén `providers`-param. Dit pad is vanuit de
  // app onbereikbaar, maar de garantie ligt sinds fase 7 op twéé plekken in
  // `auth-link`: op het wizardpad dwingt het zod-schema `provider_id` af, en op het
  // herstelpad leidt de route hem uit de koppeling af en weigert ze met een 400 als
  // die verbinding geen leesbare bank heeft. `provider_id` is dáár dus optioneel in
  // de body — niet optioneel in de uitkomst.

  return `${authUrl}/?${params.toString()}`
}

/**
 * Exchange an authorization code for access and refresh tokens.
 */
export async function exchangeCode(
  supabase: SupabaseClient,
  code: string,
  redirectUri: string
): Promise<TLTokenResponse> {
  const { authUrl } = await getBaseUrls(supabase)
  const { clientId, clientSecret } = await getCredentials(supabase)

  const res = await fetch(`${authUrl}/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    }).toString(),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`TrueLayer token exchange mislukt: ${err}`)
  }

  return res.json()
}

/**
 * Refresh an access token using a refresh token.
 */
export async function refreshAccessToken(
  supabase: SupabaseClient,
  refreshToken: string
): Promise<TLTokenResponse> {
  const { authUrl } = await getBaseUrls(supabase)
  const { clientId, clientSecret } = await getCredentials(supabase)

  const res = await fetch(`${authUrl}/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }).toString(),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`TrueLayer token refresh mislukt: ${err}`)
  }

  return res.json()
}

/**
 * Get accounts for the authenticated user.
 */
export async function getAccounts(accessToken: string, dataUrl: string): Promise<TLAccount[]> {
  const res = await fetch(`${dataUrl}/data/v1/accounts`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) {
    throw new Error(`TrueLayer accounts ophalen mislukt: ${res.status}`)
  }

  const data = await res.json()
  const results = data.results ?? []
  const parsed = z.array(TLAccountSchema).safeParse(results)
  if (!parsed.success) {
    try {
      const firstRow = Array.isArray(results) && results[0] ? results[0] as unknown as Record<string, unknown> : null
      const observedKeys = Object.keys(firstRow ?? {})
      const fingerprint = await fingerprintKeys(observedKeys)
      const knownKeys = new Set(['account_id','account_type','display_name','currency','account_number'])
      const added = observedKeys.filter(k => !knownKeys.has(k.toLowerCase()))
      const removed = [...knownKeys].filter(k => !observedKeys.map(o => o.toLowerCase()).includes(k))
      const service = getServiceClient()
      await recordContractEvent(service, {
        kind: 'contract_violation',
        surface: 'truelayer-accounts',
        severity: 'warn',
        fingerprint,
        diff: { changed: parsed.error.issues.map(i => i.path.join('.')), added, removed },
      })
    } catch {
      // logging must never break the sync
    }
  }
  return (parsed.success ? parsed.data : results) as TLAccount[]
}

/**
 * Get balance for a specific account.
 */
export async function getAccountBalance(
  accessToken: string,
  dataUrl: string,
  accountId: string
): Promise<TLBalance[]> {
  const res = await fetch(`${dataUrl}/data/v1/accounts/${accountId}/balance`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    // De OAuth-callback doet deze call per rekening vóór ze redirect. Een
    // hangende TrueLayer-respons zou daar de hele functie in de platform-timeout
    // laten lopen: de koppeling staat dan wél in de database, maar de gebruiker
    // ziet een gateway-fout in plaats van de success-pagina. Een afgebroken call
    // wordt door alle callers niet-fataal afgevangen. Zelfde waarde als het
    // huispatroon in lib/forex.ts en lib/price-feed.ts.
    signal: AbortSignal.timeout(8000),
  })

  if (!res.ok) {
    throw new Error(`TrueLayer saldo ophalen mislukt: ${res.status}`)
  }

  const data = await res.json()
  return data.results ?? []
}

/**
 * Vertaal een mislukte transactie-respons naar een fouttype dat de call-site
 * kan wégen.
 *
 * De oude vorm gooide alleen `res.status` in een tekst, waarmee de
 * providerfoutcode verloren ging. Juist die code bepaalt wat de sync-route mag
 * doen: `provider_request_limit_exceeded` is een limiet van de bánk (los van
 * onze 10/dag en los van die van TrueLayer) en betekent "stop met ophalen, houd
 * wat je hebt" — niet "de sync is mislukt".
 *
 * De body wordt defensief gelezen: een provider die HTML of niets teruggeeft mag
 * deze functie niet zelf laten falen.
 */
async function buildTransactionsError(res: Response): Promise<TrueLayerRequestError> {
  let providerErrorCode: string | null = null
  try {
    const body = await res.clone().json() as { error?: unknown }
    if (typeof body?.error === 'string') providerErrorCode = body.error
  } catch {
    // Geen (geldige) JSON-body — dan blijft alleen de status over.
  }

  const suffix = providerErrorCode ? `${res.status} (${providerErrorCode})` : `${res.status}`
  const message = `TrueLayer transacties ophalen mislukt: ${suffix}`

  if (res.status === 429 && providerErrorCode === PROVIDER_REQUEST_LIMIT_CODE) {
    return new TrueLayerProviderLimitError(message, res.status, providerErrorCode)
  }

  return new TrueLayerRequestError(message, res.status, providerErrorCode)
}

/**
 * Get transactions for a specific account.
 */
export async function getAccountTransactions(
  accessToken: string,
  dataUrl: string,
  accountId: string,
  from?: string,
  to?: string
): Promise<TLTransaction[]> {
  const params = new URLSearchParams()
  if (from) params.set('from', from)
  if (to) params.set('to', to)

  const qs = params.toString() ? `?${params.toString()}` : ''
  const res = await fetch(`${dataUrl}/data/v1/accounts/${accountId}/transactions${qs}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) {
    throw await buildTransactionsError(res)
  }

  const data = await res.json()
  const results = data.results ?? []
  const parsed = z.array(TLTransactionSchema).safeParse(results)
  if (!parsed.success) {
    try {
      const firstRow = Array.isArray(results) && results[0] ? results[0] as unknown as Record<string, unknown> : null
      const observedKeys = Object.keys(firstRow ?? {})
      const fingerprint = await fingerprintKeys(observedKeys)
      const knownKeys = new Set(['transaction_id','timestamp','amount','currency','description','transaction_type','transaction_category','merchant_name','running_balance','meta'])
      const added = observedKeys.filter(k => !knownKeys.has(k.toLowerCase()))
      const removed = [...knownKeys].filter(k => !observedKeys.map(o => o.toLowerCase()).includes(k))
      const service = getServiceClient()
      await recordContractEvent(service, {
        kind: 'contract_violation',
        surface: 'truelayer-transactions',
        severity: 'warn',
        fingerprint,
        diff: { changed: parsed.error.issues.map(i => i.path.join('.')), added, removed },
      })
    } catch {
      // logging must never break the sync
    }
  }
  return (parsed.success ? parsed.data : results) as TLTransaction[]
}

/**
 * Get available banking providers (institutions).
 *
 * TrueLayer's `GET {authUrl}/api/providers` kent GEEN `country`-queryparam
 * (levert dan 200 + een lege lijst); wél `?clientid=<client_id>`. Landfiltering
 * doen we daarom client-side op het `country`-veld (lowercase, bv. "nl").
 * Zonder opts: kale URL, ongefilterde lijst (sandbox / health-probe-pad).
 */
export async function getProviders(
  authUrl: string,
  opts?: { clientId?: string; country?: string }
): Promise<TLProvider[]> {
  const url = opts?.clientId
    ? `${authUrl}/api/providers?clientid=${encodeURIComponent(opts.clientId)}`
    : `${authUrl}/api/providers`
  const res = await fetch(url)

  if (!res.ok) {
    throw new Error(`TrueLayer providers ophalen mislukt: ${res.status}`)
  }

  const providers = (await res.json()) as TLProvider[]

  if (opts?.country) {
    const country = opts.country.toLowerCase()
    return providers.filter((p) => p.country?.toLowerCase() === country)
  }

  return providers
}
