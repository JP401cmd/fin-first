---
id: 0048-rls-performance-sanering-initplan-consolidatie
title: 'RLS-performance-sanering: auth-initplan-rewrite, permissive-policy-consolidatie en FK-indexen (semantiek ongewijzigd)'
status: aanvaard
date: 2026-07-19
elements: [t-supabase, t-platform]
---

# 0048 — RLS-performance-sanering (initplan + consolidatie + FK-indexen)

## Context

De Supabase performance-advisor meldde op de live database (19 jul 2026) een grote
hoeveelheid RLS-overhead die direct doortelt in de TTFB — elke `/overzicht`-SSR doet
~90-105 queries, dus per-query- en per-rij-kosten vermenigvuldigen:

- **148× `auth_rls_initplan`** — policies die `auth.uid()` / `auth.role()` / `auth.email()`
  **per rij** evalueren i.p.v. één keer per query.
- **269× `multiple_permissive_policies`** — meerdere permissive policies per (rol, actie),
  die alle geëvalueerd worden. Grondoorzaak: een brede `Users can manage own X` (FOR ALL)
  naast granulaire per-actie-policies, plus per gedeelde tabel een `Household members can
  view shared X` policy die op `authenticated/SELECT` een derde overlap toevoegt. De 5-rol-
  fan-out (anon/authenticated/authenticator/dashboard_user/supabase_privileged_role) blies
  één logische overlap op tot ~20 meldingen per tabel.
- **43× `unindexed_foreign_keys`** + **11× `duplicate_index`**.

## Besluit

Drie migraties op de live database, **elke ingreep gedragsneutraal**:

1. **FK-indexen** (`20260719120000`): 43 ontbrekende foreign-key-indexen toegevoegd
   (`create index if not exists`), 11 exacte duplicaat-indexen gedropt (constraint-gedragen
   index per paar behouden, o.a. `budget_amounts_budget_id_effective_from_key`).
