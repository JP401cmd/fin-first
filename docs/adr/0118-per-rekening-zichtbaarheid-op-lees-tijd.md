---
id: 0118-per-rekening-zichtbaarheid-op-lees-tijd
title: Per-rekening zichtbaarheid in het huishouden wordt op lees-tijd afgedwongen, niet bij het schrijven
status: aanvaard
date: 2026-08-29
elements: [as-huishouden, as-transacties, do-huishouden, do-transactie]
---

Een bankrekening krijgt een eigen kolom `bank_accounts.partner_visibility` met drie standen — `none` / `balance` / `full` — die bepaalt wat de huishoudpartner van die rekening ziet. De keuze wordt afgedwongen op **lees-tijd**: in de SELECT-policies van `transactions`, `transaction_splits` en `recurring_transactions`, én in de SECURITY DEFINER-RPC `household_partner_items()`. `bank_accounts.ownership` wordt **niet** verbreed met een derde waarde. Standaard bij het delen van een rekening is `balance` — privacy-by-default.

## Context

### Wat er stond

De app kende drie losse knoppen die samen het huishoudbeeld bepaalden:

1. `bank_accounts.ownership` (`personal`/`shared`) — bepaalt of de partner de **rekeningrij** kan lezen;
2. `transactions.ownership` (`personal`/`shared`) — gedeelde boekingen zijn voor de partner leesbaar, **buiten elke privacy-instelling om**;
3. `household_members.privacy_settings` (5 categorieën × `full`/`totals`/`hidden`) — gate't alleen **partner-persoonlijke** items, via `household_partner_items()` / `household_partner_totals()` (ADR 0036).

De gevraagde driewegkeuze viel daarmee uiteen in drie ongelijke dingen. "Alles" was een duplicaat van `ownership='shared'`. "Alleen saldo" was de enige echt nieuwe stand — representeerbaar (rekening `shared`, boekingen `personal`) maar niet houdbaar, want elke volgende import stempelde de boekingen weer `shared`.

En "niets" was geen nieuwbouw maar een **reparatie**. `ownership='personal'` verbergt vandaag alleen de rekeningrij; de boekingen erop lopen gewoon door naar de partner via `household_partner_items()`, die uitsluitend op `t.user_id` + `t.ownership='personal'` filtert en geen rekening-scope kent. Bij categorie-privacy `full` geïtemiseerd, bij de standaard `totals` als aggregaat — en `household_partner_items('income')` leidt het partnerinkomen af uit *alle* inkomenstransacties van 12 maanden, zonder ownership-filter, dus salaris op een "privé" rekening telde gewoon mee. Belofte ≠ gedrag.

### De maat van het ontwerpvenster

Live gemeten (29-08-2026): 0 huishoudens, 0 huishoudleden, 0 `bank_accounts` met `ownership='shared'`. Het hele huishoudpad is vandaag onbereikbaar. Dat maakt zowel de schemawijziging als de gedragswijziging in de RPC nu gratis. Dat venster sluit bij de eerste geaccepteerde partneruitnodiging — een **gebruikersactie**, geen release. Er is dus geen moment waarop iemand vanzelf gewaarschuwd wordt.

## Besluit

### 1. Een aparte kolom, `ownership` blijft met rust

`ownership = 'shared'` is een overladen predicaat: 14 RLS-policies over 13 tabellen hangen eraan, plus ~200 TS-vergelijkingen, en sinds ADR 0101 draagt het een **tweede betekenis** — de weging van losse cash op `households.split_mode` (`lib/unlinked-cash.ts`). Een derde enumwaarde verandert die weging stil mee. Daarom een eigen kolom, met een CHECK die de twee koppelt:

```sql
check ((ownership = 'personal') = (partner_visibility = 'none'))
```

Bijvangst: `balance` erft automatisch de ADR 0101-weging (het saldo telt gezamenlijk, want de rekening blijft `shared`) en `none` telt 100% bij de eigenaar. Dat is precies goed.

De CHECK is bewust hard en geen trigger: elke schrijver die één van de twee kolommen zet moet **stuklopen**, niet stil een halve toestand achterlaten. `lib/bank-account-visibility.ts#ownershipWriteColumns` is de TS-kant van dezelfde regel — het equivalent van `ibanWriteColumns` voor de drie IBAN-kolommen.

### 2. Lees-tijd, niet schrijf-tijd

De helper `public.partner_hidden_account_ids()` (STABLE SECURITY DEFINER) levert de rekeningen van de partner die niet op `full` staan. Hij wordt aangeroepen als scalar-subquery `(select public.partner_hidden_account_ids())` zodat Postgres 'm als InitPlan één keer per statement evalueert — hetzelfde patroon als `20260810220000_rls_initplan_wrap_helpers_buiten_transactions.sql`. `coalesce(..., '{}')` is essentieel: `x = any(NULL)` is NULL, en zonder de coalesce zou de policy stilzwijgend **dicht**klappen.

