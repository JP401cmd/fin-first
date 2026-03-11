import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  TLProvider,
  TLAccount,
  TLBalance,
  TLTransaction,
  TLTokenResponse,
} from './types'

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

async function getCredentials(supabase: SupabaseClient): Promise<{ clientId: string; clientSecret: string }> {
  const { data: clientIdRow } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'truelayer_client_id')
    .single()

  const { data: clientSecretRow } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'truelayer_client_secret')
    .single()

  if (!clientIdRow?.value || !clientSecretRow?.value) {
    throw new Error('TrueLayer credentials niet geconfigureerd')
  }

  return { clientId: clientIdRow.value, clientSecret: clientSecretRow.value }
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

  const { data: envData } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'truelayer_environment')
    .single()

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: 'accounts balance transactions offline_access',
    redirect_uri: redirectUri,
    state,
  })

  if (providerId) {
    params.set('provider_id', providerId)
  }

  // Alleen in productie NL-banken filteren
  if (envData?.value === 'production') {
    params.set('providers', 'nl-all')
  }

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
  return data.results ?? []
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
  return data.results ?? []
}

/**
 * Get available banking providers (institutions).
 */
export async function getProviders(authUrl: string, isSandbox: boolean = false): Promise<TLProvider[]> {
  const url = isSandbox
    ? `${authUrl}/api/providers`
    : `${authUrl}/api/providers?country=NL`
  const res = await fetch(url)

  if (!res.ok) {
    throw new Error(`TrueLayer providers ophalen mislukt: ${res.status}`)
  }

  return res.json()
}
