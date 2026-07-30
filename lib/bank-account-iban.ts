import { blindIndex, encryptField } from '@/lib/crypto/field-encryption'

/**
 * De IBAN-kolommen van een `bank_accounts`-rij in één keer: plaintext (zolang
 * die kolom bestaat) én versleuteld + blind index.
 *
 * **Server-only.** `encryptField`/`blindIndex` lezen `ENCRYPTION_KEY_V1` en
 * `IBAN_INDEX_KEY_V1` uit de env. Een `'use client'`-bestand kan deze helper dus
 * niet aanroepen; schrijfpaden vanuit de browser lopen via een route (zie
 * `PATCH /api/bank-accounts/[id]` en `POST /api/assets/toggle-budget`).
 *
 * Dat is bewust géén `typeof window`-guard: de hele testsuite draait onder jsdom
 * (`vitest.config`, `environment: 'jsdom'`), dus zo'n check staat in élke test
 * aan en zegt niets over de echte bundel. De afdwinging zit op twee andere,
 * betrouwbaardere plekken: `encryptField` gooit vanzelf zodra de sleutel ontbreekt
 * (in de browser gegarandeerd), en geen enkele aanroeper vangt die throw nog op om
 * er een plaintext-only rij van te maken — zie `lib/bank-account-companion.ts`.
 * Dat laatste is precies het defect dat de securityreview van 30 juli vond.
 *
 * ## Waarom élke schrijver dit moet gebruiken
 *
 * De leespaden lezen sinds de omzetting UITSLUITEND `iban_encrypted`. Schrijft
 * één pad alleen de plaintext-kolom, dan verschijnt die rekening zonder IBAN in
 * de koppelwizard én wordt ze gemist door de `iban_hash`-tak van de OAuth-
 * callback — en, ernstiger, ze telt niet meer mee als eigen rekening, waardoor
 * interne overboekingen als echte inkomsten en uitgaven worden geboekt. Eén
 * gedeelde helper is de enige manier om dat niet per schrijfpad opnieuw te
 * moeten onthouden.
 *
 * ## Waarom de plaintext-kolom nog steeds meegeschreven wordt
 *
 * Bewuste keuze, niet luiheid: zolang `bank_accounts.iban` bestaat houden we 'm
 * coherent. Alle andere schrijvers (de OAuth-callback, `syncBankAccountCompanion`,
 * `seed-persona`) doen dat al, en er is nog één plaintext-LEZER over —
 * `app/api/onboarding/save-own-data` ruimt lege rekeningen op met een
 * `.eq('iban', '')`-filter. Zou dít pad als enige stoppen met plaintext
 * schrijven, dan ontstaat een half gevulde kolom die de Stage B-afweging
 * ("mag hij weg?") juist moeilijker maakt in plaats van makkelijker. Bij de
 * Stage B-drop verdwijnt de sleutel `iban` hier in één regel.
 *
 * ## Lege invoer is geen IBAN
 *
 * `''` en `null` leveren alle drie de kolommen `null` op. Een lege string
 * versleutelen zou een blind index opleveren die voor élke lege rekening
 * identiek is — waarna de `iban_hash`-fallback in de OAuth-callback twee
 * ongerelateerde rekeningen als "dezelfde rekening" zou behandelen.
 */
export function ibanWriteColumns(iban: string | null | undefined): {
  iban: string | null
  iban_encrypted: string | null
  iban_hash: string | null
} {
  const value = iban && iban.trim() ? iban : null
  if (!value) return { iban: null, iban_encrypted: null, iban_hash: null }
  return {
    iban: value,
    iban_encrypted: encryptField(value),
    iban_hash: blindIndex(value),
  }
}
