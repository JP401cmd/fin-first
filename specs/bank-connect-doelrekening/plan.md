# Implementatieplan: doelrekening kiezen bij bank-koppelen + cross-bron duplicaatdetectie

> Status: **in uitvoering** — de besluiten (§0, B1–B9) zijn vastgesteld op 29 juli 2026 en
> de herstelreeks B1 is diezelfde dag uitgevoerd. De fasering hieronder is op 29 juli
> herschikt op die besluiten; wat al af is staat als **✅ uitgevoerd** gemarkeerd en is
> níét verwijderd — de geschiedenis van dit plan is de verantwoording.
> Bronnen: delta-requirements (requirement-specialist, FR1–FR13 + acceptatiecriteria a–f + regressie-eisen R1–R5), de architectuurreview (architect, aanbevelingen a–f) en `scenarios.md` (SC-01…SC-26).
> Afwijkingen van de architect-lijn staan expliciet gemarkeerd met **[afwijking]**.

## 0. Besluitenronde 2 — vastgesteld 29 juli 2026 (na de scenariocatalogus)

Deze ronde volgt op het aangescherpte eigenaarsmodel (altijd vooraf een doelrekening
kiezen) en op `scenarios.md` + de tweede architectuurreview. **Deze besluiten winnen
van eerdere passages in dit document waar ze elkaar tegenspreken.**

| # | Besluit | Gevolg voor dit plan |
|---|---|---|
| B1 | **UITGEVOERD 29 juli** — migratie: `supabase/migrations/20260729171125_transactions_drift_account_scoped_dedup_and_source.sql`; code: `lib/truelayer/existing-hashes.ts` (nieuw), `app/api/bank-connect/sync/route.ts`, `lib/bank-account-companion.ts`, `components/app/cash-account-view.tsx`, `app/api/assets/toggle-budget/route.ts`. **Herstelreeks eerst, apart en klein**, vóór fase 0. Twee punten: (a) de unieke index `transactions_import_hash_idx` gaat van gebruiker-breed naar rekening-gescoped — vandaag kunnen twee échte transacties met gelijke datum/bedrag/omschrijving op twee rekeningen niet naast elkaar bestaan; (b) het destructieve "Transacties loskoppelen"-pad (`cash-account-view.tsx`) dat `bank_accounts.delete()` doet (FK-botsing, half toegepaste mutatie) en `linked_asset_id` nult (leidt tot een tweede cash-asset bij herkoppelen). | Nieuwe reeks vóór fase 0. Fase 0a codificeert de index dan meteen in de **juiste** vorm; de aanname "0a is pure codificatie" vervalt. |
| B2 | **Budgetteren = voorgevinkt vinkje.** Nieuwe rekening: altijd aan, geen vraag (huidig gedrag). Bestaande rekening mét tracking: ongewijzigd. Bestaande rekening zónder tracking: één voorgevinkte optie in wizardstap 2. Bevestigt besluit 3 uit ronde 1; het eigenaarsvoorstel "stil automatisch aan" is afgewezen. | **Fase 4** bouwt de optie. Losse bug ~~meenemen~~ **✅ al gefixt in de herstelreeks**: de callback roept `syncBudgetingActive` nu wél aan, dus `profiles.budgeting_active` loopt niet meer uit de pas. |
| B3 | **Rekeningtype overnemen van de bank.** De aanmaak-tak stempelt nu élke rekening hard als betaalrekening, ook spaarrekeningen en creditcards uit dezelfde consent (SC-05). | **✅ uitgevoerd in fase 5** — `lib/truelayer/mapper.ts#mapAccountType` + de vocabulaire-brug in `lib/account-types.ts`; getest, want het raakt de vermogensgrondslag (acceptatiecriterium g). |
| B4 | **Herkomst-icoon alleen bij gekoppelde rekeningen.** Handmatige rekeningen krijgen géén symbool — dat is de normale toestand. | Aanpassing op de al gebouwde `AccountSourceIcon`-integratie in `cash-overview.tsx`. De filterchips op Transacties houden hun bestaande gedrag. |
| B5 | **Herkomstveld `transactions.source`** (`bank` / `import` / `handmatig`) toevoegen. | Mee in de herstelreeks-migratie (B1). Voorwaarde voor her-attributie, voor uitlegbare dedup-tellers en voor het terugdraaien van een verkeerde koppeling. |
| B6 | **Herkoppelen vanaf de rekening wordt meegebouwd** in dit plan, als eigen fase: derde icoon-toestand ("verbinding kwijt") + herstelactie op de rekeningkaart, inclusief reactivatie van een gedeactiveerd cash-bezitting (SC-12 + SC-13). | **Fase 7**, na de callback- en blokkade-fase (het herstelpad leunt op de uitzondering "een inactieve tweede rij mag wél"). Motivatie: de autorisatie verloopt elke 90 dagen, dus zonder dit pad loopt iedere gebruiker er binnen een kwartaal tegenaan. |
| B7 | **CSV op een gekoppelde rekening gaat via een server-route** (`POST /api/transactions/import`): parsen blijft client-side, opslaan + dedup server-side met dezelfde module als de sync-route. Verplicht voor gekoppelde rekeningen; losse rekeningen houden voorlopig het bestaande clientpad. | **Fase 3**, samengevoegd met de importkant van de cross-bron dedup (was fase 2). Maakt "één schrijver per gekoppelde rekening" waar en lost de sleutel-discrepantie op (import gebruikt `import_hash\|bank_seq`, sync alleen `import_hash`). |

**Zonder aparte vraag overgenomen** (aanbevelingen uit `scenarios.md` §2 en de tweede
architectuurreview): punt 4 van het eigenaarsmodel ("nieuw = geen controle nodig")
wordt **niet als vlag gemodelleerd** — de kandidatenquery is al rekening- en
datumgescoped en levert op een verse rekening nul rijen, dus het snelle pad ontstaat
vanzelf; laag 1 blijft altijd draaien (idempotentie). De statussen `expired` en
`revoked` worden in de UI één herstelpad ("verbinding kwijt"), want `revoked` wordt
door geen enkel codepad geschreven. Het correctiemoment op de success-pagina geldt
voor **élke** gekoppelde rekening, niet alleen de expliciet gekozene. En de
koppel-intentie (`nieuw` / `herautoriseren`) wordt vastgelegd op de pending-rij, zodat
de 90-dagen-herautorisatie de gebruiker géén onbeantwoordbare keuze voorlegt en
`external_account_id` daar leidend blijft.

**Harde regel die hierbij hoort:** de callback importeert nooit transacties (alleen
saldo). Daardoor is een verkeerde koppeling corrigeerbaar tot de eerste sync. Leg dit
vast in ADR 0069 — de eerste "handige" optimalisatie die hier transacties gaat ophalen,
sloopt het correctiemoment. **✅ vastgelegd 30 juli 2026:**
`docs/adr/0069-callback-haalt-alleen-saldo-op.md`, én als comment bovenaan
`app/api/bank-connect/callback/route.ts` — wie die route opent om er een
transactie-ophaal in te bouwen, moet de reden zien zonder eerst de ADR-map te
doorzoeken.

### B8 + B9 — omvang van de eerste ophaal (vastgesteld 29 juli 2026)

Aanleiding: een meting op een live Rabobank-koppeling toonde dat de provider véél meer
levert dan wij vragen. Zonder `from`/`to` valt TrueLayer terug op zijn standaard van
~88 dagen (355 transacties); met een expliciete begindatum leverde dezelfde rekening
747 (7 mnd), 1.355 (13 mnd) en **3.086 transacties (19 mnd)**. Verder terugtesten
strandde op `provider_request_limit_exceeded` — de bank heeft een eigen verzoeklimiet,
los van onze 10/dag en los van die van TrueLayer.

**B8 — maximale historie, op het koppelmoment.** Bij een eerste koppeling halen we zo
ver terug als de provider geeft, in blokken (bv. 6 maanden per verzoek) zodat de
provider-limiet gerespecteerd wordt, mét voortgangsindicatie. Motivatie: dit is het
enige moment waarop de gebruiker sowieso wacht, en later alsnog ophalen kost extra
verzoeken tegen dezelfde limiet.

**B9 — géén overlap-sweep op een rekening die al historie heeft.** Draagt de gekozen
doelrekening al transacties, dan start de eerste ophaal bij de **nieuwste bestaande
transactie −3 dagen** (consistent met besluit 4 uit ronde 1; de marge vangt naboekingen
met terugwerkende datum). B8 geldt dus feitelijk voor een lege rekening; op een gevulde
rekening wint B9.

**Consequentie, expliciet geaccepteerd:** gaten *vóór* de bestaande historie worden
niet automatisch gevuld. Wie CSV-historie heeft vanaf 2026 krijgt de 2024–2025 die de
bank wél had, niet vanzelf. Het bijladen van een CSV op die rekening (B7) is de
aangewezen route daarvoor. Wordt dit in de praktijk een klacht, dan is de opvolger een
expliciete "haal oudere historie op"-actie op de rekening — bewust géén automatiek,
want elke extra ophaal telt tegen de provider-limiet.

**Gevolg voor de fasering:** B9 verkleint de rol van dedup-laag 2 op het koppelpad (er
ontstaat immers geen overlap meer), maar heft hem niet op — het importpad (B7) kan nog
steeds overlappen met al gesynchroniseerde bankrijen. Laag 2 blijft dus onverkort staan
(**fase 2**), met het importpad (**fase 3**) als primaire afnemer in plaats van de eerste
sync — en de eerste-ophaal-strategie zelf schuift naar voren, naar **fase 1**, omdat B8 de
eerste gebruikerservaring raakt.

## 1. Doel & context

Vandaag kiest de gebruiker bij "Bank koppelen" alleen een bank. Wélke rekening in TriFinity de bankdata gaat dragen, beslist de callback zelf — op `external_account_id`, anders op `iban_hash`, anders door een nieuwe rekening plus cash-asset aan te maken (`app/api/bank-connect/callback/route.ts`, stap 1–3). Die heuristiek is sinds de bugfix van 29 juli correct in de gevallen die ze aankan, maar ze is stil en onomkeerbaar: wie eerder CSV-historie op een handmatig aangemaakte rekening heeft gezet en die rekening géén IBAN gaf, krijgt er ongemerkt een tweede rekening bij. Wie 'm wél een IBAN gaf, krijgt de bankdata op de goede rij — maar dan botsen de nieuw opgehaalde transacties met de bestaande CSV-rijen, en dedup laag 1 (`import_hash` = SHA-256 over `datum|bedrag|omschrijving`, `lib/parsers/shared.ts#computeHash`) vangt dat niet: TrueLayer levert een andere omschrijvingstekst dan een ING-CSV voor dezelfde boeking. Het resultaat is een dubbele transactiereeks, een dubbel geteld saldo of allebei — en de budget-toewijzingen die de gebruiker met de hand op de CSV-rijen heeft gezet, verdwijnen visueel in de ruis.

Dit plan doet twee dingen die elkaar nodig hebben. **Eén:** de gebruiker kiest vóór de OAuth-redirect zelf welke bestaande rekening de koppeling moet dragen — of expliciet "maak een nieuwe aan" — en die keuze wint van de heuristiek. **Twee:** er komt een tweede dedup-laag die dezelfde boeking herkent als hij uit een andere bron komt (datum ±1 dag + bedrag exact + tegenpartij-IBAN, met genormaliseerde naam als fallback), additief naast het onaangeroerde hash-contract v1. De volgorde van bouwen is bewust omgekeerd aan de volgorde van het verhaal — sinds B8/B9 zelfs twee keer omgedraaid: eerst de eerste-ophaal-strategie die voorkómt dat er overlap ontstáát, dan het vangnet voor wat er tóch overlapt, dan pas de trechter die er verkeer op zet (zie de toelichting bij §3). Onderliggend principe voor beide: **dedup verhindert alleen INSERTs — nooit een update, merge of delete; de oudste rij wint en houdt haar budget-toewijzing.** Dat is wat FR11 aantoonbaar maakt zonder één regel migratiecode.

## 2. Voorwaarden vooraf (fase 0)

Vier stukken die **vóór** de eerste bouwfase af moeten zijn. Ze horen niet bij dit plan als functionaliteit, maar zonder deze vier bouwen we op zand. Elk is los te mergen en los te reviewen. **Stand 29 juli 2026: 0a is uitgevoerd, 0b is uitgevoerd, 0c is vastgelegd, 0d is gedraaid maar moet vlak vóór fase 6 herhaald worden.**

### ~~0a — Schema-drift codificeren (M)~~ — ✅ uitgevoerd 29 juli 2026

De `transactions`-tabel droeg in productie elf kolommen die in géén enkele migratie voorkwamen (`bank_seq`, `running_balance`, `bank_code`, `creditor_id`, `fx_amount`, `fx_currency`, `fx_rate`, `linked_transfer_id`, `currency`, `notes`, `is_split`) plus een ongecodificeerde `transactions_account_id_idx`.

Uitgevoerd in `supabase/migrations/20260729171125_transactions_drift_account_scoped_dedup_and_source.sql` (toegepast op remote). Die migratie deed drie dingen in plaats van één:

- **(a) drift gecodificeerd** — elf kolommen + de account-index, typen/nullability/defaults exact overgenomen uit `information_schema.columns` op remote, niet verzonnen.
- **(b) de unieke dedup-index rekening-gescoped gemaakt** — `transactions_import_hash_account_idx` op `(user_id, account_id, import_hash, coalesce(bank_seq,''))` aangemaakt vóór de oude `transactions_import_hash_idx` werd gedropt, zodat er geen onbeschermd venster was. Per constructie een versoepeling (een kolom toevoegen aan een unieke sleutel kan alleen meer sleutels onderscheiden); 0 conflicterende groepen op remote, en `account_id` is NOT NULL dus er ontstaat geen NULL-gat waardoor rijen langs de dedup glippen.
- **(c) `transactions.source` toegevoegd** (B5) — nullable, geen default, CHECK `bank|import|handmatig`. Bewust nullable: de 37.000 bestaande rijen hebben geen vastgelegd herkomstfeit en een gok zou daarna niet meer van een vaststelling te onderscheiden zijn.

Daarmee vervalt de oorspronkelijke aanname "0a is pure codificatie": (b) en (c) zijn echte wijzigingen. Wat er in dezelfde reeks meeging staat bij B1 in §0. **Wat níét in deze migratie zat en dus openstaat:** de structurele schema-verschillen (FK-doelen, nullability, spookkolom `method`) — zie restrisico 8 — en `idx_transactions_user_date`, die in de repo staat maar nooit op remote is toegepast (restrisico 9).

### ~~0b — Golden-vectortest op `computeHash` (S)~~ — ✅ uitgevoerd 29 juli 2026

R1 eist dat het hash-contract v1 onaangeroerd blijft. Dat is nu alleen een comment. Pin het vast: een vitest die `computeHash('2026-07-29', -12.5, 'ALBERT HEIJN 1234')` op een **literale digest-string** vergelijkt, plus een expliciete case voor de `${amount}`-serialisatie-invariant (`-12.5` vs `-12.50`) en voor het afkappen op 100 tekens.

Uitgevoerd in `lib/parsers/shared.test.ts` *(nieuw)*: vier tests — twee golden vectoren op een gewoon geval (positief bedrag) en een negatief bedrag (dekt tevens de `${amount}`-serialisatie-invariant: `computeHash` gebruikt `${amount}`, dus `-12.5`, niet `.toFixed(2)`-vorm `-12.50` — een wijziging naar die vorm laat de golden hash breken), een golden vector op een omschrijving >100 tekens (pint de afgekapte 100-tekens-prefix), en een gedragstest die aantoont dat twee omschrijvingen die pas ná teken 100 verschillen dezelfde hash geven. Alle vier digests zijn berekend via de echte `computeHash`-aanroep (eerste-run-methode, spiegelt `format-contracts.test.ts`), niet verzonnen.

- Bewezen dat de test bijt: `slice(0, 100)` tijdelijk naar `slice(0, 120)` gewijzigd in `shared.ts` → 2 van de 4 tests rood (de golden-vector op de lange omschrijving én de afkap-gelijkheidstest), voor precies de juiste reden; wijziging teruggedraaid, `lib/parsers` weer groen (9 bestanden, 177 tests).
- Let op na 0a: de unieke *index* is rekening-gescoped geworden, maar de hash-*input* is ongewijzigd. R1 gaat over die input; deze test pint precies dat en niets meer.
- Afronding: de test faalt aantoonbaar als iemand de hash-input verandert (zie de bijt-proef hierboven).

### 0c — Tegenpartij-normalisatie: **[afwijking op de architect-lijn]** (S) — ✅ vastgelegd, geldt onverkort

De architect noemt "consolidatie van 3 losse `normalizeCounterparty`-kopieën naar `lib/parsers/counterparty-normalize.ts`" als voorwaarde. Bij verificatie blijkt dat feitelijk anders te liggen, en de afwijking is belangrijk genoeg om níét stilzwijgend te volgen:

- `lib/parsers/counterparty-normalize.ts` **bestaat al** en is de canonieke fuzzy-normalisatie (PSP-prefix, spatie-prefix, trailing kassanummer, rechtsvorm-suffix). `lib/parsers/categorize.ts` gebruikt 'm.
- De drie andere functies zijn **geen kopieën maar andere normalisaties**: `lib/recurring-detection.ts:295` (lowercase + álle niet-alfanumerieke tekens strippen + whitespace-collapse), `lib/recurring-data.ts:125` (lowercase + trim) en `lib/uat/acceptance/cash-checks.ts:171` (lowercase + trim).

Ze samenvoegen is dus **geen refactor maar een gedragswijziging** in de terugkerende-transacties-detectie: de canonieke variant strippen trailing filiaalnummers weg en de recurring-variant niet, dus abonnementen die nu apart gegroepeerd worden vallen daarna samen (en omgekeerd voor leestekens). Aanbeveling: **haal deze consolidatie uit de voorwaarden van dít plan.** Wat wél in fase 0 hoort is één regel: de nieuwe dedup-module importeert `normalizeCounterparty` uit `lib/parsers/counterparty-normalize.ts` en definieert géén vierde variant. De echte consolidatie van de recurring-varianten is een eigen `/refactor`-opdracht met eigen regressiebewijs (zie besluit 7).

- Afronding: geen codewijziging vereist, alleen deze vastlegging — plus de constatering dat er na dit plan nog steeds drie lokale varianten leven, zodat het niet als "opgelost" wegzakt.

### ~~0d — Pre-flight op productie: bestaande dubbele koppelingen (S)~~ — ✅ afgerond 30 juli 2026

Fase 6 (voorheen fase 5) zet twee partiële unique-indexen op `bank_connection_accounts`. Die migratie faalt hard als er dan dubbele rijen staan.

```sql
-- 1: meerdere actieve koppelingen op één bankrekening
select bank_account_id, count(*) from bank_connection_accounts
where is_active and bank_account_id is not null
group by bank_account_id having count(*) > 1;

-- 2: dezelfde externe rekening meer dan eens per gebruiker
select user_id, external_account_id, count(*) from bank_connection_accounts
group by user_id, external_account_id having count(*) > 1;
```

- Bij treffers: opruimbeleid vaststellen (aanbeveling: oudste rij wint, jongere op `is_active = false`; nooit verwijderen) en die opruiming als aparte, idempotente stap **vóór** de index-migratie draaien.
- **Tussenstand 29 juli 2026: beide queries geven 0 rijen op remote.** Dat was een momentopname, geen afronding — fase 4 t/m 7 maken juist nieuwe koppelingen aan.
- **Afronding 30 juli 2026:** opnieuw gedraaid in hetzelfde tijdvenster als de index-migratie (`20260729234928`), vlak ervóór: **beide queries 0 rijen**. Derde meting erbij die de plantekst niet vroeg maar de nieuwe guard-trigger wél nodig maakt — bestaande rijen met een drager van een ándere gebruiker: **0** (op 2 koppelrijen totaal, 2 actief, 0 zonder drager). Er was dus **niets op te ruimen**; de "oudste wint"-regel is niet toegepast omdat er geen overtreders waren.

## 3. Gefaseerde bouw

Elke fase is los te reviewen, los te mergen en los terug te draaien.

**De volgorde is op 29 juli herschikt en het ordeningsprincipe is daarbij omgedraaid.** Het oude principe was "het vangnet gaat eerst", omdat de trechter bewust méér verkeer naar "koppel aan een rekening die al historie heeft" zou sturen. B9 haalt dat verkeer weg: op een rekening mét historie start de eerste ophaal bij de nieuwste bestaande transactie −3 dagen, dus daar ontstáát geen overlap meer om te vangen. Het nieuwe principe is dus: **eerst voorkomen dat overlap ontstaat (fase 1), dan het vangnet voor wat er tóch overlapt (fase 2/3), dan pas de trechter (fase 4/5).** Laag 2 blijft onverkort nodig — alleen is het importpad (B7) nu de primaire afnemer in plaats van de eerste sync, en blijft de 3-dagen-marge van B9 de tweede.

Negen fasen, waarvan één afgerond vóór de nummering begon:

| # | Fase | Omvang | Status |
|---|---|---|---|
| — | Herstelreeks B1 (index rekening-gescoped, `source`, gepagineerde hash-lookup, destructief pad gefixt) | M | ✅ 29-07-2026 |
| 1 | Eerste ophaal: maximale historie in blokken, startpunt bij historie, 429-afvang (B8/B9) | L | ✅ 29-07-2026 |
| 2 | Cross-bron dedup: de pure module + de sync-route | M | open |
| 3 | Importpad server-side (B7) + cross-bron dedup importkant | L | open |
| 4 | Doelrekening kiezen: transport + wizard-keuzestap | M | ✅ 29-07-2026 |
| 5 | Callback: precedentie, consume-once, N rekeningen, rekeningtype (B3) | M | ✅ 30-07-2026 |
| 6 | Blokkade op dubbele actieve koppeling (+ de datalaag-guard uit fase 5) | S/M | ✅ 30-07-2026 |
| 7 | Herkoppelen vanaf de rekening: derde icoon-toestand + herstelactie (B6) | M/L | ✅ 30-07-2026 |
| 8 | Saldo zichtbaar overgenomen via het herwaarderingspad | S/M | ✅ 30-07-2026 |
| 9 | Documentatie, platen, ADR's en UAT-b | M | open |

---

### ~~Herstelreeks B1~~ — ✅ uitgevoerd 29 juli 2026

Stond in de eerdere fasering verspreid over "fase 0a" en de eerste twee bullets van fase 1. Uitgevoerd als één losse, kleine reeks vóór de bouw, precies zoals B1 voorschreef:

- **Migratie** `supabase/migrations/20260729171125_transactions_drift_account_scoped_dedup_and_source.sql` — drift + rekening-gescopede unieke index + `transactions.source`. Zie §2/0a.
- **`lib/truelayer/existing-hashes.ts`** *(nieuw, mét `existing-hashes.test.ts`)* — `loadExistingImportHashes()`: gepagineerd (`range()`-lus, `EXISTING_HASH_PAGE_SIZE = 1000`, `MAX_PAGES` als vangnet), gescoped op `(user_id, account_id)` én op het datumvenster `[min, max]` van de binnenkomende batch. Vervangt de `.in('import_hash', hashes)` in `app/api/bank-connect/sync/route.ts`. Fouten worden gegooid, niet als "niets bestaat al" geïnterpreteerd.
- **Herkomst wordt gezet** — `'bank'` in de sync-route, `'import'` in de bestandsimport, `'handmatig'` in het transactieformulier en de manual-transfer-sheet, alléén op INSERT.
- **Het destructieve pad is bij de bron gefixt** — `lib/bank-account-companion.ts` deactiveert in plaats van `bank_accounts.delete()` en nult `linked_asset_id` nooit meer; de client-mutatie in `components/app/cash-account-view.tsx` loopt via de bestaande `POST /api/assets/toggle-budget` (datapad-conventie, ADR 0058) en de callback roept nu `syncBudgetingActive` aan — de losse bug uit B2 is daarmee weg.

**Wat hierdoor uit de latere fasen is vervallen:** de gepagineerde hash-fetch (was fase 1, bullet 1), de `syncBudgetingActive`-bug (was een noot bij B2/fase 3), en de migratie-voorwaarde onder de ERD-noot in §6.

