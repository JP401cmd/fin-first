/**
 * Wat een AVG-export van een tabel WEL en NIET mag bevatten — [Arch F3], AVG
 * art. 15 (inzage) en art. 20 (dataportabiliteit).
 *
 * `/api/account/export` en `/api/admin/user-export` deden allebei `select('*')`.
 * Dat leverde tot nu toe een leesbaar rekeningnummer omdat `bank_accounts.iban`
 * nog bestaat — maar Stage B laat die kolom vallen, en dan levert de export
 * `iban_encrypted` + `iban_hash` in plaats van een rekeningnummer. Dat is géén
 * geldige invulling van het inzagerecht: de betrokkene krijgt dan onleesbare
 * ciphertext waar zijn eigen gegeven hoorde te staan.
 *
 * `select('*')` sleept bovendien kolommen mee die niets met de betrokkene te
 * maken hebben maar alles met onze server:
 *
 *  - **`iban_hash`** is een blind index: een deterministische HMAC uit een
 *    server-only sleutel (`IBAN_INDEX_KEY_V1`). Als stabiele, niet-roteerbare
 *    identifier van een rekening hoort die in geen enkele gebruikersdownload —
 *    hij voegt niets toe aan het inzagerecht en is buiten onze muren precies
 *    het soort correlatiesleutel dat we niet willen verspreiden.
 *  - **`*_encrypted`-kolommen** zijn ciphertext waarvan de sleutel server-only
 *    is: nul portabiliteitswaarde voor de betrokkene.
 *  - **`bank_connections.access_token` / `refresh_token`** (de plaintext
 *    voorgangers van hun `_encrypted`-tweelingen) zijn LEVENDE bankcredentials.
 *    Op remote staan ze op 0 rijen — de migratie naar de versleutelde kolommen
 *    is rond — maar de kolommen bestaan nog, dus één legacy-rij zou volstaan om
 *    van een gebruikersdownload een credential-drager te maken. Dat risico hoort
 *    niet af te hangen van een telling die morgen anders kan zijn.
 *  - **`exchange_connections` / `broker_connections`** dragen dezelfde vorm voor
 *    exchange- en broker-API-sleutels.
 *
 * De redactie is daarom KOLOM-GEBASEERD en gecureerd, niet patroon-geraden: een
 * nieuwe geheim-achtige kolom hoort een bewuste regel te krijgen.
 *
 * ## De aanname onder de ontsleuteling, en waarom die vandaag houdt
 *
 * De ciphertext is de BRON van de leesbare waarde — ook zolang de plaintext-kolom
 * nog bestaat. Een rij met een gevulde plaintext-kolom maar een lege
 * `*_encrypted` zou daardoor een waarde uit de export verliezen die er vandaag
 * wél in staat. Dat mag dus niet voorkomen, en dat is geen hoop maar een
 * afgedwongen eigenschap: élke schrijver gaat via één helper die de drie kolommen
 * samen zet (`lib/bank-account-iban.ts#ibanWriteColumns` en zijn tegenhanger voor
 * `assets`). Op remote geteld (2026-07-30): 0 van de 28 `bank_accounts`, 0 van de
 * 2 `bank_connection_accounts` en 0 van de 14 `assets`-rijen met een nummer
 * missen hun ciphertext. Slaat die telling ooit aan, dan is dat een backfill-gat
 * en géén reden om hier op de plaintext-kolom terug te vallen — dan hoort de
 * backfill gedraaid te worden.
 */

/**
 * Kolommen die nooit in een export terechtkomen, per tabel.
 *
 * Let op de asymmetrie met {@link EXPORT_DECRYPTED_COLUMNS}: de crypto-kolommen
 * van een IBAN worden gestript én vervangen door de ontsleutelde waarde. De
 * token-/sleutelkolommen worden alléén gestript — een bankToken teruggeven "omdat
 * het van de gebruiker is" zou van de export een aanvalsmiddel maken, en het is
 * geen persoonsgegeven maar een technische machtiging.
 */
