import type { TLTransaction } from './types'
import type { ParsedTransaction } from '@/lib/parsers/shared'
import { computeHash } from '@/lib/parsers/shared'
import type { CashSubtype } from '@/lib/asset-data'
import { cashSubtypeToAccountType, type BankAccountType } from '@/lib/account-types'

/** Lege/whitespace-only providerwaarden tellen als "niet gevuld" (→ null),
 *  zodat ze niet als lege tegenpartij in de DB landen en de meta-fallback
 *  hieronder gewoon aan bod komt. ParsedTransaction gebruikt null, niet ''. */
function blankToNull(value: string | undefined | null): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

/**
 * Map a TrueLayer transaction to our ParsedTransaction format.
 * Uses the same computeHash() as file-based import for cross-import deduplication.
 */
export async function mapTransaction(tl: TLTransaction): Promise<ParsedTransaction> {
  const date = tl.timestamp.split('T')[0]
  const description = tl.description ?? ''
  // Tegenpartij: `merchant_name` is het gestandaardiseerde veld, maar de
  // Nederlandse xs2a-banken (Rabobank live: 0/354 gevuld) laten het leeg en
  // zetten naam + IBAN in `meta.counter_party_*`. Vandaar de fallback — zonder
  // deze blijft counterparty_name/-iban leeg en verliest de categorisatie
  // (regelmotor én AI) haar sterkste signaal. Pariteit met de CSV/MT940-import,
  // die deze twee velden al vult.
  const counterparty_name =
    blankToNull(tl.merchant_name) ?? blankToNull(tl.meta?.counter_party_preferred_name)
  const counterparty_iban = blankToNull(tl.meta?.counter_party_iban)

  // import_hash blijft bewust date+amount+description: de tegenpartij verrijkt
  // de rij, maar mag de dedup-sleutel niet verschuiven (bestaande rijen zouden
  // anders als "nieuw" terugkomen bij de volgende sync).
  const import_hash = await computeHash(date, tl.amount, description)

  return {
    date,
    amount: tl.amount,
    description,
    counterparty_name,
    counterparty_iban,
    reference: tl.transaction_id ?? null,
    // De DB-CHECK op transaction_type staat alleen semantische types toe
    // ('transfer'/'salary'/...); rauwe TrueLayer-categorieën ('PURCHASE',
    // 'DIRECT_DEBIT', ...) horen in bank_code, net als de CSV-import doet.
    transaction_type: null,
    source_type: null,
    bank_code: tl.transaction_category ?? tl.transaction_type ?? null,
    // transaction_id staat al in `reference`; bewust niet als bank_seq omdat een
    // pending→posted id-wissel (zelfde datum/bedrag/omschrijving) anders een valse
    // "nieuwe" rij zou worden in de samengestelde unieke index.
    bank_seq: null,
    running_balance: tl.running_balance?.amount ?? null,
    creditor_id: null,
    // fx/creditor niet beschikbaar uit TrueLayer; CSV-import vult deze.
    fx_amount: null,
    fx_currency: null,
    fx_rate: null,
    import_hash,
  }
}

/**
 * Map an array of TrueLayer transactions.
 */
export async function mapTransactions(tlTransactions: TLTransaction[]): Promise<ParsedTransaction[]> {
  return Promise.all(tlTransactions.map(mapTransaction))
}

// ── Rekeningtype van de bank overnemen (besluit B3, fase 5) ──────────────────
//
// De koppel-callback stempelde tot fase 5 élke nieuw aangemaakte rekening als
// betaalrekening: `subtype: 'checking'` op de asset, `account_type: 'checking'`
// op de `bank_accounts`-rij, `is_liquid: true`. Zit er een spaarrekening in
// dezelfde consent (SC-05), dan kreeg die dus het verkeerde label — en een
// creditcard zou als liquide betaalrekening meetellen. Dat is een
// GRONDSLAGFOUT, geen cosmetisch defect: `is_liquid` bepaalt het liquide
// vermogen, en dat voedt noodfonds, spaarquote en de FIRE-motor. Downstream is
// het niet meer te herstellen ("consume, don't recompute").
//
// Wat TrueLayer werkelijk levert op `GET /data/v1/accounts`:
// `TRANSACTION`, `SAVINGS`, `BUSINESS_TRANSACTION`, `BUSINESS_SAVINGS`.
// Creditcards komen bij TrueLayer uit een ándere resource (`/data/v1/cards`) die
// wij niet aanroepen — de kaart-tak hieronder is dus een VANGNET, niet het
// normale pad: voor een provider die het type tóch via /accounts meldt, en voor
// de dag dat we cards wél gaan ophalen.