Vier plekken gaan in hetzelfde blok mee, anders lekt het via de zijdeur:

1. `transactions` — SELECT-policy, tweede disjunct;
2. `transaction_splits` — de policy herimplementeert het predicaat **inline** en leunt dus niet op de transactions-policy;
3. `recurring_transactions` — identiek predicaat, en de tabel draagt zelf `account_id`;
4. `household_partner_items()` — de takken `transactions` (zowel `full` als het `totals`-aggregaat) én `income`. Deze RPC is SECURITY DEFINER: RLS raakt hem niet. Zonder deze vierde poort blijft "niets" een aggregaat- en inkomenlek.

`household_partner_totals()` en de saldo-/snapshotpaden blijven ongemoeid — bij `balance` is het saldo juist wél gedeeld.

**Waarom niet alleen stempelen bij het schrijven.** Een terugschakeling `full → balance` moet onmiddellijk en met terugwerkende kracht werken op historie die al als `shared` op de rekening staat. Lees-tijd geeft dat gratis. Schrijf-tijd vraagt een backfill — een datamutatie die je niet terug kunt draaien — en laat elke toekomstige schrijver de poort vergeten. Dat is letterlijk de faalklasse die ADR 0036 afwees (privacy die per afnemer ligt in plaats van structureel) en die ADR 0004 als norm vastlegt.

Schrijf-tijd blijft er wél bij als **tweede gordel**, om een andere reden dan privacy: `transactions.ownership` weegt sinds ADR 0101 mee in de gezamenlijke uitgaven. Een boeking die als `shared` meetelt terwijl de partner 'm niet kan zien, is een cijfer dat niemand kan navertellen. `rowOwnershipForImport` stempelt op een `balance`-rekening daarom `personal` — ook bij een handmatige override.

### 3. Default bij delen = `balance`

Wie een rekening deelt geeft daarmee het saldo vrij (dat ís wat "gedeeld" in het huishoudbeeld betekent), maar niet automatisch zijn boekingen. Boekingen delen is een tweede, expliciete klik. Besluit eigenaar 26-08-2026.

### 4. Op `balance` is de rekeninghouder de enige importeur

`loadHouseholdSharedDedupKeys` (`lib/truelayer/existing-hashes.ts`) leest via de RLS-client de `import_hash`/`bank_seq` van partnerrijen op een gedeelde rekening. Met de leesgate wordt die set voor de partner leeg → **stil dubbele boekingen** zodra beide partners op een `balance`-rekening importeren, en beide reeksen tellen mee in uitgaven en spaarquote.

Dit is bewust **niet** opgelost met een SECURITY DEFINER-hashfunctie: `import_hash` is zelf een correlatiesleutel — juist daarom is 'ie in `20260802190000` uit de partnerprojectie gehaald — en over een bekend formaat te brute-forceren. In plaats daarvan weigert `POST /api/transactions/import` een import door een niet-eigenaar op een gedeelde rekening die niet op `full` staat, en laat de importpagina zo'n rekening niet in de keuzelijst staan. Eerlijk en uitlegbaar in plaats van stil verdubbeld.

## Gevolgen

### Bedoelde gedragswijziging

De takken `transactions` en `income` van `household_partner_items()` leveren voortaan **alleen** rijen van rekeningen die de eigenaar bewust op `full` heeft gezet. Omdat elke persoonlijke rekening per CHECK op `none` staat, betekent dat in de praktijk: geen partner-transacties en geen partner-inkomen tenzij dat expliciet is vrijgegeven. De categoriedial (`privacy_settings`) en de rekeningdial zijn een **AND**, nooit een OR: de strengste wint. De takken `assets`, `debts` en `budgets` zijn niet rekeninggebonden en blijven ongemoeid.

Dat is een echte verandering in wat een huishouden ziet. Ze is vandaag gratis (0 huishoudleden) en ze is de bedoeling van dit besluit — niet een nevenschade ervan.

**De budget-fallback in de income-tak is meegenomen.** Die tak viel terug op de som van de `budget_type='income'`-budgetten van de partner zodra er geen zichtbare inkomenstransacties waren. Omdat de standaard bij delen `balance` is, zou de gate zichzelf daarmee ondergraven: de ongefilterde fallback wordt dan juist de primaire bron, en de partner ziet zijn maandinkomen alsnog verschijnen. De RPC onderscheidt daarom nu of de partner *geen* inkomsten heeft (verse gebruiker → fallback, ongewijzigd gedrag) of ze *verborgen* heeft (→ 0). Zonder dat onderscheid zou deze ADR precies het "belofte ≠ gedrag" hebben herhaald dat ze zegt te repareren.