---

### Fase 1 — Eerste ophaal: maximale historie in blokken + startpunt bij bestaande historie (B8/B9) (L) — ✅ uitgevoerd 29 juli 2026

> **Uitgevoerd.** `lib/truelayer/initial-fetch.ts` + `errors.ts` (nieuw, beide met tests),
> `lib/truelayer/client.ts` (providerfoutcode behouden), `lib/truelayer/existing-hashes.ts`
> (`loadNewestTransactionDate`), `app/api/bank-connect/sync/route.ts` (blok-lus + afvang),
> `app/(app)/core/cash/connect/success/page.tsx` (voortgang + afkap-melding),
> `lib/format.ts` (`formatDateShort`), migratie
> `20260729182316_bank_sync_log_provider_requests.sql` (toegepast op remote), ADR 0072,
> `lib/architecture/integrations-model.ts` (truelayer-routes gecorrigeerd), UAT-b
> WF-CASH-42/43. Afwijkingen en meegelifte reparaties staan hieronder onder
> "Genomen besluiten".

**Kern.** B8 + B9, en daarmee de eerste gebruikerservaring van een koppeling. Vandaag stuurt `sync/route.ts` `syncFrom = date_from || connAccount.sync_cursor || undefined` naar `getAccountTransactions` — bij een verse koppeling dus niets, waarop TrueLayer terugvalt op zijn standaard van ~88 dagen. De meting op een live Rabobank-koppeling liet zien dat dezelfde rekening mét expliciete begindatum 747 (7 mnd), 1.355 (13 mnd) en 3.086 transacties (19 mnd) levert. Twee regels, één helper:

- **Lege doelrekening → zo ver terug als de provider geeft, in blokken** (bv. 6 maanden per verzoek), met voortgangsindicatie. Dit is het enige moment waarop de gebruiker sowieso wacht; later alsnog ophalen kost extra verzoeken tegen dezelfde limiet.
- **Doelrekening mét transacties → start bij de nieuwste bestaande transactie −3 dagen** (besluit 4). De marge vangt naboekingen met terugwerkende datum en ligt bewust boven de ±1-dagstolerantie van laag 2. Geen blok-lus: er is niets om terug te halen.

**Deze fase is de eigenaar van het startpunt-contract.** Fase 5 (callback) en fase 7 (herkoppelen) *consumeren* die helper en definiëren hem niet opnieuw — lees de definitieve signatuur uit het bronbestand, niet uit een fasebeschrijving.

**Te wijzigen/nieuwe bestanden**

- `lib/truelayer/initial-fetch.ts` *(nieuw)* — puur, geen Supabase-import: `planInitialFetch({ newestExistingDate, maxLookbackMonths, blockMonths })` → een lijst `{ from, to }`-blokken plus het startpunt. Eén plek waar "−3 dagen", de blokgrootte en de maximale terugblik als benoemde constanten staan.
- `lib/truelayer/initial-fetch.test.ts` *(nieuw)*.
- `lib/truelayer/client.ts`, `getAccountTransactions` (regel ~273) — de HTTP-status uit een mislukt verzoek moet leesbaar blijven: de huidige `throw new Error(\`TrueLayer transacties ophalen mislukt: ${res.status}\`)` verliest de providerfoutcode. Een `429` mét `provider_request_limit_exceeded` in de body moet als eigen fouttype herkenbaar zijn, want dat is een bank-eigen limiet — los van onze 10/dag en los van die van TrueLayer.
- `app/api/bank-connect/sync/route.ts` — de blok-lus, het startpunt uit de helper, en het afvangen van de provider-limiet: **stop met ophalen, houd wat je hebt, schrijf het weg** en meld het netjes. Een 429 halverwege een historische ophaal mag de al opgehaalde blokken niet weggooien.
- `app/(app)/core/cash/connect/success/page.tsx` — voortgang tijdens de eerste ophaal en, bij een afgekapte historie, één regel die zegt tot hoe ver er is opgehaald en dat oudere historie via een CSV-import bijgeladen kan worden (B7/fase 3).

**Migraties.** Geen. *(Meeliftkans, geen eis: `bank_sync_log.status` heeft op remote géén CHECK-constraint — geverifieerd 29 juli — dus een extra statuswaarde voor een afgekapte of gedeeltelijke ophaal kan zónder migratie. Zie restrisico 7.)*

**Tests**

- Unit op `planInitialFetch`: lege rekening → blokken die samen de maximale terugblik dekken, nieuwste blok eerst; rekening met historie tot 2026-07-20 → één venster vanaf `2026-07-17`, geen blok-lus; grensgeval "historie van vandaag" → geen ophaal in de toekomst.
- Sync-route: een `provider_request_limit_exceeded` op blok 3 laat de transacties uit blok 1 en 2 in de database staan en levert géén 500.
- Rate-limit: de blok-lus telt als het aantal daadwerkelijke verzoeken, niet als één — anders omzeilt de eerste ophaal stil de 10/dag-rem. **Dit is een bewuste keuze die vastgelegd moet worden**: kiest de eigenaar voor "de eerste ophaal telt als één", dan hoort dat als uitzondering in de code te staan, niet als bijwerking.

**Afrondingscriterium.** Een koppeling op een lege rekening levert aantoonbaar meer dan de TrueLayer-standaard van ~88 dagen; een koppeling op een rekening met historie tot datum D start op D−3; een provider-limiet levert een nette melding in plaats van een lege of half weggeschreven sync.

#### Genomen besluiten bij de uitvoering (29 juli 2026)

1. **De eerste ophaal telt als ÉÉN synchronisatie tegen de 10/dag-rem** — niet als N,
   ook al doet de blok-lus tot vijf provider-verzoeken (vier transactieblokken + de
   saldo-call). Het is één gebruikershandeling, en de rem die er werkelijk toe doet is
   de bank-eigen verzoeklimiet, die toch al afgevangen moet worden. **Voorwaarde bij dat
   besluit:** het werkelijke aantal HTTP-verzoeken wordt vastgelegd, zodat de
   provider-limiet observeerbaar blijft en niemand later hoeft te raden waarom een bank
   ons afknijpt. Daarvoor is `bank_sync_log.provider_requests` toegevoegd — dus **wél
   één migratie in deze fase**, waar de plantekst er nul aankondigde: additief,
   nullable, zonder default (0 zou een meting suggereren die er niet was). De keuze
   staat als comment bij de teller in de route, niet alleen hier, anders leest ze als
   een vergeten `+ providerRequests`.
2. **De rate-limit-tik wordt vóór de provider-lus gezet**, niet erna. Stond de ophoging
   ná de lus, dan was elke mislukte of in de timeout gelopen sync gratis — en sinds de
   blok-lus kost één poging tot vijf provider-verzoeken in plaats van één. Wat hiermee
   níét is opgelost: de read-then-write blijft een TOCTOU bij gelijktijdige verzoeken;
   dat vraagt een atomaire `set daily_requests = daily_requests + 1`-RPC en is een eigen
   stap (zie restrisico 12).
3. **Meegelift, geverifieerd zonder migratie:** `bank_sync_log.status` kent nu `'partial'`
   voor een afgekapte of gedeeltelijke ophaal, mét een toelichting in `error_message` en
   het aantal niet-weggeschreven rijen. Daarmee is **restrisico 7** grotendeels gedicht:
   een gesneuvelde insert-batch heet niet langer `success`.
4. **Fout op het faalpad werd nooit gelogd.** Het `catch`-blok las de body een tweede keer
   met `req.clone().json()`; op een al geconsumeerde body gooit `clone()` synchroon,
   buiten het bereik van de `.catch()` erachter. Er belandde dus nóóit een `error`-rij in
   `bank_sync_log`. Gerepareerd door de body één keer te lezen (nu via `parseBody` + zod,
   ADR 0044) en de melding te normaliseren — `bank_sync_log` gaat mee in de
   AVG-data-export, dus geen rauwe `err.message` meer.
5. **`lib/truelayer/errors.ts` is een eigen bestand** in plaats van de fouttypen in
   `client.ts`. De sync-route doet `instanceof` op het provider-limiet-fouttype, terwijl
   de routetest juist `@/lib/truelayer/client` mockt; stonden de klassen daar, dan zou de
   test iets anders bewijzen dan productie.
6. **`maxDuration = 60` en `BATCH_SIZE` van 50 → 200** op de sync-route: de gemeten
   eerste ophaal levert ~3.000 rijen, en 60 sequentiële inserts passen niet comfortabel
   binnen de standaard-timeout.
7. **In-batch ontdubbeling toegevoegd.** Aangrenzende blokken delen bewust hun grensdatum
   (een dag overlap is gratis, een dag gat is stil verlies). Zonder ontdubbeling op
   `transaction_id` + `import_hash` botsen twee gelijke rijen in één insert op de
   rekening-gescopede unieke index en sneuvelt de héle batch.

---

### Fase 2 — Cross-bron dedup: de pure module + de sync-route (M) — ✅ uitgevoerd 29 juli 2026

> **Uitgevoerd.** `lib/parsers/cross-source-dedup.ts` + `.test.ts` (nieuw),
> `lib/truelayer/existing-hashes.ts` (`loadCrossSourceCandidates`),
> `app/api/bank-connect/sync/route.ts` (laag 2 ná laag 1, gesplitste tellers),
> `app/(app)/core/cash/connect/success/page.tsx`, migratie
> `20260729190550_bank_sync_log_cross_source_dedup_counters.sql` (toegepast op
> remote), regressiecase `ob-bank-sync-cross-source-dedup` in
> `lib/regression-tests/suites/bank-connectie-flow.ts`. Afwijkingen en
> meegelifte reparaties staan hieronder onder "Genomen besluiten".

**Kern.** Eén pure module die van twee kanten gebruikt wordt, plus toepassing ervan in de sync-route. De sleutel is **exact, niet fuzzy**: gescoped op `(user_id, account_id)`, datum binnen ±1 kalenderdag, bedrag exact gelijk inclusief teken, én tegenpartij-IBAN exact gelijk na normalisatie — of, als één van beide zijden geen IBAN heeft, `normalizeCounterparty(naam)` exact gelijk. Géén bedragmarge, géén Levenshtein, géén scoredrempel. Alles wat niet exact matcht is per definitie geen duplicaat.

**Gewijzigde rol na B9.** Op het koppelpad vangt laag 2 nu nog maar één ding: de 3-dagen-marge van B9. De grote afnemer is het importpad (fase 3). Dat verandert niets aan de module, wel aan de verwachting: een structureel hoge `transactions_dup_cross_source` op een sync is voortaan een *signaal*, geen normaal beeld.

**Te wijzigen/nieuwe bestanden**

- `lib/parsers/cross-source-dedup.ts` *(nieuw)* — pure functies, geen Supabase-import: `buildCrossSourceKeys(tx)` en `findCrossSourceDuplicate(candidate, existing[])`, met een expliciet `reason`-veld (`'iban'` | `'name'`) in het resultaat zodat de import-UI kan uitleggen wáárom. Importeert `normalizeCounterparty` uit `lib/parsers/counterparty-normalize.ts` en definieert **géén** vierde variant (0c).
- `lib/parsers/cross-source-dedup.test.ts` *(nieuw)*.
- `app/api/bank-connect/sync/route.ts` — twee wijzigingen (de gepagineerde hash-fetch is al af, zie de herstelreeks):
  1. Naast de hashes de **kandidaat-rijen** ophalen voor laag 2: `date, amount, counterparty_iban, counterparty_name` binnen `[min(datum) - 1 dag, max(datum) + 1 dag]` van de opgehaalde batch, gescoped op `user_id` + `account_id = connAccount.bank_account_id`. Eén range-query, geen N+1 — en bij voorkeur als tweede export in `lib/truelayer/existing-hashes.ts`, want dat bestand bezit al precies deze scope-regel (rekening + datumvenster) en die redenering hoort niet op twee plekken te leven.
  2. Gesplitst tellen: `duplicates_exact` (laag 1, hash) en `duplicates_cross_source` (laag 2). Server-side **stil overslaan** — geen status, geen markering, geen rij in `transactions`.
- `app/(app)/core/cash/connect/success/page.tsx` — de teller-tekst leest de gesplitste velden.

**Migraties**

- Eén kolom op `bank_sync_log`: `transactions_dup_cross_source integer` (nullable, additief). De bestaande `transactions_dup` blijft de laag-1-teller — geen hergebruik, geen betekeniswissel op een bestaande kolom.

**Tests**

- Unit op de pure module: match op IBAN; match op naam-fallback bij eenzijdige `null`-IBAN; **geen** match bij ±2 dagen; **geen** match bij afwijkend bedrag (ook niet bij 1 cent); **geen** match bij teken-omkering; geen match over `account_id`-grens heen; geen match over `user_id`-grens heen.
- Sync-route: gesplitste tellers kloppen; laag 2 leidt nooit tot een update/delete op een bestaande rij (assertie op de mock: geen `.update()`/`.delete()` op `transactions`).
- **FR11-bewijs**: bestaande rij mét `budget_id` blijft na een sync die diezelfde boeking cross-bron aanbiedt ongewijzigd — zelfde `id`, zelfde `budget_id`, zelfde `category_source`.

**Afrondingscriterium.** Een sync in de B9-marge op een rekening met bestaande CSV-historie voegt nul dubbele transacties toe, `bank_sync_log` toont de splitsing, `npx tsc --noEmit` en `npm run test:run` groen.

#### Genomen besluiten bij de uitvoering (29 juli 2026)

1. **De ene aangekondigde kolom is er twee geworden**, `transactions_dup_cross_source_iban`
   en `_name`, in plaats van één `transactions_dup_cross_source`. Reden: de
   naam-terugval is de zwakke plek van laag 2 (twee filialen van dezelfde keten
   normaliseren naar dezelfde tegenpartij-naam) en dat restrisico is expliciet
   vastgelegd — zonder aparte teller is het niet te méten. Een derde kolom met
   het totaal is bewust NIET toegevoegd: een afgeleide waarde naast haar
   componenten opslaan is per definitie toekomstige drift. Het totaal is
   `coalesce(iban,0) + coalesce(name,0)`, en de respons levert het als
   `duplicates_cross_source`.
2. **Het respons-veld heet niet `duplicates_exact`** zoals de plantekst aankondigde.
   `duplicates` bestaat al en betekent al "laag 1"; het wordt gelezen door
   `components/app/bank-connect/connected-account-card.tsx` en de success-pagina.
   Een hernoeming zou een stille betekeniswissel zijn geweest. Laag 2 komt er
   additief naast (`duplicates_cross_source`), precies zoals `balance` en
   `fetch_mode` dat eerder deden.
3. **`partitionCrossSourceDuplicates` is toegevoegd naast de door het plan
   gevraagde `findCrossSourceDuplicate`** — en is de functie die beide afnemers
   gebruiken. Reden: één bestaande rij mag hooguit één kandidaat absorberen.
   Twee échte boekingen van €5 bij dezelfde bakker op dezelfde dag matchen
   allebei op één bestaande CSV-rij; als de match een filter is in plaats van een
   toewijzing verdwijnt er stil één van de twee — precies het fout-positief dat
   deze laag hoort te vermijden. Laag 1 heeft dit probleem niet (die spiegelt de
   unieke index, dus de database weigert de tweede sowieso) en houdt daarom haar
   set-vorm. Bijkomend voordeel: fase 3 erft het "identieke uitkomst op dezelfde
   invoer"-criterium gratis, want beide afnemers roepen dezelfde functie aan.
4. **De ±1-dagtolerantie wordt door de loader toegepast, niet door de route.**
   `loadCrossSourceCandidates` verbreedt het batchvenster zelf met
   `CROSS_SOURCE_DATE_TOLERANCE_DAYS`. Zou de aanroeper dat doen, dan kan de
   ophaal ooit smaller worden dan waarmee de matcher vergelijkt en glipt een
   duplicaat op de dag ervóór of erná er stil doorheen. Eén constante, één plek
   waar ze wordt toegepast.
5. **Beide zijden een IBAN maar verschillend → géén naam-terugval.** Twee
   verschillende IBANs zijn positief bewijs van twee tegenpartijen; naam-
   gelijkheid mag dat niet overrulen. Idem: ontbreekt aan één kant zowel een
   bruikbare IBAN als een bruikbare naam, dan is er geen match — matchen op
   alleen datum + bedrag zou elke maandelijkse vaste last op zichzelf laten
   lijken. Beide gevallen staan als test vast.
6. **Bedragen worden in hele centen vergeleken** (`Math.round(amount * 100)`),
   niet als double. `Math.round` en niet afkappen: `-12.5 * 100` kan als
   `-1249.9999…` uit de vermenigvuldiging komen, en `Math.trunc` maakt daar
   `-1249` van — dan matcht "exact op de cent" stil niet meer.
7. **De `user_id`-filter is een privacy-control, geen optimalisatie** — vastgelegd
   in de docstring van `ExistingHashScope` na de security-review. De SELECT-policy
   op `transactions` is bréder dan eigen-rij (ze laat huishoud-gedeelde
   partnerrijen door), dus RLS is hier géén vangnet: valt die `.eq('user_id', …)`
   ooit weg omdat iemand 'm als dubbelop leest, dan komen partnerboekingen in de
   dedup-vergelijking en wordt de cross-bron-teller een inferentiekanaal.
8. **Emmer op het bedrag in `partitionCrossSourceDuplicates`** (`Map<amountCents,
   keys[]>`) in plaats van een volle scan. Semantisch identiek — een match
   vereist per definitie een gelijk bedrag, en de indexen staan per emmer
   oplopend dus "eerste treffer wint" blijft gelden — maar het haalt de
   O(kandidaten × bestaande) weg die bij fase 3 (CSV van ~3.000 rijen tegen een
   volle historie) de event-loop zou blokkeren binnen dezelfde 60 seconden waarin
   ook de provider-verzoeken en de insert-batches moeten passen.
9. **Meegelift, drift uit fase 1 gerepareerd** in
   `lib/regression-tests/suites/bank-connectie-flow.ts`: `TX_BATCH_SIZE` stond nog
   op 50 (de route doet 200 sinds fase 1) en `SYNC_STATUSES` miste `'partial'`.
   Beide zijn zelf-refererende asserties, dus ze waren groen terwijl ze een
   onwaarheid documenteerden.

**Openstaand na deze fase** (geen blokkade, wel bewust):

- De kandidaten worden geladen op basis van het datumvenster van de **volledige**
  opgehaalde batch, niet van wat er ná laag 1 nog over is — beide leesronden
  draaien parallel in één `Promise.all`. Bij een routine-sync waarin laag 1 alles
  al afvangt, worden er dus tegenpartij-IBANs en -namen gelezen voor een laag 2
  die niets meer te doen heeft. Sequentieel maken kost een extra round-trip op
  élke sync; dat is bewust niet gedaan. Herweeg dit als fase 3 dezelfde
  leesronde vanuit de importkant hergebruikt.
- `describeSyncError` in de sync-route plet een gefaalde kandidaten-leesronde tot
  `'Onbekende fout'` in `bank_sync_log`, terwijl de geworpen tekst al
  client-veilig is. De schone vorm is een eigen `SyncStepError`-klasse met een
  per constructie gecureerde melding; dat is fase-1-code en hier bewust niet
  aangeraakt.

---

### Fase 3 — Importpad server-side (B7) + cross-bron dedup importkant (L) — ✅ uitgevoerd 29 juli 2026

> **Opgeleverd:** `app/api/transactions/import/route.ts` (+ `route.test.ts`), aanpassingen in
> `app/(app)/core/cash/import/page.tsx` (serverpad, laag-2-partitie, uitlegbanner, teller,
> statuscel per rij met matchreden) en `app/(app)/core/cash/import/select-all.ts`.
> Verificatie: `tsc` 0 fouten · volledige suite **676 bestanden / 8.580 tests groen** ·
> `npm run check:client-reads` groen (45 bekende readers, 0 nieuwe, niets aan de allowlist
> toegevoegd).
>
> **Genomen beslissingen.** Parsen blijft client-side; opslaan én beide dedup-lagen zijn
> server-side. De route vertrouwt de client niet: hij zet zelf `user_id`, `account_id`,
> `source: 'import'` en `is_income`, en **herberekent `import_hash`** — een verzonnen hash
> zou de unieke index omzeilen en de dedup van élke volgende import vervuilen. Zod werkt als
> whitelist, dus onbekende velden worden gestript. Laag 1 (indexsleutel) is **niet**
> overrulebaar — dat is geen oordeel maar de databasewerkelijkheid; laag 2 (cross-bron) wél,
> via `allow_cross_source`, omdat de gebruiker bij een import aanwezig is.
>
> **Security-gate (orchestrator, 29 juli — de agent viel twee keer om op API-fouten, dus
> zelf uitgevoerd): geen 🔴, geen 🟠 in de route zelf.** Firsthand tegen de live policies
> geverifieerd: rekening- én budget-eigenaarschap lopen via RLS (`bank_accounts`/`budgets`
> SELECT), niet via een tweede kopie van de eigendomsregel; `transactions` INSERT dwingt
> `auth.uid() = user_id` af, dus de importeur kan nooit op een vreemde `user_id` schrijven;
> geen `getServiceClient()` in het pad; foutmeldingen lopen via `forbidden()`/`serverError(err,
> 'transactions-import:POST')` zonder rauwe drivertekst naar de client.
>
> **Wél één 🟠 op systeemniveau, buiten deze route:** op een **huishouden-gedeelde** rekening
> (`ownership='shared'`) mogen beide partners importeren, maar zowel de dedup-scope als de
> unieke index zijn op `user_id` gesleuteld. Importeren beide partners hetzelfde afschrift,
> dan ontstaan duplicaten die **geen** van beide lagen vangt. Dat is inherent aan het
> per-gebruiker-model en ouder dan deze fase, maar deze route maakt het gedeelde-rekening-pad
> expliciet — dus hoort het hier vastgelegd. Zie restrisico's.

**Kern.** Twee dingen die één fase zijn geworden. **B7:** `POST /api/transactions/import` — parsen blijft client-side (de bestandsformaten, de kolomherkenning en de voorvertoning veranderen niet), maar opslaan + dedup gaan server-side, met dezelfde module als de sync-route. Verplicht voor gekoppelde rekeningen; losse rekeningen houden voorlopig het bestaande clientpad. **FR12:** het moet net zo goed werken als de CSV ná de bankkoppeling komt — bij een handmatige import is de gebruiker aanwezig, dus laag-2-treffers worden **zichtbaar voorgedeselecteerd met reden**, niet stil overgeslagen, en zijn overrulebaar.

Waarom samen: B7 maakt "één schrijver per gekoppelde rekening" waar en lost de sleutel-discrepantie op (de import gebruikt `import_hash|bank_seq`, de sync alleen `import_hash`). Die discrepantie los je niet netjes op als je de dedup-UI eerst nog aan de clientkant uitbreidt en dán verhuist. Dit is ook de route die `lib/architecture/integrations-model.ts` al noemt maar die niet bestaat (§6) en de door ADR 0058 benoemde opvolger van het client-directe importpad.

**Te wijzigen/nieuwe bestanden**

- `app/api/transactions/import/route.ts` *(nieuw)* — neemt geparste rijen aan, valideert met zod via `parseBody` (ADR 0044), draait laag 1 (`loadExistingImportHashes`) + laag 2 (`cross-source-dedup`), schrijft in batches weg met `source: 'import'`, geeft per rij terug wat er is gebeurd. Foutvorm via `lib/api/respond.ts`. Eigenaarschap van de doelrekening server-side controleren — de client mag geen `account_id` opgeven waar hij geen recht op heeft.
- `app/(app)/core/cash/import/page.tsx` — voor een **gekoppelde** rekening loopt het opslaan via de route; voor een losse rekening blijft het bestaande pad. Naast de bestaande `isDuplicate` (laag 1) een tweede vlag met reden, bijvoorbeeld `crossSourceDuplicate: { reason: 'iban' | 'name' } | null`. `skipImport` gaat op `true`, de checkbox blijft aanklikbaar. De bestaande date-range-query (`select date, amount, description`) wordt uitgebreid met `counterparty_iban, counterparty_name` — dezelfde query, meer kolommen, geen extra roundtrip.
- `app/(app)/core/cash/import/select-all.ts` + `.test.ts` — de "selecteer alles"-logica moet weten dat een cross-bron-duplicaat standaard uit staat.
- `scripts/check-client-data-reads.mjs` — de import-pagina van de grandfather-allowlist áf zodra haar reads via de route lopen. Eraf halen mag; erbij zetten niet.