/** Wat één providertype betekent in de twee TriFinity-woordenlijsten. */
export type MappedAccountType = {
  /** Voor `bank_accounts.account_type` (CHECK-constraint). */
  account_type: BankAccountType
  /** Voor `assets.subtype` van het cash-bezit. */
  subtype: CashSubtype
  /**
   * Voor `assets.is_liquid`. Alleen een kaart-/kredietrekening is `false`: die
   * draagt een schuld, geen direct opneembaar tegoed, en mag het liquide
   * vermogen niet opblazen.
   */
  is_liquid: boolean
}

/**
 * Providertypes waarvan we weten wat ze betekenen. Bewust een expliciete tabel en
 * geen `includes('SAVINGS')`-heuristiek: een nieuw providertype hoort hier
 * zichtbaar bij te komen, niet stil in een bestaande tak te vallen.
 *
 * `BUSINESS_SAVINGS` → `business` en niet `savings`: de woordenlijst heeft één
 * slot, en "zakelijk" is de eigenschap die `checking`/`savings` niet óók kan
 * uitdrukken. Beide BUSINESS_*-varianten landen daarmee op hetzelfde type, wat
 * consistent is met hoe de gebruiker ze in `ACCOUNT_TYPES` zelf zou kiezen.
 */
const PROVIDER_ACCOUNT_TYPES: Record<string, { subtype: CashSubtype; is_liquid: boolean }> = {
  TRANSACTION: { subtype: 'checking', is_liquid: true },
  SAVINGS: { subtype: 'savings_account', is_liquid: true },
  BUSINESS_TRANSACTION: { subtype: 'business', is_liquid: true },
  BUSINESS_SAVINGS: { subtype: 'business', is_liquid: true },
  // Vangnet, zie de noot hierboven. `other_cash` omdat er geen creditcard-slot
  // in de woordenlijst bestaat, en `is_liquid: false` omdat dát de waarde is die
  // de vermogensgrondslag raakt. Een bankgeleverde creditcard hóórt eigenlijk
  // een `debts`-rij te zijn; dat is een eigen stap, geen stille aanname hier.
  CREDIT_CARD: { subtype: 'other_cash', is_liquid: false },
  CARD: { subtype: 'other_cash', is_liquid: false },
}

/** Val-terug voor een onbekend of ontbrekend providertype (plan, criterium g). */
const FALLBACK_ACCOUNT_TYPE: MappedAccountType = {
  account_type: 'checking',
  subtype: 'checking',
  is_liquid: true,
}

/**
 * Vertaal het TrueLayer-accounttype naar de TriFinity-velden die de
 * vermogensgrondslag bepalen.
 *
 * Een onbekend, leeg of ontbrekend type valt terug op betaalrekening — het
 * meest voorkomende geval, en het gedrag van vóór B3. Bewust een val-terug en
 * geen throw: een onbekend providertype mag een OAuth-callback nooit laten
 * stranden.
 */
export function mapAccountType(tlAccountType: string | null | undefined): MappedAccountType {
  const key = tlAccountType?.trim().toUpperCase()
  if (!key) return FALLBACK_ACCOUNT_TYPE

  const known = PROVIDER_ACCOUNT_TYPES[key]
  if (!known) return FALLBACK_ACCOUNT_TYPE

  return {
    account_type: cashSubtypeToAccountType(known.subtype),
    subtype: known.subtype,
    is_liquid: known.is_liquid,
  }
}
