---
id: 0059-avg-bewaartermijnen-en-wissing
title: AVG-rechten afmaken — bewaartermijnen, volledige wissing/reset, export en FK-anonimisering
status: aanvaard
date: 2026-07-21
elements: [t-supabase, app-comp]
---

De AVG-rechten (verwijderen, reset, dataportabiliteit, bewaartermijnen) worden
sluitend gemaakt met één datamodel-single-source (`lib/user-data-tables.ts`), een
FK-ON-DELETE-hardening (migratie `20260721140000`), een volledige alles-in-één
JSON-export en een dagelijkse retentie-cron met vastgelegde termijnen
(`lib/retention.ts`).

## Context

Enterprise-architectuurreview 3 jul 2026, bevinding #18 (Arch F3) legde vier
gebreken bloot:

1. **Verwijderen kon technisch falen.** Zeven eigen-data-FK's (`assets`, `debts`,
   `bank_connections`, `bank_connection_accounts`, `bank_sync_log`,
   `category_corrections`, `goal_contributions`) stonden op `ON DELETE NO ACTION`
   naar `auth.users`; faalde de app-wipe deels, dan blokkeerde `admin.deleteUser`.
   Daarnaast blokkeerden `settlement_entries.from/to_user_id`,
   `app_settings.updated_by`, `uat_results.tester` en `uat_rounds.created_by`
   (allemaal `NO ACTION`), en bleven `ai_usage`/`feedback` (geen FK) als
   orphan-UUID achter na verwijdering. (De kaart-premisse noemde
   `actions.assigned_to/by`; die kolommen bestaan niet op de live DB — de echte
   blokkade zat elders.)
2. **Reset wiste niet alles.** `deleteAllUserData` miste o.a.
   `exchange_connections` (**API-keys!**), `wallet_addresses`,
   `broker_connections`, `custom_calculators`, `user_own_ibans` — die
   overleefden een "alle gegevens wissen".
3. **Export onvolledig.** Zes losse CSV's (gebruiker) en vier tabellen (admin);
   geen alles-in-één machine-leesbare export (art. 20).
4. **Geen bewaartermijnen.** `purge_expired_lead_intakes()` bestond maar werd
   nergens aangeroepen; geen retentie voor de log-/usage-tabellen.

## Besluit

- **Single source datamodel** (`lib/user-data-tables.ts`): álle 49 user-scoped
  tabellen (kolom `user_id`) vallen in precies één partitie — `SESSION_WIPE`
  (sessie-client, eigen-rij DELETE-policy), `SERVICE_WIPE` (alleen service-role:
  `net_worth_history`, `feedback`) of `RETENTION_ALLOWLIST` (operationeel;
  behouden bij reset, gepurged op leeftijd, gewist bij full-delete). Een vitest
  dwingt de volledige dekking af (drift-baken).
- **FK ON DELETE (migratie `20260721140000`):** eigen-data → `CASCADE` (vangnet +
  orphan-preventie); grootboek/audit → `SET NULL` (anonimiseren). De huishouden-
  keuze is **anonimiseren** (`settlement_entries` `from/to_user_id` NULL-baar +
  `SET NULL`): bedrag blijft voor het grootboek van de achterblijvende partner,
  identifier van de vertrekkende gebruiker verdwijnt. (Eigenaar akkoord 2026-07-21.)
- **Volledige export:** nieuwe `GET /api/account/export` (sessie-client, eigen
  rijen — geen service-role) levert één JSON over dezelfde tabellenlijst als de
  wipe; `admin/user-export` uitgebreid naar de volledige persoonlijke set
  (service-role, audit-gelogd).
- **Bewaartermijnen** (`lib/retention.ts`, eigenaar akkoord): `error_logs`/
  `mail_log` 12 mnd, `job_runs` 6 mnd, `contract_events`/`ai_token_usage`/
  `ai_usage` 24 mnd, `lead_intakes` 90 dgn (ADR 0022). Nieuwe fail-closed
  `GET /api/cron/retention` (CRON_SECRET, service-role, `job_runs`-registratie),
  dagelijks via `vercel.json`.

## Gevolgen

- Een `auth.users`-delete sleurt nu écht alle eigen data mee (CASCADE); huishoud-
  data hangt aan `households`, niet aan de vertrekkende user → veilig.
- `settlement_entries` kan NULL-tegenpartijen krijgen; consumers
  (`lib/settlement-data.ts`, `settlement-overview.tsx`) tolereren dit
  (geanonimiseerde posten tellen niet mee in de per-partner-uitsplitsing).
- **Migratie is repo-only geschreven; remote-apply is een release-actie** (nog
  uit te voeren, met `list_migrations`-verificatie i.v.m. de bekende drift).