**Migraties.** Geen.

**Tests**

- Route: rijen op een andermans `account_id` → 403/400, niets weggeschreven. Dedup-uitkomst identiek aan die van de sync-route op dezelfde invoer (één module, twee afnemers).
- Uitbreiding van `select-all.test.ts`: cross-bron-duplicaten blijven uitgevinkt bij "selecteer alles", maar handmatig aanvinken blijft mogelijk en leidt tot een echte insert.
- Unit: een rij die zowel laag-1- als laag-2-duplicaat is, telt precies één keer en toont de laag-1-reden (de striktere).
- `source` = `'import'` op elke via deze route weggeschreven rij, ook bij een handmatig overrulede duplicaat.

**Let op — bestaande fout-positief niet uitbreiden.** De soft-check op de import-pagina bouwt haar `contentKey` als `${date}|${amount}|${description.slice(0,100)}` en **negeert `bank_seq`**, terwijl de harde `rowDedupKey` dat wél meeneemt. Twee écht verschillende boekingen met gelijke datum/bedrag/omschrijving worden daardoor nu al onterecht als duplicaat voorgemarkeerd. Dat repareren we hier **niet** (buiten scope), maar de nieuwe laag mag er niet bovenop stapelen: de laag-2-check draait alleen op rijen die de laag-1-check niet al heeft afgevangen. Wél expliciet: de nieuwe route erft die fout niet — server-side is `rowDedupKey` de sleutel.

**Afrondingscriterium.** Acceptatiecriterium (f) — CSV importeren na een bankkoppeling — levert nul dubbele rijen bij ongewijzigde standaardselectie, de gebruiker kan een voorgedeselecteerde rij bewust alsnog importeren, en een import op een gekoppelde rekening schrijft aantoonbaar via de server-route.

---

### Fase 4 — Doelrekening kiezen: transport + wizard-keuzestap (M) — ✅ uitgevoerd 29 juli 2026

> **Opgeleverd.** Migraties `20260729213240_bank_connections_target_account_and_link_intent.sql`,
> `20260729222134_guard_bank_connections_target_account_ownership.sql` en
> `20260729222421_guard_bank_connection_target_account_revoke_public.sql` (alle drie
> toegepast op remote). Nieuw: `app/api/bank-connect/accounts/route.ts` (+ `route.test.ts`),
> `lib/truelayer/target-account.ts`, `lib/budget-tracking.ts`,
> `components/app/bank-connect/target-account-choice.tsx` (+ `.test.tsx`),
> `app/api/bank-connect/auth-link/route.test.ts`. Gewijzigd:
> `app/api/bank-connect/auth-link/route.ts`, `app/(app)/core/cash/connect/page.tsx`,
> `app/api/assets/toggle-budget/route.ts`, `lib/bank-account-companion.ts` (+ test),
> `lib/architecture/archimate-model.ts`, `lib/architecture/integrations-model.ts` (+ test),
> `docs/architecture/architecture.json`, UAT-b (`lib/uat/acceptance/cash.ts`,
> `cash.engine.test.ts`, `lib/uat/catalog.ts`, `lib/uat/flows/cash.ts` + `cash.test.ts`).
>
> **Verificatie:** `npx tsc --noEmit` 0 fouten · volledige suite **680 bestanden /
> 8.632 tests groen** (2 bestanden / 4 tests overgeslagen, ongewijzigd) ·
> `npm run check:client-reads` groen (45 bekende
> readers, 0 nieuwe, niets aan de allowlist toegevoegd) · `npx eslint` schoon op alle
> gewijzigde bestanden. De gepinde regressietest `bank-connect-page-steps` is
> **ongewijzigd** gebleven (stap-ids `select`/`confirm`/`redirect`), net als de
> state-opbouw in `auth-link` (R2).

