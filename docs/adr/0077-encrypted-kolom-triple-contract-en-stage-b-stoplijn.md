---
id: 0077-encrypted-kolom-triple-contract-en-stage-b-stoplijn
title: 'Een encrypted kolom-triple heeft één schrijf-helper en één lees-helper per tabel, wist alleen bij bekend-leeg, en de plaintext-kolom blijft tot de laatste browser-schrijver én -lezer server-side is'
status: aanvaard
date: 2026-08-02
elements: [as-vermogen, t-supabase]
---

# 0077 — Encrypted kolom-triple: contract en Stage B-stoplijn

Aanleiding: Stage B van de field-level encryptie op `assets.account_number`
(`lib/asset-account-number.ts`, spiegel van `lib/bank-account-iban.ts`).
Tweede keer dat dit patroon opduikt na `bank_accounts.iban` — twee is genoeg om
het vast te leggen vóórdat een derde encrypted kolom het stilzwijgend anders
doet.

## Context

Een field-level-encrypted kolom bestaat als **triple**: de plaintext-kolom
(tijdelijk, tot de Stage B-drop), `<kolom>_encrypted` (AES-256-GCM, versleuteld
met een server-only sleutel) en `<kolom>_hash` (HMAC-blind-index, ook
server-only sleutel). Twee routes raken zo'n triple: schrijven en lezen. Beide
zijn nu twee keer onafhankelijk gebouwd (`iban` op `bank_accounts`,
`account_number` op `assets`) met hetzelfde patroon:

- **Schrijven**: één gedeelde functie per tabel (`ibanWriteColumns`,
  `accountNumberWriteColumns`) die alle drie de kolommen in één keer aflevert.
  Elke server-side schrijver roept 'm aan; niemand mag de plaintext-kolom los
  zetten zonder de encrypted tegenhanger, en niemand mag "leeg" schrijven
  tenzij de invoer écht leeg is (zie hieronder).
- **Lezen**: één gedeelde functie per tabel (`resolveAssetAccountNumber` voor
  assets; de IBAN-leeskant is inline in de OAuth-callback/companion-sync)
  die plaintext laat winnen zolang die kolom nog meeleeft, en anders de
  ciphertext ontsleutelt. Geen enkele consument leest de ruwe kolom rechtstreeks.

Het risico dat dit ADR vastlegt is niet hypothetisch: `AssetForm`
(`components/core/assets-client.tsx`) is een `use client`-bestand dat een
bewerkte cash-bezitting rechtstreeks via de browser-supabase-client opslaat.
Het kan niet versleutelen (`ENCRYPTION_KEY_V1` is server-only) en schrijft dus
alléén de plaintext-kolom — het spiegelbeeld van de gedeelde
write-helper-regel, maar dan gebroken. Gemeten op productie (2026-08-02): van
33 cash-bezittingen hebben er 2 wél `account_number` maar géén
`account_number_encrypted`, allebei `source='manual'`, met een companion-rij
in `bank_accounts` waarvan `iban_encrypted` óók leeg is. Zie het aandachtspunt
`assetform-schrijft-alleen-plaintext-account-number`.

## Besluit

**1. Eén schrijf-helper en één lees-helper per tabel, geen los-lopende
schrijvers.** Elke server-side plek die een encrypted kolom-triple muteert of
leest, doet dat via de gedeelde helper voor die tabel — niet via een eigen
`.insert()`/`.update()` met losse velden. Dat geldt met terugwerkende kracht
voor elke huidige triple en is de standaard voor elke toekomstige.

**2. Wissen mag alleen bij bekend-leeg, nooit bij onbekend.** Een schrijver die
de waarde niet kent (bv. een partial update die het veld niet meelevert) laat
de kolom ONGEMOEID — hij zet 'm niet op `null`. Alleen een schrijver die de
gebruiker expliciet leeg liet (`''`/`null` als bewuste invoer) mag alle drie de
kolommen op `null` zetten. Dit is al de vorm van `ibanWriteColumns` (lege
string/`null` → alle drie `null`) en van `AssetForm`'s eigen
save-payload-gedrag (het IBAN-veld weglaten als het onbekend is, i.p.v. leeg
op te sturen — zie `components/core/asset-form-iban.test.ts`); dit besluit
maakt die regel expliciet en generiek voor elke toekomstige triple, zodat een
volgende schrijver 'm niet per ongeluk andersom implementeert (leeg=onbekend
wissen).

