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