### Bewust geaccepteerde restblootstelling

Een huishoudlid dat `partner_hidden_account_ids()` rechtstreeks aanroept leert **hoeveel niet-`full`-rekeningen zijn partner heeft — inclusief de volledig persoonlijke**, waarvan hij via geen enkel ander kanaal zelfs het bestaan kan waarnemen (de SELECT-policy op `bank_accounts` verbergt die compleet). Het zijn kale UUID's: geen naam, saldo, IBAN of hash, en de vervolg-exploiteerbaarheid is nihil (`GET`/`PATCH`/`DELETE /api/bank-accounts/[id]` zijn eigen-rij, `count_foreign_rows_on_bank_account` geeft TF404, de boekingen blijven RLS-gescoped). Het blijft metadata-vertrouwelijkheid, en de grant kan niet weg: de policy roept de functie aan als *invoker*, dus `authenticated` heeft `EXECUTE` nodig.

Dat is inherent aan de InitPlan-vorm; het alternatief (een per-rij-boolean met het account-id als argument) draait de hele optimalisatieronde van `20260719090108` / `20260810220000` terug op het drukste leespad van de app. De functie verschijnt na apply als twintigste `authenticated_security_definer_function_executable`-WARN in de Supabase-advisor, naast `user_household_id()` en de andere negentien — hetzelfde patroon, dezelfde afweging.

**De dedup-garantie ligt op route-niveau, niet op DB-niveau.** De INSERT-policy op `transactions` beperkt alleen `user_id`, niet `account_id`: een partner kan langs de importroute om nog steeds een directe client-insert doen op een verborgen rekening. Vertrouwelijkheid blijft intact (het blijven zijn eigen rijen, die de eigenaar sowieso al ziet), maar de blokkade uit §4 is een routecontrole en geen constraint. Een DB-niveau-variant vraagt een with_check die `account_id` tegen de zichtbaarheid toetst — een aparte kaart.

**RLS doet geen kolomfiltering.** Bij `balance` is de héle `bank_accounts`-rij voor de partner leesbaar; dat `iban_hash` niet meereist is volledig een applicatielaag-control (`BANK_ACCOUNT_PARTNER_COLUMNS` plus de repo-brede scan in `lib/bank-account-visibility.test.ts`), niet iets wat de database afdwingt.

### Wat nog niet bewezen is

De policies zijn geschreven en de TS-kant is getest, maar de migratie is bij het schrijven van deze ADR **nog niet toegepast**. Twee dingen horen bij de release-stap en niet eerder:

1. een **RLS-leaktest** met twee echte gebruikers in één huishouden (de norm uit ADR 0004): per stand exact 0 rijen uit `transactions`, `transaction_splits`, `recurring_transactions` en de vier RPC-takken, plus een terugschakeltest `full → balance` op bestaande gedeelde historie;
2. een **EXPLAIN** op een 13-maands transactievenster om te bevestigen dat de helper als InitPlan landt en niet als per-rij-subquery.

**Deploy-volgorde is niet vrij.** Vier bestanden selecteren `partner_visibility` (`app/(app)/core/cash/import/page.tsx`, `components/app/cash-account-view.tsx` ×2 via `BANK_ACCOUNT_PARTNER_COLUMNS`, `app/api/transactions/import/route.ts`). Die kolom bestaat nog niet op productie. Gaat de code vóór de migratie live, dan geeft PostgREST `42703` en valt het cash-leespad om — het faalt closed (geen lek), maar het is een harde storing. **Migratie eerst, dan de code.**

## Alternatieven

**Een derde waarde op `ownership`.** Afgewezen: verandert stil de ADR 0101-cashweging en raakt 14 policies en ~200 TS-vergelijkingen.

**Alleen schrijf-tijd stempelen.** Geen RLS-wijziging, geen prestatievraag, dedup blijft intact — maar niet met terugwerkende kracht, en elke toekomstige schrijver kan de poort vergeten. Alleen verdedigbaar als "alleen saldo" als *standaardinstelling* wordt gepositioneerd en niet als *garantie*, en dan moet de schermtekst dat letterlijk zeggen. De eigenaar koos op 26-08-2026 expliciet voor de garantie.

**Dedup redden met een SECURITY DEFINER-hashfunctie.** Afgewezen: `import_hash` is een correlatiesleutel over een bekend formaat.

## Referenties

- `supabase/migrations/20260829160000_bank_accounts_partner_visibility.sql`
- `supabase/migrations/20260829161000_household_partner_items_account_gate.sql`
- `lib/bank-account-visibility.ts` + `lib/bank-account-visibility.test.ts`
- ADR 0004 (RLS als structurele poort), ADR 0036 (privacy structureel, niet per afnemer), ADR 0058 (muteren via API-route), ADR 0101 (cashweging op `split_mode`)
