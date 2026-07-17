---
id: 0045-migratie-baseline-resync-en-drift-hek
title: 'Documentaire baseline-migratie voor remote-only tabellen; werkwijze-hek tegen migratie-drift'
status: aanvaard
date: 2026-07-17
elements: [t-supabase]
---

# 0045 — Migratie-baseline-resync + drift-hek

## Context

De live (remote) Supabase telde 74+ tabellen; de repo-migraties beschreven er
~56. 23 LIVE tabellen hadden geen tabeldefinitie in `supabase/migrations/*`
(o.a. `recommendations`, `actions`, `budget_amounts`, `transaction_splits`,
`bank_connections`, `user_own_ibans`, `error_logs`, `mail_log`, `ai_usage`,
`admin_actions_log`, de `_legacy_holding*`-reeks). Bron: enterprise-
architectuurreview 3 jul 2026, bevinding #19 (Arch F3).

Gevolgen:

- De RLS-policies van die tabellen waren **niet vanuit git te reviewen** — een
  blinde vlek in een persoonlijke-financiën-app waar een verkeerde policy een
  datalek is.
- De ERD-view op `/beheer/architectuur?view=database` (gescand uit de
  migrations door `scanTableRelations`) miste deze tabellen; elke schema-review
  tegen de repo gaf een vals beeld.

Structurele oorzaak: de repo is op enig moment geconsolideerd
(`20260215000000_create_base_tables.sql`) zonder deze objecten mee te nemen,
terwijl remote via `apply_migration`-DDL doorgroeide. **Historie ≠ files ≠
live** — drie sporen die uiteenliepen.

## Besluit

1. **Documentaire, additieve baseline.** Eén migratie
   (`20260717120000_sync_remote_baseline.sql`) codificeert de 23 remote-only
   tabellen EXACT zoals ze remote bestaan — kolommen, inline FK's/constraints,
   `enable row level security` + alle policies, en indexes. Gegenereerd uit
   remote-introspectie (`information_schema`/`pg_catalog`/`pg_policies`), niet
   met de hand verzonnen.

2. **Idempotent + no-op op remote.** `create table if not exists`,
   `drop policy if exists` + `create policy`, `create index if not exists`.
   De objecten bestaan al op prod; de baseline is bewust **niet** opnieuw op
   remote uitgevoerd (geen `apply_migration`) en draait op een schone
   preview-branch volledig herspeelbaar.

3. **Geen history-rewrite.** Puur additief: geen `supabase migration repair`,
   geen `db reset`, geen drop/recreate. De bestaande files én de remote
   historie-tabel blijven ongemoeid. Dit vermijdt het grootste risico
   (out-of-order/reset op prod) en dekt alle vier de acceptatiecriteria van de
   kaart met minimale prod-impact. History-repair (files ↔ remote-versies
   gelijktrekken) is optioneel en risicovol; bewust uitgesteld.

4. **Werkwijze-hek tegen toekomstige drift.** Elke `apply_migration` op remote
   krijgt in dezelfde PR een `supabase/migrations/<ts>_*.sql` met **matchende
   timestamp** die exact dezelfde DDL vastlegt. De repo blijft zo de bron van
   waarheid en de ERD zelf-actualiserend.

## Gevolgen

- De 23 tabellen verschijnen na `npm run arch:diagram` in de ERD; de scanner
  telt hun RLS-dekking mee. `lib/architecture/db-model.test.ts` blijft groen.
- **Let op — scanner-gotcha:** de tabel-scanner (`scanTables` in
  `scripts/architecture/generate.mjs`) matcht `create table …` óók in
  SQL-commentaar en captured bij een niet-identifier na `create table if not
  exists` per abuis "if"/"in" als tabel. Vermijd de letterlijke frase
  "create table" in migratie-commentaar (of geef 'm altijd een echte
  identifier eronder).
- **Restpunt (aparte F3-kaart 'RLS-hygiëne'):** inhoudelijke policy-hygiëne op
  o.a. `error_logs`/`mail_log` (advisor: `WITH CHECK (true)`/brede inserts) valt
  buiten deze baseline — die legt de bestaande situatie alleen vast.
- **Restpunt (werkwijze-regel in CLAUDE.md):** het hek uit besluit 4 hoort ook
  expliciet in `fin/CLAUDE.md` (de ERD-sectie noemt het nog niet). Die wijziging
  loopt via de main thread + gebruikersgoedkeuring, niet via deze agent.
- **Omgekeerde drift (los):** `net_worth_history` (`20260716160000_*`) is lokaal
  gedefinieerd maar stond ten tijde van de sync nog niet in de live-tabellen —
  de migratie lijkt remote nog niet toegepast. Buiten scope van deze baseline.
