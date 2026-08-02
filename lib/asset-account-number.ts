import { blindIndex, decryptField, encryptField } from '@/lib/crypto/field-encryption'

/**
 * De rekeningnummer-kolommen van een `assets`-rij in één keer: plaintext (zolang
 * die kolom bestaat) én versleuteld + blind index.
 *
 * Dit is het spiegelbeeld van {@link import('./bank-account-iban').ibanWriteColumns}
 * voor `bank_accounts`. Zelfde opzet, zelfde reden, andere tabel: op `assets`
 * heten de drie kolommen `account_number`, `account_number_encrypted` en
 * `account_number_hash` — er bestaat GEEN `assets.iban`.
 *
 * **Server-only.** `encryptField`/`blindIndex` lezen `ENCRYPTION_KEY_V1` en
 * `IBAN_INDEX_KEY_V1` uit de env. Een `'use client'`-bestand kan deze helper dus
 * niet aanroepen; schrijfpaden vanuit de browser lopen via een route (zie
 * `POST /api/assets/toggle-budget`). Net als bij `ibanWriteColumns` bewust géén
 * `typeof window`-guard: de hele testsuite draait onder jsdom, dus zo'n check
 * staat in élke test aan en zegt niets over de echte bundel. `encryptField` gooit
 * vanzelf zodra de sleutel ontbreekt — in de browser gegarandeerd.
 *
 * ## Waarom élke schrijver dit moet gebruiken
 *
 * De kolommen liepen aantoonbaar uiteen. `POST /api/onboarding/aangifte-import`
 * schreef alleen `account_number`, en de auto-link-trigger schrijft sinds
 * `20260802093000_auto_link_cash_asset_encrypted_iban.sql` juist alleen nog
 * `account_number_encrypted`/`_hash`. Zolang elke schrijver zijn eigen kolomset
 * kiest, is "mag de plaintext-kolom weg?" per schrijfpad opnieuw een onderzoek.
 * Met één helper is het één regel op één plek.
 *
 * ## Waarom de plaintext-kolom nog steeds meegeschreven wordt
 *
 * Bewuste keuze, niet luiheid: zolang `assets.account_number` bestaat houden we
 * 'm coherent. Er is nog één plaintext-LEZER over — de nalees-fetch van
 * `AssetForm` (`components/core/assets-client.tsx`), die het zichtbare
 * IBAN-veld van het bewerkscherm vult. Zou een schrijver als enige stoppen met
 * plaintext, dan toont dat scherm een leeg veld voor een rekening die wél een
 * nummer heeft — en dat is precies de half gevulde kolom die de drop-afweging
 * moeilijker maakt in plaats van makkelijker. Bij de drop verdwijnt de sleutel
 * `account_number` hier in één regel.
 *
 * ## Lege invoer is geen rekeningnummer
 *
 * `''`, `null` en `undefined` leveren alle drie de kolommen `null` op. Een lege
 * string versleutelen zou een blind index opleveren die voor élk leeg
 * rekeningnummer identiek is — waarna een hash-lookup twee ongerelateerde
 * bezittingen als "dezelfde rekening" zou behandelen.
 */
export function accountNumberWriteColumns(accountNumber: string | null | undefined): {
  account_number: string | null
  account_number_encrypted: string | null
  account_number_hash: string | null
} {
  const value = accountNumber && accountNumber.trim() ? accountNumber : null
  if (!value) {
    return { account_number: null, account_number_encrypted: null, account_number_hash: null }
  }
  return {
    account_number: value,
    account_number_encrypted: encryptField(value),
    account_number_hash: blindIndex(value),
  }
}

/** De twee kolommen die {@link resolveAssetAccountNumber} nodig heeft. */
export type AssetAccountNumberColumns = {
  account_number?: string | null
  account_number_encrypted?: string | null
}

