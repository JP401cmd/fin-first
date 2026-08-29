/**
 * Per-rekening zichtbaarheid in het huishouden (Honeydue-model).
 *
 * Eén plek voor de drie standen van `bank_accounts.partner_visibility`, hun
 * koppeling aan `bank_accounts.ownership`, en de kolomlijst die veilig is om van
 * een rekening te lezen die van de PARTNER kan zijn.
 *
 * De echte poort ligt in de database (ADR 0118, migraties
 * `20260829160000_bank_accounts_partner_visibility.sql` en
 * `20260829161000_household_partner_items_account_gate.sql`): de RLS-policies op
 * transactions / transaction_splits / recurring_transactions en de RPC
 * `household_partner_items()` dwingen af wat de partner mag zien, op LEES-tijd.
 * Dit bestand is de TS-kant van dezelfde regels — nooit de vervanging ervan.
 */

/** De drie standen, in oplopende openheid. */
export const PARTNER_VISIBILITY_VALUES = ['none', 'balance', 'full'] as const

export type PartnerVisibility = (typeof PARTNER_VISIBILITY_VALUES)[number]

export type AccountOwnership = 'personal' | 'shared'

/**
 * Standaard bij het DELEN van een rekening: privacy-by-default.
 *
 * Besluit eigenaar 26-08-2026. Wie een rekening deelt geeft daarmee het saldo
 * vrij (dat is wat "gedeeld" in het huishoudbeeld betekent), maar niet
 * automatisch zijn boekingen. Wil je die ook delen, dan is dat een tweede,
 * expliciete klik.
 */
export const DEFAULT_SHARED_VISIBILITY: PartnerVisibility = 'balance'

export function isPartnerVisibility(value: unknown): value is PartnerVisibility {
  return typeof value === 'string' && (PARTNER_VISIBILITY_VALUES as readonly string[]).includes(value)
}

/**
 * De DB-invariant `bank_accounts_visibility_matches_ownership` in TS-vorm:
 * 'none' hoort bij een persoonlijke rekening, 'balance'/'full' bij een gedeelde.
 */
export function ownershipForVisibility(visibility: PartnerVisibility): AccountOwnership {
  return visibility === 'none' ? 'personal' : 'shared'
}

/**
 * Andersom: welke zichtbaarheid past bij een eigendomskeuze.
 *
 * `current` laat een bestaande, strengere of ruimere keuze staan zolang die bij
 * het nieuwe eigendom past — anders zou "naam wijzigen" op een `full`-rekening
 * de zichtbaarheid stil terugzetten naar `balance`.
 */
export function visibilityForOwnership(
  ownership: AccountOwnership,
  current?: PartnerVisibility | null,
): PartnerVisibility {
  if (ownership === 'personal') return 'none'
  if (current === 'balance' || current === 'full') return current
  return DEFAULT_SHARED_VISIBILITY
}

/**
 * De twee kolommen ALTIJD als één blok wegschrijven — zoals `ibanWriteColumns`
 * de drie IBAN-kolommen bij elkaar houdt.
 *
 * De CHECK-constraint in de database weigert elke schrijfactie die er maar één
 * zet. Dat is bewust hard: een halve toestand ("gedeeld, maar zichtbaarheid nog
 * op none") is precies het stille privacygat dat deze feature dicht moet zetten.
 */
export function ownershipWriteColumns(
  visibility: PartnerVisibility,
): { ownership: AccountOwnership; partner_visibility: PartnerVisibility } {
  return { ownership: ownershipForVisibility(visibility), partner_visibility: visibility }
}

/**
 * Lees een (mogelijk oude of ontbrekende) waarde van een rekeningrij uit en maak
 * er een geldige stand van. Rijen van vóór de migratie dragen geen kolom; die
 * volgen hun `ownership`.
 */
