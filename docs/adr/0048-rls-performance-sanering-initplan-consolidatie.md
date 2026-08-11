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
zijn byte-identiek (`md5` over de geordende id-lijst) op `transactions` en
`recurring_transactions`. Op `transaction_splits` leverde de fixture geen rijen op, dus
daar draagt de structurele redenering (identieke booleaanse structuur, zelfde helper) het
bewijs — niet de meting.

**Effect (zelfde fixture, warme cache, bit-identieke uitvoer).**
Kaal `user_household_id()` evalueert de helper per rij; gewikkeld verschijnt `InitPlan 2`
dat één keer draait (twee buffers) en waarnaar de filter via `(InitPlan 2).col1` verwijst.
Netto ruwweg tweederde minder gelezen buffers en een vervijfvoudiging van de snelheid op de
fixture. Voor solo-gebruikers — op dit moment nog het volledige gebruikersbestand, er zijn
nog geen huishoudens — blijft het plan qua vorm identiek en kost de InitPlan één buffer;
geen regressie. (Exacte meetwaarden staan in het taakrapport, buiten deze repo.)

**Wat níét waar bleek.** De partiële index wordt door het policy-plan (nog) **niet** gekozen:
de planner verkiest één scan op `idx_transactions_date` plus een filter boven een BitmapOr
zodra de huishouden-tak een Param is. De index is wél correct en optimaal zodra
`household_id` een literal is (`Index Scan …_shared_date`, index-cond op household_id én
date, géén Sort, 0,5 ms) — maar het huidige partner-pad (`household_partner_items`) filtert
op `ownership = 'personal'` en raakt hem dus evenmin. Hij blijft staan als vooruitgeschoven
post — hij is partieel en matcht vooralsnog geen enkele rij, dus de schrijfkosten zijn
verwaarloosbaar. Dat is bewust.

**Waar de expliciete `Sort` vandaan komt (naderhand vastgesteld, T3.1b).** Aanvankelijk
werd die toegeschreven aan een ontbrekende samengestelde index op `(user_id, date)`. Dat
bleek onjuist: die index is inmiddels toegepast (migratie
`20260804063307_perf_composite_indexes_apply`) en de `Sort` bleef staan. De echte oorzaak is
deze policy zelf. Zolang een query voor de gebruikersafbakening **alleen op RLS leunt**,
maakt de huishouden-`OR` er een `BitmapOr` van, en een bitmapscan levert geen gesorteerde
uitvoer — dus moet er altijd expliciet gesorteerd worden, met of zonder passende index.
Draagt de query daarentegen een **expliciete** `.eq('user_id', …)`, dan mag de planner een
gewone `Index Scan` nemen en de RLS-`OR` naar een `Filter` degraderen; dán kan de
indexordening de `ORDER BY` wél bedienen. Dat is de goedkope uitweg voor wie een sortering
wil vermijden: filter expliciet op `user_id` in plaats van het aan RLS over te laten.

**Verificatie.** Advisors vóór/ná gelijk (`auth_rls_initplan` 0 → 0 — het instrument dekt
dit patroon niet). Twee-gebruikers-RLS-simulatie ná: eigenaar-isolatie 0 vreemde rijen op
alle drie tabellen; partner ziet uitsluitend de gedeelde rijen en **0** privérijen;
geen rijen uit een ander huishouden; `anon` 0 rijen **zonder fout** op alle drie tabellen.
`db-model`- + household-vitest groen (op de 2 pre-existente `partner-items-projection`-
failures na, die van een ander traject zijn).

## Addendum 2 (2026-08-10) — de rest van de database, plus een eigen gate

Migratie `20260810220000_rls_initplan_wrap_helpers_buiten_transactions.sql`
(**geschreven, nog niet toegepast** — toepassen loopt via de release-stap).

**Wat er nog openstond.** Addendum 1 wikkelde `user_household_id()` op de
transactions-familie. Daarbuiten bleven de drie helpers kaal. Gemeten tegen `pg_policies`
op de live database (10-08-2026): **34 policies** verwijzen naar `user_household_id()`,
`user_owned_household_id()` of `is_superadmin()`; **5** waren al gewikkeld (de drie uit
addendum 1 plus `user_reports` ×2); **29 policies met 36 kale aanroepen** resteerden.
Daarvan zitten er 25 in `public` — het getal uit de aanleiding — en **4 op
`storage.objects`** (`guide_help_admin_*`, kale `is_superadmin()`), die buiten de
public-scope van de oorspronkelijke telling vielen maar dezelfde kwaal hebben.

Gemeten tegen `pg_proc` (10-08-2026) zijn alle drie `STABLE SECURITY DEFINER` met
`search_path=public` en ACL `{postgres=X,authenticated=X,service_role=X}` — `anon` heeft
géén EXECUTE. Alle 29 policies staan op `to authenticated`.

**Twee plekken waar het scherper bijt dan bij transactions.** `budget_amounts` heeft een
`FOR ALL`-policy, dus de kale aanroep zit óók in `with_check` — per te *schrijven* rij.
En `assets` draagt de `*_encrypted`-kolommen en wordt op vrijwel elke pagina gelezen.

**De gate.** De Supabase-advisor `auth_rls_initplan` herkent alleen
`auth.*`/`current_setting` en stond vóór én ná op 0; hij kán dit patroon niet vinden.
Daarom introduceert deze migratie `public.rls_helper_policy_hygiene()` — `STABLE SECURITY
INVOKER`, `search_path = ''`, EXECUTE alleen voor `service_role`. Twee lenzen:
`kale_helper_aanroep` (performance) en `anon_zonder_execute` (veiligheid: helper in een
policy waarvan de rolset `anon`/`public` bevat terwijl anon geen EXECUTE heeft — dat geeft
anon een harde fout in plaats van stil 0 rijen, precies de valkuil uit dit ADR).

**Hoe bewezen is dat niets verruimd is.** De migratie sluit af met een `DO`-block dat per
policy de *genormaliseerde* expressie hasht — normalisatie = schema-kwalificatie én de
`(select … as …)`-wrapper wegstrepen — en vergelijkt met 34 md5's die read-only vóór de
migratie zijn gemeten. Wijkt er één af, dan faalt de migratie. Daarnaast bewaakt het block
dat het aantal helper-dragende policies exact 34 blijft en dat elke rolset
`{authenticated}` blijft. Dat de normalisatie klopt is *empirisch* aangetoond en niet
alleen beredeneerd: de vijf al-gewikkelde policies uit addendum 1 hashen vandaag identiek
aan hun nog-kale zusters (`recurring_transactions` == `assets` == `e0907df4…`). Zij staan
als controlegroep in dezelfde lijst.

**Blast radius vandaag.** 0 huishoudens, 0 huishoudleden, 0 gedeelde assets/budgets
(gemeten 10-08-2026): de huishouden-takken matchen nu nul rijen, dus de opbrengst is
latent — dit voorkomt een klif zodra huishoudens in gebruik komen. De
`is_superadmin()`-takken evalueren wél al (3 superadmins).

**Niet doen — waarschuwing voor later.** De advisor meldt de drie helpers als
`authenticated_security_definer_function_executable` (WARN). Die WARN is hier bewust niet
opgevolgd: een policy-expressie wordt geëvalueerd met de rechten van de *aanroeper*, dus
`authenticated` moet EXECUTE op deze helpers houden. Dat recht intrekken breekt élke
huishoud- en beheerpolicy in dit ADR.