/**
 * De ENE leeskant voor het rekeningnummer van een `assets`-rij — het spiegelbeeld
 * van {@link accountNumberWriteColumns}, en de plek waar de plaintext-kolom bij de
 * drop in één regel verdwijnt.
 *
 * ## Waarom plaintext WINT en de ciphertext alleen aanvult
 *
 * Dit is bewust de omgekeerde volgorde van het patroon dat `decryptField` in zijn
 * eigen docstring noemt (`decryptField(row.x_encrypted) ?? row.x`). Reden: op
 * `assets` is de browser nog de meest recente schrijver van de plaintext-kolom.
 * `AssetForm` (`components/core/assets-client.tsx`) slaat een bewerkte cash-
 * bezitting rechtstreeks op via de browser-supabase-client en schrijft daarbij
 * ALLEEN `account_number` — versleutelen kan daar niet, want `ENCRYPTION_KEY_V1`
 * is server-only. Zou de ciphertext hier winnen, dan overschrijft een oude
 * `account_number_encrypted` een zojuist door de gebruiker getypt nummer, en
 * schrijft de companion-sync dus stil het VORIGE rekeningnummer naar
 * `bank_accounts`. Plaintext-eerst is daarmee de enige volgorde die het huidige
 * gedrag exact behoudt.
 *
 * De ciphertext-tak is netto winst en geen gedragswijziging in de andere
 * richting: sinds `20260802093000_auto_link_cash_asset_encrypted_iban.sql` vult
 * de auto-link-trigger bij een bankkoppeling uitsluitend
 * `account_number_encrypted`/`_hash`. Voor élke via de bank aangemaakte
 * cash-bezitting was de plaintext-kolom dus leeg en kreeg de companion géén
 * IBAN — precies de rij die daarna uit de eigen-rekeningherkenning valt, waarna
 * interne overboekingen als échte inkomst én uitgave meetellen.
 *
 * ## Waarom hier geen kale `decryptField`
 *
 * `decryptField` GOOIT bij een ontbrekende `v1:`-prefix, een niet-passende
 * sleutel of een beschadigde ciphertext. Beide aanroepers zitten op een pad waar
 * een throw het gedrag verandert in plaats van een fout te melden:
 *
 *   - `setBudgetTracking` (`lib/budget-tracking.ts`) roept de companion-sync
 *     bewust best-effort aan (`.catch()`); een throw bij het ONTSLEUTELEN valt
 *     buiten die catch — synchroon, vóór de promise — en laat de toggle-route in
 *     een 500 eindigen terwijl de asset-vlag al weggeschreven is.
 *   - `POST /api/budgetteren/setup` draait in één try/catch die de hele setup als
 *     mislukt rapporteert; één onleesbare ciphertext zou daar de complete
 *     budget-seed afbreken.
 *
 * Vandaar dezelfde defensieve vorm als `ibanColumns` in
 * `lib/bank-account-companion.ts`: vangen, server-side loggen, `null` teruggeven.
 *
 * ## Bij de drop van `assets.account_number`
 *
 * Verwijder de plaintext-tak hieronder én de kolom uit de twee select-strings die
 * deze functie voeden (`BUDGET_TRACKING_ASSET_SELECT` in `lib/budget-tracking.ts`
 * en de cash-select in `app/api/budgetteren/setup/route.ts`). Dat mag pas als
 * `AssetForm` niet langer de enige plaintext-schrijver/-lezer is — zolang dat
 * formulier client-side opslaat, is de ciphertext voor handmatig ingevoerde
 * nummers niet vers.
 */
export function resolveAssetAccountNumber(row: AssetAccountNumberColumns): string | null {
  const plain = row.account_number
  if (plain && plain.trim()) return plain

  const encrypted = row.account_number_encrypted
  if (!encrypted) return null
  try {
    return decryptField(encrypted)
  } catch (err) {
    console.error(
      '[asset-account-number] rekeningnummer niet te ontsleutelen (sleutel ontbreekt, is ongeldig, of de ciphertext is beschadigd) — ' +
      'de bezitting wordt behandeld als "geen rekeningnummer bekend":',
      err,
    )
    return null
  }
}
