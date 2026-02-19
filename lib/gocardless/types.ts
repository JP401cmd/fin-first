/**
 * GoCardless Bank Account Data API types.
 * Based on the GoCardless (formerly Nordigen) API v2.
 */

export type GCInstitution = {
  id: string
  name: string
  bic: string
  transaction_total_days: string
  countries: string[]
  logo: string
}

export type GCRequisition = {
  id: string
  created: string
  redirect: string
  status: string
  institution_id: string
  agreement: string
  reference: string
  accounts: string[]
  link: string
}

export type GCAccountDetail = {
  id: string
  iban: string
  institution_id: string
  status: string
  owner_name: string
}

export type GCTransactionAmount = {
  amount: string
  currency: string
}

export type GCTransaction = {
  transactionId?: string
  internalTransactionId?: string
  bookingDate: string
  valueDate?: string
  transactionAmount: GCTransactionAmount
  remittanceInformationUnstructured?: string
  remittanceInformationUnstructuredArray?: string[]
  creditorName?: string
  creditorAccount?: { iban?: string }
  debtorName?: string
  debtorAccount?: { iban?: string }
  bankTransactionCode?: string
}

export type GCTransactionsResponse = {
  transactions: {
    booked: GCTransaction[]
    pending?: GCTransaction[]
  }
}

export type GCBalance = {
  balanceAmount: GCTransactionAmount
  balanceType: string
  referenceDate?: string
}

export type GCBalancesResponse = {
  balances: GCBalance[]
}

export type GCTokenResponse = {
  access: string
  access_expires: number
  refresh: string
  refresh_expires: number
}
