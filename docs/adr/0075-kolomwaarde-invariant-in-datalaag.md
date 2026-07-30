---
id: 0075-kolomwaarde-invariant-in-datalaag
title: 'Een invariant over een kolomwaarde hoort in de datalaag, niet in de route die de kolom vandaag schrijft'
status: aanvaard
date: 2026-07-30
elements: [t-supabase, t-bankconnect]
---

# 0075 — Kolomwaarde-invariant hoort in de datalaag

Vierde keer dat dit patroon onafhankelijk werd gevonden tijdens
`specs/bank-connect-doelrekening/plan.md`; kandidaat voor een eigen ADR sinds
het restpunt bij fase 4 (§0c-omgeving), nu geschreven bij fase 9.

## Context

**RLS scopet de RIJ, niet de WAARDE van een foreign-key-kolom op die rij.**
Een own-row policy (`using (auth.uid() = user_id)`) staat een gebruiker toe
zijn eigen rij te muteren — inclusief elke kolom daarop, ook een FK-kolom die
naar een rij van een ANDER type wijst. Als die andere rij eigendom is van
iemand anders (bv. een huishoud-gedeelde rekening van een partner), dan
scopet de policy op de tabel die je muteert niets af over de tabel waar de FK
naartoe wijst. Het gat is dus niet "de gebruiker leest andermans data" (dat
blokkeert RLS wél) maar "de gebruiker laat zijn eigen rij naar andermans rij
wijzen" — eigen-data-vervuiling op een gedeelde entiteit, plus een
misleidend/verkeerd label op wie iets draagt.

Dit patroon is nu **vier keer** onafhankelijk gevonden, telkens op een andere
kolom, telkens vóórdat het als aanvalsscenario werd bewezen:

1. **`profiles.role` / `profiles.commercial_tier` / `profiles.active_subscriptions`**
   (ADR 0049, `guard_profiles_role`) — een ingelogde gebruiker kon zijn eigen
   `role` naar `superadmin` schrijven, en later zijn eigen
   entitlement-kolommen (paywall/AI-credit-bypass) naar een betaalde staat.
   Beide gedicht met BEFORE-triggers.
2. **`bank_connections.target_bank_account_id`** (fase 4, migratie
   `20260729222134_guard_bank_connections_target_account_ownership.sql`) — een
   browserclient kon een pending koppeling naar een rekening van een
   huishoudpartner laten wijzen. Gedicht met de
   `security definer`-trigger `guard_bank_connection_target_account`.
3. **`bank_connection_accounts.bank_account_id`** (fase 6, migratie
   `20260729234928_bank_connection_accounts_one_active_link_and_owner_guard.sql`)
   — dezelfde regel op de zusterkolom: de policy op deze tabel is `for all`
   voor rol `public`, dus een browserclient kon zijn eigen koppelrij naar een
   huishoud-gedeelde partnerrekening laten wijzen. Firsthand tegen remote
   geverifieerd: geen cross-user READ (die rij mag hij toch al lezen), wél
   eigen-data-vervuiling plus een misleidend dragerlabel. Gedicht met dezelfde
   triggervorm.
4. **`bank_accounts.linked_asset_id`** (gevonden bij fase 8, **nog niet
   gedicht**) — dezelfde motivatie geldt onverkort, maar mist de
   guard-trigger die zijn twee zusterkolommen sinds fase 4/6 wel hebben.
   `syncAccountBalance` (fase 8) dicht het gat in de CODE met een
   `user_id`-filter op elke schrijfronde, maar dat is een control op één
   aanroeppad, geen datalaag-invariant.

## Besluit

**Een invariant over een kolomwáárde ("deze FK mag alléén naar een rij van
dezelfde eigenaar wijzen, of naar `null`") hoort in de datalaag, niet alleen
in de route die de kolom vandaag toevallig schrijft.** Een routecontrole is
per definitie incompleet: elke huidige én toekomstige schrijver op die kolom
moet de regel zelf onthouden en correct toepassen, en één vergeten aanroeper
volstaat om het gat te heropenen.

**De vorm: een BEFORE INSERT/UPDATE-trigger, `security definer` (of
`security invoker` waar dat volstaat — zie ADR 0049),
`set search_path = ''`, die de FK-waarde alleen bij een INSERT of een
gewijzigde waarde toetst (skip-branch bij een ongewijzigde kolom) en `null`
altijd toestaat.** Kolom-privilege-REVOKE is bewust geen alternatief: de
tabel-brede UPDATE/INSERT-grants van Supabase maken een kolom-REVOKE
aantoonbaar een no-op (ADR 0049); alleen een trigger is niet door de
aanroeper te omzeilen.

**De ordening binnen een migratie is geen detail als er ook een unieke index
bij komt.** Fase 6 stelde dit vast: een BEFORE ROW-trigger draait vóór
indexonderhoud, dus een poging op andermans rij loopt op de eigenaarschapsfout
(`42501`) en **nooit** op de unieke-index-fout (`23505`) — anders vertelt de
constraint-fout iets over het bestaan van andermans rijen (een
existentie-orakel).

## Alternatieven

- **Kolom-privilege-REVOKE** — verworpen, zie hierboven (ADR 0049): een no-op
  door Supabase's tabel-brede grants.
- **De regel alleen in elke route herhalen** — verworpen: dat is precies het
  patroon dat vier keer onafhankelijk een gat opleverde, telkens op een
  andere kolom, telkens pas gevonden ná een security-review.
- **`with check` op de RLS-policy zelf** — geen vervanger: `with check` kan
  alleen kolommen op DEZELFDE rij toetsen tegen een simpele expressie, geen
  cross-tabel-eigenaarschap (dat vraagt een subquery naar de doeltabel, en
  RLS-subqueries op elke schrijfoperatie zijn een prestatie- én
  onderhoudslast die een trigger niet heeft). Wél *aanvullend* nodig — zie
  Gevolgen.

## Gevolgen

- **`bank_accounts.linked_asset_id` mist de trigger nog** (bevinding bij fase
  8). Eigen kaart voor `supabase-db-specialist`: spiegel
  `guard_bank_connection_target_account` /
  `guard_bank_connection_account_bank_account` naar deze kolom.
- **De guard op beide bestaande triggers leunt op een AFWEZIGE expliciete
  `with check` op de onderliggende policy** (bevinding bij fase 6). De
  trigger vergelijkt de eigenaar van de FK-doelrij met `new.user_id`; dat
  `new.user_id` betrouwbaar is komt vandaag van de `using`-clause die
  Postgres hergebruikt als post-write-check omdat `with_check` `null` is. Zet
  iemand daar later een expliciete `with check (true)` op, dan kan een rij
  mét `user_id` = slachtoffer en een FK van dat slachtoffer de guard
  passeren. Fatsoenlijk repareren: `with check ((select auth.uid()) =
  user_id)` expliciet maken op beide policies. Eigen stap,
  `supabase-db-specialist`.
- Toekomstige kolommen die een FK naar een andere eigenaarschapstabel dragen
  (huishouden-gedeeld of niet) worden bij aanmaak tegen dit besluit getoetst:
  hoort er een guard-trigger bij, of is de kolom aantoonbaar altijd
  `null`/systeemgeschreven?
- `scanTableRelations` (`generate.mjs`) leest geen triggers — deze guards
  verschijnen dus niet als edge op de ERD. De FK-relatie zelf (kolom → tabel)
  staat er wél; de eigenaarschapsinvariant staat alleen hier en in de
  migratie-comments.
