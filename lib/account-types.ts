// ── Rekening-typen ───────────────────────────
// Verhuisd uit components/app/account-form-modal.tsx zodat lib (regression) deze
// lijst kan importeren zonder terug naar components te reiken (import-richting
// UI→lib). Zuiver data.

import type { CashSubtype } from './asset-data'

export const ACCOUNT_TYPES = [
  { value: 'checking', label: 'Betaalrekening' },
  { value: 'savings', label: 'Spaarrekening' },
  { value: 'joint', label: 'En/of-rekening' },
  { value: 'business', label: 'Zakelijke rekening' },
  { value: 'contant_geld', label: 'Contant geld' },
  { value: 'other', label: 'Overig' },
] as const

/**
 * De waarden die `bank_accounts.account_type` toestaat — exact de CHECK-constraint
 * `bank_accounts_account_type_check`
 * (`supabase/migrations/20260616000000_widen_bank_accounts_account_type_check.sql`).
 */
export type BankAccountType = (typeof ACCOUNT_TYPES)[number]['value']

// ── De twee vocabularies, en de brug ertussen ────────────────────────────────
//
// Hetzelfde begrip ("wat voor rekening is dit?") heeft in de database TWEE
// verschillende woordenlijsten, en dat is geen slordigheid maar geschiedenis:
//
//   - `bank_accounts.account_type` → 'checking' | 'savings' | 'joint' |
//     'business' | 'contant_geld' | 'other'   (met CHECK-constraint)
//   - `assets.subtype` voor een cash-bezit → `CashSubtype`: 'checking' |
//     'savings_account' | 'joint' | 'business' | 'contant_geld' | 'other_cash'
//     (vrij tekstveld, gelabeld in ASSET_SUBTYPE_LABELS.cash)
//
// Vier van de zes waarden zijn identiek; twee heten anders. Dat verschil was
// latent giftig: `syncBankAccountCompanion` schreef `account_type: asset.subtype
// || 'checking'` rechtstreeks door, dus een cash-bezit met subtype
// 'savings_account' of 'other_cash' liet de companion-write op de
// CHECK-constraint stuklopen — en die fout wordt daar niet gelezen, dus de
// budgetteringskeuze deed dan stil niets. Zolang de bankkoppeling élke rekening
// als 'checking' stempelde was dat pad onbereikbaar; B3 (fase 5) maakt het
// bereikbaar. Vandaar deze brug, op één plek, in beide richtingen.

const CASH_SUBTYPE_TO_ACCOUNT_TYPE: Record<string, BankAccountType> = {
  checking: 'checking',
  savings_account: 'savings',
  joint: 'joint',
  business: 'business',
  contant_geld: 'contant_geld',
  other_cash: 'other',
}

const ACCOUNT_TYPE_TO_CASH_SUBTYPE: Record<string, CashSubtype> = {
  checking: 'checking',
  savings: 'savings_account',
  joint: 'joint',
  business: 'business',
  contant_geld: 'contant_geld',
  other: 'other_cash',
}

/**
 * `assets.subtype` (cash) → `bank_accounts.account_type`.
 *
 * Leeg/ontbrekend → `'checking'`: dat is het bestaande gedrag van
 * `syncBankAccountCompanion` en de kolomdefault. Een subtype dat *wel* gevuld is
 * maar niet in de cash-woordenlijst staat (bv. een spaar-subtype als
 * `'deposito'`, of restdata) → `'other'` in plaats van rauw doorgeschreven: een
 * CHECK-schending is hier stil, en "overig" is de eerlijke samenvatting van "iets
 * wat deze woordenlijst niet kent".
 */
export function cashSubtypeToAccountType(subtype: string | null | undefined): BankAccountType {
  if (!subtype) return 'checking'
  return CASH_SUBTYPE_TO_ACCOUNT_TYPE[subtype] ?? 'other'
}

/**
 * `bank_accounts.account_type` → `assets.subtype` (cash).
 *
 * Gebruikt door de cash-as-asset-backfill: staat er al een `bank_accounts`-rij
 * met een door de gebruiker gekozen type, dan is dát de bron voor het subtype van
 * het bij te maken bezit — niet een hardgecodeerde `'checking'`.
 */
export function accountTypeToCashSubtype(accountType: string | null | undefined): CashSubtype {
  if (!accountType) return 'checking'
  return ACCOUNT_TYPE_TO_CASH_SUBTYPE[accountType] ?? 'other_cash'
}
