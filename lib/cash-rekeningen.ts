export interface CashAssetRow {
  id: string
  name: string
  current_value: number
  institution?: string | null
  has_budget_tracking?: boolean | null
}

export interface BankAccountRow {
  id: string
  name: string
  balance: number
  iban?: string | null
  bank_name?: string | null
  linked_asset_id: string | null
}

export interface CashRekening {
  /** assets.id — dé sleutel voor het focus-anker (#rekening-<assetId>). */
  assetId: string
  name: string
  balance: number
  iban: string | null
  bankName: string | null
  /** bank_accounts.id wanneer gekoppeld, anders null (handmatig). */
  bankAccountId: string | null
  /** assets.has_budget_tracking — bepaalt of de geldstroom-detailweergave beschikbaar is. */
  budgetTracked: boolean
  source: 'bank' | 'manual'
}

/**
 * Verenigt cash-assets met hun (optionele) gekoppelde bank_account tot één
 * asset-gedreven rekeningenlijst. Bank-saldo en bank-naam winnen wanneer een
 * koppeling bestaat; anders vallen we terug op de asset zelf (handmatige cash).
 */
export function buildCashRekeningen(
  cashAssets: CashAssetRow[],
  bankAccounts: BankAccountRow[],
): CashRekening[] {
  const bankByAssetId = new Map<string, BankAccountRow>()
  for (const b of bankAccounts) {
    if (b.linked_asset_id) bankByAssetId.set(b.linked_asset_id, b)
  }

  return cashAssets.map((a) => {
    const bank = bankByAssetId.get(a.id) ?? null
    return {
      assetId: a.id,
      name: bank?.name ?? a.name,
      balance: bank ? Number(bank.balance) : Number(a.current_value),
      iban: bank?.iban ?? null,
      bankName: bank?.bank_name ?? a.institution ?? null,
      bankAccountId: bank?.id ?? null,
      budgetTracked: a.has_budget_tracking === true,
      source: bank ? 'bank' : 'manual',
    }
  })
}
