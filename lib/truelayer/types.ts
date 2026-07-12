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
}

export type TLTokenResponse = {
  access_token: string
  refresh_token?: string
  token_type: string
  expires_in: number
  scope: string
}
