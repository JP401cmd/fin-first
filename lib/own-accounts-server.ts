// lib/own-accounts-server.ts
//
// Server-zijde ophaal van de "mijn rekeningen"-identifiers: de set waarmee een
// tegenpartij als één van je eigen rekeningen wordt herkend, zodat een
// overboeking daarheen als interne VERSCHUIVING landt en niet als échte uitgave.
//
// Waarom deze module bestaat: die set werd tot nu toe op één plek server-side
// gebouwd (`POST /api/own-accounts/reclassify`) en op één plek client-side (de
// importpagina). Elk nieuw pad dat 'm nodig heeft — de bankkoppeling-sync, de
// instellingen-sheet voor tegenpartijen — kopieerde anders dezelfde drie
// subtiliteiten: de ontsleuteling per rij mét teller, de bewuste AFWEZIGHEID van
// een eigenaarsfilter op `bank_accounts`, en de normalisatie in
// `buildOwnAccountIdentifiers`. Eén helper, één redenering.
//
// De encryptiesleutel is server-only; dit bestand kan dus nooit vanuit een
// `'use client'`-bestand worden geïmporteerd. Clientlezers gaan via
// `lib/own-accounts-ibans.ts` → `GET /api/own-accounts/ibans`.

import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptField } from '@/lib/crypto/field-encryption'
import { buildOwnAccountIdentifiers, type OwnAccountIdentifiers } from '@/lib/own-accounts'

/** Grep-bare tag voor de serverlog; alleen TELLINGEN, nooit IBANs of namen. */
const LOG_TAG = '[own-accounts:identifiers]'

export type OwnAccountIdentifierLoad = {
  /** De gecombineerde set: IBANs (genormaliseerd) + naam-patronen (lowercase). */
  ids: OwnAccountIdentifiers
  /**
   * Aantal `bank_accounts`-rijen met een gevulde maar niet-ontsleutelbare
   * `iban_encrypted`. > 0 betekent: de set is ONVOLLEDIG en er kunnen dus
   * verschuivingen als echte uitgave blijven staan. De aanroeper beslist wat
   * daarmee te doen — hard falen (identifier-rol, zie
   * `fetchOwnAccountIbansStrict`) of doorgaan met wat leesbaar is.
   */
  unreadableIbans: number
}

/**
 * Bouw de eigen-rekening-identifiers voor één gebruiker: de handmatige regels
 * uit `user_own_ibans` plus de IBANs van de bankrekeningen die deze gebruiker
 * mag zien.
 *
 * Bedoeld om ÉÉN KEER PER VERWERKINGSRONDE te draaien (per sync-run, per
 * import, per pagina-load) — nooit per transactie: het zijn twee queries.
 */
export async function loadOwnAccountIdentifiers(
  supabase: SupabaseClient,
  userId: string,
): Promise<OwnAccountIdentifierLoad> {
  const [rulesRes, accountsRes] = await Promise.all([
    // Eigen-rij tabel: de `.eq('user_id', …)` hoort hier wél, want
    // `user_own_ibans` is per gebruiker en niet huishoud-gedeeld.
    supabase.from('user_own_ibans').select('match_type, match_value, iban').eq('user_id', userId),
    // `iban_encrypted`, niet de plaintext kolom: Stage B dropt
    // `bank_accounts.iban`. `user_own_ibans.iban` is een handmatig ingevoerde
    // regel en valt buiten de veldencryptie — die blijft plaintext.
    //
    // GEEN `.eq('user_id', …)` — bewust, en spiegelt `/api/own-accounts/ibans`.
    // De SELECT-policy op `bank_accounts` is huishoud-verbreed:
    //   (auth.uid() = user_id) OR (ownership = 'shared' AND household_id = user_household_id())
    // Met het eigenaarsfilter viel de gezamenlijke huishoudrekening buiten de
    // identifier-set, waardoor een overboeking dáárheen als échte uitgave bleef
    // staan in plaats van als interne verschuiving — dubbeltelling die de
    // spaarquote vertekent, zonder dat er ergens iets faalt. Eigenaarsbesluit:
    // gedeelde rekeningen tellen als eigen. RLS is hier de scope, niet een
    // extra filter; voeg 'm niet "voor de zekerheid" terug.
    supabase.from('bank_accounts').select('iban_encrypted'),
  ])

  // Per rij ontsleutelen mét een teller. Anders dan bij een cosmetisch
  // IBAN-staartje is een weggelaten rij hier géén schoonheidsfoutje: de IBAN is
  // hier een MATCH-identifier, dus een stil overgeslagen rekening betekent
  // transacties die eigen-rekening-verschuiving hadden moeten worden en dat niet
  // worden. Eén rommelige rij mag de hele ronde niet laten vallen, dus we slaan
  // 'm over — maar wél zichtbaar in de serverlog.
  //
  // **Wat deze teller NIET kan zien** (securityreview 30 juli):
  // `decryptField(null)` gooit niet, hij geeft `null`. Een rij met een plaintext
  // IBAN maar een lege `iban_encrypted` valt dus stil uit de match zonder hier op
  // te vallen. Dat is hier bewust niet op te lossen: `iban_encrypted IS NULL` is
  // van deze kant niet te onderscheiden van "deze rekening heeft geen IBAN" (11
  // van de 28 rijen op remote hebben er geen), en een teller die daarop afgaat
  // zou bij normale data alarm slaan. De invariant hoort dus aan de SCHRIJFkant:
  // élke schrijver op `bank_accounts.iban` dual-writet `iban_encrypted` +
  // `iban_hash` (de OAuth-callback, `syncBankAccountCompanion`, `seed-persona`).
  // Na de Stage B-drop is de plaintext-kolom er niet meer en is dit verschil ook
  // niet langer denkbaar.
  let unreadableIbans = 0
  const accountIbans = ((accountsRes.data ?? []) as { iban_encrypted: string | null }[]).map((a) => {
    try {
      return decryptField(a.iban_encrypted)
    } catch {
      unreadableIbans++
      return null
    }
  })
  if (unreadableIbans > 0) {
    console.error(
      `${LOG_TAG} ${unreadableIbans} bankrekening(en) met een onleesbare iban_encrypted overgeslagen — die matchen niet mee`,
    )
  }

  return {
    ids: buildOwnAccountIdentifiers(rulesRes.data ?? [], accountIbans),
    unreadableIbans,
  }
}

/**
 * Doorgeefluik: de check zelf is puur en woont in `lib/own-accounts.ts`, zodat de
 * clientkant hem óók kan gebruiken zonder deze server-only module (en dus
 * `decryptField`) mee te trekken. Hier geherexporteerd omdat aanroepers die de
 * identifiers hier ophalen de check meestal in dezelfde adem nodig hebben.
 */
export { hasOwnAccountIdentifiers } from '@/lib/own-accounts'