export const EXPORT_REDACTED_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  bank_accounts: ['iban_encrypted', 'iban_hash'],
  bank_connection_accounts: ['iban_encrypted', 'iban_hash'],
  // `assets.account_number` is het rekeningnummer van een cash-bezit en draagt
  // dezelfde twee crypto-kolommen. Ze horen hier niet "ook maar even" bij: de
  // OAuth-callback schrijft `assets.account_number_hash` en
  // `bank_accounts.iban_hash` in dezelfde flow met dezelfde `blindIndex()` op
  // dezelfde IBAN, dus dat zijn byte-identieke waarden (remote: 14 rijen). Zonder
  // deze regel strip je de blind index op de ene tabel en lever je 'm één tabel
  // verderop alsnog uit — de redactie zou dan een no-op zijn.
  // `assets.account_number` staat óók op de Stage B-droplijst
  // (`specs/field-level-encryption/PR1-status.md`), dus de ontsleuteling hieronder
  // moet er zijn vóórdat die drop komt.
  assets: ['account_number_encrypted', 'account_number_hash'],
  bank_connections: [
    'access_token',
    'access_token_encrypted',
    'refresh_token',
    'refresh_token_encrypted',
  ],
  exchange_connections: ['api_key_encrypted', 'api_key_hash', 'api_secret_encrypted'],
  broker_connections: ['api_key_encrypted', 'api_key_hash', 'api_secret_encrypted'],
}

/** Eén versleutelde kolom en de leesbare kolom waarin haar waarde hoort te landen. */
export interface DecryptedExportColumn {
  cipherColumn: string
  plainColumn: string
}

/**
 * Kolommen die ontsleuteld in de export moeten verschijnen.
 *
 * Zolang `bank_accounts.iban` nog bestaat overschrijft dit de plaintext-kolom met
 * exact dezelfde waarde (de dual-write houdt ze gelijk). Ná de Stage B-drop is dit
 * de enige plek waar het rekeningnummer nog vandaan komt — en dat is precies de
 * bedoeling: de export blijft leesbaar zonder dat de route moet weten of de kolom
 * er nog is.
 */
export const EXPORT_DECRYPTED_COLUMNS: Readonly<Record<string, readonly DecryptedExportColumn[]>> = {
  bank_accounts: [{ cipherColumn: 'iban_encrypted', plainColumn: 'iban' }],
  bank_connection_accounts: [{ cipherColumn: 'iban_encrypted', plainColumn: 'iban' }],
  assets: [{ cipherColumn: 'account_number_encrypted', plainColumn: 'account_number' }],
}

/** Een ruwe exportrij zoals PostgREST 'm teruggeeft. */
export type ExportRow = Record<string, unknown>

/**
 * Brengt de rijen van één tabel in exportvorm: ontsleutel wat leesbaar moet zijn,
 * strip wat server-intern is.
 *
 * Volgorde is niet vrijblijvend — eerst ontsleutelen, dán strippen. Andersom zou
 * `iban_encrypted` al weg zijn op het moment dat we 'm nodig hebben.
 *
 * @param decrypt Ontsleutelfunctie (`decryptField`). Gooit die of geeft ze `null`,
 *                dan blijft de leesbare kolom leeg in plaats van dat de hele
 *                export klapt: een onleesbare rij mag het inzagerecht op alle
 *                andere rijen niet blokkeren.
 */
export function shapeExportRows(
  table: string,
  rows: readonly ExportRow[],
  decrypt: (value: string | null) => string | null,
): ExportRow[] {
  const decryptions = EXPORT_DECRYPTED_COLUMNS[table] ?? []
  const redactions = EXPORT_REDACTED_COLUMNS[table] ?? []
  if (decryptions.length === 0 && redactions.length === 0) return rows as ExportRow[]

  return rows.map((row) => {
    const shaped: ExportRow = { ...row }

    for (const { cipherColumn, plainColumn } of decryptions) {
      const cipher = shaped[cipherColumn]
      if (typeof cipher !== 'string') {
        // Geen ciphertext = geen rekeningnummer. Expliciet `null` zetten zodat de
        // export niet per rij een andere vorm heeft (en na de Stage B-drop de
        // kolom niet stilzwijgend ontbreekt).
        if (!(plainColumn in shaped)) shaped[plainColumn] = null
        continue
      }
      try {
        shaped[plainColumn] = decrypt(cipher)
      } catch {
        shaped[plainColumn] = null
      }
    }

    for (const column of redactions) {
      delete shaped[column]
    }

    return shaped
  })
}

/**
 * Dezelfde bewerking voor een enkele rij (het profiel), zodat beide exportroutes
 * één vorm gebruiken.
 */
export function shapeExportRow(
  table: string,
  row: ExportRow | null,
  decrypt: (value: string | null) => string | null,
): ExportRow | null {
  if (!row) return null
  return shapeExportRows(table, [row], decrypt)[0] ?? null
}