2. **RLS initplan-rewrite + consolidatie** (`20260719120500` + naleveringen `…121000`,
   `…121500`):
   - `auth.<fn>()` → `(select auth.<fn>())` in élke policy (Postgres cachet de subquery per
     query; identieke semantiek — Supabase's eigen aanbeveling).
   - Permissive policies per (rol, actie) samengevoegd tot één policy met OR-verbonden
     condities. Permissive policies zijn al OR-verbonden, dus OR-samenvoegen is per definitie
     gedragsneutraal. Redundante `manage own`-FOR-ALL-policies, volledig gedekt door de
     granulaire per-actie-policies, zijn gedropt zonder toegangsverlies. Eigenaar-OF-huishouden
     SELECT-policies staan op `to authenticated`: de huishouden-tak roept de SECURITY DEFINER-
     helper `user_household_id()` aan waarop `anon` geen execute-recht heeft — `to authenticated`
     houdt het anon-gedrag exact gelijk (0 rijen, geen fout) i.p.v. anon in die functie te trekken.
   - RESTRICTIVE policies: geen aanwezig, niets aangeraakt.

Beheer/service-role blijft via de service-client die RLS passeert (ADR 0006); service_role-
policies zijn functioneel behouden (via OR meegenomen bij merges).

## Bewuste uitzonderingen (niet 1-op-1 gedragsneutraal te consolideren)

- **app_settings** (4 residuale `multiple_permissive`): alleen initplan-rewrite. De overlap
  bestaat uit gemengde public/authenticated-rolsets + security-gevoelige API-key-filtering —
  samenvoegen zou de rolsemantiek wijzigen.
- **household_members** (1 residual, UPDATE): alleen initplan-rewrite. RLS-recursie-historie en
  afwijkende with_check-semantiek tussen owner-update en privacy-update.
- **questionnaire_questions / questionnaires** (elk 1 residual, SELECT): service+superadmin
  samengevoegd; de losse `authenticated_read`-SELECT (=`true`) blijft bestaan → 1 bewuste overlap.

## Gevolgen

- Advisor vóór → ná: `auth_rls_initplan` **148 → 0**; `multiple_permissive_policies` **269 → 7**
  (alle 7 = bovengenoemde bewuste uitzonderingen); `unindexed_foreign_keys` **43 → 0**;
  `duplicate_index` **11 → 0**.
- Geverifieerd met een twee-gebruikers-RLS-simulatie (`set role authenticated` + JWT-claims):
  eigenaar-isolatie intact (0 vreemde rijen op transactions/assets/profiles/budgets/valuations),
  anon ziet 0 rijen zonder fout, ingelogde gebruiker onveranderd. `db-model`- + household-vitest groen.
- Nieuwe FK-indexen verschijnen tijdelijk als `unused_index` (INFO) tot ze voor het eerst gebruikt
  worden — verwacht, geen regressie.
- Geen nieuwe tabellen/FK's → ERD (`architecture.json.tableRelations`) ongewijzigd; geen
  `arch:diagram`-regeneratie nodig.

## Addendum (2026-08-04) — `user_household_id()` alsnog in een initplan

Migratie `20260804055846_perf_rls_household_initplan_en_shared_index.sql`.

**Wat er nog openstond.** De rewrite hierboven wikkelde `auth.<fn>()`, maar liet de tweede
helper in dezelfde policies **kaal** staan: `household_id = user_household_id()` op de
SELECT-policies van `transactions`, `recurring_transactions` en `transaction_splits`. Dat is
geen slordigheid maar een blinde vlek van het meetinstrument: de Supabase-advisor herkent
alleen `auth.*`/`current_setting`, dus `auth_rls_initplan` stond al op 0 en bleef daar —
vóór én ná deze migratie. De advisor kón dit dus niet vinden; alleen `EXPLAIN` maakt het
zichtbaar. Waarom het bijt: `user_household_id()` is `STABLE SECURITY DEFINER`, en Postgres
inlinet SECURITY DEFINER-functies nooit en constant-foldt `STABLE` niet. Zonder
scalar-subquery-wrapper wordt hij dus geëvalueerd voor elke rij waar de eerste OR-tak
(`auth.uid() = user_id`) niet al waar is — precies de partnerrijen in een huishouden.

**Besluit.** `user_household_id()` → `(select public.user_household_id())` in die drie
SELECT-policies (`transaction_splits` heeft twee subselects, maar slechts één droeg de
helper). Plus een partiële index `idx_transactions_household_shared_date
(household_id, date desc) where ownership = 'shared'` voor de gedeelde OR-tak.

**Waarom de semantiek identiek is.** De functie levert per definitie één scalaire waarde
(`LIMIT 1`), dus `(select f())` geeft exact dezelfde waarde — inclusief `NULL` voor een
gebruiker zonder huishouden, en `household_id = NULL` blijft `NULL` (niet-waar). Hij is
`STABLE`, dus binnen één query kan de uitkomst niet wijzigen: één evaluatie geeft dezelfde
rijenset als N evaluaties per rij. Hij is read-only, dus er zijn geen neveneffecten die van
het aantal aanroepen afhangen. Rolset, policynamen en de `WITH CHECK`-kant bleven
onaangeroerd; er is geen tak toegevoegd, verwijderd of verbreed. Empirisch bevestigd met een
huishouden-fixture (in een teruggedraaide transactie): de zichtbare rij-**ID's** vóór en ná
zijn byte-identiek (`md5` over de geordende id-lijst, 10.156 transacties → dezelfde
`63c906e5…`; 19 recurrings → dezelfde `81d446c8…`).

**Effect (zelfde fixture, warme cache, identieke uitvoer van 642 rijen).**
Kaal `user_household_id()`: `Buffers: shared hit=1696`, 12,2 ms. Gewikkeld: `InitPlan 2`
één keer geëvalueerd (`Buffers: shared hit=2`) en `Buffers: shared hit=557`, 2,4 ms —
67% minder buffers, ~5× sneller. Voor solo-gebruikers (vandaag 100% van de productiedata:
0 huishoudens, 0 gedeelde rijen) blijft het plan qua vorm identiek en kost de InitPlan
1 buffer: 178 → 175 buffers, geen regressie.

**Wat níét waar bleek.** De partiële index wordt door het policy-plan (nog) **niet** gekozen:
de planner verkiest één scan op `idx_transactions_date` plus een filter boven een BitmapOr
zodra de huishouden-tak een Param is. De index is wél correct en optimaal zodra
`household_id` een literal is (`Index Scan …_shared_date`, index-cond op household_id én
date, géén Sort, 0,5 ms) — maar het huidige partner-pad (`household_partner_items`) filtert
op `ownership = 'personal'` en raakt hem dus evenmin. Hij blijft staan als vooruitgeschoven
post (partieel, vandaag 0 rijen, verwaarloosbare schrijfkosten) en zal als `unused_index`
(INFO) opduiken. Dat is bewust, en het aandachtspunt
`idx-transactions-user-date-drift-remote` blijft staan: `idx_transactions_user_date` staat
nog steeds niet op remote, wat de expliciete `Sort` in al deze plannen verklaart.

**Verificatie.** Advisors vóór/ná gelijk (`auth_rls_initplan` 0 → 0 — het instrument dekt
dit patroon niet). Twee-gebruikers-RLS-simulatie ná: eigenaar-isolatie 0 vreemde rijen op
alle drie tabellen; partner ziet de 1.503 gedeelde rijen en **0** van de 9.235 privérijen;
geen rijen uit een ander huishouden; `anon` 0 rijen **zonder fout** op alle drie tabellen.
`db-model`- + household-vitest groen (op de 2 pre-existente `partner-items-projection`-
failures na, die van een ander traject zijn).