**Kern.** FR1, FR2, FR13. De keuze gaat mee door OAuth via een **kolom, niet via de state-string**: `bank_connections.target_bank_account_id`. De pending-rij bestaat op dat moment al (`auth-link` maakt 'm aan vóór de redirect), dus er is geen nieuw transportmechanisme nodig en het state-formaat blijft exact `${connection.id}:${user.id.slice(0,8)}-${Date.now()}` — dat is wat R2 eist. De kolom is **consume-once**: de callback zet 'm op `null` zodra hij is toegepast, zodat een herautorisatie 90 dagen later niet stilletjes dezelfde oude voorkeur herhaalt.

**Te wijzigen/nieuwe bestanden**

- `app/api/bank-connect/auth-link/route.ts` — accepteert optioneel `target_bank_account_id` in de body, valideert eigenaarschap (`bank_accounts.user_id = user.id`, `is_active`) en schrijft het mee in de pending-rij. Nieuwe mutatieroute-conventie: dit is het moment om `parseBody(schema, req)` met zod toe te voegen (ADR 0044) — de handler komt er toch al langs.
- `app/api/bank-connect/accounts/route.ts` *(nieuw)* of een server-loader — de wizard mag **geen** client-direct supabase-read doen: `app/(app)/core/cash/connect/page.tsx` staat niet op de grandfather-allowlist in `scripts/check-client-data-reads.mjs` en `npm run check:client-reads` zou een directe read terecht flaggen (ADR 0058). Levert per rekening: `id`, naam, gemaskeerde IBAN, aantal bestaande transacties, datum oudste/nieuwste transactie en of er al een actieve koppeling op zit. De nieuwste transactiedatum doet hier dubbel werk: hij is óók het startpunt dat B9 straks gebruikt, dus de wizard kan er meteen mee zeggen wát er gaat gebeuren ("we halen op vanaf 17 juli" of "we halen zo ver terug als je bank geeft"). Bereken dat met de helper uit fase 1 — niet met een tweede `-3 dagen` in de UI.
- `app/(app)/core/cash/connect/page.tsx` — de keuze landt **binnen** de bestaande drie stappen, niet als vierde stap: stap 2 `confirm` wordt "Rekening & bevestigen". Boven de bestaande veiligheids-/90-dagen-/alleen-lezen-blokken komt de rekeningkeuze met "Nieuwe rekening aanmaken" als expliciete, gelijkwaardige optie (FR13) — niet als afwezigheid van een keuze. Bij een rekening die al historie heeft: toon het aantal bestaande transacties en de periode, zodat de gebruiker snapt wát hij samenvoegt.
- Zelfde stap draagt de **FR9-bevestiging**, in de vorm die B2 vastlegt: als de gekozen **bestaande** rekening nog geen budget-tracking heeft (`assets.has_budget_tracking = false`), staat daar één regel met een **voorgevinkte** optie "neem deze rekening mee in mijn budgetten" — zichtbaar en uitzetbaar, niet stil. Een nieuwe rekening krijgt budgetteren altijd aan zonder vraag (huidig gedrag); een bestaande rekening mét tracking blijft ongewijzigd. Geen aparte dialoog later (besluit 3). De losse `syncBudgetingActive`-bug uit B2 is al weg (zie de herstelreeks) — deze fase erft die niet meer.
- **Onboarding (SC-25):** tijdens onboarding is er meestal geen bestaande rekening om te kiezen. De keuzestap moet dan niet doodlopen: "nieuwe rekening aanmaken" staat voorgeselecteerd en de lijst wordt weggelaten in plaats van leeg getoond. Verifieer of de onboarding-flow vóór dit punt al een standaardrekening aanmaakt — dat bepaalt of de lijst één of nul opties heeft.

**Migraties**

```sql
alter table public.bank_connections
  add column if not exists target_bank_account_id uuid
  references public.bank_accounts(id) on delete set null;

-- Koppel-intentie op de pending-rij (§0, "zonder aparte vraag overgenomen").
-- Wordt hier gezet op 'nieuw'; fase 7 (B6) schrijft 'herautoriseren'.
alter table public.bank_connections
  add column if not exists link_intent text
  check (link_intent is null or link_intent in ('nieuw', 'herautoriseren'));
```

`on delete set null` is bewust: een verwijderde doelrekening mag de koppeling niet blokkeren, alleen de voorkeur laten vervallen.

**Waarom `link_intent` hier en niet in fase 7.** De intentie ontstáát bij het aanmaken van de pending-rij, en dat gebeurt in deze fase. Hem hier meenemen scheelt een tweede `alter table` op dezelfde tabel en voorkomt dat fase 7 een kolom moet toevoegen om een gedrag te kunnen kiezen dat de wizard al kent. Fase 7 is de eigenaar van de *waarde* `'herautoriseren'` en van wat die waarde doet; deze fase is de eigenaar van de *kolom* en van de default. Consume-once geldt alleen voor `target_bank_account_id` — de intentie is een feit over die koppelpoging en blijft staan.

**Tests**

- `auth-link`: onbekende/andermans `target_bank_account_id` → 400, geen pending-rij met vreemde verwijzing. Dit is de RLS-relevante rand: de kolom mag nooit naar een rekening van een andere gebruiker wijzen.
- Component/UI-test op de wizard: de stap-indicator toont nog steeds **drie** stappen. De gepinde verwachting leeft in de in-app regressiesuite `lib/regression-tests/suites/kern-bank-connect-flow.ts`, test `bank-connect-page-steps` (regel 42–52) en assert de stap-**ids** `select`/`confirm`/`redirect` — niet de labels. Bij besluit 6-optie A blijft die test dus **ongewijzigd groen**; bij optie B moet hij bewust worden bijgewerkt.
- Zonder keuze blijft de body-vorm van `auth-link` geldig (achterwaarts compatibel).

**Afrondingscriterium.** De keuze reist aantoonbaar mee tot in de pending-rij; `npm run check:client-reads` blijft groen; de wizard heeft nog steeds drie stappen.

#### Genomen besluiten bij de uitvoering (29 juli 2026)

1. **Géén stille voorselectie zolang er iets te kiezen valt.** De keuzestap start op
   "nog niets gekozen" en de knop "Verbind met {bank}" blijft uit tot de gebruiker
   kiest, met de hint *"Kies eerst waar de data terechtkomt."* Voorselecteren op
   "nieuw" zou het gedrag dat dit plan repareert (de app kiest zelf) alleen
   verplaatsen van de callback naar de wizard. Prijs, expliciet aanvaard: een
   bestaande gebruiker met één rekening doet één extra klik. De knop is óók uit
   zolang de lijst nog laadt — anders koppelt één snelle klik alsnog op "nieuw"
   voordat de keuze in beeld is (bevinding van de ux-review).
2. **De lijst = `bank_accounts`-rijen, en bewust ruimer dan "`is_active`".** De
   plantekst noemde `is_active` bij de eigenaarschapsvalidatie, maar dat sluit precies
   de B2-groep uit: "budgetteren staat uit" wordt door `syncBankAccountCompanion`
   uitgedrukt als `bank_accounts.is_active = false`. De regel is daarom: actief,
   **of** inactief mét een nog bestaand cash-bezit. Een rekening waarvan het
   cash-bezit is gedeactiveerd valt af (die is nergens zichtbaar; reactivatie is
   fase 7/SC-13), en een inactieve rekening zónder bezit ook (geen canoniek pad om
   haar terug te brengen). Die regel woont in `lib/truelayer/target-account.ts` en
   wordt door zowel de lijst als de `auth-link`-grens gelezen — stond hij op twee
   plekken, dan zou de lijst ooit iets tonen dat de route weigert.
3. **Buiten scope, bewust: een cash-bezit zónder companion-rij is geen kandidaat.**
   Er is geen FK-doel voor `target_bank_account_id`. Dat kost geen historie: om een
   CSV op een rekening te kunnen importeren is een `bank_accounts`-rij nodig, dus
   élke rekening mét transacties heeft er één. Companion-loze cash-bezittingen
   (o.a. direct na onboarding) hebben nul transacties, en daar is "nieuwe rekening
   aanmaken" het juiste antwoord.
4. **SC-25 geverifieerd, en het antwoord is "nul opties".** De onboarding-flow maakt
   cash-*bezittingen* aan (`assets`, `has_budget_tracking = true` als de
   budgetteren-module aan staat) maar géén `bank_accounts`-rijen: de RPC en het
   fallback-pad krijgen `bank_accounts: []` mee. Tijdens en direct na onboarding is
   de lijst dus leeg → lijst weggelaten, "nieuw" voorgeselecteerd, wizard loopt niet
   dood. Zelfde behandeling als een gefaalde lijst-load, dáár met een waarschuwing
   in `--warning`-tokens.
5. **Eigenaarschap is een expliciete `.eq('user_id', …)`, geen dubbelop.** De
   SELECT-policy op `bank_accounts` (en op `assets`/`transactions`) is bréder dan
   eigen-rij: huishoud-gedeelde partnerrijen komen erdoor. RLS is hier dus géén
   vangnet. Een koppeling op een partnerrekening zou transacties op de `user_id` van
   de koppelaar zetten terwijl dedup en unieke index per gebruiker sleutelen
   (duplicaten die geen enkele laag vangt), de partner blokkeren zodra fase 6 één
   actieve koppeling per rekening afdwingt, en via de historie-tellers andermans
   uitgavenvolume prijsgeven. Let op het contrast met fase 3: het *importpad* mag
   juist wél op een gedeelde rekening schrijven — daar is geen per-gebruiker-koppeling
   in het spel.
6. **De kolomwaarde is óók in de datalaag geborgd** (security-review, 🟠 die 🔴 zou
   worden zodra fase 5 de kolom consumeert). RLS scope't de RÍJ (`user_id`), niet de
   WAARDE van een FK-kolom daarop: de policy op `bank_connections` is `for all` met
   `using (auth.uid() = user_id)` en zónder `with_check`, `authenticated` heeft
   INSERT/UPDATE-grant, en de FK-check draait als tabel-eigenaar en omzeilt RLS. Een
   huishoud-partner kon dus vanuit de browser `target_bank_account_id` op een
   gedeelde rekening van het slachtoffer zetten — de route omzeild, niet gebroken.
   Gedicht met een `before insert or update`-trigger
   (`guard_bank_connection_target_account`, `security definer`, `search_path = ''`)
   die alleen bij een echte waardewijziging valideert, zodat `null` (consume-once) en
   ongerelateerde updates altijd door mogen. **Gevolg voor fase 5: de callback mag de
   kolom vertrouwen** — de waarde is per constructie owner-consistent of `null`.
7. **B2 wordt vóór de redirect toegepast, en alleen aanzettend.** `auth-link` zet
   budgetteren aan via `lib/budget-tracking.ts#setBudgetTracking` — de ENE schrijver
   van de budgetteringsas (asset-vlag + companion + `profiles.budgeting_active`),
   uitgesnoept uit `POST /api/assets/toggle-budget`, dat nu een dunne aanroeper is.
   Twee routes met elk hun eigen drieluik is precies hoe die vlaggen eerder uiteen
   liepen. De write gebeurt vóór de pending-rij: mislukt hij, dan is er nog niets
   gebeurd en komt er een nette fout in plaats van een genegeerd vinkje. Het pad zet
   budgetteren nooit **uit** — een uitgevinkt vinkje op een rekening die al trackt
   laat die keuze ongemoeid.
8. **Meegelift, uit dezelfde security-review:** `syncBankAccountCompanion` zocht de
   bestaande companion op `linked_asset_id` **zonder** eigenaarsfilter, terwijl die
   kolom globaal UNIQUE is en de SELECT-policy partnerrijen doorlaat. Een partner kon
   daarmee de companion-rij vóórclaimen, waarna de budgetteringskeuze van het
   slachtoffer stil niets deed (update geweigerd, insert op UNIQUE geketst, fout
   ingeslikt). `.eq('user_id', userId)` toegevoegd. Ouder dan deze fase, maar deze
   fase voegt de tweede aanroeper toe.
9. **De keuzestap is per rekening begrensd én de leesronde ook.** `MAX_TARGET_ACCOUNTS
   = 50` op de lijst-query plus `mapWithConcurrency(…, 5, …)` op de historie-queries:
   het aantal `bank_accounts`-rijen is niet door ons bepaald (de INSERT-policy staat
   een sessie toe er willekeurig veel aan te maken), en een ongebounde fan-out van
   twee queries per rekening raakt de gedeelde verbindingspool van *alle* gebruikers.
   Een keuzelijst boven de vijftig is als UI toch onbruikbaar. De ordening is
   deterministisch, dus de afkap is stabiel.
10. **Wat de wizard over de eerste ophaal zegt, komt uit `planInitialFetch`.** De
    accounts-route geeft per rekening `fetch_plan { mode, start_date }` mee; de UI
    formatteert die datum en rekent niets na. Nergens een tweede "−3 dagen". Een
    gefaalde historie-query gooit bewust (500) in plaats van als "0 transacties" te
    degraderen: dat laatste zou een volledige historische ophaal aankondigen op een
    rekening die al vol staat.
11. **Een al-gekoppelde rekening is in deze fase informatie, geen blokkade.** De route
    levert `linked_provider_name` en de optie toont "al gekoppeld aan {bank}", maar
    blijft kiesbaar — de blokkade (niet-kiesbaar + `conflict()`) is fase 6, mét de
    partiële unique-indexen die haar echt maken. Vastgelegd als verwacht gedrag in
    UAT-b, zodat het niet als defect wordt gemeld.
12. **Kleine dingen bewust wél/niet gedaan.** Wél: de bestaande foutbanner op de
    wizard van `red-*` naar `--negative`-tokens, en de stap-labels op klein scherm
    `sr-only` in plaats van `hidden` (met `hidden` verloren de inactieve stappen hun
    toegankelijke naam en hoorde een screenreader-gebruiker op mobiel kale cijfers).
    Niet: de hand-gerolde kicker/deck migreren naar `<Kicker>`/`<EditorialDeck>` — de
    pagina-kop ernaast is óók niet gemigreerd, en die verbouwing hoort niet in deze
    fase; en niet de `kern-*`-classes in het component naar `--module-active-*` —
    beide zijn toegestaan en op deze route identiek, en `kern-*` spiegelt de pagina.

**Restpunten die openstaan (niet blokkerend, wel bewust)**

- ~~**`TARGET_ACCOUNT_SELECT` leest `bank_accounts.iban` in plaintext**, terwijl de
  callback de omgekeerde doctrine documenteert.~~ — **✅ gedicht 30 juli.** Eerst de
  backfill afgemaakt (`scripts/encrypt-existing-bank-credentials.mjs`, na een
  sleutel-pariteitsproef tegen twee bestaande prod-rijen: lokale
  `ENCRYPTION_KEY_V1`/`IBAN_INDEX_KEY_V1` ontsleutelen wat prod schreef en leveren
  dezelfde blind index). Remote vóór → ná: `bank_accounts` 17 rijen met een
  plaintext IBAN waarvan 7 versleuteld → **15 versleuteld, 0 te backfillen**;
  `assets.account_number` 9 te backfillen → **0**; `bank_connection_accounts` was al
  rond. De twee resterende "plaintext" rijen per tabel zijn lege strings (`iban =
  ''`), bewust overgeslagen: een leeg veld versleutelen levert een zinloze
  ciphertext én laat álle IBAN-loze rekeningen op dezelfde blind index botsen.
  Daarna zijn `TARGET_ACCOUNT_SELECT` en de vier andere server-leespaden omgezet
  naar `iban_encrypted` + `decryptField` (zie het restpunt hieronder voor wat er
  bewust bleef staan), en bewaakt een eigen regressie-case
  (`ob-bank-target-account-select-encrypted-iban`) de kolomlijst.
- **Vier CLIENT-leespaden lezen `bank_accounts.iban`/`assets.account_number` nog in
  plaintext, en dat is de échte Stage B-blokkade (nieuw, 30 juli).**
  `app/(app)/core/cash/import/page.tsx`, `components/overview/transacties/transacties-analyse.tsx`,
  `lib/auto-categorize-context.ts` (via `ai-categorize-sheet` en de sleepmodus) en
  `lib/transfer-matching.ts` draaien met de browser-client en kunnen per definitie
  niet ontsleutelen — de sleutels zijn server-only. Ze omzetten is dus geen
  kolomwissel maar het verplaatsen van de read naar een loader/route, precies
  **fase b van ADR 0058**. Twee daarvan gebruiken de IBAN als MATCH-identifier
  (eigen-rekening-detectie), dus een halve migratie laat overboekingen stil als
  uitgave gelden. Server-side rest nog `app/api/budgetteren/setup/route.ts`
  (`iban:account_number`-alias) en `app/api/onboarding/save-own-data/route.ts`
  (`.eq('iban','')`-delete — geen read-for-display, maar breekt wél op de drop).
  Stage B kan niet vallen voor deze zeven weg zijn.
- **`saveAccount` in `components/app/cash-account-view.tsx` schrijft
  `bank_accounts.iban` ZONDER de dual-write (nieuw, securityreview 30 juli).** Het
  pad is vandaag dood (`AccountFormModal` wordt geïmporteerd maar `showAccountForm`
  gaat nergens op `true`), dus er staan 0 gedesynchroniseerde rijen. Wordt het
  herbedraad zonder `iban_encrypted`/`iban_hash`, dan levert dat een verouderd
  staartje in de koppelwizard én een verouderde eigen-rekening-match. Weghalen of
  via een route laten lopen die `ibanColumns()` uit `lib/bank-account-companion.ts`
  gebruikt.
- **De B2-write is niet transactioneel met de insert.** Faalt de insert ná een
  geslaagde budget-write, dan staat budgetteren aan zonder koppeling. Zichtbaar en
  zelf-herstelbaar via de bestaande toggle; geen securityprobleem.
- **Interpretatie van de UAT-b-regel "subscenario's van `['a','b','c']` af":** gelezen
  als "de dekking mag niet op a/b/c blijven staan", uitgevoerd als uitbreiding naar
  `['a','b','c','d']` op WF-CASH-30 plus een eigen criterium **WF-CASH-44** voor de
  onboarding-variant (SC-25). Pin-tellingen in `cash.engine.test.ts` bewogen mee: 43
  → 44 workflows, `exactWorkflows` blijft 26 (beide criteria zijn `ui-only`).
- Het patroon achter besluit 6 — *een kolomwaarde-invariant hoort in de datalaag, niet
  alleen in de route die de kolom vandaag schrijft* — kwam nu voor de derde keer terug
  (`guard_profiles_role`, de entitlement-kolommen, deze). Kandidaat voor een eigen
  ADR, met die drie als bewijsvoering. Niet in deze fase geschreven.

---

### Fase 5 — Callback: precedentie, consume-once, N rekeningen en rekeningtype (M) — ✅ uitgevoerd 30 juli 2026

> **Opgeleverd.** Nieuw: `app/api/bank-connect/relink/route.ts` (+ `route.test.ts`),
> `app/api/bank-connect/linked-accounts/route.ts` (+ `route.test.ts`),
> `lib/truelayer/cash-asset-backfill.ts` (+ `.test.ts`), `lib/truelayer/linked-account.ts`,
> `components/app/bank-connect/carrier-correction.tsx`, `lib/account-types.test.ts`,
> `docs/adr/0069-callback-haalt-alleen-saldo-op.md`. Gewijzigd:
> `app/api/bank-connect/callback/route.ts` (+ `route.test.ts`),
> `app/(app)/core/cash/connect/success/page.tsx`, `lib/truelayer/mapper.ts` (+ test),
> `lib/account-types.ts`, `lib/bank-account-companion.ts`,
> `components/app/bank-connect/target-account-choice.tsx`,
> `lib/regression-tests/suites/bank-connectie-flow.ts`,
> `scripts/check-client-data-reads.mjs`, `lib/architecture/archimate-model.ts`,
> `lib/architecture/archimate-concerns.ts`, `lib/architecture/integrations-model.ts`
> (+ test), `docs/architecture/architecture.json`, UAT-b (`lib/uat/acceptance/cash.ts`,
> `cash-checks.ts`, `cash.engine.test.ts`, `lib/uat/catalog.ts`, `lib/uat/flows/cash.ts`
> + `cash.test.ts`).
>
> **Migraties: geen** — zoals aangekondigd. De ene datalaag-bevinding uit de
> security-review is bewust bij fase 6 belegd (zie de restpunten).
>
> **Verificatie:** `npx tsc --noEmit` 0 fouten · volledige suite **686 bestanden
> (684 groen, 2 overgeslagen) / 8.686 tests (8.682 groen, 4 overgeslagen)** ·
> `npm run check:client-reads` groen (**44** bekende readers — één minder dan de 45
> van fase 4: de success-pagina is van de allowlist áf) · `npx eslint --quiet` schoon
> op alle gewijzigde bestanden. `npm run arch:diagram` opnieuw gedraaid (ADR's 69 → 70,
> de twee nieuwe routes in de diff).
>
> **De gepinde suite `kern-bank-connect-flow` is ongewijzigd; `bank-connectie-flow`
> kreeg één bewuste wijziging** en dat was de bijt-proef zelf: de
> bron-inspectie-case `ob-bank-callback-reused-account-decrypted-iban` viel rood zodra
> stap 2b naar `lib/truelayer/cash-asset-backfill.ts` verhuisde. De gegarandeerde
> invariant (lees `iban_encrypted`, niet de plaintext-kolom — Stage B) is niet
> veranderd, alleen haar adres; de case controleert nu de módule én dat de callback
> ernaar delegeert in plaats van een tweede inline kopie te maken.
>
> **UAT-b:** `WF-CASH-45` (precedentieketen, met "identiteit wint van de keuze" als
> expliciet vérwacht gedrag zodat het niet als defect wordt gemeld), `WF-CASH-46`
> (`mapAccountType`, `exact` — de check importeert de echte functie, geen kopie) en
> `WF-CASH-47` (het correctiemoment). Pin-tellingen: 44 → 47 workflows,
> `exactWorkflows` 26 → 27, flow-dekking 44 → 47.

**Kern.** FR3, FR4. De expliciete keuze wordt als schakel in de bestaande precedentieketen geschoven, niet als vervanger ervan. De volgorde wordt:

1. `external_account_id` (stabiele bank-identiteit, overleeft herautorisatie) — **blijft eerst**, ook boven de expliciete keuze: als deze externe rekening hier al eerder gekoppeld was, is dát de waarheid en zou de voorkeur een bestaande koppeling verhangen.
2. **`target_bank_account_id`** — alleen bij `link_intent = 'nieuw'`, alleen voor de **eerste onbediende TrueLayer-rekening**, en alleen als de doelrekening in deze callback nog niet door 1 geclaimd is. *(Sinds fase 4 is de EIGENAAR van de kolomwaarde geborgd in de datalaag: de trigger `guard_bank_connection_target_account` dwingt af dat ze naar een rekening van dezelfde gebruiker wijst, of `null` is. De GESCHIKTHEID wordt hier wél opnieuw getoetst — zie besluit 4.)*
3. `iban_hash`-fallback (bestaande rekening met gelijke IBAN) — voor de overige rekeningen uit een consent met N rekeningen, en op het herautorisatiepad.
4. Nieuwe rekening + cash-asset aanmaken (het huidige stap-3-blok).

> **[afwijking van de eerdere plantekst, bewust]** Deze twee middelste schakels
> stonden hierboven oorspronkelijk omgekeerd: `iban_hash` als 2, de voorkeur als 3.
> Dat is bij de uitvoering omgezet, en de reden staat in §0 zelf: de expliciete keuze
> moet van de **heuristiek** winnen, en `iban_hash` ís die heuristiek (§1 noemt hem
> ook zo). Stond hij boven de keuze, dan werd een keuze voor rekening A stil
> overruled zodra rekening B dezelfde IBAN draagt — precies de stille beslissing die
> fase 4/5 wegneemt. `external_account_id` is géén heuristiek maar identiteit, en
> blijft daarom eerst. Zie besluit 1.

**N teruggegeven rekeningen**: alle N blijven gekoppeld — de bank bepaalt wat er in de consent zit, en een rekening stilzwijgend laten vallen is een gegevensverlies dat de gebruiker niet ziet. De voorkeur bindt hooguit één ervan; de rest volgt de bestaande heuristiek. Dat is wat FR3 "geen stille onomkeerbare koppeling" in de praktijk betekent: niets is stil, en het **correctiemoment op de success-pagina hoort onlosmakelijk bij deze fase** — "dit is niet de goede rekening" met de mogelijkheid de koppeling naar een andere rekening te verhangen, en volgens §0 voor **élke** gekoppelde rekening, niet alleen de expliciet gekozene (SC-07). Descopen mag, maar dan verhuist het als aandachtspunt naar `lib/architecture/archimate-concerns.ts` (zie besluit 2).

**Rekeningtype overnemen van de bank (B3).** De aanmaak-tak stempelt vandaag élke nieuw aangemaakte rekening hard als betaalrekening — `subtype: 'checking'` op de asset (regel ~180 en ~220) en `account_type: 'checking'` op de `bank_accounts`-rij (regel ~239) — ongeacht wat TrueLayer als accounttype teruggeeft. Een spaarrekening of creditcard uit dezelfde consent (SC-05) krijgt daardoor het verkeerde label, en een creditcardschuld die als liquide betaalrekening meetelt vertekent netto vermogen, spaarquote én FIRE-motor. Dat is een grondslagfout: downstream is 'm niet meer te herstellen ("consume, don't recompute"). Deze fase mapt het TrueLayer-accounttype naar het TriFinity-`subtype`/`account_type` en zet `is_liquid` daarop af, met een expliciete val-terug op `checking` bij een onbekend type — plus een test, want dit raakt de vermogensgrondslag.

**Te wijzigen bestanden**

- `app/api/bank-connect/callback/route.ts` — het nieuwe precedentie-blok komt tussen de huidige "Stap 2: IBAN-fallback" en "Stap 2b: cash-as-asset backfill" te staan, zodat de backfill ook voor een via-voorkeur hergebruikte rekening draait. Ná de lus: `target_bank_account_id` op `null` (consume-once), in dezelfde update als de bestaande statuswijziging. In "Stap 3: pas nu aanmaken": de B3-typemapping. Bij een via voorkeur of IBAN hergebruikte rekening: het startpunt uit `planInitialFetch` (fase 1) initieel in `sync_cursor` zetten — **die helper wordt hier geconsumeerd, niet opnieuw gedefinieerd**.
- `lib/truelayer/mapper.ts` — de accounttype-mapping als pure functie, naast de bestaande transactie-mapping; niet inline in de route.
- `app/(app)/core/cash/connect/success/page.tsx` — per gekoppelde rekening tonen wélke TriFinity-rekening hem draagt, plus de correctie-actie.
- `app/api/bank-connect/relink/route.ts` *(nieuw, of een `PATCH` op een bestaande route)* — verhangt één `bank_connection_accounts`-rij naar een andere `bank_account_id`. **Verhangt alleen de koppeling, niet de reeds geïmporteerde transacties** — her-attributie van oude transacties staat expliciet buiten scope, en dat hoort in de UI-tekst van het correctiemoment te staan (restrisico 5).

**Migraties.** Geen.

**Tests**

- Acceptatiecriterium (a): bestaande rekening met CSV-historie gekozen → koppeling landt daarop, geen tweede rekening, geen tweede cash-asset, en `sync_cursor` start op nieuwste-transactiedatum −3 dagen.
- (b): nieuwe rekening expliciet gekozen → precies één nieuwe `bank_accounts` + één `assets`-rij.
- (c): drie TrueLayer-rekeningen, één voorkeur → drie koppelingen, de voorkeur bindt er precies één.
- (d): een al-gekoppelde rekening als doel → afgevangen (zie fase 6), geen tweede actieve koppeling.
- **(g, B3):** een spaarrekening en een creditcard in dezelfde consent → hun `subtype`/`account_type`/`is_liquid` volgen het banktype, niet `checking`; een onbekend type valt terug op `checking` zonder te crashen.
- **(h, SC-14):** dezelfde doelrekening achtereenvolgens aan twee verschillende providers → geen tweede rekening, geen tweede cash-asset. Deze werkte al "toevallig" via de precedentieketen maar was nooit een testcase.
- Consume-once: tweede callback op dezelfde connection past de voorkeur niet nogmaals toe; `link_intent` blijft wél staan.

**Afrondingscriterium.** Criteria (a)–(d) plus (g) en (h) aantoonbaar, en de precedentie is als één leesbaar blok met verantwoording gedocumenteerd — in de stijl van de bestaande stap-1/2/3-commentaren in dit bestand.

#### Genomen besluiten bij de uitvoering (30 juli 2026)

1. **De expliciete keuze staat bóven `iban_hash`, niet eronder** — de omkering hierboven
   toegelicht. De keten leeft als één blok met verantwoording bovenaan de lus in
   `callback/route.ts`, en schakel 1 wordt vooraf voor **álle** TL-rekeningen opgelost
   in plaats van onderweg. Anders zou de uitkomst van de lus-volgorde afhangen: een
   latere rekening kan de doelrekening op identiteit opeisen, en dan mag een eerdere
   rekening haar niet al via de voorkeur hebben ingepikt.
2. **Eén `boundAccountIds`-set: binnen één callback draagt één TriFinity-rekening
   hooguit één TL-rekening.** Schakels 2 en 3 slaan een al bezette rij over en vallen
   door naar aanmaak. Zonder die regel is dit bereikbaar: de gebruiker kiest rekening
   A, en TL-rekening 2 uit dezelfde consent hasht óók naar A — dan landen twee
   bankrekeningen op één rij, precies de dubbele koppeling die fase 6 hard blokkeert.
   Schakel 1 staat er bewust buiten: identiteit wint altijd, en bestaande duplicaten
   zijn fase 6's probleem, niet dat van deze lus.
3. **`link_intent = 'herautoriseren'` slaat schakel 2 over.** Op dat pad is de
   doelrekening een UX-kortere weg (fase 7 zet 'm mee), geen nieuwe binding —
   `external_account_id` claimt de rekening daar sowieso terug, en anders is
   `iban_hash` de juiste val-terug.
4. **De GESCHIKTHEID van de voorkeur wordt op callback-moment opnieuw getoetst**
   (bevinding uit de security-review). De datalaag-trigger uit fase 4 borgt alléén de
   *eigenaar*; `isEligibleTargetAccount` is een tweede, andere regel — een rekening
   waarvan het cash-bezit is gedeactiveerd mag geen koppeling dragen (SC-13), want dan
   komen saldo en transacties binnen op een rij die nergens in de app zichtbaar is.
   Tussen de wizard en de OAuth-terugkomst kan dat bezit gedeactiveerd zijn. De toets
   loopt via `loadTargetAccount` (dus geen tweede kopie van de eigendomsregel) en kost
   pas een leesronde nadat vaststaat dát er een rekening te binden is.
5. **Consume-once nult óók een NIET-toegepaste voorkeur.** Een voorkeur die overleeft
   omdat ze even niet paste (identiteit claimde de rekening, of het bezit was
   gedeactiveerd), past een volgende keer wél — en slaat dan stil toe, 90 dagen later,
   op een keuze die de gebruiker niet meer ziet. De write staat ná de lus in een eigen
   update en niet meegelift op de token-/statusupdate zoals de plantekst voorstelde:
   die draait vóórdat de voorkeur is toegepast, en dan zou het nullen "de callback is
   begonnen" betekenen in plaats van "de voorkeur is verbruikt". `link_intent` blijft
   staan en wordt door de callback nooit aangeraakt (getest).
6. **Géén `sync_cursor`-write — afwijking van de plantekst.** Fase 5 zou het startpunt
   uit `planInitialFetch` initieel in `sync_cursor` zetten. Sinds fase 1 is dat niet
   alleen overbodig maar schadelijk: de sync-route bepaalt het startpunt zélf zodra er
   nog géén cursor staat (`isFirstFetch = !date_from && !sync_cursor` →
   `loadNewestTransactionDate` → `planInitialFetch`). Een cursor hier zou (a) van
   "eerste ophaal" een gewone cursor-sync maken en de blok-lus (B8) op een lege
   hergebruikte rekening overslaan, en (b) het startpunt bevriezen op het koppelmoment
   — importeert de gebruiker tussen koppelen en synchroniseren nog een CSV, dan is de
   bevroren datum verkeerd. Criterium (a) is daarom getest op het *gedrag* (de eerste
   sync start op D−3, al gedekt door fase 1) en niet op de kolom. Eén eigenaar van het
   startpunt-contract, en dat is `lib/truelayer/initial-fetch.ts`.
7. **Twee woordenlijsten, één brug — en een latente bug die B3 juist bereikbaar
   maakte.** `bank_accounts.account_type` heeft een CHECK-constraint
   (`checking|savings|joint|business|contant_geld|other`); `assets.subtype` voor cash
   kent `savings_account` en `other_cash`. `syncBankAccountCompanion` schreef
   `asset.subtype` rechtstreeks door, dus een bezit met subtype `savings_account` liet
   die write op de constraint stuklopen — stil, want de fout wordt daar niet gelezen,
   dus de budgetteringskeuze deed niets. Zolang de bankkoppeling élke rekening als
   `checking` stempelde was dat pad onbereikbaar; B3 maakt het bereikbaar. Vandaar
   `cashSubtypeToAccountType`/`accountTypeToCashSubtype` in `lib/account-types.ts`,
   gebruikt door de mapper, de companion én de backfill. `BUSINESS_SAVINGS` → `business`
   (niet `savings`): de woordenlijst heeft één slot, en "zakelijk" is de eigenschap die
   `checking`/`savings` niet óók kan uitdrukken. `CREDIT_CARD` → `other_cash`/`other`
   mét **`is_liquid: false`** is een *vangnet*: TrueLayer levert kaarten via
   `/data/v1/cards`, dat wij niet aanroepen. `expected_return` blijft bewust 0 — een
   rendementsaanname (2,5% bij `savings_account` volgens `ASSET_SUBTYPE_DEFAULTS`) via
   een bankkoppeling de FIRE-motor injecteren is een grondslagwijziging waar niemand om
   vroeg.
8. **De cash-as-asset-backfill is uit de callback gelicht** naar
   `lib/truelayer/cash-asset-backfill.ts`, omdat het correctiemoment exact dezelfde stap
   nodig heeft en fase 7 (SC-13, reactivatie) erop voortbouwt. Drie dingen zijn daarbij
   veranderd, geen ervan cosmetisch: de lookup filtert nu op `user_id` (de inline versie
   niet — de bredere SELECT-policy liet een gedeelde partnerrij door, waarna dit pad een
   cash-bezit van de koppelaar aan de bankrekening van de partner had gehangen), het
   subtype komt uit `bank_accounts.account_type` in plaats van een hardgecodeerde
   `checking`, en de schrijffouten worden gelézen — een gefaalde `linked_asset_id`-write
   liet eerder een zwevend €0-cash-bezit achter en meldde `created: true`.
9. **De correctie leest niet meer client-direct.** De success-pagina is van de
   grandfather-allowlist áf: lezen gaat via `GET /api/bank-connect/linked-accounts`
   (45 → 44 readers). Het correctiemoment had er een tweede tabel bij nodig (welke
   `bank_accounts`-rij draagt dit?), en dat is het moment om een read te verhuizen in
   plaats van te verbreden (ADR 0058). Bijkomend: de volledige IBAN verlaat de server
   niet meer — alleen de laatste vier tekens, gelijk aan de wizard.
10. **De grens "wijzigen kan alleen vóór de eerste synchronisatie" is een SERVERregel.**
    Eerste opzet had 'm in React-state (`syncResults`), en dat overleeft geen refresh:
    de knop kwam terug op een koppeling die al had opgehaald, en verhangen zou dan de
    al geïmporteerde transacties achterlaten. `relink` weigert nu met een `conflict()`
    op `last_synced_at`/`sync_cursor` van de kóppeling, en de UI leest datzelfde
    serverfeit via `linked-accounts`. Bewust NIET "staan er transacties op de
    doelrekening": een rekening mét CSV-historie kiezen is juist het hoofdgeval van dit
    hele plan. Bevinding van zowel de ux-review (🔴) als de security-review (🟡) — één
    en dezelfde.
11. **`relink` verhangt en nult de cursor; de backfill draait erná.** De cursor was een
    uitspraak over de vórige rekening, dus `null` laat `planInitialFetch` het startpunt
    opnieuw bepalen op de historie van de nieuwe doelrekening. De backfill stond eerst
    vóór de update; nu erná, want een gefaalde verhuizing liet anders een vers
    €0-cash-bezit achter op een rekening die de koppeling niet kreeg. Restrisico aan
    deze kant staat als comment in de route.
12. **Een mislukte drager leest als fout, niet als variant.** `bank_account_id = null`
    betekent dat de aanmaak van de rekening is mislukt. De eerste opzet toonde "Landt op
    een nieuwe rekening" — niet te onderscheiden van de geslaagde flow. Nu een
    `--negative`-melding met een "probeer opnieuw"-uitweg, en de sync-knop uit (die zou
    stil falen). Bevinding van de ux-review (🔴).

**Restpunten die openstaan (niet blokkerend, wel bewust)**

- **Fase 6 erft één datalaag-taak.** — **✅ gedicht 30 juli 2026** door
  `trg_guard_bank_connection_account_bank_account` (migratie `20260729234928`); het
  aandachtspunt `fk-waarde-zonder-datalaag-guard` is uit
  `lib/architecture/archimate-concerns.ts` verwijderd. De beschrijving hieronder
  blijft staan als verantwoording. `bank_connection_accounts.bank_account_id` had
  géén guard-trigger, terwijl zijn zusterkolom `bank_connections.target_bank_account_id`
  die in fase 4 juist wél kreeg — met exact de motivatie die hier ook geldt: RLS scope't
  de RÍJ, niet de WAARDE van een FK-kolom daarop. De policy is `for all` voor rol
  `public`, dus een browserclient kan zijn eigen koppelrij naar een huishoud-gedeelde
  partnerrekening laten wijzen. Firsthand tegen remote geverifieerd: **geen cross-user
  read** (die rij mag hij onder dezelfde policy al lezen, en `syncAccountBalance` kan de
  partnerrij niet schrijven omdat de UPDATE-policy owner-gescoped is), maar wél
  eigen-data-vervuiling op een gedeelde rekening plus een misleidend dragerlabel. Belegd
  bij **fase 6**, die met de partiële unique-indexen toch al DDL op deze tabel doet, en
  vastgelegd als aandachtspunt `fk-waarde-zonder-datalaag-guard` in
  `lib/architecture/archimate-concerns.ts` (verwijder dat punt zodra de trigger staat).
- **Tijd-van-schrijven-aanname in de fase-4-trigger.** Zijn skip-branch laat een latere
  UPDATE door zodra `target_bank_account_id` én `user_id` ongewijzigd blijven. Zou
  `bank_accounts.user_id` ooit van eigenaar wisselen (huishoud-reparenting), dan bindt de
  callback een vreemde rij. Vandaag onbereikbaar — geen route schrijft die kolom, en de
  UPDATE-policy heeft een `WITH CHECK` — maar het is een voorwaarde bij een toekomstige
  reparenting-functie.
- **De bezet-check in `relink` is een TOCTOU** tot de partiële unique-index van fase 6
  landt. Twee gelijktijdige verhuizingen naar dezelfde rekening kunnen er beide door.
  Eigen data, geen leak; de index is het echte slot. — **✅ gedicht 30 juli 2026**:
  `bank_connection_accounts_one_active_per_bank_account` staat op remote; de
  routecontrole is nu de vriendelijke variant (409 mét banknaam en uitweg) en loopt
  via de gedeelde `resolveTargetAccount`.
- **Contrast van `text-kern-700` op 12px** (de "Wijzigen"-link) zit met de
  standaard-accentkleur naar schatting net boven AA, maar `kern` is gebruikersinstelbaar.
  Icoon + underline geven al een niet-kleur-signaal. Een meetronde over de gegenereerde
  `--color-kern-700`-varianten is een eigen, systemische taak (zelfde klasse als de
  Horizon-warm-goud-casus in de kwaliteitstoets), niet iets voor deze fase.
- **De silent catch in `handleSync`** op de success-pagina (een gefaalde sync laat de knop
  terugspringen zonder melding) is ouder dan deze fase en bewust niet meegenomen —
  fase 8 raakt die respons toch al.

---

### Fase 6 — Blokkade op dubbele actieve koppeling (S/M) — ✅ uitgevoerd 30 juli 2026

> **Opgeleverd.** Migratie:
> `supabase/migrations/20260729234928_bank_connection_accounts_one_active_link_and_owner_guard.sql`
> (toegepast op remote; versienummer door remote toegekend). Nieuw:
> `lib/truelayer/target-account.test.ts`. Gewijzigd:
> `lib/truelayer/target-account.ts`, `app/api/bank-connect/auth-link/route.ts`
> (+ test), `app/api/bank-connect/relink/route.ts` (+ test),
> `app/api/bank-connect/accounts/route.ts` (+ test),
> `app/api/bank-connect/callback/route.ts` (+ test),
> `app/(app)/core/cash/connect/page.tsx`,
> `components/app/bank-connect/target-account-choice.tsx` (+ test),
> `components/app/bank-connect/carrier-correction.tsx`,
> `lib/architecture/archimate-concerns.ts` (aandachtspunt
> `fk-waarde-zonder-datalaag-guard` **verwijderd**), UAT-b
> (`lib/uat/acceptance/cash.ts`, `cash-checks.ts`, `cash.engine.test.ts`,
> `lib/uat/catalog.ts`, `lib/uat/flows/cash.ts` + `cash.test.ts`).
>
> **Pre-flight (0d), opnieuw gemeten in hetzelfde tijdvenster als de migratie:**
> dubbele actieve koppelingen per rekening **0**, dubbele
> `(user_id, external_account_id)` **0**. Extra gemeten: 2 koppelrijen totaal, 2
> actief, 0 zonder drager, **0 met een vreemde drager** (dus geen bestaande
> eigenaarschapsvervuiling die de nieuwe guard zou blokkeren). **Niets op te
> ruimen** — de "oudste wint"-regel is niet toegepast omdat er geen overtreders
> waren.
>
> **Datalaag-verificatie op remote, met rolsimulatie** (tien controles in één
> transactie-omsloten `DO`-blok, deels als rol `authenticated` met
> `request.jwt.claims`, daarna opgeruimd; eindstand identiek aan de begintoestand:
> 2 rijen, 2 actief, 0 proefrijen): tweede ACTIEVE koppeling op dezelfde rekening →
> `23505` op `bank_connection_accounts_one_active_per_bank_account`; tweede
> **INACTIEVE** koppeling → toegestaan; dezelfde `external_account_id` tweemaal →
> `23505` op `bank_connection_accounts_one_per_external`; drager naar andermans
> rekening (UPDATE én INSERT) → `42501 Deze rekening bestaat niet of is niet van
> jou`; drager op `null`, drager naar een eigen rekening, en een ongerelateerde
> UPDATE op een rij die de drager al draagt → alle drie doorgelaten.
>
> **Verificatie:** `npx tsc --noEmit` 0 fouten · volledige suite **687 bestanden
> (685 groen, 2 overgeslagen) / 8.720 tests (8.716 groen, 4 overgeslagen)** — +1
> bestand en +34 tests t.o.v. fase 5 · `node scripts/check-client-data-reads.mjs`
> groen (**44** bekende readers, 0 nieuwe) · `npx eslint --quiet` schoon op alle
> gewijzigde bestanden · `npm run arch:diagram` opnieuw gedraaid (ADR's 71, geen
> diff — indexen en triggers worden niet gescand).
>
> **Vier bijt-proeven, alle vier voor de juiste reden rood en teruggedraaid:**
> `isSelectableTargetOption` → altijd `true` (3 rood, incl. de disabled-assertie in
> de UI); de bezet-tak in `resolveTargetAccount` uitgezet (2 rood: de 409 op
> `auth-link` én de regel zelf); de `occupyingLinks`-seeding van `boundAccountIds`
> uitgezet (2 rood: schakel 3 → 4 en schakel 2 → 4); de `linkedCount === 0`-uitgang
> uitgezet (2 rood).
>
> **UAT-b:** `WF-CASH-48` / `UAT-CASH-48` — één criterium over de drie lagen
> (index, 409, zichtbaar-maar-uitgeschakeld), `kind: 'exact'`, en de check
> importeert de échte `isSelectableTargetOption` + `occupiedTargetAccountMessage`
> in plaats van een kopie. Pin-tellingen bewust meebewogen: 47 → 48 workflows,
> `exactWorkflows` 27 → 28, flow-dekking 47 → 48.
>
> **Reviews:** `security-specialist` (geen 🔴, één 🟡 + drie 🟢) en
> `ux-review-expert` (twee 🔴, twee 🟡) — alle 🔴 en 🟡 verwerkt behalve twee
> bewust doorgeschoven punten; zie de besluiten en restpunten hieronder.

**Kern.** FR5. Twee partiële unique-indexen maken het onmogelijk in de database, en de UI vangt het af vóórdat de gebruiker naar de bank vertrekt.

**Migraties**

```sql
create unique index if not exists bank_connection_accounts_one_active_per_bank_account
  on public.bank_connection_accounts (bank_account_id)
  where is_active and bank_account_id is not null;

create unique index if not exists bank_connection_accounts_one_per_external
  on public.bank_connection_accounts (user_id, external_account_id);
```

Draait **na** de pre-flight uit fase 0d, in hetzelfde tijdvenster (de 0/0-meting van 29 juli telt niet mee — fase 4 en 5 maken juist nieuwe koppelingen aan). De tweede index verankert bovendien de bugfix van 29 juli (`external_account_id`-eerst-dedup) op databaseniveau in plaats van alleen in code.

**Erfenis uit fase 5 — neem dit mee in dezelfde migratie:** een guard-trigger op
`bank_connection_accounts.bank_account_id`, spiegelbeeld van
`guard_bank_connection_target_account` uit fase 4 (`security definer`,
`search_path = ''`, `null` toegestaan, skip-branch bij een ongewijzigde waarde). Reden:
RLS scope't de RÍJ, niet de WAARDE van een FK-kolom daarop, en de policy op deze tabel
is `for all` voor rol `public` — een browserclient kan zijn eigen koppelrij dus naar een
huishoud-gedeelde partnerrekening laten wijzen. Zie het restpunt bij fase 5 en het
aandachtspunt `fk-waarde-zonder-datalaag-guard` in `lib/architecture/archimate-concerns.ts`
(verwijder dat punt zodra de trigger staat). Dit is óók de fase die de TOCTOU in de
bezet-check van `POST /api/bank-connect/relink` echt dicht: de partiële index is het slot,
de routecontrole is de vriendelijke variant.

**Te wijzigen bestanden**

- `app/api/bank-connect/accounts/route.ts` — markeert rekeningen met een actieve koppeling als niet-kiesbaar, met reden.
- `app/(app)/core/cash/connect/page.tsx` — zo'n rekening is zichtbaar maar uitgeschakeld ("al gekoppeld aan {bank}"), niet weggelaten: verdwenen opties zijn verwarrender dan uitgelegde opties.
- `app/api/bank-connect/auth-link/route.ts` — server-side dezelfde controle (de UI-check is comfort, niet de grens) → `conflict('…')` uit `lib/api/respond.ts`.

**Tests**

- Migratie: een tweede actieve koppeling op dezelfde `bank_account_id` faalt; een **inactieve** tweede rij mag wél (dat is precies de soft-disconnect-situatie die de callback hergebruikt).
- Route: `auth-link` met een al-gekoppelde doelrekening → 409 met NL-melding, geen pending-rij.

**Afrondingscriterium.** Acceptatiecriterium (d) aantoonbaar op zowel DB- als routeniveau.

#### Genomen besluiten bij de uitvoering (30 juli 2026)

1. **Eén migratie, drie invarianten, en de trigger vóór de indexen.** De twee
   partiële unieke indexen en de eigenaarschapsguard zitten in dezelfde migratie —
   één DDL-venster op één tabel, zoals de plantekst vroeg. De volgorde binnen die
   migratie is géén detail: een BEFORE ROW-trigger draait vóór indexonderhoud, dus
   een poging op andermans rekening loopt op `42501` van de guard en **nooit** op
   `23505` met constraintnaam. De unieke index vertelt daardoor niets over het
   bestaan van andermans koppelingen. Empirisch vastgesteld met drie
   rollback-probes (security-review).
2. **De geschiktheidsregel is uitgebreid, niet gedupliceerd: `resolveTargetAccount`.**
   `lib/truelayer/target-account.ts` bezat al de eigenaarschaps- en
   geschiktheidsregel; FR5 is er als dérde laag bij gekomen in één aanroep
   (`loadOccupyingLink(s)` + `occupiedTargetAccountMessage`), zodat geen aanroeper
   de helft kan vergeten. Vier afnemers lezen nu dezelfde regel: de keuzelijst,
   `auth-link`, `relink` en de callback. De inline bezet-query die fase 5 in
   `relink` had staan is vervangen; de accounts-route heeft haar eigen
   link-query ingeleverd.
3. **400 en 409 zijn verschillende afwijzingen, en de ORDENING is de control.**
   "Bestaat niet / niet van jou / niet geschikt" blijft 400 met één vaste tekst;
   "bestaat, is van jou, maar bezet" is 409 mét banknaam en uitweg — de gebruiker
   kan die toestand zélf opheffen en verdient dus geen onbruikbare 400. De
   bezet-toets valt bewust **ná** de eigenaarschapstoets, anders wordt de 409 een
   existentie-orakel op andermans id's. Dat kruispunt (een bezette
   *partner*rekening → 400, nooit 409-met-banknaam) staat nu vast in een test, op
   verzoek van de security-review: het is precies de assertie die een latere
   "parallelliseer die twee queries"-optimalisatie zou breken.
4. **`linked_provider_name` is het kiesbaarheidsfeit, niet een tweede boolean.**
   Bewust géén `selectable`-veld ernaast — dat zou een tweede bron voor hetzelfde
   feit zijn. Met één randgeval dat er wél bij hoorde: een bezette rekening
   waarvan de banknaam niet te lezen is mag niet als `null` (= vrij) terugkomen,
   want dat is een fail-open control. Vandaar `occupyingProviderLabel` met
   `UNKNOWN_OCCUPYING_PROVIDER_LABEL` ("een andere bank") en een test die dat pint.
5. **De callback moest mee, en dat was geen bijzaak.** `supabase-js` gooit niet op
   een unieke index — het geeft een `error` terug die de lus niet las. Zonder
   ingreep zou een IBAN-treffer (schakel 3) op een al gekoppelde rekening dus
   **stil** geen koppelrij opleveren: geen fout, geen rekening, geen data. Twee
   dingen daarom veranderd: (a) `boundAccountIds` wordt nu óók geseed met
   rekeningen die búiten deze callback een actieve koppeling dragen, zodat schakel
   2 en 3 ze overslaan en doorvallen naar aanmaak; (b) de koppelrij-write leest
   zijn `error`, slaat bij falen de saldo-stap over (een saldo op een rekening
   zonder koppelrij is een cijfer dat niemand kan verklaren) en telt mee in
   `linkedCount`.
6. **Schakel 1 (identiteit) valt bewust NIET door — en krijgt daarom een zichtbare
   uitgang.** Bevinding van de security-review (🟡), bereikbaar zonder aanvaller:
   koppel bank A op rekening X → verbreken (X komt vrij) → bank B op X → bank A
   herverbinden. Schakel 1 hergebruikt de rij van A en zet `is_active` terug op
   `true`, wat botst met de koppeling van B. Doorvallen naar schakel 4 mag daar
   níet: de historische transacties staan op X, en de koppeling naar een verse rij
   verhuizen laat ze verweesd achter. De write blijft dus geweigerd, maar de flow
   mag geen succes melden: landt er van een consent **geen enkele** koppelrij, dan
   redirect de callback naar `?error=geen_koppeling` (of `?bank_error=1` op het
   onboardingpad) met NL-uitleg op de wizard. Faalt er één van meerdere, dan gaan
   de geslaagde koppelingen wél door naar de success-pagina — die toont per
   rekening wie hem draagt. Het vólledige herstelpad (per rekening zichtbaar, met
   actie) hoort bij fase 7; zie de overdracht.
7. **De blokkade in de UI is zichtbaar-maar-uitgeschakeld, en heeft een echte
   uitweg.** Een verdwenen optie is verwarrender dan een uitgelegde optie. De reden
   staat bínnen het `<label>` (dus in de toegankelijke naam van de radio), de
   **uitweg eronder als echte link** naar `/core/assets/cash/{bank_accounts.id}` —
   de bestaande, stabiele redirect naar `/overzicht/cashflow#rekening-{assetId}`
   die de "Open volledig"-link op de cash-kaart al gebruikt, in een nieuw tabblad
   omdat de koppelflow alleen in React-state leeft. Bevinding van de ux-review
   (🔴): "verbreek die koppeling eerst" was een instructie zonder pad. De link
   staat bewust buiten het label — een link binnen een label dat een radio omsluit
   vecht met de radio om de klik.
8. **Contrast: de redenregel is van `--ink-3` naar `--ink-2`/`text-xs` gegaan.**
   Ook een ux-bevinding (🔴): `--ink-3` haalt op 11–12px geen AA (gemeten 3,28:1 op
   `--subtle`, 3,65:1 op `--paper`), en fase 6 maakt de blootstelling permanent
   doordat een bezette rij structureel op `--subtle` staat. Alleen de redenregel is
   omgezet — die is de énige verklaring waarom de optie uit staat. De ándere
   meta-regels (banknaam, IBAN-staart, historie) zijn bewust NIET meegegaan: dat is
   een systemisch tokenprobleem dat overal in de app speelt, en het per-state
   omzetten zou blocked en niet-blocked rijen uit elkaar laten lopen. Als restpunt
   opgenomen.
9. **De "alles bezet"-melding staat nu op béide oppervlakken.** Het correctiemoment
   had er al één; de wizard niet, en daar was een lijst met louter grijze opties
   zonder duiding het gevolg (ux-review 🟡). Dezelfde toestand, één uitleg. "Nieuwe
   rekening aanmaken" blijft altijd de werkende uitkomst, dus dit is geen
   doodlopende weg.
10. **Kleur: geen stoplicht.** Bezet is een *toestand*, geen fout of waarschuwing —
    dus uitsluitend ink-/subtle-tokens en het neutrale `Link2`-icoon, geen
    `AlertTriangle` en geen warning-tokens op de kaart zelf. Bevestigd door de
    ux-review.

**Restpunten die openstaan (niet blokkerend, wel bewust)**

- **Het per-rekening zichtbare herstelpad ontbreekt nog (→ fase 7).** Besluit 6
  maakt de "geen enkele koppeling"-uitkomst zichtbaar, maar de gedeeltelijke variant
  (één van N rekeningen kon niet gekoppeld worden omdat haar drager bezet is) is
  alleen in de serverlog te zien. Fase 7 bouwt de derde icoon-toestand en de
  herstelactie op de rekeningkaart; dáár hoort deze toestand een gezicht te krijgen,
  met dezelfde uitweg als de 409-tekst ("verbreek die koppeling eerst").
- **De guard leunt op een AFWEZIGE `with check` op de policy.** De trigger
  vergelijkt de eigenaar van de drager met `new.user_id`; dat `new.user_id`
  betrouwbaar is komt uit `Users can manage own connection accounts`, die `for all`
  is met `using (auth.uid() = user_id)` en `with_check = null` — Postgres hergebruikt
  dan `USING` als post-write-check, ná de BEFORE-trigger. Zet iemand daar later een
  expliciete `with check (true)` op, dan kan een rij mét `user_id` = slachtoffer en
  een drager van dat slachtoffer de guard passeren. Geen leesleak, wél vervuiling.
  Vastgelegd als nagekomen aantekening in de migratie; hetzelfde geldt voor de
  fase-4-guard. Fatsoenlijk repareren = `with check ((select auth.uid()) = user_id)`
  expliciet maken op beide policies — eigen stap, `supabase-db-specialist`.
- **`--ink-3` haalt op zijn normale gebruiksmaat (11–12px) geen AA**, op zowel
  `--paper` als `--subtle`. Pre-existing tokeneigenschap, niet door deze fase
  geïntroduceerd, maar wél door deze fase gemeten. Zelfde klasse als de
  Horizon-warm-goud-casus uit de kwaliteitstoets: een eigen, systemische ronde
  (token donkerder, of de regel "ink-3 alleen ≥14px of decoratief" in de ui-ux-skill).
- **`POST /api/bank-connect/disconnect` is nu load-bearing voor FR5** (de 409 stuurt
  de gebruiker ernaartoe) maar bouwt zijn fouten met de hand
  (`NextResponse.json({ error }, { status: 500 })`) in plaats van via
  `lib/api/respond.ts`, en valideert zijn body niet met zod. Eigenaarschap en
  foutlezing zijn wél in orde, dus geen leak — puur ADR-0044-consistentie op een
  route die door deze fase belangrijker is geworden.
- **Een gefaalde koppelrij-write laat de in schakel 4 aangemaakte `bank_accounts`- en
  `assets`-rij achter.** Alleen bereikbaar op het aanmaakpad (waar een botsing
  praktisch onmogelijk is, want de rij is vers); wél zichtbaar in de log. Geen
  opruiming ingebouwd: een delete in een OAuth-callback is een groter risico dan een
  zwevende €0-rekening die de gebruiker zelf kan verwijderen.
- **De in-app regressiesuites zijn NIET gedraaid** (`kern-bank-connect-flow`,
  `bank-connectie-flow`, `beheer-bank-connect`): die lopen via de server-runner tegen
  een draaiende `npm run dev` en vragen `REGRESSION_TEST_EMAIL`/`_PASSWORD`. Niets in
  deze fase raakt hun assertions — de bron-inspectie-case
  `ob-bank-callback-reused-account-decrypted-iban` bewaakt de backfill-module en de
  delegatie, en die zijn ongewijzigd — maar dat is een leesoordeel, geen groen.
  Handmatig draaien vóór de release blijft staan.

---

### Fase 7 — Herkoppelen vanaf de rekening: derde icoon-toestand + herstelactie (B6) (M/L) — ✅ uitgevoerd 30 juli 2026

> **Opgeleverd.** Nieuw: `lib/bank-connection-status.ts` (+ `.test.ts`) — de ene
> afleiding; `lib/bank-link-loader.ts` (+ `.test.ts`) — de server-loader;
> `lib/truelayer/start-relink.ts` (+ `.test.ts`) — de gedeelde clientkant van de
> herstelactie; `lib/cash-detail-target.ts` (+ `.test.ts`);
> `components/app/bank-connect/connected-account-card.test.tsx`,
> `sync-status-badge.test.tsx`, `app/(app)/core/cash/connect/page.test.tsx`,
> `.../success/page.test.tsx`, `components/overview/transacties/transactie-tijdlijn.test.tsx`.
> Gewijzigd: `components/core/account-source-icon.tsx` (+ test),
> `components/core/vermogen-asset-card.tsx`, `components/app/cash-overview.tsx`,
> `components/app/cash-account-view.tsx`,
> `components/overview/transacties/transactie-tijdlijn.tsx`,
> `components/app/bank-connect/connected-account-card.tsx`, `sync-status-badge.tsx`,
> `target-account-choice.tsx`, `app/(app)/overzicht/cashflow/page.tsx` +
> `cashflow-below-fold.tsx`, `app/(app)/core/cash/connect/page.tsx` +
> `success/page.tsx`, `app/api/bank-connect/auth-link/route.ts` (+ test),
> `callback/route.ts` (+ test), `linked-accounts/route.ts` (+ test),
> `sync/route.ts`, `balances/route.ts`, `lib/truelayer/cash-asset-backfill.ts`
> (+ test), `lib/truelayer/linked-account.ts`, `lib/truelayer/errors.ts`,
> `lib/truelayer/client.ts`, `lib/architecture/integrations-model.test.ts`,
> `lib/regression-tests/suites/bank-connectie-flow.ts`, `specs/.../scenarios.md`.
>
> **Migraties: geen** — zoals aangekondigd; `link_intent` komt uit fase 4.
>
> **Verificatie:** `npx tsc --noEmit` 0 fouten · volledige suite **695 bestanden
> (693 groen, 2 overgeslagen) / 8.858 tests (8.854 groen, 4 overgeslagen)** — +8
> bestanden en +138 tests t.o.v. fase 6 · `node scripts/check-client-data-reads.mjs`
> groen (**44** bekende readers, 0 nieuwe; niets toegevoegd) · `npx eslint --quiet`
> schoon op alle gewijzigde bestanden · `npm run arch:diagram` gedraaid (diff: +1
> integratie-client `lib/truelayer/start-relink.ts`, +2 componenten; ADR's 71).
>
> **Bijt-proeven, alle rood om de juiste reden en teruggedraaid:** de
> intentie-wint-regel in `deriveBankLinkHealth` omgedraaid (2 rood: een zacht
> ontkoppelde rekening werd `linked`/`linked-broken` i.p.v. `manual`);
> `.eq('is_active', true)` uit de loader (1 rood, zelfde regel op loader-niveau);
> `provider_id` terug in de gedeelde herstel-body (3 rood over beide oppervlakken);
> de kaartband uitgezet (4 rood); `exceptConnectionAccountId` weggehaald (5 rood, alle
> `expected 409 to be 200`); de reactivatie-tak uitgezet (3 rood); de
> botsings-classificatie verslapt naar "elke 23505" (2 rood, precies op het
> onderscheid `drager_bezet` vs. `geen_koppeling`); het contrast teruggezet naar
> `text-warning` (1 rood); de val-terug-uitweg + spoof-guard uitgezet (3 rood); de
> 401-uitweg in `handleSync` uitgezet (2 rood).
>
> **Reviews:** `security-specialist` (geen 🔴/🟠; twee 🟡 en zes 🟢 — beide 🟡's en
> drie 🟢's verwerkt) en `ux-review-expert` (één 🔴, zeven 🟠, vijf 🟡 — 🔴 en alle
> 🟠 verwerkt, de 🟡's grotendeels; score 8/10). Wat bewust is doorgeschoven staat
> onder de restpunten.

**Kern.** B6, uit SC-12/SC-13. De autorisatie verloopt elke 90 dagen, dus zonder dit pad loopt iedere gebruiker er binnen een kwartaal tegenaan — en vandaag ziet hij dat niet eens: `components/core/account-source-icon.tsx` kent precies twee toestanden (`connected` → `Link2`, niet-verbonden → `FileText`) en een verbroken of verlopen koppeling valt stil terug in de tweede. Visueel is een dode koppeling dan niet te onderscheiden van een rekening die nooit gekoppeld was.

Vier onderdelen, in deze volgorde:

1. **Derde icoon-toestand.** `AccountSourceIcon` gaat van een `connected: boolean` naar drie toestanden (`linked` / `lost` / `manual`), inclusief `ACCOUNT_SOURCE_TOOLTIP` en `accountSourceSuffix()` — die laatste draagt de betekenis in de accessible name van de omvattende control, want het symbool zelf blijft `aria-hidden`. **Let op de bestaande conventie in dat bestand:** dit symbool is herkomst, géén status, en heeft daarom bewust geen stoplichtkleur; "verbinding kwijt" is de eerste toestand die dáár tegenaan schuurt. Ofwel de derde toestand blijft binnen de inkt-tonen (aanbeveling: eigen glyph, geen kleur), ofwel het commentaar in dat bestand wordt bewust bijgewerkt. Niet stilzwijgend een rode tint erin schuiven.
2. **B4 meenemen:** handmatige rekeningen krijgen géén symbool — dat is de normale toestand. Dat is een aanpassing op de al gebouwde integratie in `components/app/cash-overview.tsx`; de filterchips op Transacties (`transactie-tijdlijn.tsx#AccountButton`) houden hun bestaande gedrag.
3. **Herstelactie op de rekeningkaart.** Klik op de indicator start een herkoppeling mét deze rekening als doelrekening en `link_intent = 'herautoriseren'` op de pending-rij (kolom uit fase 4), zodat de wizard de keuzestap overslaat — de doelrekening is bekend en `external_account_id` claimt 'm bij de callback sowieso terug. Dit is een UX-kortere weg, geen nieuwe backend-regel.
4. **Reactivatie van een gedeactiveerd cash-bezitting (SC-13).** Hergebruikt de callback een rekening waarvan het gekoppelde `assets`-rij `is_active = false` is, dan reactiveert diezelfde stap dat bezitting — anders herstel je een koppeling op een rekening die nergens in de UI verschijnt, terwijl saldo en transacties wél binnenkomen. `loadAllCashRekeningen()` in `cash-overview.tsx` filtert `cashAssets` immers op `is_active !== false` vóórdat de koppelstatus wordt bepaald.

**`expired` en `revoked` zijn één herstelpad** (§0): geen enkel codepad schrijft ooit `'revoked'`, dus de copy is neutraal ("verbinding kwijt — verbind opnieuw") en suggereert geen onderscheid dat de app niet kent.

**Te wijzigen/nieuwe bestanden**

- `components/core/account-source-icon.tsx` — drie toestanden + tooltips + suffix; alle call-sites mee.
- `components/app/cash-overview.tsx` en `components/core/vermogen-asset-card.tsx` — de kaart leest de koppelstatus (`bank_connections.status` via `bank_connection_accounts`) en toont indicator + herstelactie.
- `app/api/bank-connect/auth-link/route.ts` — accepteert `link_intent`; bij `'herautoriseren'` is `target_bank_account_id` verplicht.
- `app/(app)/core/cash/connect/page.tsx` — bij `link_intent = 'herautoriseren'` de keuzestap overslaan. **De drie stap-ids blijven bestaan** (R3): dit is een overgeslagen stap, geen verwijderde.
- `app/api/bank-connect/callback/route.ts` — de reactivatie van het cash-bezitting, in "Stap 2b: cash-as-asset backfill".

**Migraties.** Geen — `link_intent` komt uit fase 4.

**Tests**

- Icoon: drie toestanden renderen het juiste symbool en de juiste accessible-name-suffix; een verbroken koppeling is niet gelijk aan "handmatig"; een puur handmatige rekening toont géén symbool (B4).
- Reconnect op een rekening met `assets.is_active = false` → na de callback staat die op `true` en verschijnt de rekening weer op cashflow (SC-13, het incident van vandaag).
- `auth-link` met `link_intent = 'herautoriseren'` zonder `target_bank_account_id` → 400.
- De gepinde regressietest `bank-connect-page-steps` blijft groen (stap-**ids** ongewijzigd).

**Afrondingscriterium.** Een verlopen koppeling is op de rekeningkaart herkenbaar, in twee klikken te herstellen zonder de volledige wizard, en een gedeactiveerd cash-bezitting is daarna weer zichtbaar.

#### Genomen besluiten bij de uitvoering (30 juli 2026)

1. **De toestand heet `linked-broken`, niet `lost`, en `expired`/`revoked` zijn één
   uitkomst.** De plantekst noemde `lost`; `linked-broken` is gekozen omdat de
   loader, de wire-vorm en het component dezelfde drie woorden dragen en de naam dan
   overal letterlijk hetzelfde betekent. `revoked` wordt door geen enkel codepad
   geschreven, dus het is géén tweede toestand — een toestand die niet kan optreden
   wordt nooit getest, en de copy zou een detectie suggereren die de app niet heeft.
   `pending` is om dezelfde reden bewust géén vierde uitkomst: de callback zet de
   verbinding op `active` vóórdat hij koppelrijen schrijft.
2. **Het amendement op de icoon-docstring is doorgevoerd, mét twee grenzen.** De
   regel "puur herkomst — géén status, dus geen stoplichtkleur" klopte zolang er twee
   toestanden waren die beide normaal zijn. `linked-broken` is status én actie en
   krijgt daarom `--warning` (aandacht, geen verlies: een kwartaalautorisatie die
   verloopt is verwacht onderhoud). Grens 1: het glyph (`Unlink`) draagt de betekenis
   óók zonder kleur. Grens 2: de **14-dagen-vooraankondiging hoort NIET op het
   icoon** — die zou elk kwartaal twee weken lang waarschuwen zonder dat er iets stuk
   is, en dan leert de gebruiker 'm te negeren op het moment dat het wél stuk is.
3. **Vier signalen, één afleiding, en de volgorde van de regels IS het contract.**
   `deriveBankLinkHealth` (`lib/bank-connection-status.ts`) leest
   `bank_connection_accounts.is_active`, `bank_connections.status`,
   `token_expires_at` en `last_synced_at`. Regel 1–2: geen koppelrij óf zacht
   ontkoppeld → `manual`. **Gebruikersintentie wint van storing**: een bewust
   verbroken koppeling die daarna verliep vraagt geen aandacht meer. Regel 3–4:
   status `expired`/`revoked` óf een verstreken `token_expires_at` → `linked-broken`
   (de datum is nodig náást de status, want die gaat pas op `expired` bij een
   mislukte refresh, en die draait alleen als iemand synchroniseert). `last_synced_at`
   is bewust géén onderdeel van het verdict — nooit gesynchroniseerd is niet kapot —
   maar reist wél mee, zodat detail en badge hun versheidstekst uit hetzelfde object
   lezen. Drie oppervlakken consumeren die ene functie: kaart-icoon, `SyncStatusBadge`
   en `ConnectedAccountCard`; de drie eigen kopieën van `status === 'expired' ||
   'revoked'` zijn weg.
4. **Bron van waarheid = de loader.** `lib/bank-link-loader.ts` levert per
   `bank_accounts`-rij een `CashBankLink`; `cash-overview.tsx` en
   `cash-account-view.tsx` consumeren dat en hun twee client-directe
   `bank_connection_accounts`-reads zijn weg. De query leest alléén actieve
   koppelrijen — dat is regel 1+2 van de afleiding samengevouwen in de query — maar
   geeft `linkIsActive: true` dóór in plaats van de uitkomst te hardcoderen, zodat er
   geen tweede regel ontstaat. Fail-open (`return []` bij een leesfout) is bewust: de
   val-terug is `manual`, dus een storing levert nooit een onterecht "verbinding
   kwijt".
5. **B4 was al af.** De plantekst vroeg "handmatige rekeningen krijgen géén symbool";
   fase 5 had dat al ingebouwd (`bankLinked={… ? true : undefined}` op de kaart). Het
   component rendert `manual` wél — de filterchips op Transacties houden hun
   bestaande gedrag, precies zoals B4 voorschrijft — en de kaart laat de prop weg.
6. **Het herstelpad loopt NIET door de wizard, en dat is beter dan de plantekst
   vroeg.** Het plan wilde de keuzestap overslaan bij `link_intent =
   'herautoriseren'`; in plaats daarvan post de herstelknop rechtstreeks naar
   `auth-link` en volgt de redirect naar de bank. Nul wizardstappen in plaats van
   twee, het afrondingscriterium ("twee klikken zonder de volledige wizard") ruim
   gehaald, en de gepinde R3-verwachting (`bank-connect-page-steps`, stap-ids
   `select`/`confirm`/`redirect`) blijft **ongewijzigd** groen omdat de wizard-structuur
   niet is aangeraakt.
7. **`relink_connection_account_id` in plaats van `link_intent` +
   `target_bank_account_id` — afwijking van de plantekst, strikter ingevuld.** De
   client noemt de te herstellen KOPPELING; de server leidt de doelrekening, de
   intentie én de bank eruit af. Dat haalt drie dingen weg: (a) een client die
   `link_intent: 'herautoriseren'` met een willekeurige doelrekening combineert (die
   combinatie liet de callback schakel 2 overslaan, dus een keuze die stil genegeerd
   werd); (b) een tweede bron voor "welke rekening draagt deze koppeling"; (c) een
   verplichte `provider_id` in de body — die dwong élk oppervlak met een herstelknop
   tot een eigen leesronde op een kolom die de server al heeft. `provider_id` is
   daarom optioneel geworden op dít pad en wordt er overruled; op het wizardpad
   blijft hij verplicht, want daar is de body de enige bron. Beide velden samen → 400:
   twee bronnen voor één beslissing.
8. **De 409-val van het herstelpad.** De rekening is per definitie bezet door precies
   de koppeling die hersteld wordt, dus zonder `exceptConnectionAccountId` zou dit pad
   ALTIJD een 409 geven. Draagt een ándere actieve koppeling de rekening, dan hoort de
   409 er wél te zijn — mét dezelfde uitweg-tekst (`occupiedTargetAccountMessage`) als
   de wizard en `relink`. Die 409 doet op dit pad iets nieuws: hij **voorspelt de
   botsing van schakel 1** vóórdat de gebruiker naar zijn bank vertrekt.
9. **Geen geschiktheidstoets op het herstelpad (SC-13-asymmetrie).**
   `isEligibleTargetAccount` wijst een rekening met een gedeactiveerd cash-bezit af
   (fase 5, besluit 4). Op het herstelpad moet die afwijzing juist níet gelden — dat
   ís SC-13, en de backfill reactiveert het bezit. Eigenaarschap wordt wél getoetst.
   Die asymmetrie staat op beide plekken gedocumenteerd, want ze leest anders als een
   vergeten controle.
10. **Hergebruik = heractivatie, en alléén dat.**
    `ensureCashAssetForBankAccount` zet `assets.is_active = true` als het bestaande
    bezit gedeactiveerd was, en geeft dat terug als `reactivated`. Bewust NIET
    meegeflipt: `has_budget_tracking` (budgetteren is een eigen, zichtbare as — B2:
    niets stil aanzetten) en `bank_accounts.is_active` (dát ís de budgetteringsvlag).
    Gevolg, expliciet aanvaard: de rekening is na herstel weer zichtbaar maar volgt de
    budgetten niet — zie de restpunten.
11. **De plaats van de backfill in de callback-lus is verschoven, na de
    security-review.** Stap 2b stond vóór de koppelwrite; een MISLUKTE koppelpoging
    (bezet-botsing → `continue`) reactiveerde daardoor alsnog een door de gebruiker
    "verwijderd" bezit, of liet een vers €0-bezit achter: een half toegepaste mutatie
    die stil het netto vermogen wijzigt terwijl de gebruiker een foutmelding leest.
    Nu draait de stap ná een geslaagde write (stap 4b) en alleen voor een HERGEBRUIKTE
    rij — schakel 4 maakt bezit en rekening in één tak aan. `POST
    /api/bank-connect/relink` had die afweging al gemaakt; nu doen beide paden het
    gelijk.
12. **Amendement op fase 5, besluit 3: schakel 2 geldt óók bij `'herautoriseren'`.**
    Besluit 3 sloeg de voorkeur daar over met "identiteit claimt sowieso terug, en
    anders is `iban_hash` de juiste val-terug". Die tweede helft is feitelijk onjuist:
    schakel 3 filtert `bank_accounts.is_active = true`, en juist op het herstelpad is
    een drager mét `is_active = false` ("budgetteren staat uit") een legitieme
    toestand. Geeft de bank bij de nieuwe consent een ander `external_account_id`, dan
    mist schakel 1, mist schakel 3, en maakt schakel 4 een VERSE rekening aan: het
    herstel landt ergens anders dan de rekening die de gebruiker repareerde, de
    historie blijft verweesd, en de SC-13-reactivatie draait niet. De voorkeur werd op
    dat pad dus wél weggeschreven en nooit geconsumeerd — dode data. Schakel 2 is nu
    op beide paden een val-terug **ná** schakel 1; identiteit wint onverkort (fase 5,
    besluit 1), en op het herstelpad wordt de geschiktheidstoets daar overgeslagen
    (besluit 9). Gepind in `callback/route.test.ts`.
13. **Het per-rekening herstelpad dat fase 6 doorgaf, heeft een gezicht gekregen.**
    De callback classificeert een bezet-botsing (`23505` mét de indexnaam
    `bank_connection_accounts_one_active_per_bank_account`) en levert twee uitkomsten
    in plaats van één generieke: landde er niets → `?error=drager_bezet&drager=<id>`,
    landde er deels → `/success?geblokkeerd=<n>`. Alleen een id en een aantal in de
    URL, nooit een banknaam of IBAN. De classificatie matcht **alleen op
    `error.message`** en niet op `details`: `details` bevat de sleutel-waarden en dus
    het provider-geleverde `external_account_id`, waarmee een providerrespons met de
    indexnaam erin een botsing op de ándere unieke index als "drager bezet" kon laten
    lezen (security-review).
14. **Contrast: `text-warning` op `--warning-bg` is verboden.** Gemeten 4,48:1 —
    onder de 4,5:1 die AA voor tekst ≤18px eist. Het patroon is: tint in **rand, vlak
    en icoon** (een grafisch element mag op 3:1), tekst op `--ink-2` (8,3:1). Dat
    raakte vier plekken. `text-warning` op `--paper` mag wél (4,59:1), dus het
    kaart-icoon blijft. Idem `--ink-3` op 11–12px (3,65:1): nieuwe copy staat op
    `--ink-2`.
15. **Eén woord per concept.** De status-pil zei "Verlopen" over exact de toestand
    die het icoon en de kaart "verbinding kwijt" noemen; dat is gelijkgetrokken. Ook
    de 401 van `sync` en `balances` zegt nu "Verbinding kwijt — verbind opnieuw om
    weer bij te werken" in plaats van het jargon "Token verlopen"; die tekst woont als
    één constante in `lib/truelayer/errors.ts`, want twee routes komen erop uit en
    `ConnectedAccountCard` laat gecureerde meldingen door naar de gebruiker.
16. **Elke blokkade heeft een pad.** Drie doodlopende einden gedicht: de 401 op
    `sync` bood "verbind opnieuw" zónder knop; `?error=drager_bezet` bood geen uitweg
    wanneer de drager niet aanwijsbaar was (die valt uit de kandidatenlijst zodra haar
    cash-bezit gedeactiveerd is — precies het SC-13-terrein); en een gespoofte
    `?drager=<eigen, vrije rekening>` toonde "deze rekening is al gekoppeld" over een
    werkende koppeling (die parameter wordt nu alleen vertrouwd als de rekening in de
    lijst óók echt bezet is).

**Restpunten die openstaan (niet blokkerend, wel bewust)**

- **De 14-dagen-vooraankondiging heeft geen proactief kanaal.** Ze leeft alléén op de
  rekeningdetail, dus de gebruiker ziet haar uitsluitend als hij daar zelf naartoe
  navigeert. `app/api/notifications` waarschuwt op sync-VERSHEID (`last_synced_at` > 3
  dagen) en slaat koppelingen die nooit synchroniseerden over — een aflopende
  autorisatie is daar geen signaal. De docstrings die naar "de notificatie" verwezen
  zijn gecorrigeerd zodat niemand op een voorziening rekent die niet bestaat; de
  notificatie zelf is een eigen kaart.
- **Reactivatie herstelt bewust `has_budget_tracking` niet** (besluit 10). De rekening
  is daarna zichtbaar maar volgt de budgetten niet, en dat wordt nergens uitgelegd —
  het leest als "half hersteld". De klik op zo'n kaart opende bovendien de
  bezitting-pane in plaats van de rekeningdetail (`bankByAsset` is alleen gevuld voor
  budget-tracked assets); dát is gerepareerd via `lib/cash-detail-target.ts`. De
  ontbrekende copy-regel vraagt een eigenaarsbesluit over scope.
- **`link_intent = 'herautoriseren'` is géén bewijs dat de verbinding kapot wás.**
  `resolveRelinkCarrier` filtert niet op `is_active` van de koppelrij en beoordeelt de
  gezondheid niet — opnieuw autoriseren van een gezonde koppeling is ongevaarlijk, en
  een tweede definitie van "kapot" zou naast `deriveBankLinkHealth` gaan drijven. Wie
  die kolom ooit als zo'n bewijs leest, leest 'm verkeerd.
- **De classificatie hangt aan de constraint-naam** in de PostgREST-fouttekst. Een
  rename laat de callback stil terugvallen op `geen_koppeling` (geen crash, wel minder
  specifiek). De naam staat als benoemde constante zodat een rename grep-baar is.
- **De 409 op het herstelpad is een read-then-write (TOCTOU).** Tussen de check en de
  OAuth-terugkomst kan een andere bank de drager claimen; dat degradeert netjes naar
  `?error=drager_bezet` — de partiële unieke index blijft het slot.
- **Twee drop-migraties in de repo zijn nooit op remote toegepast**
  (`20260713141000_null_plaintext_bank_tokens.sql`,
  `…142000_drop_plaintext_bank_tokens.sql`). Live staan er 0 rijen met een plaintext
  token, dus géén exposure — maar meerdere bestanden in deze reeks redeneren over
  "Stage B dropt `bank_accounts.iban`" terwijl die staat er niet is. Los vervolgpunt;
  het raakt óók het restpunt van fase 4 over `TARGET_ACCOUNT_SELECT`.
- **Uitval van de loader is alleen in de serverlog zichtbaar.** Fail-open is de juiste
  kant (geen onterecht "verbinding kwijt"), maar het gevolg is dat de énige zichtbare
  kwijt-melding wegvalt zonder signaal. Overweeg `null` (= onbekend) te
  onderscheiden van `[]` (= niets) zodra dat zichtbaar gemaakt moet worden.
- **`POST /api/bank-connect/disconnect`** bouwt zijn fouten nog met de hand en
  valideert zijn body niet met zod (fase-6-restpunt, ongewijzigd) — sinds fase 7 stuurt
  óók de herstelmelding de gebruiker ernaartoe.
- **Pre-existing kleurschuld die deze fase bewust niet opruimde:**
  `bg-emerald-500`/`bg-red-500`/`text-emerald-600`/`text-red-600` in
  `components/app/cash-overview.tsx` (buiten de gewijzigde regels) en de
  `rounded-*`-schuld op de wizard- en success-pagina.
- **De in-app regressiesuites zijn NIET gedraaid** (`kern-bank-connect-flow`,
  `bank-connectie-flow`, `beheer-bank-connect`): die lopen via de server-runner tegen
  een draaiende `npm run dev` met `REGRESSION_TEST_EMAIL`/`_PASSWORD`. De statische pin
  `test/kern-bank-connect-flow-suite-check.test.ts` is groen en de stap-ids zijn
  ongewijzigd, maar dat is een leesoordeel, geen groen. Handmatig draaien vóór de
  release blijft staan.

**Overdracht naar fase 8 en 9**

- **Fase 8 (saldo via het herwaarderingspad)** erft twee dingen. (a)
  `BalanceSyncResult` wordt daar additief uitgebreid met `previous`; die uitbreiding
  raakt `syncAccountBalance`, en dat is precies de aanroep die in de callback nu ná
  stap 4b staat — de rekening heeft haar cash-bezit dan gegarandeerd, dus een
  valuations-rij kan er direct aan hangen. (b) De success-pagina draagt sinds deze fase
  al twee banden (`?geblokkeerd=`, het correctiemoment); de saldo-melding komt daar
  als derde bij en hoort dezelfde token-hiërarchie te volgen — `--warning` = aandacht,
  `--negative` = mislukt, inkt op tint (besluit 14).
- **Fase 9 (documentatie, platen, ADR's, UAT-b)** krijgt van deze fase mee:
  - **UAT-b, rij 7 van de tabel in §6 staat nog open.** Nodig: een criterium voor de
    derde icoon-toestand (en dat `linked-broken` ≠ `manual`), voor het herstelpad
    vanaf de rekening (`relink_connection_account_id`, server-afgeleide doelrekening
    en bank, `link_intent = 'herautoriseren'`) en voor de SC-13-reactivatie. Beweeg de
    twee pin-tellingen in `lib/uat/acceptance/cash.engine.test.ts` bewust mee (nu 48
    workflows / 28 exact na fase 6).
  - **Een ADR over de koppelgezondheid** is een kandidaat: vier signalen, drie
    oppervlakken, één afleiding, plus de regel "gebruikersintentie wint van storing"
    en het besluit dat `expired`/`revoked` één toestand zijn. Nummer 0074 e.v. is vrij
    (hoogste bestaande 0073 na fase 3).
  - **ADR-kandidaat uit besluit 7**, en dit is de vierde keer dat het patroon
    terugkomt: *een feit dat de database al draagt hoort niet uit de client te komen*
    (doelrekening, intentie, bank). Fase 4 noteerde de datalaag-variant hiervan
    ("een kolomwaarde-invariant hoort in de datalaag") al als ADR-kandidaat met drie
    bewijzen; dit is dezelfde familie op routeniveau.
  - **`archimate-concerns.ts`:** geen nieuw structureel risico toegevoegd en geen punt
    verwijderd. De ontbrekende vooraankondigings-notificatie is een functiegat, geen
    architectuurrisico — als fase 9 hem niet oppakt, hoort hij als eigen backlogkaart,
    niet als aandachtspunt.
  - `npm run arch:diagram` is bij deze fase gedraaid; de enige diff is de nieuwe
    integratie-client `lib/truelayer/start-relink.ts` (bewust géén eigen
    INTEGRATIONS-entry: hij belt onze eigen route, niet TrueLayer — vastgelegd in de
    SKIP-lijst van `integrations-model.test.ts` mét die reden).

---

### Fase 8 — Saldo zichtbaar overgenomen via het herwaarderingspad (S/M) — ✅ uitgevoerd 30 juli 2026

> **Opgeleverd.** Nieuw: `lib/truelayer/balance-valuation.ts` (+ `.test.ts`) — de
> notitie-vocabulaire, `recordBankBalanceRevaluation`, de compenserende
> `revertBankBalanceRevaluation` en `loadBankSyncBalanceChanges`. Gewijzigd:
> `lib/truelayer/balance-sync.ts` (+ test), `lib/truelayer/linked-account.ts`,
> `app/api/bank-connect/sync/route.ts`, `balances/route.ts`, `callback/route.ts`,
> `relink/route.ts` (+ test), `linked-accounts/route.ts` (+ test),
> `app/(app)/core/cash/connect/success/page.tsx` (+ test),
> `components/app/bank-connect/carrier-correction.tsx`,
> `lib/architecture/calculations.ts`, `lib/architecture/integrations-model.test.ts`.
>
> **Migraties: geen** — `valuations` en `balance_snapshots` bestonden al.
>
> **Verificatie:** `npx tsc --noEmit` 0 fouten · volledige suite **696 bestanden
> (694 groen, 2 overgeslagen) / 8.890 tests (8.886 groen, 4 overgeslagen)** — +1
> bestand en +32 tests t.o.v. fase 7 · `node scripts/check-client-data-reads.mjs`
> groen (**44** bekende readers, 0 nieuwe; niets toegevoegd) · `npx eslint --quiet`
> schoon op alle gewijzigde bestanden.
>
> **Bijt-proeven, alle rood om de juiste reden en teruggedraaid:** de
> ongewijzigd-saldo-poort uitgezet (1 rood: `revalued: true` op een sync die niets
> veranderde); de marker-regex verslapt naar `^bank-sync.*` (2 rood — de compensatie
> las zichzelf als banksync en compenseerde zichzelf); de compensatie-aanroep uit
> `relink` gehaald (1 rood); `resolveBalanceChange` de server-bron laten negeren
> (2 rood op de success-pagina); de nul-rijen-poort op de bezitting-write in de
> compensatie weggehaald (1 rood). **Eén bijt-proef was aanvankelijk GROEN en dat
> was de nuttigste** — zie besluit 3.
>
> **Reviews:** `security-specialist` (geen 🔴; één 🟠, twee 🟡, twee 🟢-noten —
> 🟠 en beide 🟡's verwerkt) en `ux-review-expert` (twee 🟠, twee 🟡 — beide 🟠's
> en één 🟡 verwerkt; score 7/10). Wat bewust is doorgeschoven staat onder de
> restpunten.

**Kern.** FR8. `lib/truelayer/balance-sync.ts` schrijft nu `bank_accounts.balance` en `assets.current_value` en laat verder geen spoor na: het netto vermogen verspringt zonder dat de historie of de sparkline weet waarom. Elke wijziging van `assets.current_value` krijgt daarom een `valuations`-rij (`notes: 'bank-sync'`) plus de `upsertSingleBalanceSnapshot`-mirror — hetzelfde pad dat een handmatige herwaardering al volgt. Zichtbaarheid is een **melding op de success-pagina** ("saldo overgenomen: €a → €b"), geen blokkerende bevestiging.

**Te wijzigen bestanden**

- `lib/truelayer/balance-sync.ts` — leest de huidige `current_value` vóór het schrijven (dat is de "van"-waarde), schrijft alleen bij een échte wijziging, en breidt `BalanceSyncResult` additief uit met `previous`. De helper is bewust arm gebleven (geen tokenbeheer, geen rate-limit-boekhouding); de valuations-schrijfactie hoort er wél in, want hij hoort onlosmakelijk bij "saldo weggeschreven".
- `app/api/bank-connect/sync/route.ts` en `app/api/bank-connect/balances/route.ts` — geven `previous`/`balance` door; de sync-route heeft het `balance`-veld al.
- `app/(app)/core/cash/connect/success/page.tsx` — de melding.

**Migraties.** Geen — `valuations` en `balance_snapshots` bestaan.

**Tests**

- Saldowijziging → precies één `valuations`-rij met `notes: 'bank-sync'` en één `balance_snapshots`-upsert op de juiste datum.
- Ongewijzigd saldo → géén valuations-rij (anders vervuilt elke sync de herwaarderingshistorie).
- Falende saldo-call blijft niet-fataal: de transacties zijn dan al weggeschreven en mogen niet in een 500 verdampen.

**Afrondingscriterium.** Een sync die het saldo verandert is terug te vinden in de herwaarderingshistorie én in de sparkline, en de gebruiker leest op de success-pagina wat er is gebeurd.

#### Genomen besluiten bij de uitvoering (30 juli 2026)

1. **De vorige waarde reist mee ín de waardering, niet in een nieuwe kolom en niet
   via de client.** Het correctiemoment moet kunnen compenseren, maar het draait in
   een ándere request dan de callback die het saldo schreef — en op dat moment is de
   oude waarde nergens meer te vinden: de dag-upsert op `valuations` kan een
   handmatige herwaardering van diezelfde dag hebben vervangen, dus "de rij ervóór in
   het grootboek" is géén betrouwbare val-terug. Drie afgewezen alternatieven: een
   kolom op `bank_connection_accounts` (transiënte toestand in een relationele tabel,
   plus een migratie die de plantekst niet aankondigde), het bedrag via de
   redirect-URL (bedragen in browserhistorie en serverlogs), en een client-aangeleverd
   "vorige saldo" (een feit dat de database al draagt uit de client laten komen — het
   patroon dat fase 7, besluit 7 als ADR-kandidaat noteerde). Gekozen: de
   waarderingsrij legt vast wát ze verving, in `notes`. Dat is geen truc maar precies
   wat de bestaande live-herwaardering ook al doet (`'Waarde bijgewerkt van X naar
   Y'`) — het verschil is dat dit formaat machine-leesbaar is, door één module wordt
   geschreven én gelezen, en een heen-en-weer-test heeft.
2. **Beide notities hebben dezelfde vorm en verschillen ALLEEN in hun marker**
   (`bank-sync · vorige waarde <bedrag>` / `bank-sync-correctie · vorige waarde
   <bedrag>`). Elke waardering legt vast wat ze verving; voor de compensatie is dat
   het banksaldo. Daarmee is de geankerde marker het enige onderscheid dat de parser
   hoeft te maken — en dat is precies wat de test bewaakt.
3. **Eén bijt-proef was GROEN, en dat was de nuttigste bevinding van deze fase.** De
   eerste vorm van de correctie-notitie eindigde op een woord (`… teruggedraaid`) in
   plaats van op het bedrag. Een verslapte marker-regex bleef daardoor groen: de
   bescherming tegen "de compensatie leest zichzelf als banksync" kwam per ongeluk
   uit dat trailing woord en niet uit de geankerde marker. Het formaat is toen
   symmetrisch gemaakt (besluit 2) zodat de test de bedoelde eigenschap ook echt
   toetst; daarna was dezelfde proef 2× rood. **Een groene bijt-proef is geen
   geruststelling maar een aanwijzing dat de test iets anders bewaakt dan je denkt.**
4. **De compensatie schrijft de bezitting EERST en de markering LAATST** — bewust de
   omgekeerde volgorde van `recordBankBalanceRevaluation` en van de live
   herwaardering. Reden: de correctie-notitie is óók de idempotentie-poort. Stond ze
   voorop en faalde de bezitting-write daarna, dan leest de volgende aanroep de
   correctie als laatste waardering, geeft `parseBankSyncPrevious` `null`, en is de
   toestand — grootboek hersteld, `assets.current_value` nog op het banksaldo van een
   bank die de rekening niet meer draagt — niet meer zelf te herstellen. Met de
   bezitting eerst convergeert elke herhaling. Bevinding 🟠 van de security-review;
   `reverted: true` betekent sindsdien "`assets.current_value` staat écht terug",
   niet "alle drie de schrijfacties slaagden".
5. **`syncAccountBalance` schrijft de bankrekening als LAATSTE en scope't élke ronde
   op `user_id`.** Tot deze fase was het één `.update().select('linked_asset_id')`:
   saldo wegschrijven en de bezitting opzoeken in één round-trip. Dat kan niet meer —
   er staan nu schrijfacties tússen die twee die kunnen gooien, en dan zou
   `bank_accounts` het nieuwe saldo dragen terwijl `assets.current_value` het oude
   houdt. Nieuwe volgorde: grootboek → bezitting → bankrekening, zodat de laatste,
   minst ingrijpende schrijfactie de enige is die kan achterblijven. De
   `user_id`-filter erbij is een control en geen dubbelop (🟡 uit de review): de
   SELECT-policy op `bank_accounts`, `assets` én `valuations` is bréder dan eigen-rij,
   en RLS scope't de RÍJ en niet de WAARDE van `bank_accounts.linked_asset_id`
   daarop — zonder filter kon een naar een gedeelde partnerbezitting gezette FK een
   `valuations`- en `balance_snapshots`-rij onder de verkeerde eigenaar hangen,
   vóórdat de update op eigenaarschap faalde.
6. **De melding komt uit het grootboek, niet uit de sync-respons alleen.** De
   callback schrijft het saldo vóórdat de success-pagina laadt en heeft dus geen
   respons om op mee te liften — en dat is het HOOFDgeval, niet de uitzondering.
   `GET /api/bank-connect/linked-accounts` levert daarom `balance_change`,
   server-afgeleid uit de banksync-waardering van vandaag (één extra leesronde over
   alle dragers samen, geen N+1). De sync-respons draagt daarnáást
   `balance_previous`/`balance_revalued`; de sync van de sessie wint. De pagina
   herhaalt de cent-vergelijking niet zelf — anders ontstaat er een tweede definitie
   van "het saldo is veranderd".
7. **De melding draagt geen stoplichtkleur.** Een geslaagde overname is geen aandacht
   (`--warning`) en geen mislukking (`--negative`): inkt op `--ink-2` (8,56:1),
   bedragen in `font-mono tabular-nums`, eigen glyph (`History`) omdat de `Wallet`
   één regel hoger al "waar het landt" betekent. Bewust géén vrijheidstijd-framing:
   dit is een technische bevestiging op een correctiepagina, niet een financieel
   narratief moment.
8. **Het correctiepaneel vertelt nu óók wat er met het saldo gebeurt.** De
   waarschuwing in `carrier-correction.tsx` zei alleen iets over transacties, vlak
   ónder een regel die net meldde dat het saldo is "vastgelegd" — de vraag die de
   gebruiker op dat moment stelt bleef precies onbeantwoord (🟠 uit de UX-review).
   Het mechanisme bestond al; alleen de copy ontbrak.
9. **Zod op `balances/route.ts`.** Die handler kwam er toch al langs, en dat is wat de
   mutatieroute-conventie (ADR 0044) als moment aanwijst. De rauwe `await req.json()`
   en de handgemaakte 400/404 zijn vervangen door `parseBody` + `notFound()`.

**Restpunten die openstaan (niet blokkerend, wel bewust)**

- **`valuations` heeft UNIQUE `(entity_id, valuation_date)` zónder `user_id`** —
  **stap 1 van 2 gedaan 30 juli, nog niet gedicht.** De gebruiker-gescopete sleutel
  `UNIQUE (user_id, entity_type, entity_id, valuation_date)` staat op remote
  (`supabase/migrations/20260730072804_add_valuations_user_scoped_unique.sql`,
  spiegel van `balance_snapshots`) en alle negen upsert-plekken sturen 'm via één
  constante (`VALUATIONS_CONFLICT_KEY`, `lib/valuations.ts`). Pre-flight vóór
  toepassen: 39 rijen, 7 gebruikers, **0** groepen die de nieuwe sleutel zouden
  schenden, 0 `(entity_id, dag)`-paren met gemengd `entity_type` — de nieuwe sleutel
  is een superset van de oude en dus per constructie zwakker.
  **De oude constraint staat er nog, bewust.** `ON CONFLICT` inferreert op een exact
  passende index, dus code die nog de oude sleutel stuurt breekt hárd op het moment
  van de drop — en dat is niet alleen "tot de deploy": vier van de negen schrijvers
  zijn client-componenten (herwaardering, check-in, asset-edit, schuld-edit) en een
  browser houdt een geladen bundel vast. Stap 2 (drop) kan dus pas als de nieuwe
  bundel live is; tot dan bestaat de cross-user-botsing zoals hij al bestond — geen
  regressie, ook geen fix. Praktisch is de botsing een UUID-collisie, dus de kans is
  verwaarloosbaar; de reden om 'm te doen is hygiëne, niet een lopend incident.
  **Wat vóór of mét stap 2 moet landen** (securityreview 30 juli): op `valuations`
  staan nul triggers, geen FK en een INSERT-`with_check` die alléén `user_id` toetst,
  dus `entity_id`, `ownership` en `household_id` zijn vrij door de client te zetten.
  Een huishoudpartner kan daarmee een verzonnen waardering op een GEDEELDE bezitting
  van de ander schrijven, en `lib/assets-data-loader.ts` leest `valuations` zonder
  `user_id`/`ownership`-filter en groepeert op `entity_id` — die rij landt dus in de
  waarderingshistorie van de eigenaar. Vandaag remt de oude globale sleutel dat tot
  dagen waarop de eigenaar zelf nog niets had; na de drop werkt het op elke datum.
  Guard-trigger (`entity_id` hoort bij `user_id`, per `entity_type`; `ownership`/
  `household_id` niet vrij zetbaar) + de loaderquery scopen zijn dus de VOORWAARDE
  voor stap 2, niet het vervolg erop. Eigen kaart voor `supabase-db-specialist`.
  **GEEN FK op `entity_id`, en dat is een oordeel:** het veld is polymorf
  (`entity_type` kiest `assets` of `debts`) en PostgreSQL kent geen polymorfe FK;
  bovendien staat er op remote al 1 `debt`-rij zonder bijbehorende `debts`-rij, dus
  zelfs een gesplitste FK zou op bestaande data falen. De datalaag-variant is hier
  per definitie een trigger — hetzelfde patroon als het punt hieronder.
- **`bank_accounts.linked_asset_id` heeft geen eigenaarschaps-guard-trigger**, terwijl
  zijn zusterkolommen `bank_connection_accounts.bank_account_id` en
  `bank_connections.target_bank_account_id` die sinds fase 4/6 wél hebben — met exact
  dezelfde motivatie. De `user_id`-filters uit besluit 5 dichten het gat in de code;
  de datalaag-variant is de vierde keer dat het patroon "RLS scope't de rij, niet de
  WAARDE van een FK-kolom daarop" terugkomt en is daarmee rijp voor een eigen ADR.
- **`valuations.notes` is nu een machine-leesbaar besturingssignaal in een kolom die
  de gebruiker zelf kan beschrijven** (de handmatige herwaarderingssheet schrijft
  vrije tekst door met dezelfde dag-conflictsleutel). Geen rechtenwinst — de
  security-review verifieerde dat alles wat een vervalste notitie kan bereiken de
  gebruiker sowieso al direct mag op zijn eigen rijen, en er is geen cross-user of
  gezaghebbende lezer van die kolom. Wat blijft: élke volgende lezer moet dat opnieuw
  toetsen. Hoort als regel bij ADR 0071: deze notitie mag nooit een beslissing dragen
  die verder reikt dan de eigen rijen van de schrijver.
- **De `aria-live="polite"` op de saldomelding doet niets bij het hoofdpad.** Komt de
  melding uit `linked-accounts`, dan wordt de hele sectie in één keer gemount mét de
  regel al gevuld — een live-regio die al gevuld ter wereld komt wordt door de meeste
  hulpsoftware niet aangekondigd. De tekst is gewoon bereikbaar; de belofte van het
  attribuut houdt alleen voor het sync-pad. Zelfde patroon als het bestaande
  `result &&`-blok. Vraagt een a11y-keuze (accepteren, of een apart
  aankondigingsmechanisme voor "wat de callback al deed"), geen eenregelige fix.
- **De UTC-dag.** `bankSyncValuationDate()` gebruikt `toISOString().split('T')[0]`,
  gelijk aan de live herwaardering in `assets-client.tsx`. Tussen 00:00 en 02:00
  Nederlandse tijd hoort een sync daardoor bij de kalenderdag ervóór. Dat verschuift
  een punt in de verloop-band, geen bedrag — en het gevolg voor de melding is dat ze
  in dat venster niet verschijnt. Bewust niet apart opgelost: een tweede
  dag-definitie naast de bestaande zou erger zijn.
- **De in-app regressiesuites zijn NIET gedraaid** (`kern-bank-connect-flow`,
  `bank-connectie-flow`, `beheer-bank-connect`): die lopen via de server-runner tegen
  een draaiende `npm run dev`. De zelf-refererende asserties in
  `bank-connectie-flow.ts#ob-bank-balances-sync` (respons-vorm `{ balance, currency }`)
  blijven per constructie groen omdat de nieuwe velden additief zijn, maar dat is een
  leesoordeel, geen groen. Handmatig draaien vóór de release blijft staan.

**Overdracht naar fase 9**

- **ADR 0071 — Saldo via het herwaarderingspad** is bewust NIET bij deze fase
  geschreven en hoort in fase 9. Wat erin moet: elke `assets.current_value`-wijziging
  uit een banksync levert een `valuations`-rij + snapshot-mirror; ongewijzigd saldo
  schrijft niets; er komt géén "niet overschrijven"-vlag (dat zou een tweede waarheid
  voor hetzelfde getal zijn plus een nieuw gating-begrip); het correctiemoment
  compenseert append-only en nooit met een delete; en de regel uit de restpunten dat
  de notitie nooit een beslissing buiten de eigen rijen mag dragen.
  `elements: ['t-bankconnect', 'do-vermogen']`.
- **UAT-b rij 8** staat nog open: een criterium voor "saldo overgenomen: €a → €b" én
  voor de valuations-rij + snapshot-mirror, plus de compensatie bij een relink. Beweeg
  de twee pin-tellingen in `lib/uat/acceptance/cash.engine.test.ts` bewust mee (nu 48
  workflows / 28 exact).
- **`lib/architecture/calculations.ts` is al bijgewerkt** (noot bij "Netto vermogen
  (gewogen)" + `lib/truelayer/balance-valuation.ts` als bronbestand): geen
  formule- of grondslagwijziging, alleen de vastlegging dat bank-saldi voortaan via
  het herwaarderingspad landen. `archimate-concerns.ts`: geen punt toegevoegd of
  verwijderd — de twee datalaag-restpunten hierboven zijn kaarten, geen
  architectuurrisico's zolang de code ze afdekt.

---

### ~~Fase 7 (oud) — Sync-cursor bij hergebruik met bestaande historie (S)~~ — **opgegaan in fase 1**

FR10 stond hier als losse, late fase: bij een hergebruikte rekening de startcursor op de nieuwste bestaande transactie −3 dagen. B8/B9 maken daar één samenhangende eerste-ophaal-strategie van — het startpunt bij bestaande historie (B9) en de maximale historie op een lege rekening (B8) zijn twee takken van dezelfde beslissing en horen niet in twee fasen op verschillende momenten. Bovendien raakt B8 de eerste gebruikerservaring, en dat verdroeg geen positie ná zes andere fasen.

De inhoud staat nu in **fase 1**; het *consumeren* ervan bij een via voorkeur hergebruikte rekening staat in **fase 5**. De motivatie ("niet meer schadelijk dankzij laag 2, wel duur en traag") is achterhaald: met B9 gaat het niet meer om kosten maar om het voorkómen van overlap.

---

### Fase 9 — Documentatie, platen, ADR's en UAT-b (M) — ✅ documentatiedeel (ADR's + platen) uitgevoerd 30 juli 2026, UAT-b apart

Zie sectie 6. Deze fase hoort in dezelfde PR-reeks; hem apart plannen is een manier om hem te vergeten. UAT-**a** (de definities die het gedrag van vandaag vastlegden) is al gedaan — wat hier resteert is UAT-**b**: per bouwfase de criteria die het nieuwe gedrag beschrijven.

> **Documentatiedeel opgeleverd (30 juli 2026, `architecture-docs-keeper`).** Vier
> nieuwe ADR's (0070, 0071, 0074 — hernummerd van de aangekondigde 0073, zie §6 —
> en 0075, het vierde "kolomwaarde-invariant hoort in de datalaag"-geval), de
> `archimate-flows.ts`-stapdetail bijgewerkt, `fk-waarde-zonder-datalaag-guard`
> teruggeplaatst voor `bank_accounts.linked_asset_id` en restrisico's 7 + 9
> als nieuwe aandachtspunten toegevoegd, `integrations-model.ts`/`calculations.ts`/
> HLD geverifieerd (al correct resp. geen wijziging nodig). `npm run arch:diagram`
> gedraaid (ADR's 73 → 75). Verificatie: `npx vitest run lib/architecture` **11
> bestanden / 108 tests groen**, `npx tsc --noEmit` 0 fouten, `npx eslint --quiet`
> schoon op alle gewijzigde bestanden. **UAT-b (rijen 7 en 8, `lib/uat/**`) valt
> buiten dit deel** — parallelle `uat-docs-keeper`-taak, niet aangeraakt.

## 4. Besluitenlijst voor de eigenaar

> **Vastgesteld op 29 juli 2026 — de eigenaar volgt alle zeven aanbevelingen.**
> Daarmee liggen vast: exacte dedup-sleutel zonder review-status (1), correctiemoment
> op de success-pagina in scope (2), keuze vóór de redirect en melding erna (3),
> sync-cursor op nieuwste transactie −3 dagen (4), naam-fallback toegestaan mét het
> restrisico onder R1 (5), rekeningkeuze binnen wizardstap 2 (6), en consolidatie van
> `normalizeCounterparty` buiten dit plan (7). De onderbouwing hieronder blijft staan
> als verantwoording; heropen een besluit alleen met een nieuw argument.

Genummerd, met aanbeveling. Besluit 1–5 komen uit de open punten van de requirement-specialist, 6–7 uit conflicten of nieuwe bevindingen.

**Besluit 1 — Twijfelgevallen bij dedup (FR7).**
*Vraag:* wat gebeurt er met een boeking die "waarschijnlijk maar niet zeker" al bestaat?
*Opties:* (A) markeren voor review — een status op `transactions` en een scherm waar de gebruiker beslist. (B) De architect-lijn: er zíjn geen twijfelgevallen, want de sleutel is exact; wat matcht is een duplicaat, wat niet matcht niet. Bij de sync (gebruiker afwezig) stil overslaan en gesplitst tellen; bij de import (gebruiker aanwezig) zichtbaar voorgedeselecteerd met reden en overrulebaar.
*Aanbeveling:* **B.** Een "mogelijk duplicaat"-status in `transactions` is een derde waarheid naast "bestaat" en "bestaat niet", en die moet daarna door élke lezer — dashboard, budgetten, AI-context, FIRE-motor — correct genegeerd worden. Dat is precies het soort drift dat de bundel-conventie verbiedt. Exacte sleutel + geen status is minder slim en veel beter houdbaar. Prijs van B: een cross-bron-duplicaat dat de sleutel mist, blijft dubbel staan zonder dat iemand het merkt — daarom staat dat als restrisico onder R1 in sectie 7.

**Besluit 2 — Correctiemoment op de success-pagina (architect-punt c).**
*Vraag:* bouwen we in de callback-fase (nu fase 5) "dit is niet de goede rekening" mee?
*Opties:* (A) meebouwen. (B) descopen naar later.
*Aanbeveling:* **A.** Bij B is de koppeling alsnog onomkeerbaar voor de gebruiker, en dan lost dit plan het probleem waarvoor het bestaat maar half op. Kiest de eigenaar toch B, dan is de consequentie afgesproken en niet vrijblijvend: een aandachtspunt in `lib/architecture/archimate-concerns.ts` met de reden en de aanleiding om het weer op te pakken.

**Besluit 3 — Bevestigingsdialogen voor saldo en budget-tracking (FR8/FR9 vs. architect e).**
*Vraag:* onderbreken we de gebruiker vóór het overschrijven van het saldo en het aanzetten van budget-tracking?
*Opties:* (A) blokkerende bevestigingsdialogen op beide momenten. (B) Geen dialoog: de FR9-budgetkeuze landt als (voorgevinkte, zie B2) aanvinkoptie in de wizard-keuzestap (nu fase 4), en het saldo wordt gemeld op de success-pagina, achteraf en terugleesbaar in de herwaarderingshistorie (nu fase 8).
*Aanbeveling:* **B.** Een dialoog midden in een OAuth-terugkeer is een slecht moment om iets te vragen — de gebruiker is dan bezig met "ben ik er al?", niet met een keuze. De keuze hoort vóór de redirect (wizard) en de uitkomst hoort erna (melding). Let op: B betekent expliciet dat er géén "saldo niet overschrijven"-vlag komt; dat staat buiten scope.

**Besluit 4 — Startdatum van de sync-cursor bij hergebruik (FR10).**
*Vraag:* vanaf wanneer haalt de eerste sync op een hergebruikte rekening op?
*Opties:* (A) vanaf de nieuwste bestaande transactie min 3 dagen. (B) Vanaf de nieuwste bestaande transactie exact. (C) Alles ophalen en op laag 2 vertrouwen. (D) De gebruiker laten kiezen.
*Aanbeveling:* **A.** B mist naboekingen die met terugwerkende datum binnenkomen; C verbrandt rate limit en levert een trage eerste ervaring; D is een vraag waar de gebruiker het antwoord niet op weet. De 3 dagen zijn een bewuste marge boven de ±1-dagstolerantie van laag 2.

**Besluit 5 — Naam-fallback in de dedup-sleutel.**
*Vraag:* mag `normalizeCounterparty(naam)` de match dragen als één van beide zijden geen tegenpartij-IBAN heeft?
*Opties:* (A) ja, exact op de genormaliseerde naam (architect-lijn). (B) Nee — zonder IBAN geen laag-2-match; liever een gemist duplicaat dan een onterecht overgeslagen transactie.
*Aanbeveling:* **A, met de kanttekening dat dit de enige plek is waar dit plan risico neemt.** Contante opnames en pin-betalingen hebben zelden een tegenpartij-IBAN, en juist die zijn met datum+bedrag+naam goed te matchen. Maar de genormaliseerde naam is lossy (trailing filiaalnummers worden gestript), dus twee pinbetalingen van hetzelfde bedrag op dezelfde dag bij twee filialen van dezelfde keten matchen ten onrechte. Dat is zeldzaam en zichtbaar bij import (voorgedeselecteerd, overrulebaar) maar stil bij sync. Kiest de eigenaar voor de veilige kant, dan is B verdedigbaar en kost het alleen dekkingsgraad.

**Besluit 6 — Gepinde 3-stapsstructuur van de wizard (R3).**
*Vraag:* de rekeningkeuze erbij — vierde stap of binnen stap 2?
*Opties:* (A) binnen stap 2 ("Bevestig" → "Rekening & bevestigen"). (B) Vierde stap.
*Aanbeveling:* **A.** De keuze en de bevestiging gaan over hetzelfde besluit; ze splitsen maakt de wizard langer zonder hem duidelijker te maken. Bijvangst: de gepinde regressietest `bank-connect-page-steps` assert op de stap-**ids** (`select`/`confirm`/`redirect`), niet op labels — bij A blijft die dus ongewijzigd groen en hoeft er onder R3 niets "bewust bijgewerkt" te worden. Bij B moet hij wel om, met motivatie in de PR.

**Besluit 7 — Consolidatie van de drie `normalizeCounterparty`-varianten (afwijking, zie 0c).**
*Vraag:* halen we de drie lokale varianten mee in dit plan?
*Opties:* (A) ja, zoals de architect voorstelde. (B) Nee: dit plan gebruikt alleen de bestaande canonieke module en raakt de drie varianten niet; consolidatie wordt een eigen `/refactor`-opdracht.
*Aanbeveling:* **B.** De drie zijn geen kopieën maar verschillende normalisaties (geverifieerd). Ze samenvoegen verandert aantoonbaar de groepering in de terugkerende-transacties-detectie — een gedragswijziging die niets met bankkoppelen te maken heeft en die zijn eigen regressiebewijs verdient. Ze meesmokkelen in deze PR-reeks maakt de review van beide slechter.

## 5. Test- & regressieplan

**Acceptatiecriteria → waar ze afgedekt worden** *(herijkt op B7/B8/B9; fasenummers zijn de nieuwe)*

| Criterium | Dekking |
|---|---|
| (a) bestaande rekening met CSV-historie | Fase 5 (callback-precedentie) + fase 1 (startpunt D−3) + fase 2 (dedup in de marge + FR11-budgetbehoud). **Herijkt — zie hieronder.** |
| (b) nieuwe rekening | Fase 5, unit op de callback |
| (c) N rekeningen | Fase 5, unit op de callback-lus |
| (d) al-gekoppelde rekening | Fase 6, migratietest + routetest |
| (e) twijfelgeval | Fase 2 (sync: stil overslaan + tellen) en fase 3 (import: zichtbaar, overrulebaar) — besluit 1, optie B |
| (f) CSV ná bank | Fase 3, `select-all.test.ts` + unit op de pure module + routetest |
| (g) rekeningtype uit de consent (B3, nieuw) | Fase 5, unit op de typemapping |
| (h) dezelfde rekening bij twee providers (SC-14, nieuw) | Fase 5, unit op de callback |

**Criterium (a) is herijkt — de oude formulering ging uit van een overlap-sweep die er niet meer is.** De aanname was: de eerste sync haalt ver terug op, dwars over de CSV-historie heen, en laag 2 vangt die overlap. B9 haalt die sweep weg — op een rekening mét historie start de ophaal bij de nieuwste bestaande transactie −3 dagen. Wat (a) nu moet bewijzen:

1. de koppeling landt op de gekozen rekening — géén tweede `bank_accounts`-rij, géén tweede cash-asset;
2. `sync_cursor` start op D−3, waarbij D de nieuwste bestaande transactiedatum is;
3. binnen die 3-dagen-marge levert de sync nul dubbele rijen (laag 1 + laag 2);
4. bestaande rijen mét handmatige `budget_id` blijven ongewijzigd (FR11);
5. **en expliciet als verwacht gedrag, niet als tekortkoming:** gaten *vóór* de bestaande historie worden niet gevuld. Wie CSV-historie vanaf 2026 heeft, krijgt 2024–2025 niet vanzelf, ook al had de bank het. De aangewezen route daarvoor is een CSV-import op die rekening (fase 3). Een test die het tegendeel verwacht, test de oude aanname.

**Regressie-eisen** *(gecontroleerd op 29 juli 2026 na B1–B9)*

- **R1 — hash-contract v1 blijft. Klopt nog.** `computeHash` is niet aangeraakt; laag 2 is puur additief. **Nuance na B1:** de unieke *index* is wél gewijzigd (rekening-gescoped), maar R1 gaat over de hash-*input*, en die staat. De golden-vectortest uit 0b staat nog open en is de enige echte borging — tot die er is, is R1 een belofte en geen bewijs.
- **R2 — state-formaat blijft. Klopt nog.** Geen wijziging in `auth-link` aan de `fullState`-opbouw; de doelrekening reist via een kolom, en `link_intent` ook. Gepind in `kern-bank-connect-flow.ts` (regel ~263: `'abc-def-123:55e84000-1234567890'` → `connectionId`); die assertie moet **ongewijzigd** groen blijven en is daarmee de directe bewaker van R2.
- **R3 — 3-staps-test. Klopt nog, met één toevoeging.** Bij besluit 6-optie A blijft `bank-connect-page-steps` ongewijzigd groen, omdat hij op stap-**ids** assert en niet op labels. Fase 7 (B6) slaat de keuzestap over bij `link_intent = 'herautoriseren'` — dat is een overgeslagen stap, geen verwijderde: de drie ids blijven bestaan. Wordt dat toch als "twee stappen" geïmplementeerd, dan breekt de pin en is dat een bewust besluit met motivatie in de PR.
- **R4/R5 — bestaande bank- en importsuites blijven groen. Klopt nog, breder geworden.** `npm run test:run` over `lib/parsers/**`, `lib/truelayer/**` (inclusief het sinds B1 bestaande `existing-hashes.test.ts`), `app/(app)/core/cash/import/select-all.test.ts`; plus de drie in-app suites `kern-bank-connect-flow.ts`, `bank-connectie-flow.ts` en `beheer-bank-connect.ts` via de server-runner.
- **R6 — de dedup blijft rekening-gescoped (nieuw, na B1).** Geen enkele fase mag terug naar een gebruiker-brede vergelijking: dat sloeg twee échte boekingen met gelijke datum/bedrag/omschrijving op twee rekeningen stil over. Bewaakt door `lib/truelayer/existing-hashes.test.ts` en door UAT-criterium WF-CASH-40. Fase 2 en 3 breiden de dedup uit — bij beide is dit de eerste review-vraag.

**Bewust bij te werken gepinde tests**

1. `lib/regression-tests/suites/kern-bank-connect-flow.ts`, test `bank-connect-success-sync-response` (regel ~311–323) — pint de sync-response op `{ new, duplicates }`. Fase 2 splitst de duplicaattelling; deze assertie moet mee, en is de enige gepinde verwachting die dit plan zeker breekt.
2. `app/(app)/core/cash/import/select-all.test.ts` — de standaardselectie krijgt er een uitsluitingsgrond bij (fase 3).
3. ~~`lib/truelayer/*.test.ts` rondom `BalanceSyncResult` — het resultaattype wordt additief uitgebreid met `previous` (fase 8).~~ ✅ **gedaan 30 juli:** `synced` draagt nu `previous` én `revalued`; `balance-sync.test.ts` is meebewogen (de stub kent sinds fase 8 drie querystijlen en een chainable `.eq()`, omdat élke ronde óók op `user_id` gescoped is).
4. `lib/uat/acceptance/cash.engine.test.ts` — de tellingen `workflows.length === 41` (regel ~49) en `exactWorkflows.length === 25` (regel ~79) staan sinds UAT-a op die waarden. **Élk UAT-b-criterium dat erbij komt moet die twee pins bewust meebewegen**, met de reden in het commentaar erboven (dat bestand documenteert nu al waaróm het 32 → 41 werd). Dit is de makkelijkst te vergeten gepinde verwachting van de hele reeks.
5. Alleen bij besluit 6-optie B: `bank-connect-page-steps` (aantal stappen).

**Twee testlagen, expliciet.** De in-app regressiesuites (`lib/regression-tests/suites/*` — hier `kern-bank-connect-flow.ts`, `bank-connectie-flow.ts`, `beheer-bank-connect.ts` en `kern-import-export.ts`) draaien **niet** onder vitest maar via de server-runner: `/beheer/regressietest` of headless `POST /api/regression/run` tegen een draaiende `npm run dev`. `npm run test:run` dekt ze dus niet — en juist in die laag zitten de scherpste gepinde verwachtingen van dit plan. Handmatig draaien vóór de release is hier geen formaliteit.

**Verificatiecommando's per fase:** `npx tsc --noEmit`, `npm run lint`, `npm run test:run`, `npm run check:client-reads` (relevant vanaf fase 3, waar `app/(app)/core/cash/import/page.tsx` van de grandfather-allowlist af gaat, en opnieuw vanaf fase 4, waar de wizard een server-loader krijgt).

**Let op — de success-pagina staat óók op de allowlist.** `app/(app)/core/cash/connect/success/page.tsx` is grandfathered in `scripts/check-client-data-reads.mjs` (regel 85), en fase 2, 5, 7 én 8 breiden hem alle vier uit. De gate zwijgt daar dus, maar de norm geldt onverkort: nieuwe weergavedata op die pagina hoort via een route of loader te komen, niet via een extra client-directe read op een pagina die toevallig al vrijgesteld is. Dat is precies de sluiproute die ADR 0058 bedoelt te sluiten.

## 6. ADR-, platen- en UAT-synchronisatie

**ADR's** — ✅ **alle vier geschreven bij fase 9 (30 juli 2026).** Nummers
0069–0073 waren aangekondigd als vrij op 29 juli, maar 0073 werd tussentijds
door een parallelle documentatiereeks bezet (`0073-grondslag-in-de-veldnaam.md`,
niet gerelateerd aan dit plan). De importpad-ADR is daarom als **0074**
geschreven, en het vierde, hieronder aangekondigde ADR-kandidaat als **0075**.
`adr-numbering.test.ts` bevestigt: geen dubbele nummers.

- ✅ **0069 — Rekening-identiteit bij bankkoppelen.** Geschreven bij fase 5,
  zoals gepland: `docs/adr/0069-callback-haalt-alleen-saldo-op.md`.
- ✅ **0070 — Cross-bron duplicaatdetectie.** `docs/adr/0070-cross-bron-transactie-dedup.md`.
  De exacte sleutel, "additief naast v1", de INSERT-only-regel, geen DB-unique
  op laag 2, geen "mogelijk duplicaat"-status, en de rekening-gescopede
  unieke index (B1) als grondslag (R6) — allemaal opgenomen.
- ✅ **0071 — Saldo via het herwaarderingspad.** `docs/adr/0071-banksaldo-via-herwaarderingspad.md`.
  Geschreven bij fase 9 zoals bewust doorgeschoven; bevat de compensatie-regel
  (append-only, bezitting-eerst-markering-laatst) en de grens op
  `valuations.notes` uit de overdracht bij fase 8. `elements: [t-bankconnect,
  as-vermogen]` — `do-vermogen` bestaat niet als element-id in
  `archimate-model.ts`; `as-vermogen` is de juiste (zelfde id als de
  "Netto vermogen (gewogen)"-calc gebruikt).
- ✅ **0072 — Omvang van de eerste ophaal.** Was al geschreven bij fase 1:
  `docs/adr/0072-omvang-van-de-eerste-ophaal.md`.
- ✅ **0074 — Importpad via een server-route** (hernummerd van de aangekondigde
  0073, zie boven). `docs/adr/0074-importpad-via-server-route.md`. Parsen
  client-side, opslaan + dedup server-side, één schrijver per gekoppelde
  rekening, verwijzing naar ADR 0058.
- ✅ **0075 — Kolomwaarde-invariant hoort in de datalaag** (het vierde,
  vier-keer-aangevraagde ADR — zie de overdracht bij fase 8, besluit-familie
  "RLS scopet de rij, niet de FK-waarde"). `docs/adr/0075-kolomwaarde-invariant-in-datalaag.md`.
  Bewijsvoering: `guard_profiles_role`/entitlement-kolommen (ADR 0049),
  `bank_connections.target_bank_account_id` (fase 4, gedicht),
  `bank_connection_accounts.bank_account_id` (fase 6, gedicht) en
  `bank_accounts.linked_asset_id` (gevonden bij fase 8, **nog niet gedicht** —
  vastgelegd als heropend aandachtspunt, zie hieronder).

**Platen** (`/beheer/architectuur`):

- ✅ `lib/architecture/archimate-flows.ts:31` — de stap `t-bankimport` noemt nu
  beide lagen (laag 1 bevroren/ADR 0070, laag 2 cross-bron/ADR 0070, verplicht
  via de server-route op een gekoppelde rekening/ADR 0074) in plaats van de
  onwaar geworden "Coherente dedup via import_hash + bank_seq."
- ~~`lib/architecture/archimate-model.ts:535` — `ENRICH['t-bankconnect->app-comp']` uitbreiden met de doelrekening-keuze in de payload.~~ ✅ bij fase 4: de payload noemt nu de vooraf gekozen doelrekening én dat die als kolom meereist en niet in de OAuth-state.
- ✅ `lib/architecture/integrations-model.ts:227` — al gecorrigeerd tijdens de bouwfasen: `apiRoutes` voor `truelayer` noemt nu de negen échte routes (`accounts`, `auth-link`, `callback`, `linked-accounts`, `relink`, `sync`, `balances`, `status`, `disconnect`, `providers`), geen van de drie fictieve routes meer. De mt940-/ofx-/csv-entries verwijzen naar `/api/transactions/import`, dat sinds fase 3 (ADR 0074) echt bestaat. `integrations-model.test.ts` bewaakt bovendien de client-vrijstellingslijst (`errors.ts`, `existing-hashes.ts`, `initial-fetch.ts`, `target-account.ts`, `cash-asset-backfill.ts`, `linked-account.ts`, `start-relink.ts`, `balance-valuation.ts`, `cross-source-dedup.ts`) — geverifieerd bij fase 9, geen wijziging nodig.
- ✅ `lib/architecture/calculations.ts` — al gedaan bij fase 8 bij de calc "Netto vermogen (gewogen)", mét `lib/truelayer/balance-valuation.ts` als bronbestand; expliciet géén formule- of grondslagwijziging. Bij fase 9 alleen de "ADR 0071, nog te schrijven"-tekstverwijzing bijgewerkt naar "ADR 0071" nu die ADR bestaat. Het rekeningtype-uit-de-consent-punt (B3, fase 5) staat al in de note.
- ~~ERD: verschijnt automatisch na `npm run arch:diagram`, mits de drift-migratie uit 0a er is~~ — ✅ die migratie is er (B1). `npm run arch:diagram` opnieuw gedraaid bij fase 9: ADR's 73 → 75, verder geen diff (alle tabellen/routes/FK-edges van dit plan waren al meegescand in eerdere fasen).
- ✅ `lib/architecture/archimate-concerns.ts` — de eerste-ophaal-limiet-melding was bij fase 1 al ingebouwd (voortgang + afkap-melding op de success-pagina), dus dat aandachtspunt is nooit toegevoegd/verwijderd hoeven worden. Bij fase 9: `fk-waarde-zonder-datalaag-guard` **is teruggekomen**, ditmaal voor `bank_accounts.linked_asset_id` (fase 6 verwijderde 'm terecht voor `bank_connection_accounts.bank_account_id`, maar het patroon dook bij fase 8 een vierde keer op — zie ADR 0075). Restrisico 7 (`bank-sync-gefaalde-batch-niet-retried`) en restrisico 9 (`idx-transactions-user-date-drift-remote`) uit §7 zijn als nieuwe aandachtspunten toegevoegd, zoals hierboven aangekondigd — beide staan nog open in de code, dus horen op de plaat.
- ✅ HLD (`lib/architecture/hld-model.ts`): getoetst, geen wijziging nodig — geen nieuwe functionaliteit in "ik wil…"-taal, alleen een betrouwbaarder bestaande. Bank koppelen/importeren stond al in de reis (regel 73/87/92).

**UAT-a** (`lib/uat/**`) — ✅ **uitgevoerd 29 juli 2026, definities alleen; geen live run**

Het gedrag van vóór dit plan is vastgelegd zodat de bouwfasen ertegen af te zetten zijn:

- **WF-CASH-33 t/m WF-CASH-41** in `lib/uat/acceptance/cash.ts` (regel ~490–598), met mirrors in `lib/uat/acceptance/cash-checks.ts`, catalogus-scenario's `UAT-CASH-33`…`41` in `lib/uat/catalog.ts` (regel ~223–231) en knopen in `lib/uat/flows/cash.ts`. Ze dekken o.a. de zachte ontkoppeling (33), budget-behoud bij hergebruik (34), rate-limit (35), lege sync (36), 90-dagen-herautorisatie (37), tegenpartij uit `meta.counter_party_*` (38), saldo bij de eerste koppeling (39), **rekening-gescopede duplicaatcontrole (40)** en "budgetteren uitschakelen verwijdert nooit een rekening" (41).
- De pin-tellingen in `lib/uat/acceptance/cash.engine.test.ts` (41 criteria, 25 exact) en in `cash.test.ts` zijn meebewogen.

**UAT-b** — **open, per bouwfase**. Definities bijwerken/toevoegen in dezelfde PR als de fase; nooit als eindsprint. Élke toevoeging beweegt de twee pin-tellingen bewust mee (zie §5, bij te werken test 4).

| Fase | UAT-b |
|---|---|
| 1 (B8/B9) | Nieuw criterium: eerste ophaal op een lege rekening haalt méér dan de providerstandaard; op een gevulde rekening start ze op D−3; een provider-limiet kapt netjes af. Plus expliciet: gaten vóór de historie blijven bestaan — **verwacht gedrag**, geen defect. |
| 2 (laag 2, sync) | **WF-CASH-30** (`lib/uat/acceptance/cash.ts:450`, catalog `UAT-CASH-30`): de tweede dedup-laag en de gesplitste tellers in de Given/When/Then. |
| 3 (B7 + import) | **WF-CASH-23 / WF-CASH-24** (MT940/OFX en CSV): cross-bron-duplicaten komen voorgedeselecteerd mét reden binnen en zijn overrulebaar; import op een gekoppelde rekening loopt via de server-route. |
| 4 (wizard) | **WF-CASH-30** uitbreiden met de rekeningkeuze; subscenario's van `['a','b','c']` af. Plus de onboarding-variant (SC-25). |
| 5 (callback) | Nieuw criterium voor het correctiemoment op de success-pagina (élke gekoppelde rekening) en voor het rekeningtype uit de consent (B3/SC-05). |
| 6 (blokkade) | ✅ **WF-CASH-48 / UAT-CASH-48** (30 juli): één criterium over de drie lagen — partiële unieke index (mét "een inactieve rij bezet niets"), 409 op `auth-link`/`relink` met de gedeelde tekst, en zichtbaar-maar-uitgeschakeld in de wizard én het correctiemoment (huidige drager blijft kiesbaar). `kind: 'exact'`; de check importeert `isSelectableTargetOption` + `occupiedTargetAccountMessage` uit `lib/truelayer/target-account.ts`, geen kopie. Pins: 47 → 48 workflows, `exactWorkflows` 27 → 28, flow-dekking 47 → 48. |
| 7 (B6) | ✅ **WF-CASH-49 / UAT-CASH-49** (30 juli, definities alleen): één criterium over de regelvolgorde-contract van `deriveBankLinkHealth` (vier signalen → `manual`/`linked-broken`/`linked`, incl. "gebruikersintentie wint van storing" en `linked-broken` ≠ `manual`), met het herstelpad vanaf de rekening (`relink_connection_account_id`; doelrekening, intentie én bank server-afgeleid; geen 409 op de eigen koppeling) en de SC-13-reactivatie (ná de koppelwrite, `has_budget_tracking` ongemoeid) narratief in dezelfde `then`. `kind: 'exact'`; de check importeert `deriveBankLinkState` uit `lib/bank-connection-status.ts`, geen kopie. Pins: 48 → 49 workflows, `exactWorkflows` 28 → 29, flow-dekking 48 → 49. |
| 8 (saldo) | ✅ **WF-CASH-50 / UAT-CASH-50** (30 juli, definities alleen): één criterium over de `isSameBalance`-poort (ongewijzigd saldo, óók binnen de dubbele-precisietolerantie, schrijft geen waardering) en de notitie-rondtrip (`formatBankSyncNote`/`parseBankSyncPrevious`/`formatBankSyncCorrectionNote` — de compensatie leest zichzelf niet als banksync), met de valuations-rij + snapshot-mirror, de success-pagina-melding en de append-only compensatie (alleen als de LAATSTE waardering van de banksync is) narratief in dezelfde `then`. `kind: 'exact'`; de check importeert alle vier uit `lib/truelayer/balance-valuation.ts`, geen kopie. Pins: 49 → 50 workflows, `exactWorkflows` 29 → 30, flow-dekking 49 → 50. |

`lib/uat/flows/cash.ts` — de `bankkoppelen`-node en de importnodes krijgen labels die de tweede dedup-laag en de server-route noemen. `lib/uat/acceptance/cash.engine.test.ts` bewaakt de consistentie en moet groen blijven.

## 7. Restrisico's

1. **Gemiste cross-bron-duplicaten blijven stil.** De exacte sleutel is bewust streng. Een bank die de tegenpartij anders levert dan de CSV én geen IBAN meegeeft, glipt erdoor en levert een dubbele rij zonder signaal. Beperking: de gesplitste tellers in `bank_sync_log` maken zichtbaar hóéveel laag 2 vangt; een structureel lage teller op een rekening met bekende overlap is het signaal dat de sleutel tekortschiet. Opruiming van reeds bestaande historische duplicaten valt buiten scope. **Na B9 verschuift dit risico van het koppelpad naar het importpad** — daar is de gebruiker aanwezig en dus zichtbaar, wat het risico verkleint maar niet wegneemt.
2. **Onterechte match op de naam-fallback** (besluit 5). Twee pinbetalingen van hetzelfde bedrag op dezelfde dag bij twee filialen van dezelfde keten kunnen samenvallen. Bij import zichtbaar en overrulebaar; bij sync stil. Dit is de enige plek waar dit plan een transactie kan laten verdwijnen die er had moeten zijn.
3. ~~**De drift-migratie (0a) raakt een tabel met productiedata.**~~ — **✅ afgehandeld 29 juli.** De migratie is toegepast; de typen zijn geverifieerd tegen `information_schema.columns` op remote, de indexwissel was per constructie een versoepeling (0 conflicterende groepen) en de nieuwe index werd aangemaakt vóór de oude werd gedropt. Blijft staan als verantwoording, niet als open risico.
4. ~~**De partiële unique-indexen (fase 6) kunnen op prod op bestaande data stuklopen.**~~ — **✅ afgehandeld 30 juli.** De pre-flight is opnieuw gedraaid in hetzelfde tijdvenster als de migratie (0/0, plus 0 rijen met een vreemde drager) en de indexen zijn zonder conflict aangemaakt; op remote geverifieerd. Blijft staan als verantwoording, niet als open risico. **Wat er in de plaats van kwam** (nieuw, zie de restpunten bij fase 6): de indexen maken van een botsing een `error` die `supabase-js` niet gooit, dus élke schrijver op `bank_connection_accounts` moet zijn fout lézen. De callback doet dat nu; de sync-, balances- en disconnect-routes raken de kolom `bank_account_id` niet en zijn dus niet betrokken.
5. **Her-attributie blijft buiten scope.** Verhangt de gebruiker via het correctiemoment een koppeling naar een andere rekening, dan blijven de al geïmporteerde transacties op de oude rekening staan. Dat is een bewuste grens, maar hij zal als verrassing worden ervaren en hoort in de UI-tekst van het correctiemoment expliciet benoemd te worden.
6. **De import-soft-check negeert `bank_seq`** en markeert daardoor nu al echte, verschillende transacties als duplicaat. Dit plan repareert dat niet en stapelt er niet op — maar de fout blijft bestaan en wordt zichtbaarder zodra gebruikers actiever met de dedup-UI in aanraking komen. Fase 3 verkleint de blootstelling (server-side is `rowDedupKey` de sleutel) maar raakt de clientkant van losse rekeningen niet.
7. **Een gefaalde insert-batch wordt weggeschreven als een geslaagde sync (nieuw).** In `app/api/bank-connect/sync/route.ts` (regel ~226) wordt een `insertError` alleen naar `console.error` gelogd, waarna `insertedCount` niet meegroeit maar `bank_sync_log` onverkort `status: 'success'` krijgt en de response `{ new, duplicates }` teruggeeft. Eén botsing kan 50 rijen wegvagen zonder dat de gebruiker of het log er iets van laat zien — en na B1 is een botsing *waarschijnlijker* geworden bij gelijktijdige syncs (SC-26), want de rekening-gescopede unieke index vangt die race nu hard af in plaats van stil. Fatsoenlijk repareren = een statuswaarde `'partial'` plus het aantal gefaalde rijen. **Geverifieerd 29 juli: `bank_sync_log.status` heeft op remote géén CHECK-constraint** (alleen PK + twee FK's), dus dit kan zónder migratie — de eerdere aanname dat er een CHECK-uitbreiding nodig was, klopt niet. Kandidaat om mee te liften met fase 2 (die raakt de log-insert toch al voor de gesplitste tellers); bewust niet stilzwijgend aan die fase toegevoegd. **✅ Grotendeels gedicht in fase 1** (29 juli): `status: 'partial'` + het aantal niet-weggeschreven rijen in `error_message`, en het faalpad schrijft nu überhaupt een `error`-rij (dat deed het nóóit — zie besluit 4 bij fase 1). Wat blijft staan: een gesneuvelde batch is nog steeds niet-fataal en wordt niet opnieuw geprobeerd.
8. **Structurele schema-verschillen die B1 bewust niet aanraakte (nieuw).** FK-doelen, nullability en de spookkolom `method` op `transactions` wijken af tussen repo en remote. B1 codificeerde alleen wat er *is*; deze verschillen vragen een oordeel per geval (welke kant is de juiste?) en dat past niet in een documentaire migratie. Eigen vervolgronde, buiten dit plan — maar hij bestaat, en zolang hij open staat is de ERD op `/beheer/architectuur` op die punten niet de hele waarheid.
9. **`idx_transactions_user_date` staat in de repo maar is nooit op remote toegepast (nieuw).** De index staat in `supabase/migrations/20260504000001_perf_composite_indexes.sql`; `pg_indexes` op remote toont hem niet (wel losse `idx_transactions_user_id` en `idx_transactions_date`). De hotste query van de app draait dus zonder de index die ervoor bedoeld was — en fase 1 (B8) gaat het transactievolume per rekening fors vergroten. Dit is geen onderdeel van dit plan, maar het is wél de reden dat een prestatiemeting ná fase 1 misleidend kan zijn.
10. **`transactions.source` is zelf-verklaard, niet database-afgedwongen onveranderlijk (nieuw).** De kolom is technisch door de gebruiker zelf te overschrijven via de bestaande UPDATE-policy; er is bewust géén immutability-trigger, want die zou de her-attributie/herkoppeling uit fase 5 en 7 blokkeren. Alles wat op `source` gaat leunen (uitlegbare dedup-tellers, terugdraaien van een verkeerde koppeling) leunt dus op een feit dat de app zelf netjes moet bijhouden. Bovendien: de 37.000 rijen van vóór 29 juli hebben `source IS NULL` — elke lezer moet "onbekend" als eersteklas waarde aankunnen en mag NULL niet als "handmatig" interpreteren.
11. **De 10/dag-rem is niet atomair (nieuw, na fase 1).** `daily_requests` wordt gelezen en als `n + 1` teruggeschreven; N gelijktijdige verzoeken lezen dezelfde waarde en schrijven alle dezelfde `n + 1`. Die read-then-write bestond al, maar is sinds de blok-lus vijf keer zo duur per omzeiling (vier transactieblokken + saldo). Fase 1 heeft de tik naar vóór de provider-lus verplaatst — dat dicht het "een mislukte sync is gratis"-gat, niet de race. Fatsoenlijk repareren = één atomaire `update … set daily_requests = daily_requests + 1 where … returning`-RPC, waarbij "0 rijen terug" de 429 is. Eigen stap, `supabase-db-specialist`.
12. **Alles hangt aan één externe partij.** TrueLayer bepaalt welke rekeningen in de consent zitten en hoe de tegenpartijgegevens eruitzien. Verandert dat formaat, dan verandert de dekkingsgraad van laag 2 zonder dat er bij ons iets wijzigt. **Na B8 komt daar een tweede afhankelijkheid bij:** hoe ver de historie terugreikt en waar de bank-eigen verzoeklimiet ligt, verschilt per bank en is niet gedocumenteerd — de meting op Rabobank (3.086 transacties over 19 maanden, daarna `provider_request_limit_exceeded`) is één datapunt, geen norm.