export function normalizePartnerVisibility(
  raw: unknown,
  ownership: AccountOwnership | null | undefined,
): PartnerVisibility {
  const owned: AccountOwnership = ownership === 'shared' ? 'shared' : 'personal'
  if (isPartnerVisibility(raw)) {
    // Een rij die uit de pas loopt (kan alleen bij data van vóór de CHECK)
    // wordt naar de STRENGSTE lezing getrokken die bij het eigendom past.
    return owned === 'personal' ? 'none' : raw === 'none' ? DEFAULT_SHARED_VISIBILITY : raw
  }
  return owned === 'personal' ? 'none' : DEFAULT_SHARED_VISIBILITY
}

/**
 * Welk `ownership` krijgt een geïmporteerde boeking op deze rekening?
 *
 * Dit is de TWEEDE gordel, niet de poort. De poort is de RLS-policy: die
 * verbergt de boekingen van een niet-'full'-rekening voor de partner, ongeacht
 * hoe ze gestempeld zijn — dat is precies waarom "lees-tijd" gekozen is (een
 * terugschakeling `full → balance` moet met terugwerkende kracht werken).
 *
 * Waarom er tóch gestempeld wordt: `transactions.ownership` heeft een tweede
 * betekenis (de huishoudweging van uitgaven, ADR 0101). Een boeking die als
 * 'shared' telt in de gezamenlijke uitgaven terwijl de partner 'm niet kan zien,
 * is een cijfer dat niemand kan navertellen. Op een `balance`-rekening blijven
 * nieuwe boekingen dus persoonlijk — óók als de gebruiker handmatig 'shared'
 * aanvinkt of het budget gedeeld is.
 */
export function rowOwnershipForImport(
  accountOwnership: AccountOwnership,
  accountVisibility: PartnerVisibility,
  budgetOwnership: AccountOwnership | undefined,
  manualOverride?: AccountOwnership,
): AccountOwnership {
  if (accountOwnership === 'shared' && accountVisibility !== 'full') return 'personal'
  if (manualOverride) return manualOverride
  if (budgetOwnership === 'shared' && accountOwnership === 'personal') return 'shared'
  return accountOwnership
}

/**
 * Expliciete kolomlijst voor rekeningrijen die van de PARTNER kunnen zijn.
 *
 * De SELECT-policy op `bank_accounts` is huishoud-verbreed: op een gedeelde
 * rekening komt de rij van je partner mee. Die rij draagt `iban`,
 * `iban_encrypted` en `iban_hash` — dat laatste is een blind index onder een
 * server-only sleutel en dus een STABIELE CORRELATIESLEUTEL. Bij `balance` deelt
 * de gebruiker het saldo, niet zijn rekeningnummer.
 *
 * De gate `scripts/check-client-data-reads.mjs` verbiedt `select('*')` op
 * `bank_accounts` in `'use client'`-bestanden, maar ziet een gedeelde
 * lib-helper of een server-loader waarvan het resultaat als prop doorgaat NIET.
 * Deze constante is de leesbare vorm van dezelfde regel; gebruik 'm op elk pad
 * dat rekeningen leest zónder `.eq('user_id', …)`. Spiegel van
 * `ASSET_CLIENT_COLUMNS` (`lib/asset-data.ts`).
 *
 * BEWUST NIET: iban, iban_encrypted, iban_hash.
 *
 * In gebruik door `components/app/cash-account-view.tsx` (het rekeningscherm —
 * huishoud-breed leespad zonder `user_id`-filter). Een constante die nergens
 * wordt aangeroepen is een claim en geen control; bedraad 'm dus mee wanneer je
 * een volgende partner-zichtbare lezer toevoegt. De harde vangrail is
 * `bank-account-visibility.test.ts`, die de hele repo scant.
 */
export const BANK_ACCOUNT_PARTNER_COLUMNS =
  'id, user_id, name, bank_name, account_type, balance, is_active, sort_order, ' +
  'created_at, updated_at, ownership, household_id, budget_role, linked_asset_id, ' +
  'is_archive_bucket, partner_visibility'
