/**
 * TrueLayer Data API types.
 * Based on the TrueLayer Data API v1.
 */

export type TLProvider = {
  provider_id: string
  display_name: string
  logo_url: string
  country: string
}

export type TLAccountNumber = {
  iban?: string
  number?: string
  sort_code?: string
}

export type TLAccount = {
  account_id: string
  account_type: string
  display_name: string
  currency: string
  account_number: TLAccountNumber
}

export type TLBalance = {
  current: number
  available: number
  currency: string
  update_timestamp: string
}

/**
 * Het `meta`-blok van een transactie: provider-specifieke verrijking naast de
 * gestandaardiseerde velden. Voor Nederlandse banken via xs2a (Rabobank, ING)
 * is dit de ENIGE plek waar de tegenpartij staat — `merchant_name` blijft daar
 * leeg (0/354 transacties in de live Rabobank-sync). De vorm verschilt per
 * provider en groeit; daarom alleen de velden die we consumeren getypeerd, de
 * rest blijft als unknown behouden (zie TLTransactionMetaSchema in client.ts).
 */
export type TLTransactionMeta = {
  transaction_type?: string
  counter_party_preferred_name?: string
  counter_party_iban?: string
  [key: string]: unknown
}

export type TLTransaction = {
  transaction_id: string
  timestamp: string
  amount: number
  currency: string
  description: string
  transaction_type: string
  transaction_category: string
  merchant_name?: string
  running_balance?: {
    amount: number
    currency: string
  }
  meta?: TLTransactionMeta
}

export type TLTokenResponse = {
  access_token: string
  refresh_token?: string
  token_type: string
  expires_in: number
  scope: string
}

/**
 * `GET /data/v1/me` — de consent achter één toegangstoken. Alleen de velden die
 * we consumeren zijn getypeerd; `consent_expires_at` is de vervaldatum van de
 * BANKAUTORISATIE (PSD2-consent), níét van het toegangstoken (`expires_in`).
 * Zie ADR 0161 en `lib/truelayer/consent.ts`.
 */
export type TLMe = {
  client_id?: string
  credentials_id?: string
  consent_status?: string
  consent_created_at?: string
  consent_expires_at?: string | null
  provider?: { display_name?: string; logo_uri?: string; provider_id?: string }
}
