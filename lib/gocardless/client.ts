import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  GCInstitution,
  GCRequisition,
  GCAccountDetail,
  GCTransactionsResponse,
  GCBalancesResponse,
  GCTokenResponse,
} from './types'

const PRODUCTION_URL = 'https://bankaccountdata.gocardless.com'
const SANDBOX_URL = 'https://bankaccountdata.gocardless.com'

async function getBaseUrl(supabase: SupabaseClient): Promise<string> {
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'gocardless_environment')
    .single()

  return data?.value === 'sandbox' ? SANDBOX_URL : PRODUCTION_URL
}

/**
 * Get a valid access token, refreshing or creating a new one as needed.
 * Tokens are cached in app_settings for reuse across requests.
 */
export async function getAccessToken(supabase: SupabaseClient): Promise<string> {
  // Check for cached access token
  const { data: tokenData } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'gocardless_access_token')
    .single()

  const { data: expiresData } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'gocardless_token_expires_at')
    .single()

  if (tokenData?.value && expiresData?.value) {
    const expiresAt = new Date(expiresData.value)
    // Use token if it expires more than 5 minutes from now
    if (expiresAt.getTime() > Date.now() + 5 * 60 * 1000) {
      return tokenData.value
    }
  }

  // Try refresh token first
  const { data: refreshData } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'gocardless_refresh_token')
    .single()

  const { data: refreshExpiresData } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'gocardless_refresh_expires_at')
    .single()

  const baseUrl = await getBaseUrl(supabase)

  if (refreshData?.value && refreshExpiresData?.value) {
    const refreshExpiresAt = new Date(refreshExpiresData.value)
    if (refreshExpiresAt.getTime() > Date.now()) {
      const res = await fetch(`${baseUrl}/api/v2/token/refresh/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh: refreshData.value }),
      })

      if (res.ok) {
        const data: { access: string; access_expires: number } = await res.json()
        await cacheToken(supabase, data.access, data.access_expires)
        return data.access
      }
    }
  }

  // Create new token pair
  const { data: secretId } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'gocardless_secret_id')
    .single()

  const { data: secretKey } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'gocardless_secret_key')
    .single()

  if (!secretId?.value || !secretKey?.value) {
    throw new Error('GoCardless credentials not configured')
  }

  const res = await fetch(`${baseUrl}/api/v2/token/new/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      secret_id: secretId.value,
      secret_key: secretKey.value,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`GoCardless token request failed: ${err}`)
  }

  const tokenResponse: GCTokenResponse = await res.json()
  await cacheToken(supabase, tokenResponse.access, tokenResponse.access_expires)
  await cacheRefreshToken(supabase, tokenResponse.refresh, tokenResponse.refresh_expires)

  return tokenResponse.access
}

async function cacheToken(supabase: SupabaseClient, token: string, expiresInSeconds: number) {
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString()
  await supabase.from('app_settings').upsert({ key: 'gocardless_access_token', value: token, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  await supabase.from('app_settings').upsert({ key: 'gocardless_token_expires_at', value: expiresAt, updated_at: new Date().toISOString() }, { onConflict: 'key' })
}

async function cacheRefreshToken(supabase: SupabaseClient, token: string, expiresInSeconds: number) {
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString()
  await supabase.from('app_settings').upsert({ key: 'gocardless_refresh_token', value: token, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  await supabase.from('app_settings').upsert({ key: 'gocardless_refresh_expires_at', value: expiresAt, updated_at: new Date().toISOString() }, { onConflict: 'key' })
}

/**
 * List available banking institutions for a country.
 */
export async function listInstitutions(
  supabase: SupabaseClient,
  token: string,
  country: string = 'NL'
): Promise<GCInstitution[]> {
  const baseUrl = await getBaseUrl(supabase)
  const res = await fetch(`${baseUrl}/api/v2/institutions/?country=${country}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) {
    throw new Error(`Failed to fetch institutions: ${res.status}`)
  }

  return res.json()
}

/**
 * Create a new requisition (bank connection request).
 */
export async function createRequisition(
  supabase: SupabaseClient,
  token: string,
  institutionId: string,
  redirectUrl: string,
  reference: string
): Promise<GCRequisition> {
  const baseUrl = await getBaseUrl(supabase)
  const res = await fetch(`${baseUrl}/api/v2/requisitions/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      redirect: redirectUrl,
      institution_id: institutionId,
      reference,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Failed to create requisition: ${err}`)
  }

  return res.json()
}

/**
 * Get requisition details including linked account IDs.
 */
export async function getRequisition(
  supabase: SupabaseClient,
  token: string,
  requisitionId: string
): Promise<GCRequisition> {
  const baseUrl = await getBaseUrl(supabase)
  const res = await fetch(`${baseUrl}/api/v2/requisitions/${requisitionId}/`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) {
    throw new Error(`Failed to get requisition: ${res.status}`)
  }

  return res.json()
}

/**
 * Get account details (IBAN, owner name, etc.)
 */
export async function getAccountDetails(
  supabase: SupabaseClient,
  token: string,
  gcAccountId: string
): Promise<GCAccountDetail> {
  const baseUrl = await getBaseUrl(supabase)
  const res = await fetch(`${baseUrl}/api/v2/accounts/${gcAccountId}/`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) {
    throw new Error(`Failed to get account details: ${res.status}`)
  }

  return res.json()
}

/**
 * Get transactions for an account.
 */
export async function getTransactions(
  supabase: SupabaseClient,
  token: string,
  gcAccountId: string,
  dateFrom?: string,
  dateTo?: string
): Promise<GCTransactionsResponse> {
  const baseUrl = await getBaseUrl(supabase)
  const params = new URLSearchParams()
  if (dateFrom) params.set('date_from', dateFrom)
  if (dateTo) params.set('date_to', dateTo)

  const qs = params.toString() ? `?${params.toString()}` : ''
  const res = await fetch(`${baseUrl}/api/v2/accounts/${gcAccountId}/transactions/${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) {
    throw new Error(`Failed to get transactions: ${res.status}`)
  }

  return res.json()
}

/**
 * Get account balances.
 */
export async function getBalances(
  supabase: SupabaseClient,
  token: string,
  gcAccountId: string
): Promise<GCBalancesResponse> {
  const baseUrl = await getBaseUrl(supabase)
  const res = await fetch(`${baseUrl}/api/v2/accounts/${gcAccountId}/balances/`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) {
    throw new Error(`Failed to get balances: ${res.status}`)
  }

  return res.json()
}
