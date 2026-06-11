---
id: 0006-superadmin-inzage-via-service-role
title: Superadmin-inzage via service-role, nooit via RLS
status: aanvaard
date: 2026-06-11
elements: [t-supabase, do-huishouden]
---

Cross-user leesrecht voor beheer (supportview, AVG-export, platform-KPI's) loopt uitsluitend via de service-role-client in `/api/admin/*`-routes met een expliciete superadmin-check en audit-log — nooit via RLS-policies op persoonlijke tabellen.

## Context
Voor beheer 2.0 (2026-06-10) kregen `assets`, `debts`, `transactions`, `profiles` en `bank_connection_accounts` brede `is_superadmin()`-SELECT-policies. De domein- en perspectief-loaders vertrouwen bewust op RLS voor row-scoping (geen `user_id`-filter in de query). Gevolg: elke gewone app-pagina van een superadmin-sessie toonde de data van álle gebruikers — een datalek binnen het eigen account-type, ontdekt op /overzicht.

## Besluit
De vijf policies zijn verwijderd (migratie `20260611120000_drop_superadmin_personal_data_select`). Supportview en AVG-export lezen via `getServiceClient()` (`lib/supabase/service.ts`) ná `isSuperAdmin()`-check, mét `logAdminAction`-audit. RLS-policies op persoonlijke financiële tabellen mogen een interactieve sessie nooit meer cross-user leesrecht geven; uitzonderingen zijn alleen de privacy-gated huishouden-RPC's (ADR 0004).

## Gevolgen
Nieuwe beheer-features die andermans data tonen gebruiken dit service-role-pad. Operationele tabellen zonder persoonlijke financiën (`feedback`, `error_logs`, `mail_log`, `job_runs`, `ai_usage`) behouden hun superadmin-policies. Een toekomstige RLS-leaktest hoort te asserten dat een superadmin-sessie op persoonlijke tabellen alleen eigen + huishouden-gedeelde rijen ziet.
