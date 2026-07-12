import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getServiceClient } from '@/lib/supabase/service'
import { recordContractEvent } from '@/lib/contract-events'
import { fingerprintKeys } from '@/lib/parsers/shared'
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
  // Zonder providerId zetten we bewust géén `providers`-param: de auth-link-route
  // dwingt `provider_id` al af (400-guard), dus dit pad is vanuit de app
  // onbereikbaar.

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
  })

  if (!res.ok) {
    throw new Error(`TrueLayer saldo ophalen mislukt: ${res.status}`)
  }

  const data = await res.json()
  return data.results ?? []
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
    throw new Error(`TrueLayer transacties ophalen mislukt: ${res.status}`)
  }

  const data = await res.json()
  const results = data.results ?? []
  const parsed = z.array(TLTransactionSchema).safeParse(results)
  if (!parsed.success) {
    try {
      const firstRow = Array.isArray(results) && results[0] ? results[0] as unknown as Record<string, unknown> : null
      const observedKeys = Object.keys(firstRow ?? {})
      const fingerprint = await fingerprintKeys(observedKeys)
      const knownKeys = new Set(['transaction_id','timestamp','amount','currency','description','transaction_type','transaction_category','merchant_name','running_balance'])
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