**3. Stage B-stoplijn: de plaintext-kolom blijft bestaan tot de laatste
browser-schrijver én -lezer server-side is.** `assets.account_number` en
`bank_accounts.iban` mogen pas DROP-kandidaat worden zodra (a) geen enkel
`use client`-bestand ze meer rechtstreeks schrijft of leest, en (b) elke
server-side schrijver via de gedeelde helper loopt. Vandaag is `AssetForm` de
expliciet benoemde blokkade voor beide kolommen — zowel schrijvend (dit ADR)
als lezend (aandachtspunt `client-select-star-lekt-crypto-kolommen`). Niemand
plant de DROP-migratie in zolang die blokkade open staat; wie de DROP
voorbereidt, controleert eerst of `AssetForm`'s save inmiddels via een
server-route loopt.

**4. Ciphertext mag letterlijk gekopieerd worden tussen tabellen, mits
gedocumenteerd en onder dezelfde sleutel.** `20260802093000_auto_link_cash_asset_encrypted_iban.sql`
kopieert `bank_accounts.iban_encrypted`/`iban_hash` ongewijzigd naar
`assets.account_number_encrypted`/`account_number_hash` bij het aanmaken van
de companion cash-asset — de database kan niet ontsleutelen (geen sleutel) en
hoeft dat ook niet, want de trigger beoordeelt de IBAN niet inhoudelijk. Dat
mag zolang (a) beide kolomparen met dezelfde sleutelversie en dezelfde
normalisatie zijn gemaakt, en (b) de kopie expliciet in een migratie-comment
staat — niet stilzwijgend. Security-kanttekening die met dit besluit expliciet
wordt: dezelfde blind index in twee tabellen is een STABIELE CORRELATIESLEUTEL
die tabelgrenzen overschrijdt (dezelfde IBAN geeft in `bank_accounts.iban_hash`
én `assets.account_number_hash` dezelfde waarde). Dat is vandaag bedoeld
gedrag (het is precies hoe de auto-link-koppeling werkt), maar een toekomstige
kopieerslag naar een DERDE tabel moet zich afvragen of die correlatie daar ook
gewenst is, niet aannemen dat het altijd onschadelijk is.

## Alternatieven

- **Elke route zijn eigen write/read-logica laten herhalen** — verworpen: dat
  is precies het patroon dat `AssetForm` liet driften (het las de context van
  de gedeelde helper niet, want er was destijds geen gedeelde helper om te
  volgen). Eén helper per tabel maakt de regel vindbaar en dwingt 'm niet af
  via discipline maar via het enige aanroepbare pad.
- **Bij twijfel altijd wissen (fail-safe leeg)** — verworpen: een partial
  update die het veld niet meestuurt zou dan een bekende IBAN/rekeningnummer
  stil laten verdwijnen. `AssetForm`'s bestaande "laat het veld weg bij
  onbekend"-gedrag is de juiste kant; punt 2 maakt die kant het besluit i.p.v.
  toeval.
- **De plaintext-kolom nu al droppen en de twee productie-rijen handmatig
  repareren** — verworpen: lost het symptoom op, niet de oorzaak. Zolang
  `AssetForm` bestaat en client-side schrijft, ontstaat de volgende
  plaintext-only rij bij de eerstvolgende bewerking via dat formulier.

## Gevolgen

- `AssetForm`'s save-pad naar een server-route omzetten (die
  `accountNumberWriteColumns()` gebruikt) is nu de met-naam-genoemde
  voorwaarde voor de Stage B-drop van `assets.account_number` — géén losse
  toekomstige "misschien"-actie meer. Zie aandachtspunt
  `assetform-schrijft-alleen-plaintext-account-number`.
- Een derde encrypted kolom (buiten IBAN en rekeningnummer) volgt vanaf nu
  ditzelfde contract: één schrijf-helper, één lees-helper, wissen alleen bij
  bekend-leeg, en een eigen Stage B-stoplijn tot elke browser-schrijver/-lezer
  weg is.
- `scanTableRelations` (`generate.mjs`) ziet triggers en helper-functies niet
  — de ciphertext-kopie in de auto-link-trigger en de wissen-regel uit punt 2
  staan niet op de ERD, alleen hier en in de migratie-/broncode-comments.
